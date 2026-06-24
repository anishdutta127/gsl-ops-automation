-- 018-mou-cancelled-status.down.sql (reverse of 018-mou-cancelled-status.sql)
-- Restores the original 6-value CHECK. SAFE only while no MOU has
-- status='Cancelled' (else the ADD CONSTRAINT fails - the intended guard;
-- re-activate or hard-handle any Cancelled MOUs first).

BEGIN;

ALTER TABLE mous DROP CONSTRAINT IF EXISTS mous_status_check;
ALTER TABLE mous ADD CONSTRAINT mous_status_check
  CHECK (status IN ('Draft','Pending Signature','Active','Completed','Expired','Renewed'));

COMMIT;
