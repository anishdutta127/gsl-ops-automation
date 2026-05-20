/*
 * Phase 6B PI blocker audit. Single source of truth for both the
 * /admin/pi-blockers UI and PI_BLOCKERS.md so they cannot drift.
 *
 * Every code path that can prevent a PI from being issued is listed
 * here with: condition, error key, user-facing message, file:line,
 * and the TESTING_OPEN_ACCESS bypass status.
 *
 * Finance-correctness invariants (entity-prefix, GSTIN policy, PAN
 * policy) are deliberately surfaced in the same table so any future
 * code that incorrectly opens them up is visible during audit.
 */

export type BlockerCategory =
  | 'cutover'
  | 'auth'
  | 'access'
  | 'validation'
  | 'data'
  | 'finance-correctness'
  | 'system'

export type BypassedByTestingOpenAccess =
  | 'no'
  | 'yes'
  | 'not-applicable'

export interface PiBlocker {
  /** Short stable id used in URLs and test ids. */
  id: string
  category: BlockerCategory
  /** The path or product surface the blocker applies to. */
  surface: 'MOU PI' | 'VEX PI' | 'Both' | 'MOU PI page'
  /** Human-readable condition that triggers the block. */
  condition: string
  /** Error key surfaced in API response or query param. */
  errorKey: string | null
  /** User-facing message. */
  message: string
  /** Source file + line where the check fires. */
  source: string
  /** Whether TESTING_OPEN_ACCESS=true bypasses this blocker. */
  bypassed: BypassedByTestingOpenAccess
  /** Auditor note: why the bypass status is what it is. */
  note: string
}

