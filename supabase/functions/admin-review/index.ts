// ============================================================
// admin-review — Supabase Edge Function
// Authenticated endpoint for admin actions:
//   approve | reject | suspend | request_info | update_verification
// Sends creator notification emails on status changes.
// Auth: x-admin-token header must match ADMIN_SECRET env var.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const VALID_ACTIONS = ["approve", "reject", "suspend", "request_info", "update_verification"] as const;
type Action = typeof VALID_ACTIONS[number];

const REJECTION_MESSAGES: Record<string, string> = {
  SCAM_KEYWORDS:       "The campaign contained phrases that triggered our fraud-prevention filters.",
  UNREALISTIC_GOAL:    "The funding goal appears unrealistic for the stated purpose.",
  VAGUE_DESCRIPTION:   "The campaign story lacks sufficient specific, verifiable details.",
  DUPLICATE_CAMPAIGN:  "A similar campaign already exists on BayanCo.",
  POLICY_VIOLATION:    "The campaign violates our community guidelines or terms of service.",
  INSUFFICIENT_DOCS:   "The supporting documents were insufficient or could not be verified.",
  IDENTITY_UNVERIFIED: "We were unable to verify the identity of the campaign creator.",
  BANK_UNVERIFIED:     "We were unable to verify the provided bank/payment account.",
  AI_HIGH_RISK:        "Automated screening flagged this campaign as high-risk.",
  OTHER:               "The campaign did not meet our current review criteria.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth check ───────────────────────────────────────────
  const adminToken  = req.headers.get("x-admin-token");
  const ADMIN_SECRET = Deno.env.get("ADMIN_SECRET");

  if (!ADMIN_SECRET || adminToken !== ADMIN_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { campaign_id, action, reviewer_email, notes, reason_code, verification } = body;

    if (!campaign_id || !action) {
      return json({ error: "campaign_id and action are required" }, 400);
    }
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      return json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }, 400);
    }

    // ── Fetch current campaign ───────────────────────────────
    const { data: campaign, error: fetchErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (fetchErr || !campaign) return json({ error: "Campaign not found" }, 404);
    const oldStatus = campaign.status;

    // ── Build update payload ─────────────────────────────────
    const update: Record<string, any> = {
      reviewer_email,
      reviewer_notes: notes,
      reviewed_at:    new Date().toISOString(),
    };

    switch (action as Action) {
      case "approve":
        update.status = "approved";
        break;

      case "reject":
        update.status                = "rejected";
        update.rejection_reason_code = reason_code ?? "OTHER";
        break;

      case "suspend":
        update.status = "suspended";
        break;

      case "request_info":
        update.status = "info_requested";
        break;

      case "update_verification":
        // Only update verification booleans — no status change
        if (verification) {
          const allowed = ["identity_verified", "bank_verified", "social_verified", "documents_verified"];
          for (const k of allowed) {
            if (k in verification) update[k] = Boolean(verification[k]);
          }
          // If all 4 checks pass, suggest approval in notes
        }
        delete update.reviewed_at; // not a status change
        break;
    }

    // ── Apply update ─────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from("campaigns")
      .update(update)
      .eq("id", campaign_id);

    if (updateErr) throw updateErr;

    // ── Audit log ────────────────────────────────────────────
    await supabase.from("campaign_audit_log").insert({
      campaign_id,
      action,
      actor_email: reviewer_email ?? "admin",
      actor_type:  "admin",
      old_status:  oldStatus,
      new_status:  update.status ?? oldStatus,
      notes:       notes ?? null,
    });

    // ── Notify creator ────────────────────────────────────────
    if (["approve", "reject", "request_info"].includes(action)) {
      await sendStatusEmail(campaign, action as Action, notes, reason_code);
    }

    return json({ success: true, new_status: update.status ?? oldStatus });
  } catch (err: any) {
    console.error("admin-review error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendStatusEmail(
  campaign: Record<string, any>,
  action: Action,
  notes?: string,
  reasonCode?: string
) {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) return;

  const goalFmt = parseFloat(campaign.goal_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 });

  let subject = "";
  let statusBg = "#888";
  let statusLabel = "";
  let bodyHtml = "";

  if (action === "approve") {
    subject     = `🎉 Your Campaign "${campaign.title}" is Now Live on BayanCo!`;
    statusBg    = "#1A936F";
    statusLabel = "✅ Approved & Live";
    bodyHtml    = `
      <p>Great news! Your campaign has been reviewed and <strong>approved</strong>. It is now publicly visible on BayanCo.</p>
      <p><strong>Next steps:</strong></p>
      <ul style="line-height:2.2;color:#555">
        <li>Share your campaign link with friends, family, and your community</li>
        <li>Post on social media using <strong>#BayanCo</strong> and <strong>#SamaSamaTayo</strong></li>
        <li>Keep donors updated with regular progress posts</li>
        <li>Upload receipts for transparency as funds are used</li>
      </ul>`;
  } else if (action === "reject") {
    subject     = `Campaign Review Update — "${campaign.title}"`;
    statusBg    = "#c0392b";
    statusLabel = "❌ Not Approved";
    const reason = REJECTION_MESSAGES[reasonCode ?? "OTHER"];
    bodyHtml = `
      <p>After careful review, we were unable to approve your campaign at this time.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      ${notes ? `<p><strong>Reviewer notes:</strong> ${notes}</p>` : ""}
      <p>You are welcome to address these concerns and resubmit. If you believe this decision is an error, please reply to this email or contact our support team.</p>`;
  } else if (action === "request_info") {
    subject     = `⚠️ Action Required — More Info Needed for "${campaign.title}"`;
    statusBg    = "#e67e22";
    statusLabel = "⚠️ Info Requested";
    bodyHtml = `
      <p>Our review team needs additional information before we can complete the review of your campaign.</p>
      ${notes ? `<p><strong>What we need:</strong> ${notes}</p>` : ""}
      <p>Please reply to this email with the requested information within <strong>7 days</strong> to keep your campaign active in our queue.</p>`;
  }

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<style>
  body{margin:0;padding:20px;background:#FFF8F0;font-family:Arial,sans-serif;color:#2D2D2A}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden}
  .hdr{background:linear-gradient(135deg,#004E89,#5B2A86);padding:32px;text-align:center;color:#fff}
  .hdr h1{margin:0;font-size:22px}
  .badge{display:inline-block;background:${statusBg};color:#fff;font-weight:700;font-size:13px;padding:7px 20px;border-radius:20px;margin:16px 0}
  .body{padding:36px 32px}
  .card{background:#FFF8F0;border-radius:12px;padding:18px 22px;border-left:4px solid #FF6B35;margin:20px 0}
  .footer{background:#2D2D2A;padding:20px;text-align:center}
  .footer p{margin:0;color:rgba(255,255,255,.5);font-size:12px}
  .footer a{color:#FFB627;text-decoration:none}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>BayanCo Campaign Update</h1></div>
  <div class="body">
    <p>Hi <strong>${campaign.creator_name}</strong>,</p>
    <div style="text-align:center"><span class="badge">${statusLabel}</span></div>
    <div class="card">
      <strong>${campaign.title}</strong><br>
      <small style="color:#888">Goal: ₱${goalFmt} · Category: ${campaign.category}</small>
    </div>
    ${bodyHtml}
    <p style="margin-top:24px">— The BayanCo Review Team</p>
  </div>
  <div class="footer">
    <p>BayanCo · <a href="https://bayanco.org">bayanco.org</a> · <a href="mailto:hello@bayanco.org">hello@bayanco.org</a></p>
  </div>
</div>
</body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from:    "BayanCo Reviews <reviews@bayanco.org>",
      to:      [campaign.creator_email],
      subject, html,
    }),
  });
}
