-- 009: FY 25-26 validated import (2026-05-27).
-- 2 inserts + 18 studentsMou fixes + 1 received fix.
-- Source: gsl_2526_import_ready.json (69 schools, validated by Anish).

BEGIN;

-- ============================================================================
-- 1. INSERT: Laxmipat Singhania Academy (MOU-STEAM-2526-071)
-- ============================================================================
INSERT INTO mous (
  id, school_id, school_name, programme, programme_sub_type,
  school_scope, school_group_id, status, cohort_status, academic_year,
  start_date, end_date, students_mou, students_actual,
  students_variance, students_variance_pct,
  sp_without_tax, sp_with_tax, contract_value,
  received, tds, balance, received_pct,
  payment_schedule, audit_log
) VALUES (
  'MOU-STEAM-2526-071',
  'SCH-LAXMIPAT_SINGHANIA_A',
  'Laxmipat Singhania Academy',
  'STEAM', NULL,
  'SINGLE', NULL, 'Active', 'archived', '2025-26',
  '2025-04-01', '2026-03-31', 420, 420,
  0, 0,
  1694.92, 2000, 769440,
  704232, 0, 65208, 91.5,
  '50-50 half-yearly',
  '[{"timestamp":"2026-05-27T00:00:00Z","user":"anish.d","action":"create","notes":"FY 25-26 validated import. Source: gsl_2526_import_ready.json."}]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. INSERT: NARAYANA SCHOOL (MOU-STEAM-2526-072)
-- ============================================================================
INSERT INTO mous (
  id, school_id, school_name, programme, programme_sub_type,
  school_scope, school_group_id, status, cohort_status, academic_year,
  start_date, end_date, students_mou, students_actual,
  students_variance, students_variance_pct,
  sp_without_tax, sp_with_tax, contract_value,
  received, tds, balance, received_pct,
  payment_schedule, notes, audit_log
) VALUES (
  'MOU-STEAM-2526-072',
  'SCH-NARAYANA_SCHOOL',
  'NARAYANA SCHOOL',
  'STEAM', NULL,
  'SINGLE', NULL, 'Active', 'archived', '2025-26',
  '2025-04-01', '2026-03-31', 2000, 819,
  -1181, -0.5905,
  847.46, 1000, 966420,
  180000, 0, 786420, 18.6,
  '50-50 half-yearly',
  NULL,
  '[{"timestamp":"2026-05-27T00:00:00Z","user":"anish.d","action":"create","notes":"FY 25-26 validated import. Source: gsl_2526_import_ready.json."}]'::jsonb
) ON CONFLICT (id) DO NOTHING;

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