export const PI_BLOCKERS: PiBlocker[] = [
  {
    id: 'parallel-build-lock',
    category: 'cutover',
    surface: 'Both',
    condition:
      'PI_PARALLEL_BUILD_LOCK env var is unset, empty, or any value other than "false".',
    errorKey: 'parallel-build-locked',
    message:
      'PI generation is locked during the parallel-build window. Pranav continues issuing PIs from gsl-mou-system. This route activates at Gate 5 cutover.',
    source: 'src/lib/pi/parallelBuildLock.ts:26',
    bypassed: 'no',
    note:
      'Cutover lock is independent of access control. Default fails closed so an accidental redeploy never collides on the counter. Production unlock: PI_PARALLEL_BUILD_LOCK=false.',
  },
  {
    id: 'unauthenticated',
    category: 'auth',
    surface: 'Both',
    condition: 'No valid session.',
    errorKey: 'unauthenticated',
    message: 'Sign in to continue.',
    source:
      'src/app/api/pi/generate/route.ts:51, src/app/api/operations/vex/pi/create/route.ts:132',
    bypassed: 'no',
    note:
      'Auth gate runs before any access-layer check. TESTING_OPEN_ACCESS does not bypass auth.',
  },
  {
    id: 'unknown-user',
    category: 'auth',
    surface: 'MOU PI',
    condition: 'session.sub does not match any user in users.json.',
    errorKey: 'unknown-user',
    message: 'User account not found.',
    source: 'src/lib/pi/generatePi.ts:369',
    bypassed: 'no',
    note:
      'Identity lookup. Cannot be bypassed without falsifying the users.json record.',
  },
  {
    id: 'can-generate-pi-view',
    category: 'access',
    surface: 'MOU PI page',
    condition:
      'canGeneratePI(user) returns false (department not finance, not Admin wildcard).',
    errorKey: null,
    message: 'Redirected back to MOU detail with notice=pi-finance-only.',
    source: 'src/app/mous/[mouId]/pi/page.tsx:100',
    bypassed: 'yes',
    note:
      'Layer 1 view gate. Opens when TESTING_OPEN_ACCESS=true so testers can walk the flow. Layer 2 canPerform stays as defence in depth.',
  },
  {
    id: 'can-edit-finance-data',
    category: 'access',
    surface: 'VEX PI',
    condition:
      'canEditFinanceData(user) returns false (department not finance, not Admin wildcard).',
    errorKey: 'forbidden',
    message: 'Only Finance can generate VEX PIs.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:139',
    bypassed: 'yes',
    note:
      'Layer 1 edit gate. Opens when TESTING_OPEN_ACCESS=true. Layer 2 canPerform stays as defence in depth.',
  },
  {
    id: 'can-perform-mou-generate-pi',
    category: 'access',
    surface: 'MOU PI',
    condition:
      'canPerform(user, "mou:generate-pi") returns false. Only Admin role (wildcard) and Finance role grant this action.',
    errorKey: 'permission',
    message: 'Permission denied.',
    source: 'src/lib/pi/generatePi.ts:370',
    bypassed: 'no',
    note:
      'Layer 2 action gate. NOT bypassed by TESTING_OPEN_ACCESS per design (defence in depth). All current test users carry role=Admin so they trip ADMIN_WILDCARD and pass regardless.',
  },
  {
    id: 'missing-mou-id',
    category: 'validation',
    surface: 'MOU PI',
    condition: 'mouId form field missing or empty.',
    errorKey: 'missing-mou',
    message: 'No MOU was specified.',
    source: 'src/app/api/pi/generate/route.ts:63',
    bypassed: 'no',
    note: 'Form payload validation.',
  },
  {
    id: 'invalid-instalment-seq',
    category: 'validation',
    surface: 'MOU PI',
    condition: 'instalmentSeq is not a positive finite number.',
    errorKey: 'invalid-instalment-seq',
    message: 'Instalment sequence number is invalid.',
    source: 'src/app/api/pi/generate/route.ts:64',
    bypassed: 'no',
    note: 'Form payload validation.',
  },
  {
    id: 'mou-not-found',
    category: 'data',
    surface: 'MOU PI',
    condition: 'No MOU in mous.json matches the supplied mouId.',
    errorKey: 'mou-not-found',
    message: 'MOU not found.',
    source: 'src/lib/pi/generatePi.ts:375',
    bypassed: 'no',
    note: 'Data lookup.',
  },
  {
    id: 'wrong-status',
    category: 'data',
    surface: 'MOU PI',
    condition: 'MOU status is not "Active".',
    errorKey: 'wrong-status',
    message: 'PI generation is only allowed on Active MOUs.',
    source: 'src/lib/pi/generatePi.ts:376',
    bypassed: 'no',
    note: 'Lifecycle gate. Drafts and signed-but-pending MOUs cannot issue PIs.',
  },
  {
    id: 'school-not-found',
    category: 'data',
    surface: 'MOU PI',
    condition: 'No School in schools.json matches the MOU.schoolId.',
    errorKey: 'school-not-found',
    message: 'Linked school not found.',
    source: 'src/lib/pi/generatePi.ts:379',
    bypassed: 'no',
    note: 'Data integrity.',
  },
  {
    id: 'template-missing',
    category: 'system',
    surface: 'MOU PI',
    condition: 'The PI .docx template file is missing on the deploy.',
    errorKey: 'template-missing',
    message:
      'PI template missing on the server. Operator must restore the template and retry.',
    source: 'src/lib/pi/generatePi.ts:127',
    bypassed: 'no',
    note:
      'Filesystem-side check. Unrelated to access control. The error path also logs the underlying TemplateMissingError to the server console.',
  },
  {
    id: 'idempotency-short-circuit',
    category: 'system',
    surface: 'MOU PI',
    condition:
      'A Payment row already exists for this (mouId, instalmentSeq) AND has a piNumber. The call re-renders the existing PI instead of advancing the counter.',
    errorKey: null,
    message: 'PI re-rendered for existing payment row (no new number minted).',
    source: 'src/lib/pi/generatePi.ts:386',
    bypassed: 'no',
    note:
      'Not strictly a blocker; a guardrail against double-issue burning a fresh number on a duplicate click. Listed here for audit completeness.',
  },
  {
    id: 'vex-invalid-json',
    category: 'validation',
    surface: 'VEX PI',
    condition: 'POST body is not valid JSON.',
    errorKey: 'invalid-json',
    message: 'Request body must be valid JSON.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:149',
    bypassed: 'no',
    note: 'Payload parse.',
  },
  {
    id: 'vex-invalid-entity',
    category: 'finance-correctness',
    surface: 'VEX PI',
    condition: 'entityKey is not "MH" or "UP".',
    errorKey: 'invalid-entity',
    message: 'Pick MH or UP.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:154',
    bypassed: 'no',
    note:
      'ENTITY-PREFIX CHECK. Hardcoded enum check. NOT an access-layer gate so TESTING_OPEN_ACCESS cannot bypass it. Programme-PI uses the equivalent invariant via getEntityForProgramme (hardcoded programmeRouting map).',
  },
  {
    id: 'vex-missing-billing-block',
    category: 'validation',
    surface: 'VEX PI',
    condition:
      'schoolName, shippingAddress, billingName, or billingAddress is missing.',
    errorKey: 'missing-billing-block',
    message: 'Fill every school billing field.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:167',
    bypassed: 'no',
    note: 'Document-integrity validation. Not bypassed by TESTING_OPEN_ACCESS.',
  },
  {
    id: 'vex-missing-contact',
    category: 'validation',
    surface: 'VEX PI',
    condition: 'contactPerson or contactNo is missing.',
    errorKey: 'missing-contact',
    message: 'Contact person and number required.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:173',
    bypassed: 'no',
    note: 'Document-integrity validation.',
  },
  {
    id: 'vex-invalid-line-items',
    category: 'validation',
    surface: 'VEX PI',
    condition:
      'No line items, or any line item has an unknown partNumber / non-positive quantity / non-positive unitPrice.',
    errorKey: 'invalid-line-items',
    message: 'Add at least one valid product row.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:180',
    bypassed: 'no',
    note:
      'Catalog lookup against vex_products.json runs inside this check. Not bypassed.',
  },
  {
    id: 'counter-failure',
    category: 'system',
    surface: 'VEX PI',
    condition:
      'Counter atomic update exhausted retries (3) on the GitHub Contents API.',
    errorKey: 'counter-failure',
    message: 'Failed to issue PI number. Retry.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:196',
    bypassed: 'no',
    note:
      'Infrastructure-side failure. Operator must check queue health and retry.',
  },
  {
    id: 'queue-failure',
    category: 'system',
    surface: 'VEX PI',
    condition:
      'enqueueUpdate failed to commit the new VexPi record to pending_updates.json.',
    errorKey: 'queue-failure',
    message: 'Failed to queue the new VEX PI. Retry or WhatsApp Anish.',
    source: 'src/app/api/operations/vex/pi/create/route.ts:262',
    bypassed: 'no',
    note:
      'Side-effect of GitHub Contents API failure. The counter has already advanced at this point, so the PI number will gap. Numbers never duplicate.',
  },
  {
    id: 'gstin-policy',
    category: 'finance-correctness',
    surface: 'MOU PI',
    condition:
      'school.gstNumber is null or empty. Per W4-A.6, GSTIN is NOT a blocker; the .docx renders "GSTIN: To be added" placeholder.',
    errorKey: null,
    message: 'Inline note on the PI page: "GSTIN: To be added".',
    source: 'src/lib/pi/generatePi.ts:178 (placeholder render only)',
    bypassed: 'not-applicable',
    note:
      'POLICY FLAG for Anish: GSTIN is deliberately non-blocking per W4-A.6. PI can be issued without GSTIN and the .docx surfaces the placeholder. Confirm this remains intended at cutover; if GSTIN should block PI generation for finance correctness, this is a code change, not a config flip.',
  },
  {
    id: 'pan-policy',
    category: 'finance-correctness',
    surface: 'Both',
    condition:
      'PAN is not validated per PI. Company PAN (AAOCM1035E) lives in config/company.json as identity configuration.',
    errorKey: null,
    message: '(no per-PI PAN check exists)',
    source: 'config/company.json (company.pan)',
    bypassed: 'not-applicable',
    note:
      'POLICY FLAG for Anish: PAN is not a per-PI input; it is company-side identity. No code path can bypass it because there is nothing to bypass. Listed here so the audit is complete.',
  },
]
