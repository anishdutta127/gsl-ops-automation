-- Phase 7 schema fixups based on the Pause 2 dry-run review.
--
-- 1. Relax NOT NULL on sales_team.email and school_spocs.email.
--    Two real sales reps (sp-brij-singh, sp-kranthi) and one SPOC
--    (SSP-W4E-N-r10) have no email on file yet. Per Anish: do NOT
--    invent placeholder emails (a fake address could accidentally
--    receive a PI). Allow NULL so the source data lands honestly.
--
-- 2. Widen mou_import_review.resolution CHECK to include
--    'approved-as-single'. This is a legitimate workflow state from
--    the Q-A import review flow (matched + merged into an existing
--    MOU rather than created new); the Part 1 schema design missed
--    it.
--
-- Run as a single transaction so a partial schema patch does not
-- land. The DDL is idempotent via ALTER ... IF EXISTS / DROP IF
-- EXISTS for the constraint swap.

BEGIN;

ALTER TABLE sales_team ALTER COLUMN email DROP NOT NULL;

ALTER TABLE school_spocs ALTER COLUMN email DROP NOT NULL;

ALTER TABLE mou_import_review DROP CONSTRAINT IF EXISTS mou_import_review_resolution_check;
ALTER TABLE mou_import_review
  ADD CONSTRAINT mou_import_review_resolution_check
  CHECK (
    resolution IN ('imported','rejected','punted-upstream','approved-as-single')
    OR resolution IS NULL
  );

COMMIT;
