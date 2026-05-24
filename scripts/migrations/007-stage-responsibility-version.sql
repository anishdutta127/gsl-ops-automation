-- Phase 7 Part 5.B P3-NEEDS-FIX OCC: stage_responsibility.version.
--
-- /admin/stage-responsibility (actions.ts) is leadership-only config.
-- Two leadership members editing the same stage's responsible_department
-- + responsible_user_id concurrently would otherwise clobber. Same OCC
-- pattern as cc_rules.

BEGIN;

ALTER TABLE stage_responsibility
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
