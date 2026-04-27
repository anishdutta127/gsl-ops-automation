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
  daysToExpiry: number | null
  auditLog: AuditEntry[]
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

export interface Dispatch {
  id: string
  mouId: string
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
  | 'mouImportReview'
  | 'piCounter'
  | 'payment'
  | 'paymentLog'
  | 'user'

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
