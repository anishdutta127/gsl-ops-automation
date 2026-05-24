-- Phase 7 Part 5.B P2b.X OCC #1: cc_rules.version.
--
-- cc_user_ids and contexts are REPLACE-on-update form-submit fields.
-- Two wildcard admins (Anish/Ameet/Gowri) editing the same rule via
-- /admin/cc-rules/[ruleId] can clobber each other's edit silently;
-- empirical RMW race showed 1/10 survivors.
--
-- OCC: every cc_rule edit UPDATE includes `WHERE version=$1` and
-- bumps version. Conflict surfaces as 409 to the route; UI shows
-- reload prompt.

BEGIN;

ALTER TABLE cc_rules
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
