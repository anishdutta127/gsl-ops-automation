-- 014-products-registry.sql (Phase 1.4)
--
-- Admin-managed product registry, seeded from the FY26-27 finance taxonomy
-- ("Summary 26-27" in Anish Data - 23.06.26.xlsx).
--
-- DESIGN (reversible, non-destructive):
--   1. New `products` table = the registry. Seeded with the 6 finance products.
--      Each row carries `legacy_programmes[]` listing the app's existing
--      mous.programme value(s) that map to it, so existing MOUs resolve to a
--      product WITHOUT rewriting any mous.programme data.
--   2. The mous.programme CHECK is DROPPED (relaxed), not replaced with a static
--      list: the registry is now the source of truth and products are
--      user-managed (add/rename/retire with no code change), so a static CHECK
--      would have to be re-migrated on every new product. Validation moves to the
--      app (programme must match a product name or a product's legacy_programme).
--   3. Existing mous.programme values (only 'STEAM' x159 and 'Young Pioneers' x29
--      in prod) are LEFT UNCHANGED and remain valid; they resolve via
--      legacy_programmes (STEAM,Robotics -> STEM - Robotics; Young Pioneers -> YP;
--      Harvard HBPE -> Bootcamps - Harvard). No MOU is orphaned.
--
-- Down migration: scripts/migrations/014-products-registry.down.sql (re-adds the
-- original CHECK and drops the table). The down is valid while every
-- mous.programme is still one of the original four (true at apply time, before
-- Phase 2 writes any new-product MOUs).

BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_programmes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  audit_log JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Seed: the 6 finance-taxonomy products. legacy_programmes maps existing app
-- programmes onto the canonical finance name (no duplicate rows for STEAM vs
-- Robotics: both fold into STEM - Robotics).
INSERT INTO products (id, name, sort_order, legacy_programmes) VALUES
  ('stem-robotics',     'STEM - Robotics',     1, ARRAY['STEAM','Robotics']),
  ('yp',                'YP',                  2, ARRAY['Young Pioneers']),
  ('aiq',               'AIQ',                 3, ARRAY[]::text[]),
  ('bootcamps',         'Bootcamps',           4, ARRAY[]::text[]),
  ('bootcamps-harvard', 'Bootcamps - Harvard', 5, ARRAY['Harvard HBPE']),
  ('lab-setup-project', 'Lab Setup Project',   6, ARRAY[]::text[])
ON CONFLICT (id) DO NOTHING;

-- Relax the programme CHECK. Existing values stay valid free-text; the app
-- validates programme against the products registry + legacy_programmes.
ALTER TABLE mous DROP CONSTRAINT IF EXISTS mous_programme_check;

COMMIT;
