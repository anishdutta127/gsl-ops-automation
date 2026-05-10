/*
 * Shared types for the GSL MOU system.
 *
 * All values match what the sync script writes to src/data/*.json.
 * Programmes use the full names from the source Excel ("Young Pioneers",
 * not "YP") so the Rate Card and Registry stay aligned.
 */

// Gate 2 §7.1: extended to 4 values to match the canonical Ops Programme.
// The mou-system source-of-truth was 3-value; Robotics admits the new
// programme without altering any existing case-switching behaviour because
// no programme-specific branches are added. Pricing + recalc + PI routing
// all read from company.json programmeRouting which lists Robotics->UP.
export type Programme = 'STEAM' | 'Young Pioneers' | 'Harvard HBPE' | 'Robotics'

export type MouStatus =
  | 'Draft'                          // Phase 3: in MOU Pipeline, sales person drafting
  | 'Sent for Signing'               // Phase 3: emailed/printed for school signature
  | 'Awaiting Signature'             // Phase 3: with the school for sign-off
  | 'Pending Signature'              // legacy alias of Awaiting Signature
  | 'Signed'                         // Phase 3: signed PDF uploaded; in Signed Registry
  | 'Active'                         // legacy/Phase 2 alias of Signed
  | 'Completed'
  | 'Expired'
  | 'Renewed'

export type PaymentStatus =
  | 'Received'
  | 'Pending'
  | 'Overdue'
  | 'Partial'
  | 'Due Soon'     // Phase 2: within 14 days
  | 'PI Sent'      // Phase 2: Proforma issued, awaiting payment
  | 'Paid'         // Phase 2: canonical synonym of 'Received' for new-code consistency

export type AlertPriority = 'High' | 'Medium' | 'Low'

export type AlertType =
  | 'Payment Overdue'
  | 'Count Mismatch'
  | 'Renewal Due'
  | 'Missing Data'

export type AlertStatus = 'Open' | 'Resolved' | 'Dismissed'

/**
 * TT and TTT are aliases (Train the Trainer). GSL-T = Train the
 * students with a GSL trainer. Bootcamp + Other kept for legacy.
 */
export type TrainerModel = 'Bootcamp' | 'GSL-T' | 'TT' | 'TTT' | 'Other'

export type SalesChannel =
  | 'School Programs (Course)'
  | 'Bootcamps'
  | 'Partnerships - Govt Projects'
  | 'Others'

export interface YearPaymentInstalment {
  /** Free-text month label, e.g. "April 2026" or "Q1". */
  month: string
  /** Percentage 0-100. The sum across instalments in a year must equal 100. */
  pctDue: number
}

export interface YearPaymentSchedule {
  /** 1-based year index within the MOU. */
  year: number
  instalments: YearPaymentInstalment[]
}

/**
 * Per-year price per student. Phase 3 Round 3 adds this to support
 * multi-year MOUs where pricing differs each year (Pranav's 2-year
 * example: Year 1 Rs 1500/student, Year 2 may be Rs 1600/student).
 *
 * Backwards compatibility: when this is null/empty, callers fall back
 * to the top-level `spWithTax` / `spWithoutTax` on the MOU and apply it
 * uniformly across `numberOfYears` years.
 */
export interface YearlyPricingRow {
  year: number
  spWithoutTax: number
  spWithTax: number
}

/**
 * Standard billing section captured at MOU draft time and copied onto
 * the generated .docx body (Phase 3 Step 4). 13 fields per Pranav's
 * spec, mostly pulled from the school record where possible.
 */
export interface MouBillingBlock {
  billingName: string
  billingAddress: string
  billingCityState: string
  shipToName: string
  shipToAddress: string
  shipToCityState: string
  schoolEmail: string
  contactPersonName: string
  designation: string
  mobileNo: string
  contactEmail: string
  schoolContactNo: string
  pan: string
  gst: string
}

export type PaymentMode =
  | 'Bank Transfer'
  | 'Cheque'
  | 'UPI'
  | 'Cash'
  | 'Zoho'
  | 'Razorpay'
  | 'Other'

