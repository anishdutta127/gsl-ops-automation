-- 019-vex-dispatch-delivered.down.sql (reverse of 019-vex-dispatch-delivered.sql)
-- Drops the delivery-confirmation columns. SAFE only after the app code that
-- reads/writes delivered_at + delivered_by has been reverted.

BEGIN;

ALTER TABLE vex_dispatches DROP COLUMN IF EXISTS delivered_at;
ALTER TABLE vex_dispatches DROP COLUMN IF EXISTS delivered_by;

COMMIT;
