// ============================================================
// campaign-api.js — BayanCo campaign CRUD via Supabase
// ============================================================

/* global BAYANCO_CONFIG */

const cfg = () => window.BAYANCO_CONFIG || {};

// ── Submit a new campaign to the Edge Function ────────────────
async function submitCampaign(data) {
  const res = await fetch(`${cfg().functionsUrl}/submit-campaign`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Submission failed");
  return result; // { success, campaign_id }
}

// ── Record media after upload to Supabase Storage / Mux ──────
async function addCampaignMedia(campaignId, mediaItem) {
  const { supabaseUrl, supabaseAnonKey } = cfg();
  const res = await fetch(`${supabaseUrl}/rest/v1/campaign_media`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${supabaseAnonKey}`,
      apikey:          supabaseAnonKey,
      Prefer:          "return=representation",
    },
    body: JSON.stringify({ campaign_id: campaignId, ...mediaItem }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to record media");
  }
  return await res.json();
}

// ── Fetch campaigns (admin use) ───────────────────────────────
async function fetchCampaigns(filters = {}) {
  const { supabaseUrl, supabaseAnonKey } = cfg();

  let url = `${supabaseUrl}/rest/v1/campaigns?order=created_at.desc&limit=100`;

  if (filters.status)    url += `&status=eq.${encodeURIComponent(filters.status)}`;
  if (filters.ai_verdict) url += `&ai_verdict=eq.${encodeURIComponent(filters.ai_verdict)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey:        supabaseAnonKey,
    },
  });
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return await res.json();
}

// ── Fetch campaign media for a given campaign ─────────────────
async function fetchCampaignMedia(campaignId) {
  const { supabaseUrl, supabaseAnonKey } = cfg();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/campaign_media?campaign_id=eq.${campaignId}&order=created_at.asc`,
    { headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } }
  );
  if (!res.ok) return [];
  return await res.json();
}

// ── Admin action (approve, reject, etc.) ─────────────────────
async function adminReview(payload, adminToken) {
  const res = await fetch(`${cfg().functionsUrl}/admin-review`, {
    method:  "POST",
    headers: {
      "Content-Type":   "application/json",
      "x-admin-token":  adminToken,
    },
    body: JSON.stringify(payload),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Admin action failed");
  return result;
}

// ── Fetch audit log for a campaign ───────────────────────────
async function fetchAuditLog(campaignId) {
  const { supabaseUrl, supabaseAnonKey } = cfg();
  const res = await fetch(
    `${supabaseUrl}/rest/v1/campaign_audit_log?campaign_id=eq.${campaignId}&order=created_at.asc`,
    { headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } }
  );
  if (!res.ok) return [];
  return await res.json();
}

window.BayanCoAPI = {
  submitCampaign,
  addCampaignMedia,
  fetchCampaigns,
  fetchCampaignMedia,
  adminReview,
  fetchAuditLog,
};