export interface MOU {
  id: string                       // "MOU-STEAM-2526-001"
  schoolId: string
  schoolName: string               // denormalised for fast list rendering
  programme: Programme
  status: MouStatus
  academicYear: string             // "2025-26"
  startDate: string | null         // ISO YYYY-MM-DD
  endDate: string | null
  studentsMou: number
  studentsActual: number | null
  studentsVariance: number | null  // signed (actual - committed)
  studentsVariancePct: number | null  // decimal, e.g. 0.118 = 11.8%
  spWithoutTax: number             // Rs per student, pre-tax
  spWithTax: number                // Rs per student, post-tax
  contractValue: number            // Rs total
  received: number
  tds: number
  balance: number
  receivedPct: number              // 0-100
  paymentSchedule: string          // legacy "25-25-25-25 quarterly" string
  trainerModel: TrainerModel | null
  salesRep: string | null          // v1 free-text, preserved for backward compatibility
  notes: string | null
  daysToExpiry: number | null
  // v2 fields
  salesPersonId: string | null     // FK to sales_team.json; null until backfill succeeds
  templateVersion: string | null   // e.g. "STEAM-v2.1"; null for pre-v2 MOUs
  generatedAt: string | null       // ISO timestamp, set by generator on save-draft
  draftVariables: Record<string, string> | null
  auditLog: AuditEntry[]
  // Phase 3 Step 4 fields
  effectiveDate?: string | null
  numberOfYears?: number | null
  salesChannel?: SalesChannel | null
  schoolCrmId?: string | null      // free-text reference to the sales CRM
  paymentSchedules?: YearPaymentSchedule[] | null
  /** Per-year pricing. Round 3: when set, contract value and instalments
   *  use this. When null/empty, callers fall back to the top-level
   *  spWithTax * numberOfYears for the contract value. */
  yearlyPricing?: YearlyPricingRow[] | null
  billingBlock?: MouBillingBlock | null
  signedMouPdfPath?: string | null // public/signed-mous/<mou>.pdf once uploaded
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'status_change'
  | 'reassignment'
  | 'file_upload'

export interface AuditEntry {
  timestamp: string                // ISO
  user: string                     // identity name
  action: AuditAction
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  notes?: string
}

export type SalesProgramme = 'STEAM' | 'Young Pioneers' | 'Harvard HBPE' | 'VEX'

export interface SalesPerson {
  id: string                       // "sp-priya"
  name: string
  email: string
  phone: string | null
  territories: string[]
  programmes: SalesProgramme[]
  active: boolean
  joinedDate: string               // ISO YYYY-MM-DD
}

export type PendingUpdateEntity =
  | 'salesTeam'
  | 'mou'
  | 'installment'
  | 'vexOrder'
  | 'agreement'
  | 'paymentLog'
  | 'signedValues'
  | 'piIssue'
  | 'piCounter'

export interface PendingUpdate {
  id: string                       // UUID
  queuedAt: string                 // ISO
  queuedBy: string                 // identity name
  entity: PendingUpdateEntity
  operation: 'update' | 'create' | 'delete'
  payload: Record<string, unknown>
  retryCount: number               // 0..5
  lastError?: string
}

export interface PartialPaymentEntry {
  date: string                     // ISO yyyy-mm-dd
  amount: number
  mode: PaymentMode | null
  reference: string | null
  notes: string | null
  paymentLogId: string | null      // FK to payment-log entry, when split from one log
}

export interface Payment {
  id: string                       // `${mouId}-i${instalmentSeq}`, stable across syncs
  mouId: string
  schoolName: string
  programme: Programme
  instalmentLabel: string          // "1 of 4"
  instalmentSeq: number            // 1
  totalInstalments: number         // 4
  description: string              // "Instalment I"
  dueDateRaw: string | null        // "Jun-25" as in source
  dueDateIso: string | null        // best-effort first-day-of-month
  expectedAmount: number
  receivedAmount: number | null
  receivedDate: string | null
  paymentMode: PaymentMode | null
  bankReference: string | null     // UTR / Reference
  piNumber: string | null          // "MTPL/UP/25-26/18"
  taxInvoiceNumber: string | null
  status: PaymentStatus
  notes: string | null
  // v2 Phase 2 additions (installment tracking)
  piSentDate: string | null        // when PI was emailed to the school
  piSentTo: string | null          // recipient email / name
  piGeneratedAt: string | null     // when PI PDF + XML were generated
  studentCountActual: number | null // actual student count for this instalment
  partialPayments: PartialPaymentEntry[] | null
  auditLog: AuditEntry[] | null    // per-instalment audit trail
}

export interface PaymentLog {
  id: string                       // UUID
  date: string                     // ISO yyyy-mm-dd
  amount: number
  mode: PaymentMode
  reference: string | null         // UTR, cheque number, etc.
  narration: string | null
  salesPersonId: string | null
  matchedInstallmentIds: string[]  // payment.id values this was split across
  unmatched: boolean               // true until reconciled
  loggedBy: string                 // identity name
  loggedAt: string                 // ISO
  notes: string | null
}

export type VexDispatchStatus =
  | 'Proforma Sent'
  | 'Payment Received'
  | 'Invoice Generated'
  | 'Dispatched'

export interface VexLineItem {
  productName: string
  quantity: number
  ratePerUnit: number
  amount: number
}

/**
 * VEX product master (Phase 3b Step 10). 28 products from
 * VEX_Product_Master.xlsx Sheet2. Sheet1 has 87 rows of carton/dimension
 * data for a future warehouse module; deliberately not seeded.
 */
export interface VexProduct {
  partNumber: string
  name: string
  /** Unit price set per PI; null until accounts captures one. */
  defaultUnitPrice: number | null
  active: boolean
}

export type VexPiStatus =
  | 'Generated'
  | 'Payment Pending'
  | 'Delivery Pending'
  | 'Partially Dispatched'
  | 'Completed'

export interface VexPiLineItem {
  partNumber: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

/**
 * VEX PI (Phase 3b Step 11). Distinct from the existing VexOrder
 * (Tally-imported) because the new flow generates PIs in-app rather
 * than ingesting them from Tally.
 */
export interface VexPi {
  id: string                       // "VEXPI-MH-2627-001"
  piNumber: string                 // "MTPL/MH/2627/0042" (shared counter with programmes)
  entityKey: 'MH' | 'UP'
  issueDate: string                // ISO yyyy-mm-dd
  schoolName: string               // Ship To
  shippingAddress: string
  billingName: string
  billingAddress: string
  schoolGstNumber: string | null
  contactPerson: string
  contactNo: string
  lineItems: VexPiLineItem[]
  subtotal: number
  freightCharges: number
  taxableValue: number
  gstPct: number                   // 0.18 default
  gstAmount: number
  total: number
  status: VexPiStatus
  generatedBy: string
  generatedAt: string
  paymentReceivedAmount: number
  paymentLogIds: string[]
  notes: string | null
  auditLog: AuditEntry[]
}

export interface VexDispatchItem {
  partNumber: string
  qty: number
}

export type VexDispatchStatusV3 =
  | 'Requested'
  | 'Request Raised to Warehouse'   // Phase 3 Round 2: email-to-warehouse step
  | 'Invoiced'
  | 'Shipped'
export type VexDispatchMode = 'Air' | 'Surface'

export interface VexDispatch {
  id: string                       // "VEXD-MH-2627-001"
  piId: string                     // FK to vex_pis.json
  items: VexDispatchItem[]
  freight: number
  mode: VexDispatchMode
  status: VexDispatchStatusV3
  requestedBy: string
  requestedAt: string
  taxInvoiceNumber: string | null
  taxInvoicePath: string | null
  invoicedAt: string | null
  notes: string | null
  /** Phase 3 Round 2: optional supporting doc (school PO, internal approval). */
  supportingDocPath: string | null
  /** Phase 3 Round 2: timestamp + user when warehouse email button was clicked. */
  warehouseEmailSentAt: string | null
  warehouseEmailSentBy: string | null
  auditLog: AuditEntry[]
}

export interface VexOrder {
  id: string                       // stable slug or UUID
  orderDate: string                // ISO yyyy-mm-dd
  schoolId: string | null          // FK to schools.json after normalisation
  schoolName: string               // raw name from Tally import
  schoolNameNormalised: string | null
  buyerAddress: string | null
  consigneeAddress: string | null
  voucherNumber: string            // e.g. MTPL/UP/2526/1
  voucherType: string | null
  lineItems: VexLineItem[]
  subtotal: number
  freightCharges: number
  sgst: number
  cgst: number
  igst: number
  roundOff: number
  total: number
  paymentReceived: boolean
  paymentDate: string | null
  dispatchStatus: VexDispatchStatus
  dispatchDate: string | null
  invoiceDate: string | null       // when GST invoice was generated in Tally
  salesPersonId: string | null
  importedFromTally: boolean
  auditLog: AuditEntry[]
}

export type AgreementType = 'Vendor' | 'NDA'

export interface Agreement {
  id: string
  type: AgreementType
  partyName: string
  natureOfAgreement: string
  product: string | null
  department: string | null
  /**
   * Phase 3 Round 2: short summary of commercial terms shown in the
   * Agreements registry. Optional. Free-form, recommend keeping under
   * a couple of sentences.
   */
  keyTerms: string | null
  startDate: string                // ISO yyyy-mm-dd
  endDate: string | null           // null = indefinite
  tenure: string | null            // "5 years from date of agreement"
  noticePeriod: string | null
  vendorLocation: string | null
  physicalCustody: 'Physical' | 'Digital' | null
  documentUrl: string | null
  daysToExpiry: number | null      // computed by sync
  auditLog: AuditEntry[]
}

/**
 * Adjustment-as-line-item (Phase 3 Round 2).
 *
 * When an actuals update changes the economics of a programme MOU after
 * a PI has been issued or paid, the original PI is preserved and a
 * separate Adjustment record is created. The next unpaid PI surfaces
 * the cumulative adjustments as a "Balance due Previous Instalments /
 * (Excess Received)" line so the school sees a clean audit trail.
 */
export type AdjustmentTrigger =
  | 'actuals_update'
  | 'installment_plan_change'
  | 'manual'
  | 'vex_overpayment'

export type AdjustmentStatus = 'Active' | 'Reversed'

export interface Adjustment {
  id: string                            // "ADJ-..."
  mouId: string
  schoolId: string
  triggeredByEvent: AdjustmentTrigger
  triggeredAt: string                   // ISO
  triggeredBy: string
  /** The previously-issued installment whose economics no longer match. */
  originalInstallmentId: string
  /** The next unpaid installment this adjustment is added to. null = floating. */
  appliedToInstallmentId: string | null
  /** Signed. Negative = credit to school. Positive = additional charge. */
  amountDelta: number
  reason: string
  beforeAmount: number
  afterAmount: number
  status: AdjustmentStatus
}

export interface SignedValues {
  mouId: string
  signedDate: string               // ISO yyyy-mm-dd
  signedBy: string                 // identity name who captured it
  pricePerStudent: number
  studentCount: number
  duration: string
  signedScanUrl: string | null     // link, not upload
  capturedAt: string               // ISO timestamp of entry
  notes: string | null
}

export interface PiCounter {
  fiscalYear: string               // "26-27"
  next: number                     // next number to issue
  prefix: string                   // "GSL/MOU"
}

/**
 * Phase 3 PI counter shape: one sequential counter per GST entity. The
 * fiscalYear field is shared. MH and UP each track their own next-seq.
 * The legacy `PiCounter` shape is kept above for backwards compatibility
 * with the migration path in githubQueue.ts.
 */
export interface PiCounterMap {
  fiscalYear: string               // "2627"
  entities: {
    MH: { next: number }
    UP: { next: number }
  }
}

export interface StudentCount {
  mouId: string
  schoolName: string
  programme: Programme
  committed: number
  initialEnrolment: number | null
  currentActive: number | null
  variance: number                 // currentActive - committed
  variancePct: number              // decimal
  dateVerified: string | null
  verifiedBy: string | null
  notes: string | null
}

export interface School {
  id: string                       // "SCH-LAXMIPAT_SINGHANIA_A"
  name: string
  legalEntity: string | null
  city: string
  state: string
  pinCode: string | null
  contactPerson: string | null
  designation?: string | null
  email: string | null
  phone: string | null
  billingName: string | null
  billingAddress?: string | null
  shippingName?: string | null
  shippingAddress?: string | null
  pan: string | null
  gstNumber: string | null
  activeMous: number
  totalLifetimeValue: number
  notes: string | null
  auditLog?: AuditEntry[]
}

export interface Rate {
  programme: Programme
  variant: string                  // "Kit 1:4 ratio", "Beginners (Cambridge)", etc.
  standardPrice: number            // pre-GST
  gstPct: number                   // decimal (0.18)
  priceWithGst: number
  minAcceptable: number            // sales-head floor
  paymentTerms: string             // "25-25-25-25 quarterly"
  notes: string | null
}

export interface Alert {
  id: string                       // synthetic, stable across syncs
  type: AlertType
  mouId: string | null
  schoolName: string | null
  description: string
  dueDate: string | null
  priority: AlertPriority
  status: AlertStatus
  assignedTo: string | null
  resolutionNotes: string | null
  actionLink: string               // e.g. "/mous/MOU-STEAM-2526-002"
}

export interface ProgrammeBreakdown {
  programme: Programme
  mouCount: number
  studentCount: number
  contractValue: number
  received: number
}

export interface KPIs {
  totalActiveMous: number
  totalPendingMous: number
  totalContractValue: number
  totalReceived: number
  totalBalance: number
  collectionPct: number            // 0-100
  totalSchools: number
  alertCounts: {
    high: number
    medium: number
    low: number
    total: number
  }
  programmeBreakdown: ProgrammeBreakdown[]
  upcomingRenewals30d: number
  upcomingRenewals90d: number
  overduePayments: number
  asOfDate: string                 // ISO YYYY-MM-DD
}
