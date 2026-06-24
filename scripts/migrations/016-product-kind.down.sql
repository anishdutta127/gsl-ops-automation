-- 016-product-kind.down.sql (reverse of 016-product-kind.sql)
-- Drops the kind column. The audit entry appended to Lab Setup's audit_log
-- remains (harmless, and an accurate historical record).

BEGIN;

ALTER TABLE products DROP COLUMN IF EXISTS kind;

COMMIT;
