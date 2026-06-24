-- 018-mou-cancelled-status.sql (Phase 3: MOU cancel/soft-delete)
--
-- NOT YET APPLIED. Shown for review before prod (same gate as 014/017).
--
-- Additive: extends the mous.status CHECK to allow 'Cancelled' so finance can
-- soft-cancel a wrongly-created MOU (distinct from cohort_status='archived',
-- which is end-of-cycle, not "deleted"). No existing row changes; reversible.
-- Received/outstanding are computed from non-Cancelled payments in the app, so
-- a Cancelled MOU's totals fall to zero without touching the stale mou.received.
--
-- Down: 018-mou-cancelled-status.down.sql (restores the original 6-value CHECK;
-- valid only while no MOU is 'Cancelled').

BEGIN;

ALTER TABLE mous DROP CONSTRAINT IF EXISTS mous_status_check;
ALTER TABLE mous ADD CONSTRAINT mous_status_check
  CHECK (status IN ('Draft','Pending Signature','Active','Completed','Expired','Renewed','Cancelled'));

COMMIT;
