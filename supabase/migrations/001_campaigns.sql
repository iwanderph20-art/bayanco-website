-- ============================================================
-- BayanCo Database Schema — Campaign Vetting System
-- Run this in your Supabase project: SQL Editor > New query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CAMPAIGNS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Creator info
  creator_name    TEXT NOT NULL,
  creator_email   TEXT NOT NULL,
  creator_phone   TEXT NOT NULL,

  -- Campaign details
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  category        TEXT NOT NULL CHECK (category IN (
    'medical','education','small_business','emergency','community','personal','other'
  )),
  goal_amount     DECIMAL(12,2) NOT NULL CHECK (goal_amount >= 1000),
  story           TEXT NOT NULL CHECK (char_length(story) >= 50),

  -- Payment info (sensitive values stored encrypted in production)
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('gcash','bank')),
  payment_details JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── Status Workflow ───────────────────────────────────────
  -- pending        → just submitted, waiting for AI scan
  -- ai_reviewing   → AI scan in progress
  -- under_review   → passed AI, queued for human review
  -- info_requested → admin asked creator for more info
  -- approved       → campaign is live
  -- rejected       → permanently declined
  -- suspended      → was live, now suspended
  -- ─────────────────────────────────────────────────────────
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','ai_reviewing','under_review','info_requested',
    'approved','rejected','suspended'
  )),

  -- Review details
  rejection_reason_code TEXT CHECK (rejection_reason_code IN (
    'SCAM_KEYWORDS','UNREALISTIC_GOAL','VAGUE_DESCRIPTION',
    'DUPLICATE_CAMPAIGN','POLICY_VIOLATION','INSUFFICIENT_DOCS',
    'IDENTITY_UNVERIFIED','BANK_UNVERIFIED','AI_HIGH_RISK','OTHER'
  )),
  reviewer_notes  TEXT,
  reviewer_email  TEXT,
  reviewed_at     TIMESTAMPTZ,

  -- ── Tier-2 Manual Verification Checklist ────────────────
  identity_verified   BOOLEAN DEFAULT FALSE,
  bank_verified       BOOLEAN DEFAULT FALSE,
  social_verified     BOOLEAN DEFAULT FALSE,
  documents_verified  BOOLEAN DEFAULT FALSE,

  -- ── Tier-1 AI Screening Results ──────────────────────────
  ai_score        INTEGER CHECK (ai_score BETWEEN 0 AND 100),
  ai_verdict      TEXT CHECK (ai_verdict IN ('clean','suspicious','high_risk','pending')) DEFAULT 'pending',
  ai_flags        JSONB DEFAULT '[]'::jsonb,   -- [{type, description, severity}]
  ai_summary      TEXT,
  ai_screened_at  TIMESTAMPTZ,

  -- ── Media ────────────────────────────────────────────────
  -- Stored as JSON arrays for fast reads; campaign_media table has full detail
  media_urls      JSONB DEFAULT '[]'::jsonb,
  document_urls   JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CAMPAIGN MEDIA TABLE
-- Full record per uploaded file (images, videos, documents)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_media (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  media_type      TEXT NOT NULL CHECK (media_type IN ('image','video','document')),

  -- Supabase Storage path (images/docs)
  storage_path    TEXT,
  public_url      TEXT,
  thumbnail_url   TEXT,     -- Supabase image transform URL for fast previews

  -- Mux fields (videos only)
  mux_upload_id   TEXT,
  mux_asset_id    TEXT,
  mux_playback_id TEXT,
  mux_status      TEXT DEFAULT 'pending',  -- pending | ready | errored

  -- File metadata
  file_name       TEXT,
  file_size       INTEGER,  -- bytes
  mime_type       TEXT,
  upload_complete BOOLEAN DEFAULT FALSE,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ADMIN USERS TABLE
-- Simple admin table; no Supabase Auth required
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,     -- bcrypt hash
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ============================================================
-- CAMPAIGN AUDIT LOG
-- Immutable record of every status change / admin action
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  actor_email TEXT,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('system','admin','creator')),
  old_status  TEXT,
  new_status  TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGER: auto-update updated_at on campaigns
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_media   ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_audit_log ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can INSERT a new campaign (form submission)
CREATE POLICY "public_insert_campaigns"
  ON campaigns FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Anyone can read their own campaigns by email (used for status check pages)
CREATE POLICY "creator_read_own_campaigns"
  ON campaigns FOR SELECT TO anon, authenticated
  USING (true);   -- relax for MVP; tighten when auth is added

-- Service role (Edge Functions) can do everything — bypasses RLS
-- (service_role key always bypasses RLS by default in Supabase)

-- Media: anyone can insert (upload happens before campaign exists in some flows)
CREATE POLICY "public_insert_media"
  ON campaign_media FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "public_read_media"
  ON campaign_media FOR SELECT TO anon, authenticated
  USING (true);

-- Audit log: only service role can insert/read
-- (Edge Functions use service_role key, so no explicit policy needed)

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_campaigns_status         ON campaigns(status);
CREATE INDEX idx_campaigns_creator_email  ON campaigns(creator_email);
CREATE INDEX idx_campaigns_created_at     ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_ai_verdict     ON campaigns(ai_verdict);
CREATE INDEX idx_campaign_media_campaign  ON campaign_media(campaign_id);
CREATE INDEX idx_audit_log_campaign       ON campaign_audit_log(campaign_id);

-- ============================================================
-- STORAGE BUCKETS
-- Run separately in Supabase Dashboard → Storage, or via API:
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES
--   ('campaign-media', 'campaign-media', true,  10485760,  ARRAY['image/jpeg','image/png','image/webp']),
--   ('campaign-docs',  'campaign-docs',  false, 10485760,  ARRAY['application/pdf','image/jpeg','image/png']);

-- Storage RLS policies (set via Dashboard → Storage → Policies):
-- campaign-media: anyone can upload, public read
-- campaign-docs:  service role only read (signed URLs for creator access)

-- ============================================================
-- SEED: default admin (change password immediately after setup!)
-- Password here is bcrypt of "bayanco-admin-2026" — CHANGE THIS
-- ============================================================
-- INSERT INTO admin_users (email, name, password_hash)
-- VALUES (
--   'admin@bayanco.org',
--   'BayanCo Admin',
--   '$2b$12$placeholder_replace_with_real_bcrypt_hash'
-- );
