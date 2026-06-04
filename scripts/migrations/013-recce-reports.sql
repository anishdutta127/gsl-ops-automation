-- Step 3 (2026-06-05): Recce reports (lab-requirement reconnaissance).
--
-- A simple per-school record of what lab facilities/requirements a school
-- has or is missing. Record-keeping only (not a workflow). Multiple rows
-- per school allowed (reconnaissance over time). Optionally linked to an MOU.
--
-- Additive + idempotent.
--   node scripts/apply-migration.mjs scripts/migrations/013-recce-reports.sql

BEGIN;

CREATE TABLE IF NOT EXISTS recce_reports (
  id            TEXT PRIMARY KEY,
  school_id     TEXT NOT NULL,
  mou_id        TEXT,
  requirements  TEXT,
  status        TEXT NOT NULL DEFAULT 'recorded',
  created_by    TEXT,
  created_at    TIMESTAMPTZ,
  audit_log     JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS recce_reports_school_idx ON recce_reports (school_id);

COMMIT;
