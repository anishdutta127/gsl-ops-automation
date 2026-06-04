-- Step 2 two-process model (2026-06-04): MOU.ops_review_status.
--
-- The Ops-side review lifecycle ('Pending for review' | 'In Review' |
-- 'Submitted to Finance'), deliberately SEPARATE from the status column so
-- the Ops track never reaches the money/PI gate (PI_BLOCKED_STATUSES reads
-- `status` only). Scalar text, nullable, no default: existing 190 rows stay
-- NULL (not-in-review) and the read mapper coalesces NULL -> null.
--
-- Additive + idempotent.
--
-- Run with:
--   node scripts/apply-migration.mjs scripts/migrations/011-mou-ops-review-status.sql

BEGIN;

ALTER TABLE mous
  ADD COLUMN IF NOT EXISTS ops_review_status TEXT;

COMMIT;
