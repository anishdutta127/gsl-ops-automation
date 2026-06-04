-- Step 3 (2026-06-05): Welcome Note tracking.
--
-- Ops triggers a templated welcome note to the school after Finance enters
-- the MOU; the system tracks sent-vs-pending. One row per MOU. status
-- 'pending' (drafted, not sent) | 'sent'. A MOU with no row + no sent note
-- counts as "welcome pending" on the Ops dashboard.
--
-- No real email infra exists (no SMTP/provider); this records the note +
-- sent-status only. Actual send-wiring is a follow-up.
--
-- Additive + idempotent.
--   node scripts/apply-migration.mjs scripts/migrations/012-welcome-notes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS welcome_notes (
  mou_id      TEXT PRIMARY KEY,
  school_id   TEXT,
  note_text   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  sent_at     TIMESTAMPTZ,
  sent_by     TEXT,
  updated_at  TIMESTAMPTZ,
  audit_log   JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMIT;
