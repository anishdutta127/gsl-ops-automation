-- 020-payment-log-void.sql (Pass 1: finance corrections / payment_log soft-delete)
--
-- NOT YET APPLIED. Shown for review before prod (same gate as 014/017/018).
--
-- Additive: payment_logs gains a soft-delete tombstone (voided_at / voided_by /
-- void_reason) so a mis-logged or duplicate receipt (the St Paul's duplicate,
-- the VEX over-counts incl. Funscholar) can be VOIDED in-app with full audit
-- instead of a one-off recovery script. Voiding reverses the log's balance
-- effect at the application layer (decrements the VexPi or requires the MOU
-- instalment to be unmatched first); the row itself is KEPT for audit, never
-- hard-deleted.
--
-- No existing row changes; all three columns nullable; reversible.
-- Down: 020-payment-log-void.down.sql (drops the columns; safe only while no
-- payment_log is voided, else void history is lost).

BEGIN;

ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS voided_at   timestamptz;
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS voided_by   text;
ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS void_reason text;

COMMIT;
