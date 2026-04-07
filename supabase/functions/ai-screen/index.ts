// ============================================================
// ai-screen — Supabase Edge Function
// Tier-1 automated content screening using Claude Haiku.
// Combines keyword scan + LLM analysis → 0-100 trust score.
// Updates campaign status to 'under_review' when done.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Known scam/fraud signal phrases
const SCAM_KEYWORDS: Array<[string, number]> = [
  ["guaranteed return", 25], ["guaranteed profit", 25], ["100% guaranteed", 20],
  ["double your money", 30], ["quick money", 20], ["get rich quick", 30],
  ["investment scheme", 25], ["ponzi", 50], ["pyramid scheme", 50],
  ["free money", 20], ["unlimited income", 20], ["passive income guaranteed", 20],
  ["wire transfer", 15], ["western union", 10], ["moneygram", 10],
  ["nigerian prince", 40], ["unclaimed inheritance", 40], ["lottery winner", 40],
  ["selected for grant", 30], ["secret government grant", 35],
  ["send fee first", 35], ["advance fee", 35], ["processing fee required", 30],
];

// Heuristic checks for unrealistic goals by category (in PHP)
const GOAL_THRESHOLDS: Record<string, number> = {
  medical:        5_000_000,
  education:      1_000_000,
  small_business: 3_000_000,
  emergency:      2_000_000,
  community:      10_000_000,
  personal:       500_000,
  other:          5_000_000,
};

interface Flag {
  type: string;
  description: string;
  severity: "low" | "medium" | "high";
}

interface AiResult {
  score: number;
  flags: Flag[];
  summary: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { campaign_id } = await req.json();

    // Fetch campaign
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (error || !campaign) throw new Error("Campaign not found");

    // Mark as under AI review
    await supabase
      .from("campaigns")
      .update({ status: "ai_reviewing" })
      .eq("id", campaign_id);

    // ── Tier-1a: Keyword scan ─────────────────────────────────
    const text = `${campaign.title} ${campaign.story}`.toLowerCase();
    let keywordPenalty = 0;
    const keywordFlags: Flag[] = [];

    for (const [kw, penalty] of SCAM_KEYWORDS) {
      if (text.includes(kw)) {
        keywordPenalty += penalty;
        keywordFlags.push({
          type: "keyword_match",
          description: `Contains suspicious phrase: "${kw}"`,
          severity: penalty >= 30 ? "high" : penalty >= 20 ? "medium" : "low",
        });
      }
    }

    // ── Tier-1b: Heuristic goal check ─────────────────────────
    const goalFlags: Flag[] = [];
    const maxGoal = GOAL_THRESHOLDS[campaign.category] ?? 5_000_000;
    if (campaign.goal_amount > maxGoal) {
      goalFlags.push({
        type: "unrealistic_goal",
        description: `Goal ₱${campaign.goal_amount.toLocaleString()} exceeds typical range for category "${campaign.category}" (≤₱${maxGoal.toLocaleString()})`,
        severity: campaign.goal_amount > maxGoal * 3 ? "high" : "medium",
      });
    }

    // Minimum story length check
    const descFlags: Flag[] = [];
    if (campaign.story.trim().split(/\s+/).length < 40) {
      descFlags.push({
        type: "vague_description",
        description: "Story is very short — lacks sufficient detail for verification",
        severity: "medium",
      });
    }

    // ── Tier-1c: LLM analysis via Claude Haiku ────────────────
    const llmResult = await analyzeWithClaude(campaign);

    // ── Aggregate score ────────────────────────────────────────
    const allFlags: Flag[] = [
      ...keywordFlags,
      ...goalFlags,
      ...descFlags,
      ...llmResult.flags,
    ];

    const totalPenalty = keywordPenalty + allFlags.filter(f => f.type !== "keyword_match").length * 5;
    const finalScore = Math.max(0, Math.min(100, llmResult.score - totalPenalty));

    let verdict: "clean" | "suspicious" | "high_risk";
    if (finalScore >= 65) verdict = "clean";
    else if (finalScore >= 35) verdict = "suspicious";
    else verdict = "high_risk";

    // All campaigns proceed to human review; AI score influences priority
    const newStatus = "under_review";

    // ── Persist results ────────────────────────────────────────
    await supabase
      .from("campaigns")
      .update({
        ai_score:       finalScore,
        ai_verdict:     verdict,
        ai_flags:       allFlags,
        ai_summary:     llmResult.summary,
        ai_screened_at: new Date().toISOString(),
        status:         newStatus,
      })
      .eq("id", campaign_id);

    await supabase.from("campaign_audit_log").insert({
      campaign_id,
      action:      "ai_screen_complete",
      actor_type:  "system",
      old_status:  "ai_reviewing",
      new_status:  newStatus,
      notes:       `Score: ${finalScore}/100 · Verdict: ${verdict} · ${allFlags.length} flag(s)`,
    });

    return new Response(
      JSON.stringify({ success: true, score: finalScore, verdict, flags: allFlags.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("ai-screen error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Claude Haiku analysis ─────────────────────────────────────
async function analyzeWithClaude(campaign: Record<string, any>): Promise<AiResult> {
  const CLAUDE_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!CLAUDE_KEY) {
    return { score: 65, flags: [], summary: "AI screening skipped (API key not set)" };
  }

  const prompt = `You are a fraud-detection system for BayanCo, a Filipino crowdfunding platform serving genuine communities.

Analyze this campaign for legitimacy. Most Filipino campaigns are genuine — be lenient with authentic stories.

CAMPAIGN DATA:
Title: "${campaign.title}"
Category: ${campaign.category}
Goal: ₱${campaign.goal_amount}
Story: "${campaign.story.slice(0, 1500)}"

ASSESS FOR:
1. Scam patterns (vague promises, unrealistic claims, emotional manipulation with no substance)
2. Realism of goal amount for category
3. Specificity (names, places, dates, medical conditions) vs generic filler
4. Red flags (requests to contact outside platform, suspicious urgency)
5. Positive signals (specific hospital/school names, realistic timeline, clear beneficiary)

Respond ONLY with valid JSON, no markdown:
{
  "score": <0-100, 100 = fully legitimate>,
  "summary": "<1-2 sentences>",
  "flags": [
    {"type": "<flag_type>", "description": "<what was found>", "severity": "<low|medium|high>"}
  ]
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(raw);

    return {
      score:   Math.max(0, Math.min(100, parseInt(parsed.score) || 65)),
      flags:   Array.isArray(parsed.flags) ? parsed.flags : [],
      summary: parsed.summary ?? "",
    };
  } catch (e) {
    console.error("Claude API error:", e);
    return {
      score:   60,
      flags:   [{ type: "ai_error", description: "LLM screening failed — manual review required", severity: "low" }],
      summary: "Automated LLM screening encountered an error.",
    };
  }
}
