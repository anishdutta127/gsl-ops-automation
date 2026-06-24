-- 015-mou-region.down.sql (reverse of 015-mou-region.sql)
-- Drops the region column. Non-destructive to the rest of the row.

BEGIN;

ALTER TABLE mous DROP COLUMN IF EXISTS region;

COMMIT;
