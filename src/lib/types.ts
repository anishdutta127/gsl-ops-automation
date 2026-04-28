/*
 * Shared types for the GSL Ops Automation system.
 *
 * Sources:
 * - step 8 eng review Q-I (six net-new entities + Dispatch override + MOU
 *   extensions + MOU import review)
 * - Update 1 post-ceremony: Programme is 5-value enum; programmeSubType
 *   on MOU captures sub-types (e.g., 'GSLT-Cretile' under 'STEAM')
 * - Update 2 post-ceremony: MagicLinkToken (renamed and extended from
 *   FeedbackHmacToken) with `purpose` discriminator
 * - Week 1 fixture spec: User + UserRole (8 roles incl. Finance and
 *   TrainerHead added in Week 1)
 *
 * Every persistent entity carries `auditLog: AuditEntry[]` per the MOU
 * pattern (step 3 §10c). Exception: MagicLinkToken is a short-lived auth
 * primitive; the Communication that carried the token is the audit anchor.
 *
 * No runtime validation layer (Zod, etc.) per step 8 architectural choice.
 * Validators live in src/lib/importer/validators.ts and write-time guards
 * in their respective endpoint handlers.
 */

// ============================================================================
// Audit pattern (inherited from MOU; Ops adds domain-specific actions)
// ============================================================================

export type AuditAction =
  // Inherited from MOU
  | 'create'
  | 'update'
  | 'status_change'
  | 'reassignment'
  | 'file_upload'
  // Import + identity resolution (Q-A, Q-K)
  | 'auto-link-exact-match'
  | 'manual-relink'
  | 'gslt-cretile-normalisation'
  // Lifecycle stages
  | 'actuals-confirmed'
  | 'pi-issued'
  | 'dispatch-raised'
  | 'delivery-acknowledged'
  | 'feedback-submitted'
  // P2 exception (Q-J)
  | 'p2-override'
  | 'p2-override-acknowledged'
  // CC rule administration (step 6.5 Item H + step 7 Fix 5)
  | 'cc-rule-created'
  | 'cc-rule-toggle-on'
  | 'cc-rule-toggle-off'
  // WhatsApp draft surveillance mitigation (step 7 Fix 5)
  | 'whatsapp-draft-copied'
  // Feedback auto-escalation (Update 3)
  | 'auto-create-from-feedback'
  // Q-A importer: legacy-include flag (Item C INCLUDED flip path)
  | 'legacy-include-import'
  // W3-C C2: kanban skip / backward / Pre-Ops exit transitions. Forward-by-1
  // drags do NOT emit this action (the per-stage action like 'pi-issued' is
  // already the substantive audit record); skip / backward / Pre-Ops drags
  // emit this entry with the operator's reason in the notes field.
  | 'kanban-stage-transition'
  // W3-C C1 fold-in: emitted when a school/MOU edit form saves a real
  // startDate over the synthesised AY-start placeholder (e.g., 2025-04-01)
  // that deriveStage uses as a fallback when upstream startDate is null.
  // Phase 1.1 audit query: count MOUs that still carry the synthetic.
  | 'startdate-synthesis-replaced'
  // W3-D: emitted when an Admin edits a lifecycle rule's defaultDays via
  // /admin/lifecycle-rules. Captures before / after defaultDays and an
  // optional changeNotes field on the audit entry. Retroactively shifts
  // which MOUs render as overdue on next render.
  | 'lifecycle-rule-edited'
  // W4-A.2: emitted when a MOU's cohortStatus flips between 'active' and
  // 'archived' via /admin/mou-status, /mous/archive (reactivate), or the
  // initial W4-A.2 fixture migration. Captures before / after cohortStatus
  // and optional notes. The kanban + /mous default views filter on
  // cohortStatus === 'active'; archived MOUs surface only on /mous/archive
  // and the bulk admin page.
  | 'mou-cohort-status-changed'
  // W4-B.3: emitted when a MOU's delayNotes textarea is auto-saved on
  // blur. before / after capture the old and new notes, truncated to
  // ~200 chars with the suffix " ... [truncated; full notes on MOU]"
  // so the audit reader knows full text exists on the MOU record.
  // Empty / whitespace-only saves normalise to null.
  | 'mou-delay-notes-updated'
  // W4-B.5: emitted when /mous/[id]/payment-receipt records a
  // payment receipt against a Payment row. before / after capture
  // the receivedAmount + receivedDate + bankReference + paymentMode
  // + notes; the lib treats the action as edit-mode (re-recording on
  // an already-paid Payment is allowed and generates a fresh entry
  // so operators can correct wrong reference numbers).
  | 'payment-recorded'
  // W4-C.2: emitted when /mous/[id]/intake records an IntakeRecord
  // against a MOU. The audit entry lands on the MOU's auditLog (so
  // the MOU detail page surfaces it without joining IntakeRecord) and
  // a parallel entry lands on the IntakeRecord's own auditLog.
  // Captures studentsAtIntake / productConfirmed / gslTrainingMode
  // variances against the MOU's baseline values in the entry's
  // before / after fields when those values diverge.
  | 'intake-captured'
  // W4-C.3: emitted when the operator clicks "I sent it" on the
  // thank-you compose-and-copy panel. Sets
  // intakeRecord.thankYouEmailSentAt and writes a Communication
  // row of type='welcome-note' status='sent'. The audit entry lands
  // on both the IntakeRecord and the Communication.
  | 'intake-thank-you-sent'
  // W4-C.7: emitted when the W4-C.7 correction audit moves an
  // IntakeRecord to the correct active MOU. The W4-C.4 backfill
  // mismapped 11 of 23 records (the script's ROW_MAPPING assumed
  // sequential MOU-id numbering matched form-row order, which the
  // active 51-list does not follow). before / after capture the old
  // + new MOU id; mirrored on both the departing and arriving
  // parent MOU's auditLog so the audit trail follows the record.
  | 'intake-record-corrected-w4c7'
  // W4-D.1: DispatchRequest (Sales-initiated) lifecycle. The Sales
  // submitter creates a request via /dispatch/request; Ops reviews
  // via /admin/dispatch-requests and either approves (creating a
  // Dispatch via the conversion action), rejects (with rejection
  // reason), or the requester cancels before review. The
  // 'dispatch-request-converted' entry mirrors on both the
  // DispatchRequest auditLog and the resulting Dispatch's auditLog
  // so the trail crosses the entity boundary cleanly.
  | 'dispatch-request-created'
  | 'dispatch-request-approved'
  | 'dispatch-request-rejected'
  | 'dispatch-request-cancelled'
  | 'dispatch-request-converted'
  // W4-D.1: emitted when an Ops user edits the lineItems on a
  // Dispatch (or a DispatchRequest pre-conversion). before / after
  // capture the lineItems array. UI exposed via the Ops conversion
  // surface at /mous/[id]/dispatch.
  | 'dispatch-line-item-edited'
  // W4-D.8: emitted when the Mastersheet backfill mutation script
  // creates a Dispatch record from a Mastersheet TWs or Cretile row.
  // Mirrored on both the new Dispatch and the parent MOU's auditLog
  // so /mous/[id] surfaces the historical entry. The notes carry the
  // verification-table row reference + confidence label so the audit
  // remains tied to Anish's W4-D.8 Phase 1 sign-off.
  | 'dispatch-backfilled-from-mastersheet'
  // W4-E.2: emitted when the SPOC DB import mutation script creates
  // a SchoolSPOC entry from `ops-data/SCHOOL_SPOC_DATABASE.xlsx`.
  // Mirrored on both the SchoolSPOC and the parent School's auditLog
  // so /schools/[id] surfaces the historical entry. The notes carry
  // the verification-table sheet/row reference + match-confidence
  // label so the audit ties back to Anish's W4-E.2 Phase 1 sign-off.
  | 'school-spoc-imported-from-db'
  // W4-E.4: lifecycle for reminder Communications. 'reminder-composed'
  // emits when an operator clicks Compose on /admin/reminders and the
  // Communication record lands with status='queued-for-manual'. The
  // mirrored entry on the parent entity (MOU, Payment, Dispatch, or
  // the original feedback-request Communication) names the recipient
  // and threshold context. 'reminder-marked-sent' emits when the
  // operator clicks "I sent it" after pasting into Outlook; the parent
  // entity does NOT receive a parallel entry because the source-of-
  // truth for "we chased about X" is the Communication record indexed
  // by mouId + type.
  | 'reminder-composed'
  | 'reminder-marked-sent'
  // W4-F.1: SalesOpportunity lifecycle. Minimal-container scope per
  // Anish's option C decision. Free-text status / recce / gslModel
  // fields with no state-machine; the workflow vocabulary is deferred
  // to D-026 (post-round-2 interview with Pratik + Shashank). The 3
  // audit actions cover the only mutations the lib supports today;
  // approval / conversion-to-MOU actions are intentionally NOT added
  // until the workflow is defined.
  | 'opportunity-created'
  | 'opportunity-edited'
  | 'opportunity-marked-lost'
  // W4-E.5: emitted on every Notification record's auditLog.
  // 'create' is reused for the initial creation; 'mark-read' captures
  // a user clicking a notification or running mark-all-read. Idempotent:
  // re-marking an already-read notification is a no-op (no audit entry
  // appended).
  | 'notification-marked-read'

