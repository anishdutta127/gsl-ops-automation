-- 014-products-registry.down.sql  (reverse of 014-products-registry.sql)
--
-- Restores the original mous.programme CHECK and drops the products table.
-- SAFE only while every mous.programme is still one of the original four values
-- ('STEAM','Young Pioneers','Harvard HBPE','Robotics'). True at apply time and
-- until Phase 2 writes a MOU carrying a new finance product name; if such rows
-- exist, re-map them back before running this down (the ADD CONSTRAINT would
-- otherwise fail, which is the intended guard - it refuses to silently orphan).

BEGIN;

ALTER TABLE mous ADD CONSTRAINT mous_programme_check
  CHECK (programme = ANY (ARRAY['STEAM','Young Pioneers','Harvard HBPE','Robotics']));

DROP TABLE IF EXISTS products;

COMMIT;
