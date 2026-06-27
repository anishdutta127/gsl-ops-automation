-- 021-vex-void.down.sql (reverse of 021-vex-void.sql).
--
-- Drops the soft-delete tombstone columns on vex_pis + vex_dispatches. SAFE only
-- while no row has voided_at set (else the void history is permanently lost).
-- Restore or re-evaluate any voided PIs/dispatches before running.

BEGIN;

ALTER TABLE vex_dispatches DROP COLUMN IF EXISTS void_reason;
ALTER TABLE vex_dispatches DROP COLUMN IF EXISTS voided_by;
ALTER TABLE vex_dispatches DROP COLUMN IF EXISTS voided_at;

ALTER TABLE vex_pis DROP COLUMN IF EXISTS void_reason;
ALTER TABLE vex_pis DROP COLUMN IF EXISTS voided_by;
ALTER TABLE vex_pis DROP COLUMN IF EXISTS voided_at;

COMMIT;