export interface AuditEntry {
  timestamp: string                // ISO
  user: string                     // User.id
  action: AuditAction
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  notes?: string
}

// ============================================================================
// User + roles (fixture-driven; permissions matrix in src/lib/auth/permissions.ts)
// ============================================================================

export type UserRole =
  | 'Admin'
  | 'Leadership'
  | 'SalesHead'
  | 'SalesRep'
  | 'OpsHead'
  | 'OpsEmployee'
  | 'Finance'
  | 'TrainerHead'

export interface User {
  id: string                                    // GSL ID convention: email-prefix (e.g., 'anish.d')
  name: string
  email: string                                 // for outbound notifications, magic-link issuance
  role: UserRole                                // base role
  testingOverride: boolean                      // default false; only Misba is true at fixture seed
  testingOverridePermissions?: UserRole[]       // present iff testingOverride is true
  active: boolean
  passwordHash: string                          // bcrypt hash; never plaintext anywhere
  createdAt: string                             // ISO
  auditLog: AuditEntry[]
}

/**
 * Staff JWT session claims. Signed by src/lib/crypto/jwt.ts; verified by
 * src/middleware.ts on every request. Cookie name: 'gsl_ops_session'.
 */
export interface SessionClaims {
  sub: string                                   // User.id
  email: string
  name: string
  role: UserRole
  iat?: number                                  // standard JWT (issued-at)
  exp?: number                                  // standard JWT (expires-at)
  iss?: string                                  // 'gsl-ops-automation'
  aud?: string                                  // 'staff'
}

// ============================================================================
// Programme (Update 1: GSLT-Cretile is a STEAM sub-type via programmeSubType)
// ============================================================================

