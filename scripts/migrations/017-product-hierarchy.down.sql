-- 017-product-hierarchy.down.sql (reverse of 017-product-hierarchy.sql)
-- Drops parent_id. Audit entries appended to children remain (harmless record).
-- No MOU is affected (parent_id never participated in MOU resolution).

BEGIN;

ALTER TABLE products DROP COLUMN IF EXISTS parent_id;

COMMIT;
