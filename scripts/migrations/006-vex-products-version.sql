-- Phase 7 Part 5.B P3-NEEDS-FIX OCC: vex_products.version.
--
-- /admin/operations/vex/products/[partNumber]/edit is an admin edit
-- form (default_unit_price, active toggle). Two wildcard admins
-- editing the same product can clobber each other's edit silently.
-- Same OCC pattern as cc_rules / communication_templates.

BEGIN;

ALTER TABLE vex_products
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