export type Programme =
  | 'STEAM'            // covers GSLT-Cretile via programmeSubType per Update 1
  | 'Young Pioneers'
  | 'Harvard HBPE'
  | 'TinkRworks'       // 5 of 24 2026-04 MOUs per ground-truth §1
  | 'VEX'              // 1 of 24

// ============================================================================
// School
// ============================================================================

export interface School {
  id: string                       // 'SCH-...'
  name: string
  legalEntity: string | null
  city: string
  state: string
  region: string                   // 'East' | 'North' | 'South-West' per SPOC DB
  pinCode: string | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  billingName: string | null
  pan: string | null
  gstNumber: string | null         // null blocks PI generation per step 6.5 Item F
  notes: string | null
  active: boolean
  createdAt: string
  auditLog: AuditEntry[]
}

// ============================================================================
// SchoolGroup (Q-I; chain MOUs: Narayana WB, Techno India, Carmel)
// ============================================================================

export type SchoolScope = 'SINGLE' | 'GROUP'

export interface SchoolGroup {
  id: string                       // 'SG-NARAYANA_WB', 'SG-TECHNO_INDIA', 'SG-CARMEL'
  name: string
  region: string
  createdAt: string
  createdBy: string
  memberSchoolIds: string[]
  groupMouId: string | null        // FK to mous.json when one-MOU-covers-all-members
  notes: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// MOU (extended from MOU pattern with Ops fields)
// ============================================================================

export type MouStatus =
  | 'Draft'
  | 'Pending Signature'
  | 'Active'
  | 'Completed'
  | 'Expired'
  | 'Renewed'

/**
 * Cohort status (W4-A.2) is orthogonal to MouStatus.
 *
 *   - MouStatus is the lifecycle state (Draft / Pending Signature / Active /
 *     Completed / Expired / Renewed).
 *   - cohortStatus is whether the MOU is in the operationally-current cohort
 *     ('active') or the historical archive of past-academic-year cohorts
 *     ('archived').
 *
 * The kanban (/) and /mous default list filter cohortStatus === 'active'.
 * Archived MOUs surface only on /mous/archive (read + reactivate) and
 * /admin/mou-status (bulk per-MOU flip; Admin server-side gated). MOU detail
 * pages, /escalations, and /admin/audit do NOT filter by cohort because
 * those surfaces serve historical / cross-cohort use cases.
 *
 * A 'Pending Signature' MOU can be cohortStatus 'active' (in the current
 * pursued list) or 'archived' (lapsed pursuit from a prior AY); the two
 * dimensions are independent.
 *
 * W4-F (sales pipeline pre-MOU) may extend this enum to add 'pre-launch'
 * or similar; the type is left open for additional values.
 */
export type CohortStatus = 'active' | 'archived'

export type TrainerModel = 'Bootcamp' | 'GSL-T' | 'TT' | 'Other'

export interface MOU {
  id: string                       // 'MOU-STEAM-2627-001'
  schoolId: string
  schoolName: string               // denormalised for fast list rendering
  programme: Programme
  programmeSubType: string | null  // Update 1: 'GSLT-Cretile' under 'STEAM'; null otherwise
  schoolScope: SchoolScope         // 'SINGLE' default; 'GROUP' for chain MOUs (Q-I)
  schoolGroupId: string | null     // FK to SchoolGroup when schoolScope is 'GROUP'
  status: MouStatus
  cohortStatus: CohortStatus       // W4-A.2: orthogonal to status; see CohortStatus docs
  academicYear: string             // '2026-27'
  startDate: string | null         // ISO YYYY-MM-DD
  endDate: string | null
  studentsMou: number
  studentsActual: number | null
  studentsVariance: number | null
  studentsVariancePct: number | null
  spWithoutTax: number             // Rs per student, pre-tax
  spWithTax: number                // Rs per student, post-tax
  contractValue: number            // Rs total
  received: number
  tds: number
  balance: number
  receivedPct: number              // 0-100
  paymentSchedule: string          // '25-25-25-25 quarterly'
  trainerModel: TrainerModel | null
  salesPersonId: string | null     // FK to sales_team.json
  templateVersion: string | null
  generatedAt: string | null
  notes: string | null
  /**
   * W4-B.3: free-text "Status notes" / reason-for-delay captured on the
   * MOU detail page. Persistent textarea with 600ms auto-save on blur;
   * every save lands a 'mou-delay-notes-updated' audit entry with
   * before / after truncated to ~200 chars. Empty or whitespace-only
   * saves normalise to null. Editable by every authenticated user
   * (W3-B principle); attribution captured on the audit entry.
   */
  delayNotes: string | null
  daysToExpiry: number | null
  auditLog: AuditEntry[]
}

// ============================================================================
// SalesOpportunity (W4-F.1; pre-MOU sales pipeline container)
//
// Minimal container per Anish's option C: free-text status / recce /
// gslModel fields, no state machine, no approval workflow, no
// conversion-to-MOU flow. The Mastersheet Sheet1 sales-pipeline
// surface is a 2-row stub template with no operational data; building
// a state machine without operational input would embed assumptions
// about Pratik's actual sales process that may not match reality.
// D-026 captures the round-2 interview path: post-tester-interview
// the workflow vocabulary lands in a follow-up batch.
//
// Schema choices that affect the lib:
//   - schoolName is free-text initially. schoolId may FK to schools.json
//     once the recce confirms a stable record; pre-recce it stays null.
//   - gslModel, recceStatus, status, approvalNotes are FREE-TEXT. No
//     enum normalisation. Operators write whatever describes their
//     state; D-026 enumerates after round-2 interviews.
//   - programmeProposed re-uses the existing Programme enum (sales
//     reps pick STEAM / Young Pioneers / TinkRworks / Harvard HBPE /
//     VEX) so the conversion-to-MOU pre-fill stays consistent when
//     the conversion flow lands in Phase 2.
//   - conversionMouId is recorded once a follow-up batch creates the
//     MOU; today the field stays null even after both approvals.
//   - lossReason populated when sales rep clicks Mark as lost.
// ============================================================================

export interface SalesOpportunity {
  id: string                       // 'OPP-2627-001'
  schoolName: string               // free-text; populated even pre-recce
  schoolId: string | null          // FK to schools.json once recce confirms
  city: string
  state: string
  region: string
  salesRepId: string               // FK to sales_team.json
  programmeProposed: Programme | null
  /** Free-text per W4-F.1; D-026 enumerates after round 2. */
  gslModel: string | null
  commitmentsMade: string | null
  outOfScopeRequirements: string | null
  /** Free-text per W4-F.1; D-026 enumerates after round 2. */
  recceStatus: string | null
  recceCompletedAt: string | null
  /** Free-text per W4-F.1; D-026 enumerates after round 2. */
  status: string
  /** Free-text per W4-F.1; sales rep records approval state in plain language. */
  approvalNotes: string | null
  conversionMouId: string | null
  lossReason: string | null
  /**
   * W4-F.3 did-you-mean dismissal flag. The detail page surfaces an
   * inline panel when `schoolId === null` and `schoolName` token-
   * matches an existing school in `schools.json` above the 0.7
   * threshold. Operator clicks either "Link to existing school" (sets
   * schoolId, this flag stays false) or "Keep as new school" (sets
   * this flag to true; suggestion is suppressed on subsequent
   * detail-page renders). The flag is intentionally not surfaced in
   * the list / create form; it is detail-page-only state.
   */
  schoolMatchDismissed: boolean
  createdAt: string
  createdBy: string                // User.id
  auditLog: AuditEntry[]
}

// ============================================================================
// SchoolSPOC (W4-E.1; school-side point-of-contact directory)
//
// 1-to-many with School: a school may have multiple SPOCs (Principal,
// Coordinator, Vice-Principal). Imported from `ops-data/SCHOOL_SPOC_
// DATABASE.xlsx` via `scripts/w4e-spoc-import-mutation.mjs` (Phase 2,
// post-Anish-signoff on the W4-E.2 verification table). Editable
// thereafter via /schools/[id]/spocs (compose-and-copy lookups + audit
// trail; the school edit form does not duplicate the directory).
//
// `role` heuristic on import: the first SPOC row encountered per school
// is tagged 'primary'; subsequent rows are 'secondary'. This is a best-
// effort default that Anish reviews on the verification table; D-017
// captures the reorder path for multi-POC schools.
// ============================================================================

export type SchoolSpocRole = 'primary' | 'secondary'

export interface SchoolSPOC {
  id: string                       // 'SSP-...'
  schoolId: string                 // FK to schools.json
  name: string
  designation: string | null       // 'Principal', 'Coordinator', 'Vice-Principal'
  email: string | null             // RFC-5322 where present; raw text otherwise
  phone: string | null             // E.164 where normalisable; raw text otherwise
  role: SchoolSpocRole             // 'primary' for first row per school; 'secondary' otherwise
  active: boolean                  // false when SPOC has left the school; never deleted
  sourceSheet: 'East' | 'North' | 'South-West' | 'manual'
  sourceRow: number | null         // 1-indexed row in source sheet; null for manual additions
  createdAt: string
  createdBy: string                // 'system-w4e-import' for backfill; User.id for later
  auditLog: AuditEntry[]
}

// ============================================================================
// Notification (W4-E.5; in-app feed for internal cross-team signals)
//
// Phase 1 surface: a TopNav <NotificationBell /> badge + dropdown of last 10
// + a /notifications page with filters and mark-all-read. No outbound email
// from this entity (the W3-E compose-and-copy stays the school-facing path).
// Notifications are internal-only: when a Sales user submits a DispatchRequest,
// Ops users get a Notification; when Ops approves it, the Sales submitter
// gets one back. Self-broadcast is excluded server-side: createNotification
// drops the entry when senderUserId === recipientUserId (operators do not
// need a notification of their own action; the audit log already captures it).
//
// `kind` discriminator drives icon + copy in the dropdown; `actionUrl` is
// the deep-link the click navigates to (and which marks-read in the same
// request). `payload` carries entity FK metadata for round-trip rendering
// without re-fetching the source entity (e.g., `dispatchRequestId`).
// ============================================================================

export type NotificationKind =
  | 'dispatch-request-created'      // Sales submits -> notify Ops
  | 'dispatch-request-approved'     // Ops approves   -> notify requester
  | 'dispatch-request-rejected'     // Ops rejects    -> notify requester
  | 'dispatch-request-cancelled'    // Requester cancels pre-review -> notify Ops
  | 'intake-completed'              // Sales completes intake -> notify Ops + sales owner
  | 'payment-recorded'              // Finance records receipt -> notify Ops + sales owner
  | 'escalation-assigned'           // Escalation assigned -> notify assignee
  | 'reminder-due'                  // Reminder composed -> notify sales owner of MOU

export interface Notification {
  id: string                       // 'NTF-...'
  recipientUserId: string          // FK to users.json
  senderUserId: string             // FK to users.json; 'system' allowed for system-emitted
  kind: NotificationKind
  title: string                    // short headline rendered in dropdown
  body: string                     // one-line context (e.g., "for MOU-STEAM-2627-014")
  actionUrl: string                // deep-link path; click navigates + marks-read
  payload: Record<string, unknown> // entity FKs (e.g., { dispatchRequestId, mouId })
  createdAt: string                // ISO
  readAt: string | null            // null until first mark-read; idempotent thereafter
  auditLog: AuditEntry[]           // 'create' on creation; 'notification-marked-read' on first read
}

// ============================================================================
// Communication (Q-I; channel x status matrix)
// ============================================================================

export type CommunicationChannel =
  | 'email'
  | 'whatsapp-draft-copied'

export type CommunicationType =
  | 'welcome-note'
  | 'three-ping-cadence-t-30'
  | 'three-ping-cadence-t-14'
  | 'three-ping-cadence-t-7'
  | 'actuals-confirmation-request'
  | 'pi-sent'
  | 'payment-received-confirmation'
  | 'dispatch-raised'
  | 'delivery-acknowledgement-reminder'
  | 'feedback-request'
  | 'escalation-notification'
  | 'closing-letter'
  // W4-E.4 reminder templates (Phase 1: manual cadence via /admin/reminders).
  // Each rides the existing Communication entity with channel='email' and
  // status flowing 'queued-for-manual' -> 'sent' on operator mark-sent.
  | 'reminder-intake-chase'              // chase Sales for missing IntakeRecord
  | 'reminder-payment-chase'             // chase school for outstanding instalment
  | 'reminder-delivery-ack-chase'        // chase school for missing delivery acknowledgement
  | 'reminder-feedback-chase'            // chase SPOC for unsubmitted feedback past 48h

export type CommunicationStatus =
  | 'queued'             // email channel only: record written, automated send not yet attempted
  | 'queued-for-manual'  // email channel only: composed for clipboard copy, awaiting operator mark-sent
  | 'sent'               // email channel only: confirmed delivered (manual mark-sent or automated SMTP OK)
  | 'bounced'            // email channel only: bounce detected
  | 'failed'             // email channel only: non-bounce send failure
  | 'draft-copied'       // whatsapp-draft-copied channel only: terminal

export interface Communication {
  id: string                       // UUID
  type: CommunicationType
  schoolId: string
  mouId: string | null
  installmentSeq: number | null
  channel: CommunicationChannel
  subject: string | null
  bodyEmail: string | null
  bodyWhatsApp: string | null
  toEmail: string | null
  toPhone: string | null
  ccEmails: string[]               // resolved at send-time via resolveCcList
  queuedAt: string                 // always set
  queuedBy: string                 // User.id
  sentAt: string | null            // set on terminal email transition
  copiedAt: string | null          // set when channel is whatsapp-draft-copied
  status: CommunicationStatus
  bounceDetail: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// Escalation (Q-I; lane + level + auto-feedback per Update 3)
// ============================================================================

export type EscalationLane = 'OPS' | 'SALES' | 'ACADEMICS'
export type EscalationLevel = 'L1' | 'L2' | 'L3'
export type EscalationOrigin = 'manual' | 'p2-override' | 'feedback' | 'system'
export type EscalationStage =
  | 'mou-signed'
  | 'actuals-confirmation'
  | 'dynamic-recalculation'
  | 'proforma-invoice'
  | 'payment-reconciliation'
  | 'kit-dispatch'
  | 'training-rollout'
  | 'feedback-escalation'

export type EscalationStatus = 'open' | 'acknowledged' | 'resolved' | 'withdrawn'
export type EscalationSeverity = 'low' | 'medium' | 'high'

export interface Escalation {
  id: string
  createdAt: string
  createdBy: string                // User.id; 'system' for auto-created
  schoolId: string
  mouId: string | null
  stage: EscalationStage
  lane: EscalationLane
  level: EscalationLevel
  origin: EscalationOrigin
  originId: string | null          // FK to Feedback.id (origin='feedback') or Dispatch.id (origin='p2-override')
  severity: EscalationSeverity
  description: string
  assignedTo: string | null        // User.id; computed from (lane, level) at creation
  notifiedEmails: string[]         // fan-out list snapshotted at creation
  status: EscalationStatus
  resolutionNotes: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// CcRule (Q-I; literal scoping per step 6.5 Item D)
// ============================================================================

export type CcRuleScope =
  | 'region'           // all schools in a region
  | 'sub-region'       // e.g., 'Bangalore' within South-West
  | 'school'           // single schoolId
  | 'training-mode'    // all TTT schools, all GSL-Trainer schools
  | 'sr-no-range'      // North sheet 'Sr.no 1 to 7'

export type CcRuleContext =
  | 'welcome-note'
  | 'three-ping-cadence'
  | 'dispatch-notification'
  | 'feedback-request'
  | 'closing-letter'
  | 'escalation-notification'
  | 'all-communications'
  // W4-E.4 reminder contexts: each reminder kind picks up its own
  // CC fan-out from cc_rules.json. Existing rules with
  // 'all-communications' still match. New rules can target a single
  // reminder kind by listing only that context.
  | 'intake-reminder'
  | 'payment-reminder'
  | 'delivery-ack-reminder'
  | 'feedback-chase'

export interface CcRule {
  id: string                       // 'CCR-SW-RAIPUR-PUNE-NAGPUR', etc.
  sheet: 'South-West' | 'East' | 'North' | 'derived'
  scope: CcRuleScope
  scopeValue: string | string[]    // e.g., 'East', ['Raipur','Pune','Nagpur'], '1..7'
  contexts: CcRuleContext[]        // literal scoping per step 6.5 Item D
  ccUserIds: string[]              // FK to users.json OR sales_team.json; resolved to emails at send-time by ccResolver
  enabled: boolean                 // step 6.5 Item H; default true
  sourceRuleText: string           // original free-text from SPOC DB (audit)
  createdAt: string
  createdBy: string                // 'import' for 10 pre-seeded; User.id for later
  disabledAt: string | null
  disabledBy: string | null
  disabledReason: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// Feedback (Q-I; 4 categories with null-skip)
// ============================================================================

export type FeedbackCategory =
  | 'training-quality'
  | 'kit-condition'
  | 'delivery-timing'
  | 'trainer-rapport'

export interface FeedbackRating {
  category: FeedbackCategory
  rating: 1 | 2 | 3 | 4 | 5 | null   // null = SPOC explicitly skipped this category
  comment: string | null
}

export interface Feedback {
  id: string                       // UUID
  schoolId: string
  mouId: string
  installmentSeq: number
  submittedAt: string              // ISO
  submittedBy: 'spoc' | 'ops-on-behalf'
  submitterEmail: string | null
  ratings: FeedbackRating[]        // always length 4; categories in fixed order
  overallComment: string | null
  magicLinkTokenId: string | null  // FK to MagicLinkToken (purpose='feedback-submit'); null for ops-on-behalf
  auditLog: AuditEntry[]
}

// ============================================================================
// MagicLinkToken (Update 2; renamed and extended from FeedbackHmacToken)
//
// Extended FeedbackHmacToken into MagicLinkToken with a purpose enum rather
// than creating a separate StatusViewToken. Reasoning: same lifecycle
// (issued via Communication, consumed by SPOC, audit-archived on prune),
// same HMAC verification logic, same expiry-and-rotation pattern. Two
// separate entities would duplicate roughly 80% of the schema and the
// pruning script. The purpose enum cleanly distinguishes feedback-submit
// (single-use, 48h expiry) from status-view (multi-use, 30-day expiry).
// ============================================================================

export type MagicLinkPurpose = 'feedback-submit' | 'status-view'

export interface MagicLinkToken {
  id: string                       // UUID; 'tokenId' query param on the magic link
  purpose: MagicLinkPurpose
  mouId: string
  installmentSeq: number
  spocEmail: string                // who the link was issued to
  issuedAt: string                 // ISO
  expiresAt: string                // +48h for feedback-submit; +30 days for status-view
  usedAt: string | null            // feedback-submit: set on POST consume. status-view: always null.
  usedByIp: string | null          // feedback-submit: set on consume. status-view: always null.
  lastViewedAt: string | null      // status-view: updated on each GET. feedback-submit: always null.
  viewCount: number                // status-view: incremented per GET. feedback-submit: always 0.
  communicationId: string          // FK to Communication that carried this token
  // No auditLog: short-lived auth primitive; Communication is the audit anchor.
}

// ============================================================================
// Dispatch (Q-J; P2 exception via overrideEvent)
// W4-D.1: multi-SKU lineItems + DispatchRequest origin (Sales-initiated flow)
// ============================================================================

export type DispatchStage =
  | 'pending'
  | 'po-raised'
  | 'dispatched'
  | 'in-transit'
  | 'delivered'
  | 'acknowledged'

export interface DispatchOverrideEvent {
  overriddenBy: string             // User.id; Leadership role only at UI level
  overriddenAt: string             // ISO
  reason: string                   // mandatory; non-empty; UI enforces content
  acknowledgedBy: string | null    // Finance User.id; optional post-hoc ack
  acknowledgedAt: string | null
}

/**
 * W4-D.1 line item discriminated union. TinkRworks-style flat dispatches
 * (single quantity per SKU) vs Cretile-style per-grade allocations
 * (quantity broken down by grade band). The discriminator `kind` lets
 * TypeScript narrow correctly at every consumer; the Mastersheet
 * Delivery-Tracker TWs sheet seeds 'flat' rows and the Cretile sheet
 * seeds 'per-grade' rows.
 */
export type DispatchLineItem =
  | { kind: 'flat'; skuName: string; quantity: number }
  | {
      kind: 'per-grade'
      skuName: string
      gradeAllocations: { grade: number; quantity: number }[]
    }

/**
 * W4-D.1 Dispatch origin discriminator.
 *
 * - 'sales-request': Dispatch was created via /admin/dispatch-requests
 *    approve+convert from a Sales-submitted DispatchRequest. requestId
 *    is set.
 * - 'ops-direct': Dispatch was created directly by Ops via
 *    /mous/[id]/dispatch (the historical raiseDispatch lib path).
 *    requestId is null.
 * - 'pre-w4d': Pre-W4-D synthetic seed records migrated by the W4-D.1
 *    schema change. lineItems carries a single placeholder line; do
 *    not treat as authoritative product detail.
 */
export type DispatchOrigin = 'sales-request' | 'ops-direct' | 'pre-w4d'

export interface Dispatch {
  id: string
  mouId: string | null             // null permitted for P2 override pilots
                                   // before MOU is formally signed (DIS-002 pattern)
  schoolId: string
  installmentSeq: number
  stage: DispatchStage
  installment1Paid: boolean
  overrideEvent: DispatchOverrideEvent | null
  poRaisedAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  acknowledgedAt: string | null
  acknowledgementUrl: string | null  // signed handover form link
  notes: string | null
  // W4-D.1 multi-SKU + origin tracking
  lineItems: DispatchLineItem[]
  requestId: string | null         // FK to DispatchRequest when raisedFrom='sales-request'
  raisedBy: string                 // User.id; 'system-pre-w4d' for migrated seeds
  raisedFrom: DispatchOrigin
  auditLog: AuditEntry[]
}

/**
 * W4-D.1 DispatchRequest (Sales-initiated; Ops-approved).
 *
 * Workflow: Sales submits via /dispatch/request; the request lands in
 * status='pending-approval'. Ops reviews on /admin/dispatch-requests
 * and either approves (transitions to 'approved' and creates a Dispatch
 * with requestId set + raisedFrom='sales-request'), rejects (transitions
 * to 'rejected' with rejectionReason), or the requester cancels prior
 * to review (status='cancelled'). conversionDispatchId points at the
 * resulting Dispatch when status='approved'.
 *
 * Permission gate at write-time: Sales (SalesHead, SalesRep) can
 * create + cancel their own requests; Ops (Admin, OpsHead) approve
 * or reject any request. Cross-validation rules (active-cohort MOU,
 * intake completion, etc.) live in the lib mutator added in W4-D.2.
 */
export type DispatchRequestStatus =
  | 'pending-approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export interface DispatchRequest {
  id: string                       // 'DR-...'
  mouId: string                    // active cohort only; validated at write
  schoolId: string                 // denormalised for fast list rendering
  requestedBy: string              // User.id (Sales)
  requestedAt: string              // ISO
  requestReason: string            // free-text intent (pilot kickoff, post-payment, etc.)
  installmentSeq: number           // which instalment this dispatch covers
  lineItems: DispatchLineItem[]
  status: DispatchRequestStatus
  conversionDispatchId: string | null  // FK to Dispatch when status='approved'
  rejectionReason: string | null       // populated when status='rejected'
  reviewedBy: string | null            // Ops User.id (approve / reject) or requester (cancel)
  reviewedAt: string | null
  notes: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// MOU import review queue (Q-A)
// ============================================================================

export type MouImportValidationCategory =
  | 'tax_inversion'
  | 'student_count_implausible'
  | 'contract_value_implausible'
  | 'date_inversion'
  | 'unknown_programme'
  | 'schoolname_implausible'
  | 'id_format'

export interface MouImportReviewCandidate {
  schoolId: string                 // FK to schools.json
  schoolName: string               // denormalised for reviewer convenience
  matchKey: string                 // the normalised tuple that matched
}

/**
 * Rejection reason enum for import-review resolution=rejected (Phase
 * C5a-2). Five categories cover the common cases reviewers face;
 * 'other' requires rejectionNotes so the reviewer can describe the
 * one-off case in plain language. Future analytics ("what % of
 * rejections are data-quality vs duplicate") read this enum directly.
 */
export type RejectionReason =
  | 'data-quality-issue'
  | 'duplicate-of-existing'
  | 'out-of-scope'
  | 'awaiting-source-correction'
  | 'other'

export interface MouImportReviewItem {
  queuedAt: string                 // ISO
  rawRecord: unknown               // full MOU record as received
  validationFailed: MouImportValidationCategory | null
  quarantineReason: string         // human-readable summary
  candidates: MouImportReviewCandidate[] | null  // populated for school-matcher zero/multi paths; sorted by schoolId asc
  resolvedAt: string | null
  resolvedBy: string | null
  resolution: 'imported' | 'rejected' | 'punted-upstream' | null
  rejectionReason: RejectionReason | null   // populated when resolution === 'rejected'
  rejectionNotes: string | null             // required when rejectionReason === 'other'
}

// ============================================================================
// Sales team
// ============================================================================

export interface SalesPerson {
  id: string                       // 'sp-...'
  name: string
  email: string
  phone: string | null
  territories: string[]
  programmes: Programme[]
  active: boolean
  joinedDate: string               // ISO YYYY-MM-DD
}

// ============================================================================
// Payment + reconciliation (inherited from MOU)
// ============================================================================

export type PaymentMode =
  | 'Bank Transfer'
  | 'Cheque'
  | 'UPI'
  | 'Cash'
  | 'Zoho'
  | 'Razorpay'
  | 'Other'

export type PaymentStatus =
  | 'Received'
  | 'Pending'
  | 'Overdue'
  | 'Partial'
  | 'Due Soon'
  | 'PI Sent'
  | 'Paid'

export interface PartialPaymentEntry {
  date: string                     // ISO yyyy-mm-dd
  amount: number
  mode: PaymentMode | null
  reference: string | null
  notes: string | null
  paymentLogId: string | null
}

export interface Payment {
  id: string                       // `${mouId}-i${instalmentSeq}`, stable across syncs
  mouId: string
  schoolName: string
  programme: Programme
  instalmentLabel: string          // '1 of 4'
  instalmentSeq: number
  totalInstalments: number
  description: string
  dueDateRaw: string | null
  dueDateIso: string | null
  expectedAmount: number
  receivedAmount: number | null
  receivedDate: string | null
  paymentMode: PaymentMode | null
  bankReference: string | null     // UTR / Reference
  piNumber: string | null          // 'GSL/OPS/26-27/0001'
  taxInvoiceNumber: string | null
  status: PaymentStatus
  notes: string | null
  piSentDate: string | null
  piSentTo: string | null
  piGeneratedAt: string | null
  studentCountActual: number | null
  partialPayments: PartialPaymentEntry[] | null
  auditLog: AuditEntry[] | null
}

export interface PaymentLog {
  id: string                       // UUID
  date: string                     // ISO yyyy-mm-dd
  amount: number
  mode: PaymentMode
  reference: string | null
  narration: string | null
  salesPersonId: string | null
  matchedInstallmentIds: string[]  // payment.id values this was split across
  unmatched: boolean               // true until reconciled
  loggedBy: string                 // User.id
  loggedAt: string                 // ISO
  notes: string | null
}

// ============================================================================
// IntakeRecord (W4-C; post-signing intake form data)
//
// A new lifecycle stage `post-signing-intake` sits between `mou-signed` and
// `actuals-confirmed`. Card enters when MOU.status flips to Active; exits
// when an IntakeRecord with completedAt !== null exists for the MOU. The
// 22-field form replaces the legacy Google Form (`MOU_Signing_Details_
// 2026-2027__Responses_.xlsx`); 24 historical responses are backfilled
// via `scripts/w4c-backfill-intake.mjs`.
// ============================================================================

export type SubmissionStatus =
  | 'Submitted'
  | 'Pending'
  | 'In Transit'
  | 'Not Applicable'

/**
 * Form-facing training-mode enum. Maps to MOU.trainerModel:
 *   'GSL Trainer'             -> 'GSL-T'
 *   'Train The Trainer (TTT)' -> 'TT'
 * The intake captures the school-confirmed value verbatim; mou.trainerModel
 * stays as the historical baseline. W4-D dispatch consumes the intake value.
 */
export type GslTrainingMode = 'GSL Trainer' | 'Train The Trainer (TTT)'

export interface IntakeRecord {
  id: string                       // UUID; generated on first save
  mouId: string                    // FK to mous.json (1-to-1 in Phase 1)
  completedAt: string              // ISO datetime; the moment intake was submitted
  completedBy: string              // FK to users.json
  // Account ownership (W4-C.1: Account Owner field split per recon)
  salesOwnerId: string             // FK to sales_team.json; required
  // Location + grades
  location: string                 // free text e.g. 'Krishnanagar, Nadia, West Bengal'
  grades: string                   // free text e.g. '1-8' or '4-8'
  // Recipient details for the thank-you note (W4-C.3)
  recipientName: string
  recipientDesignation: string
  recipientEmail: string           // RFC-5322; validated at submit time
  // Student count + duration (variance vs MOU baseline surfaces a warning)
  studentsAtIntake: number         // variance vs mou.studentsMou warns; both saved
  durationYears: number            // 1..10
  startDate: string                // ISO yyyy-mm-dd; defaults to AY-start; override allowed
  endDate: string                  // ISO yyyy-mm-dd; > startDate; defaults to start + durationYears
  // Submission tracking
  physicalSubmissionStatus: SubmissionStatus
  softCopySubmissionStatus: SubmissionStatus
  // Product + training mode (variance vs MOU surfaces a warning)
  productConfirmed: Programme      // variance vs mou.programme warns
  gslTrainingMode: GslTrainingMode // variance vs mou.trainerModel warns
  // School POC (W4-C.1: split from the Google Form's combined POC + phone field)
  schoolPointOfContactName: string
  schoolPointOfContactPhone: string  // E.164 normalised where possible; raw text preserved when not
  // Signed copy URL (operator-pasted Drive / SharePoint / Dropbox link)
  signedMouUrl: string
  // Thank-you email tracking (compose-and-copy via W3-E pattern; mark-sent action)
  thankYouEmailSentAt: string | null
  auditLog: AuditEntry[]
}

// ============================================================================
// Queue + counter primitives (inherited from MOU pattern)
// ============================================================================

export type PendingUpdateEntity =
  | 'salesTeam'
  | 'mou'
  | 'school'
  | 'schoolGroup'
  | 'communication'
  | 'escalation'
  | 'ccRule'
  | 'feedback'
  | 'magicLinkToken'
  | 'dispatch'
  | 'dispatchRequest'              // W4-D.1
  | 'mouImportReview'
  | 'piCounter'
  | 'payment'
  | 'paymentLog'
  | 'user'
  | 'lifecycleRule'
  | 'intakeRecord'
  | 'schoolSpoc'                   // W4-E.1
  | 'notification'                 // W4-E.5
  | 'salesOpportunity'             // W4-F.1

export interface PendingUpdate {
  id: string                       // UUID
  queuedAt: string                 // ISO
  queuedBy: string                 // User.id
  entity: PendingUpdateEntity
  operation: 'update' | 'create' | 'delete'
  payload: Record<string, unknown>
  retryCount: number               // 0..5
  lastError?: string
}

export interface PiCounter {
  fiscalYear: string               // '26-27'
  next: number                     // next number to issue
  prefix: string                   // 'GSL/OPS' (Phase 1 default per Q-B)
}

// ============================================================================
// Lifecycle rules (W3-D editable kanban-stage durations)
//
// Each rule names a forward transition between two kanban stages and the
// default days a MOU may sit in the source stage before the kanban renders
// an Overdue badge. Editable via /admin/lifecycle-rules; per-rule auditLog
// captures every defaultDays change with before / after / notes.
//
// stageToKey is informational (the lookup used by the kanban indexes by
// stageFromKey). The 'mou-closed' literal models the post-feedback closure
// window which is not a real kanban column.
//
// Pre-Ops triage budget (30 days) is NOT in this collection: it is a
// while-in-stage budget for the holding bay rather than a transition
// between two stages, and the user W3-D scope explicitly listed only the
// 7 transition durations. The Pre-Ops budget stays hardcoded in
// stageDurations.ts; revisit if pilot operators need to tune it.
// ============================================================================

export interface LifecycleRule {
  stageFromKey: string             // KanbanStageKey
  stageToKey: string               // KanbanStageKey | 'mou-closed'
  defaultDays: number              // 1..365 inclusive
  customNotes: string
  updatedAt: string                // ISO
  updatedBy: string                // User.id; 'system' on initial seed
  auditLog: AuditEntry[]
}
