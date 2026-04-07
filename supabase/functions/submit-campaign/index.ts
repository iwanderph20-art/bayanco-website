// ============================================================
// submit-campaign — Supabase Edge Function
// Receives campaign form data, stores in DB, triggers AI scan,
// and sends the campaigner a welcome / pending-review email.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    // ── Validate required fields ────────────────────────────
    const required = [
      "creator_name", "creator_email", "creator_phone",
      "title", "category", "goal_amount", "story", "payment_method",
    ];
    for (const field of required) {
      if (!body[field]) {
        return json({ error: `Missing required field: ${field}` }, 400);
      }
    }

    // ── Sanitise ────────────────────────────────────────────
    const campaignData = {
      creator_name:   body.creator_name.trim(),
      creator_email:  body.creator_email.trim().toLowerCase(),
      creator_phone:  body.creator_phone.trim(),
      title:          body.title.trim(),
      category:       body.category,
      goal_amount:    parseFloat(body.goal_amount),
      story:          body.story.trim(),
      payment_method: body.payment_method,
      payment_details: buildPaymentDetails(body),
      status:         "pending",
      ai_verdict:     "pending",
    };

    // ── Insert campaign ─────────────────────────────────────
    const { data: campaign, error: insertErr } = await supabase
      .from("campaigns")
      .insert(campaignData)
      .select()
      .single();

    if (insertErr) throw insertErr;

    // ── Log creation ────────────────────────────────────────
    await supabase.from("campaign_audit_log").insert({
      campaign_id: campaign.id,
      action:      "campaign_submitted",
      actor_email: campaign.creator_email,
      actor_type:  "creator",
      new_status:  "pending",
      notes:       `Submitted by ${campaign.creator_name}`,
    });

    // ── Trigger AI screening (fire-and-forget) ───────────────
    // Don't await — let the function run asynchronously
    supabase.functions
      .invoke("ai-screen", { body: { campaign_id: campaign.id } })
      .catch((e: Error) => console.error("AI screen invoke error:", e));

    // ── Send welcome / pending email ─────────────────────────
    await sendWelcomeEmail(campaign);

    return json({ success: true, campaign_id: campaign.id });
  } catch (err: any) {
    console.error("submit-campaign error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPaymentDetails(body: Record<string, string>) {
  if (body.payment_method === "gcash") {
    return { gcash_number: body.gcash_number ?? "" };
  }
  return {
    bank_name:       body.bank_name ?? "",
    account_number:  body.account_number ?? "",
    account_name:    body.account_name ?? "",
  };
}

async function sendWelcomeEmail(campaign: Record<string, any>) {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) {
    console.warn("RESEND_API_KEY not set — skipping welcome email");
    return;
  }

  const goalFormatted = parseFloat(campaign.goal_amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Campaign Pending Review</title>
<style>
  body{margin:0;padding:20px;background:#FFF8F0;font-family:'DM Sans',Arial,sans-serif;color:#2D2D2A}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,78,137,.08)}
  .hdr{background:linear-gradient(135deg,#004E89,#5B2A86);padding:40px 32px;text-align:center}
  .hdr-logo{font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;margin-bottom:6px}
  .hdr-sub{color:rgba(255,255,255,.8);font-size:15px}
  .body{padding:36px 32px}
  .badge{display:inline-block;background:#FFB627;color:#2D2D2A;font-weight:700;font-size:13px;padding:6px 18px;border-radius:20px;margin:12px 0 24px}
  .card{background:#FFF8F0;border-radius:12px;padding:20px 24px;border-left:4px solid #FF6B35;margin:20px 0}
  .card-title{font-size:18px;font-weight:700;color:#004E89;margin-bottom:6px}
  .card-meta{font-size:13px;color:#888}
  .card-id{font-size:11px;color:#aaa;font-family:monospace;margin-top:8px}
  .steps{margin:28px 0}
  .step{display:flex;gap:14px;margin-bottom:18px;align-items:flex-start}
  .num{width:30px;height:30px;min-width:30px;border-radius:50%;background:linear-gradient(135deg,#FF6B35,#5B2A86);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
  .step-body h4{margin:0 0 2px;font-size:14px;color:#004E89}
  .step-body p{margin:0;font-size:13px;color:#666}
  .footer{background:#2D2D2A;padding:24px;text-align:center}
  .footer p{margin:0;color:rgba(255,255,255,.5);font-size:12px}
  .footer a{color:#FFB627;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-logo">BayanCo</div>
    <div class="hdr-sub">Together We Rise — Your Campaign is Under Review</div>
  </div>
  <div class="body">
    <p>Kamusta, <strong>${campaign.creator_name}</strong>! 🌟</p>
    <p>Salamat for submitting your campaign to BayanCo. We've received it and it's now in our review queue.</p>
    <div style="text-align:center"><span class="badge">⏳ Status: Pending Review</span></div>
    <div class="card">
      <div class="card-title">${campaign.title}</div>
      <div class="card-meta">Goal: ₱${goalFormatted} &nbsp;·&nbsp; Category: ${campaign.category}</div>
      <div class="card-id">Campaign ID: ${campaign.id}</div>
    </div>
    <div class="steps">
      <p style="font-weight:700;color:#004E89;margin-bottom:14px">What happens next:</p>
      <div class="step">
        <div class="num">1</div>
        <div class="step-body"><h4>Automated Safety Scan</h4><p>Our AI checks your campaign instantly for platform safety.</p></div>
      </div>
      <div class="step">
        <div class="num">2</div>
        <div class="step-body"><h4>Human Review (24–48 hrs)</h4><p>Our team verifies your identity, documents, and digital footprint.</p></div>
      </div>
      <div class="step">
        <div class="num">3</div>
        <div class="step-body"><h4>Go Live!</h4><p>Once approved, your campaign goes public. We'll email you with your campaign link.</p></div>
      </div>
    </div>
    <p>If we need more information, we'll contact you at <strong>${campaign.creator_email}</strong> or <strong>${campaign.creator_phone}</strong>.</p>
    <p style="margin-top:20px">Maraming salamat at sama-sama nating buuin ang komunidad! 🇵🇭</p>
    <p>— The BayanCo Team</p>
  </div>
  <div class="footer">
    <p>BayanCo · Filipino Crowdfunding · <a href="https://bayanco.org">bayanco.org</a></p>
    <p style="margin-top:6px">If you didn't submit this campaign, please <a href="mailto:hello@bayanco.org">contact us</a> immediately.</p>
  </div>
</div>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "BayanCo <noreply@bayanco.org>",
      to: [campaign.creator_email],
      subject: `⏳ Your Campaign "${campaign.title}" is Pending Review — BayanCo`,
      html,
    }),
  });
}
