-- 015-mou-region.sql (salesperson -> region slice)
--
-- Adds a nullable `region` column to mous. The region is DERIVED from the
-- MOU's salesperson (sales_team.territories) at write time and stored here so
-- reports/aggregations can read it without re-joining. Additive and
-- non-destructive: existing rows get NULL; no data is rewritten.
--
-- Down: scripts/migrations/015-mou-region.down.sql (DROP COLUMN region).

BEGIN;

ALTER TABLE mous ADD COLUMN IF NOT EXISTS region TEXT NULL;

COMMIT;
