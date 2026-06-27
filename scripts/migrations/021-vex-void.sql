-- 021-vex-void.sql (Pass 2: VEX PI edit + void/cancel)
--
-- NOT YET APPLIED. Shown for review before prod (same gate as 020).
--
-- Additive: vex_pis and vex_dispatches each gain a soft-delete tombstone
-- (voided_at / voided_by / void_reason), parity with the payment_logs columns
-- from migration 020. Voiding a VEX PI in error cascade-voids its PRE-SHIP
-- dispatches + its payment_logs and zeroes its balance, then tombstones the PI.
-- "Voided" = voided_at IS NOT NULL, kept SEPARATE from the freely-transitioned
-- `status` so a void cannot be silently undone via the status bar.
--
-- vex_pis.status and vex_dispatches.status are free-text TEXT (no CHECK), so the
-- void state needs no constraint change. Hard-delete stays impossible: the
-- vex_dispatches.pi_id FK is ON DELETE RESTRICT.
--
-- No existing row changes; all columns nullable; reversible.
-- Down: 021-vex-void.down.sql (drops the columns; safe only while no row is voided).

BEGIN;

ALTER TABLE vex_pis        ADD COLUMN IF NOT EXISTS voided_at   timestamptz;
ALTER TABLE vex_pis        ADD COLUMN IF NOT EXISTS voided_by   text;
ALTER TABLE vex_pis        ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE vex_dispatches ADD COLUMN IF NOT EXISTS voided_at   timestamptz;
ALTER TABLE vex_dispatches ADD COLUMN IF NOT EXISTS voided_by   text;
ALTER TABLE vex_dispatches ADD COLUMN IF NOT EXISTS void_reason text;

COMMIT;
