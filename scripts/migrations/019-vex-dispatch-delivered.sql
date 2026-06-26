-- 019-vex-dispatch-delivered.sql (VEX dispatch delivery confirmation)
--
-- NOT YET APPLIED. Shown for review before prod (same gate as 014/017/018).
--
-- Additive: adds delivered_at + delivered_by to vex_dispatches so a dispatch
-- can advance Shipped -> Delivered with who/when captured and audited. The
-- status column is free-text TEXT NULL (no CHECK constraint), so the new
-- 'Delivered' status value needs no constraint change. No existing row
-- changes; reversible.
--
-- Down: 019-vex-dispatch-delivered.down.sql (drops the two columns; safe only
-- while nothing reads them, i.e. revert the app code first).

BEGIN;

ALTER TABLE vex_dispatches ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL;
ALTER TABLE vex_dispatches ADD COLUMN IF NOT EXISTS delivered_by TEXT NULL;

COMMIT;
