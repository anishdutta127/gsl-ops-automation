-- 009: FY 25-26 validated import (2026-05-27).
-- 18 studentsMou fixes + 1 received fix + 1 flag.
-- Source: gsl_2526_import_ready.json (69 schools, validated by Anish).
--
-- NOTE: The original migration also inserted Laxmipat Singhania (-071)
-- and NARAYANA SCHOOL (-072), but these already existed in production
-- postgres as -001 and -027 (Phase 7 archive recovery, not in the JSON
-- seed). The duplicate inserts were deleted on 2026-05-27 after
-- side-by-side verification. The INSERTs are removed from this file so
-- a future re-run is a clean no-op. Pricing discrepancies on -001 and
-- -027 are flagged to Pranav for finance judgement.

BEGIN;

-- ============================================================================
-- 3. FIX: studentsMou 0 -> NULL for 18 schools where source says "not specified"
-- ============================================================================
UPDATE mous SET students_mou = NULL
WHERE id IN (
  'MOU-STEAM-2526-025',  -- Doon Scholars School
  'MOU-STEAM-2526-026',  -- RBSM PUBLIC SCHOOL
  'MOU-STEAM-2526-029',  -- Shemrock School
  'MOU-STEAM-2526-030',  -- ITIKI School
  'MOU-STEAM-2526-031',  -- The Shree ji school
  'MOU-STEAM-2526-034',  -- National Gems Higher Secondary School
  'MOU-STEAM-2526-035',  -- B I T Global School
  'MOU-STEAM-2526-037',  -- Modern High School International (#1)
  'MOU-STEAM-2526-038',  -- Modern High School International (#2)
  'MOU-STEAM-2526-042',  -- Rishi Aurobindo Memorial Academy (#2)
  'MOU-STEAM-2526-044',  -- Podar International School Howrah
  'MOU-STEAM-2526-045',  -- Shree Pralhadrao Kashid Foundation
  'MOU-STEAM-2526-052',  -- Ebenezer Modern Matriculation
  'MOU-STEAM-2526-060',  -- Clever Minds School (#2)
  'MOU-STEAM-2526-064',  -- Darshan Academy, Pune
  'MOU-STEAM-2526-065',  -- Shivam Eduactional Academy_Indraprastha
  'MOU-STEAM-2526-066',  -- Shivam Eduactional Academy_Bhatagaon
  'MOU-STEAM-2526-068'   -- Don Bosco Matric Higher Secondary School
) AND students_mou = 0;

-- ============================================================================
-- 4. FIX: Julien Eglin Road erroneous received figure -> 0
-- ============================================================================
UPDATE mous SET
  received = 0,
  balance = contract_value,
  received_pct = 0,
  audit_log = audit_log || '[{"timestamp":"2026-05-27T00:00:00Z","user":"anish.d","action":"import-correction","before":{"received":3290523},"after":{"received":0},"notes":"FY 25-26 import: source received was erroneous (5.7x sales). Set blank pending Pranav real number."}]'::jsonb
WHERE id = 'MOU-STEAM-2526-007'
  AND received = 3290523;

-- ============================================================================
-- 5. FLAG: Sagaya Matha duplicate for Pranav review
-- ============================================================================
-- MOU-STEAM-2526-070 (*Sagaya Matha) and MOU-STEAM-2526-049 (*Sagaya Matha)
-- have similar names+amounts. NOT deleting; flagging via audit note.
UPDATE mous SET
  audit_log = audit_log || '[{"timestamp":"2026-05-27T00:00:00Z","user":"anish.d","action":"import-flag","notes":"FY 25-26 import: possible duplicate of MOU-STEAM-2526-049 (same school, similar amounts). Flagged for Pranav review: genuine second engagement or data duplicate?"}]'::jsonb
WHERE id = 'MOU-STEAM-2526-070';

COMMIT;
