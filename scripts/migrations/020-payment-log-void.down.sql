-- 020-payment-log-void.down.sql (reverse of 020-payment-log-void.sql).
--
-- Drops the soft-delete tombstone columns. SAFE only while no payment_log row
-- has voided_at set (else the void history is permanently lost). Restore or
-- re-evaluate any voided logs before running.

BEGIN;

ALTER TABLE payment_logs DROP COLUMN IF EXISTS void_reason;
ALTER TABLE payment_logs DROP COLUMN IF EXISTS voided_by;
ALTER TABLE payment_logs DROP COLUMN IF EXISTS voided_at;

COMMIT;
