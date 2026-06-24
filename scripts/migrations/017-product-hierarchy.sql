-- 017-product-hierarchy.sql (two-level category / sub-product registry)
--
-- NOT YET APPLIED. Shown for review before prod (same gate as migration 014).
--
-- Adds a nullable self-referencing parent_id to products. A product is either a
-- top-level CATEGORY (parent_id NULL, may have children) or a SUB-PRODUCT
-- (parent_id -> a category). Two-level only is an APP-LEVEL invariant (a product
-- with a parent may not itself be a parent); the FK alone allows deeper nesting.
--
-- Backward-compatible: every existing product stays valid as a top-level entry
-- with no children until reorganised. No existing MOU is orphaned - mous.programme
-- still resolves via resolveProduct (product name / legacy_programmes), which is
-- unaffected by parent_id.
--
-- Seeds ONLY the confirmed Bootcamp grouping (Pranav): AIQ and Bootcamps - Harvard
-- become sub-products of the existing "Bootcamps" product (the category).
-- STEM - Robotics, YP and Lab Setup Project stay top-level (not told they are
-- categories). The full tree is DATA (admin-editable), not hard-coded here.
--
-- Down: 017-product-hierarchy.down.sql (DROP COLUMN parent_id).

-- Option (b) approved: "Bootcamps" is a pure category grouper. A new
-- "Bootcamps (general)" leaf sub-product holds the 3 existing Bootcamps MOUs
-- (GNIMS, Guru Nanak, B.K. Birla Kalyan) so no MOU sits directly on a category.
-- Those 3 MOUs are moved STEAM -> 'Bootcamps (general)' here (audited). This is
-- the ONLY MOU re-tag in this migration; the broader re-classification (Pranav's
-- ~10 pending rows) is NOT touched.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_id TEXT NULL REFERENCES products(id) ON DELETE RESTRICT;

-- (b) the leaf for the existing Bootcamps MOUs
INSERT INTO products (id, name, active, sort_order, legacy_programmes, kind, parent_id, created_by, audit_log)
VALUES ('bootcamps-general', 'Bootcamps (general)', TRUE, 7, ARRAY[]::text[], 'per-student', 'bootcamps', 'system (migration 017)',
  jsonb_build_array(jsonb_build_object('timestamp','2026-06-24T00:00:00Z','user','system (migration 017)','action','create',
    'after', jsonb_build_object('id','bootcamps-general','parentId','bootcamps'),
    'notes','Leaf sub-product under the Bootcamps category for the existing general-Bootcamps MOUs (option b).')))
ON CONFLICT (id) DO NOTHING;

-- place the confirmed bootcamp sub-products + the new general leaf under the category
UPDATE products
SET parent_id = 'bootcamps',
    audit_log = audit_log || jsonb_build_array(jsonb_build_object(
      'timestamp', '2026-06-24T00:00:00Z',
      'user', 'system (migration 017)',
      'action', 'product-parent-changed',
      'before', jsonb_build_object('parentId', null),
      'after', jsonb_build_object('parentId', 'bootcamps'),
      'notes', 'Confirmed by Pranav: bootcamp-type sub-product placed under the Bootcamps category.'
    ))
WHERE id IN ('aiq', 'bootcamps-harvard');

-- (b) move the 3 existing Bootcamps MOUs onto the leaf (audited)
UPDATE mous
SET programme = 'Bootcamps (general)',
    audit_log = audit_log || jsonb_build_array(jsonb_build_object(
      'timestamp', '2026-06-24T00:00:00Z',
      'user', 'system (migration 017)',
      'action', 'status_change',
      'before', jsonb_build_object('programme', programme),
      'after', jsonb_build_object('programme', 'Bootcamps (general)'),
      'notes', 'Option (b): moved from STEAM lump onto the Bootcamps (general) leaf so the Bootcamps category is a pure grouper. Confirmed bootcamp sale.'
    ))
WHERE id IN ('MOU-STEAM-2627-070', 'MOU-STEAM-2627-023', 'MOU-STEAM-2627-024');

COMMIT;
