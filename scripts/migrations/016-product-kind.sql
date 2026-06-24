-- 016-product-kind.sql (Lab Setup out-of-scope marker)
--
-- Adds a `kind` flag to products: 'per-student' (the platform's students x price
-- model) vs 'project' (project-based work with no per-student model, tracked
-- externally). Marks Lab Setup Project as 'project' per Pranav: it is lab-setup
-- project work (0 students) and must NOT be treated as a per-student product or
-- read as a gap when it carries no MOUs. The product is KEPT (flagged, not
-- deleted) and the change is audited on its audit_log.
--
-- Additive + reversible: existing rows default to 'per-student'; down drops the
-- column (016-product-kind.down.sql).

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'per-student';

UPDATE products
SET kind = 'project',
    audit_log = audit_log || jsonb_build_array(jsonb_build_object(
      'timestamp', '2026-06-24T00:00:00Z',
      'user', 'system (migration 016)',
      'action', 'product-kind-changed',
      'before', jsonb_build_object('kind', 'per-student'),
      'after', jsonb_build_object('kind', 'project'),
      'notes', 'Confirmed by Pranav: Lab Setup Project is project-based lab work (no per-student model). Marked out-of-scope for the per-student MOU system so it is not expected to carry MOUs and does not read as a reconciliation gap. Tracked externally.'
    ))
WHERE id = 'lab-setup-project';

COMMIT;
