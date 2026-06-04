-- Step 1 product-portfolio rework (2026-06-04): structured MOU.products[].
--
-- Adds a JSONB `products` column to mous holding the structured
-- product portfolio (MouProduct[]: product brand, skuName, gradeSpecific,
-- grades[] for grade-agnostic kits, perGradeQuantity for grade-banded
-- ones). Modelled on the proven legacy DispatchLineItem union. Supersedes
-- the brand-only product_selection, which stays derivable during the
-- transition (deriveProductSelection).
--
-- DISPATCH TRACKING ONLY - never read by pricing/PI.
--
-- Additive + idempotent: ADD COLUMN IF NOT EXISTS, nullable, no default,
-- so existing 190 rows are untouched (NULL = no portfolio yet) and the
-- read mapper coalesces NULL -> null.
--
-- Run with:
--   node scripts/apply-migration.mjs scripts/migrations/010-mou-products.sql

BEGIN;

ALTER TABLE mous
  ADD COLUMN IF NOT EXISTS products JSONB;

COMMIT;
