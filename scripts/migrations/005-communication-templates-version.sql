-- Phase 7 Part 5.B P2b.X OCC #2: communication_templates.version.
--
-- default_cc_rules + variables + body_markdown are REPLACE-on-update.
-- Two wildcard admins editing the same template can clobber each
-- other's edit silently; empirical RMW race showed 1/10 survivors.
--
-- OCC: every template edit UPDATE includes `WHERE version=$1` and
-- bumps version. Conflict surfaces as 409.

BEGIN;

ALTER TABLE communication_templates
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
