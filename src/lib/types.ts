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
  // Phase 1.4 product registry (admin add/rename/retire)
  | 'product-renamed'
  | 'product-retired'
  | 'product-reactivated'
  | 'product-kind-changed'         // migration 016: per-student vs project
  | 'mou-cancelled'                // Phase 3: MOU soft-cancel/delete (cascade soft-deletes linked payments)
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
  // W4-G.1: InventoryItem lifecycle. 4 actions cover the only
  // mutations the lib supports today:
  //   - imported-from-mastersheet: backfill at W4-G.3 mutation
  //   - stock-edited: Misba/Pradeep manual stock correction
  //   - threshold-edited: reorder threshold set / changed
  //   - decremented-by-dispatch: side effect of W4-G.4 hook on
  //     raiseDispatch + approveRequest conversion paths. The audit
  //     entry mirrors on the parent Dispatch + InventoryItem so the
  //     audit reader can grep either side without joins.
  | 'inventory-imported-from-mastersheet'
  | 'inventory-stock-edited'
  | 'inventory-threshold-edited'
  | 'inventory-decremented-by-dispatch'
  // W4-H.3: school-facing handover worksheet + internal dispatch note
  // download events. Both append a dedup'd entry (60s window per
  // userId+dispatchId+action) on Dispatch.auditLog so we can answer
  // "did the trainer print the form before the on-site visit?"
  | 'handover-worksheet-downloaded'
  | 'dispatch-note-downloaded'
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
  // W4-I.1.7: emitted on a User record's auditLog when an Admin changes
  // a user's role. before / after capture the prior + new UserRole
  // values; notes carry the operator-supplied reason. Phase 1 has no
  // role-edit UI; entries are written by data-mutation scripts (round 2
  // tester provisioning per D-040) and surface in admin audit views.
  | 'user-role-changed'
  // Phase 5 (2026-05-19, Pranav review #4): emitted on MOU audit log
  // when an operator records a real-world student-count change via
  // /mous/[id]/student-count. Each entry's `after` captures the new
  // count + the recalc impact summary (installmentsAffected,
  // previousExpectedTotal, newExpectedTotal, the adjustment row +
  // cumulativeDelta). A parallel entry lands on each affected
  // Payment row with the per-row before / after nominalAmount /
  // adjustmentFromLockedInstallments / netDue.
  | 'student-count-changed'
  // 2026-05-19 quick-wins (Pranav review #6): emitted on School audit
  // log when the school's sales rep is reassigned via
  // /schools/[id]/reassign-sales-rep. before / after capture
  // { salesPersonId, scope }; notes carry the operator-supplied
  // reason. Also emitted on each MOU's audit log when scope is
  // 'all-mous' (the cascade variant).
  | 'sales-rep-reassigned'
  // W4-I.4 MM5: emitted when an Escalation's editable fields (status,
  // category, type, severity, assignedTo, description, resolutionNotes)
  // are modified via /escalations/[id]/edit. before / after capture the
  // changed-field diff; notes carry the operator-supplied context.
  | 'escalation-edited'
  // Gate 4 Step 4: emitted on MOU auditLog when an operator clicks
  // "Send reminder" on the workflow handoff banner. Captures the
  // stage + owner + recipient count; drives the per-stage per-24h
  // cooldown check on subsequent reminder attempts.
  | 'workflow-reminder-sent'
  // W4-I.4 MM3: emitted when an IntakeRecord's editable fields are
  // modified via /mous/[id]/intake/edit. The MM3 batch added the
  // gradeBreakdown + rechargeableBatteries fields to power Misba's
  // kit allocation table; the edit lib supports the full mutable set
  // for backfill. before / after capture the field diff.
  | 'intake-edited'
  // W4-I.5 Phase 3: CommunicationTemplate lifecycle.
  // 'template-created'   on first save via /admin/templates/new
  // 'template-edited'    on any field change via /admin/templates/[id]/edit
  // 'template-deactivated' on the active=false flip (preserves history)
  // 'template-reactivated' on active=true flip
  | 'template-created'
  | 'template-edited'
  | 'template-deactivated'
  | 'template-reactivated'
  // W4-I.5 Phase 3: emitted on the parent MOU's auditLog when an
  // operator clicks "Send via Outlook" on the template launcher. The
  // audit entry records which template was used, the recipient, the
  // resolved subject, and which variables were substituted; sufficient
  // for the Communications tab on /mous/[id] to render the chronology
  // without fetching the Communication entity (we do not write a
  // Communication row at this stage; that happens later when SMTP
  // integration lands per Phase 1.1).
  | 'communication-sent'
  // Gate 2 Step 6: Finance bank-entry matcher writes this on the
  // Payment row and mirrors it on the parent MOU's auditLog when
  // /finance/payments confirms a candidate. before / after capture
  // receivedAmount + receivedDate + paymentMode + bankReference +
  // status (Paid or Partial). Notes record the variance vs the
  // expected amount when the bank entry differs.
  | 'payment-matched'
  // Gate 2 Step 6: emitted when /finance/pi/[paymentId] re-issues a
  // PI. before / after capture the old + new piNumber; notes record
  // the entity counter that advanced. Mirrored on both the Payment
  // row and the parent MOU's auditLog. The old number is voided in
  // the sense that Payment.piNumber is overwritten; the audit log
  // remains the canonical history of voided numbers.
  | 'pi-reissued'
  // Gate 2 Step 6: emitted on the parent MOU's auditLog when
  // /finance/adjustments reverses an Adjustment. before / after
  // capture the status flip ('Active' -> 'Reversed') plus the
  // adjustmentId + amountDelta for context. Idempotent: a second
  // click on an already-reversed adjustment does NOT write a no-op
  // entry; the reverseAdjustment lib returns 'already-reversed'
  // without touching the audit log.
  | 'adjustment-reversed'
  // Gate 4.95 Session 4 (renewals lifecycle): operator marks the
  // school as having declined to renew the MOU. notes carries the
  // free-text reason captured at /finance/renewals. MOU.status is
  // NOT mutated by this action; the audit entry alone records the
  // signal so the renewal bucket reader can compute renewalStatus
  // from the log. A subsequent 'status_change' to 'Renewed' supersedes
  // a prior decline (operators may change their mind).
  | 'mou-renewal-declined'
  // Gate 5A.5 Step 4 (dispatch override flow): payment gates can be
  // bypassed on trial / pilot / urgent-partnership MOUs through a
  // request to the configured override approver (default Shashank).
  // before / after capture the dispatchOverride state transition;
  // notes carries the reason / approval notes / rejection reason
  // depending on the action. All three are classified as critical
  // changes per criticalChanges.ts.
  | 'dispatch-override-requested'
  | 'dispatch-override-approved'
  | 'dispatch-override-rejected'
  // Phase 6C PI backfill: Pranav-driven backfill of historic paid-no-PI
  // payment rows. Emitted on both the Payment.auditLog and the parent
  // MOU.auditLog when /admin/imports/pi-backfill applies a fresh or
  // manually-supplied PI number to a payment row whose piNumber was
  // null. before.piNumber is null; after.piNumber is the applied
  // value; notes carries the auto-match candidate id or "manual entry".
  | 'pi-backfill-applied'
  // Phase 6D Part 6: one-shot dueDateIso backfill on YP-2526 Series B
  // payment rows imported during Week 3 with dueDateIso=null. The
  // script scripts/backfill-yp2526-due-dates.mjs derives a date from
  // the parent MOU's academicYear + instalment seq (canonical cadence
  // i1=Jun, i2=Sep, i3=Dec, i4=Mar) and stamps each touched row.
  // before.dueDateIso is null; after.dueDateIso is the derived ISO.
  | 'due-date-backfill-phase-6d'
  // Phase 6E Finding 1: one-shot productSelection backfill on MOUs
  // that have dispatch evidence of Cretile or TinkRworks SKUs but
  // null productSelection. scripts/backfill-mou-products.mjs maps
  // each dispatch lineItem to its inventory category and writes the
  // inferred product onto the parent MOU. before.productSelection is
  // null; after.productSelection is 'Cretile' / 'TinkRworks' / 'Both'.
  | 'product-selection-backfill-phase-6e'
  // Phase 6F Part 3: operator-driven productSelection edits through
  // the /admin/product-backfill bulk-edit page. Pattern matches the
  // one-shot backfill action but is recorded per-MOU at save time
  // rather than via a script run.
  | 'product-selection-bulk-update'
  // Phase 6F Part 5: V4-verification impersonation start. Written on
  // the caller's auditLog (not the target's). Lets Anish walk the
  // homepage as Pranav / Misba / Ameet for role-specific screenshot
  // capture without needing those users' passwords.
  | 'user-impersonation-started'
  // Phase 6G: Microsoft Entra ID SSO sign-in. Written on the User
  // record (existing matched-by-email user OR a fresh auto-created
  // pending user). before.azureAdObjectId / after.azureAdObjectId
  // capture the oid backfill; notes carry the Microsoft
  // userPrincipalName.
  | 'sso-signin'

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

/**
 * Workflow-stage department a user belongs to. Independent of `role`:
 * the post-2026-04-27 trusted core team are all Admin role but their
 * department field reflects the real-world function they exercise
 * during the pilot (Misba = ops, Shubhangi = finance, etc.). Admin
 * and Leadership map to null; a null department reads as "sees all
 * stages" through the wildcard branches in lib/access.ts. See
 * docs/role-decisions.md "2026-05-10: Gate 1 department backfill"
 * for the per-user rationale.
 */
export type Department = 'sales' | 'ops' | 'finance' | null

export interface User {
  id: string                                    // GSL ID convention: email-prefix (e.g., 'anish.d')
  name: string
  email: string                                 // for outbound notifications, magic-link issuance
  role: UserRole                                // base role
  /**
   * Workflow-stage department. Optional on the type to keep the
   * pre-Gate-1 test corpus compiling; lib/access.ts getDepartment()
   * falls back to defaultDepartmentForRole(user.role) when this
   * field is undefined. Production user records (src/data/users.json
   * and src/data/_fixtures/users.json) always set the field
   * explicitly post Gate 1 Step 2.
   */
  department?: Department
  testingOverride: boolean                      // default false; only Misba is true at fixture seed
  testingOverridePermissions?: UserRole[]       // present iff testingOverride is true
  active: boolean
  passwordHash: string                          // bcrypt hash; never plaintext anywhere
  createdAt: string                             // ISO
  auditLog: AuditEntry[]
  /**
   * Phase 6G: Microsoft Entra ID object ID (the immutable `oid`
   * claim). Set on first SSO sign-in. Null for users who have
   * never signed in via Microsoft. Lookups during SSO sign-in
   * prefer email match (case-insensitive), then write the oid
   * onto the matched user so subsequent sign-ins are oid-keyed
   * (defence against the user changing their email at Microsoft).
   */
  azureAdObjectId?: string | null
  /**
   * Phase 6G: set to true when a User record is auto-created by
   * the SSO sign-in callback for an email that did not match any
   * existing user. Cleared by an admin via the approval queue (or
   * by direct edit on /admin/users). When true, the user holds a
   * session token but `active: false` keeps them out of every
   * gated surface until Anish promotes them.
   */
  requiresAdminReview?: boolean
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
// Programme (Gate 2 §7.1 reduction to 4 values: STEAM, Young Pioneers,
// Harvard HBPE, Robotics. VEX migrates to a parallel module: see VexPi /
// VexDispatch / VexOrder below; the sales-team carries VEX as a
// SalesProgramme separately.) GSLT-Cretile + TinkRworks remain STEAM
// sub-types via programmeSubType.
// ============================================================================

export type Programme =
  | 'STEAM'            // covers GSLT-Cretile + TinkRworks via programmeSubType
  | 'Young Pioneers'
  | 'Harvard HBPE'
  | 'Robotics'         // Gate 2: added as the fourth canonical programme

/**
 * Programmes a sales rep / sales opportunity may carry. Extends Programme
 * with the parallel VEX module so a rep can own VEX kit pursuits without
 * triggering an MOU programme of the same name. Pre-Gate-2 'TinkRworks'
 * tags are migrated to ['STEAM'] (TinkRworks is a STEAM subtype).
 */
export type SalesProgramme = Programme | 'VEX'

// ============================================================================
// School
// ============================================================================

export interface School {
  id: string                       // 'SCH-...'
  name: string
  legalEntity: string | null
  city: string
  state: string
  /**
   * SPOC DB nomenclature: 'East' | 'North' | 'South-West' (3 values).
   * 'South-West' is already a pre-collapsed combined region in this
   * taxonomy, NOT separate 'South' + 'West' entries; we keep the
   * 3-value enum so school records stay aligned with the upstream
   * SPOC source rather than forking into a 4-value 'N|S|E|W' shape.
   *
   * The Sales Pipeline form (createOpportunity.REGION_OPTIONS) extends
   * to 6 values for forward-looking pipeline data scouted pre-MOU.
   *
   * Phase X super-region overlay (Ameet's grouping) lives in
   * src/lib/regions.ts: NE = North + East, SW = South-West + South + West.
   * The overlay is derivation-only; no field is added to School. Filter
   * machinery (applyDimensionFilters) does OR-within-dimension, so a
   * super-region selection expands to its primary values transparently.
   */
  region: string
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
  // Gate 2 §7.2: chain-billing fields. Live on SchoolGroup so a chain
  // billing centrally surfaces one master GSTIN + one primary contact;
  // standalone schools (1:1 group) leave these null and bill through
  // their own School fields. Chain MOU PI generation reads master
  // GSTIN from here when school.gstNumber is null. Optional on the
  // type so pre-Gate-2 SchoolGroup fixtures + libs continue to compile;
  // production records always set them explicitly post Gate 2.
  primaryContact?: string | null
  primaryEmail?: string | null
  primaryPhone?: string | null
  gstNumber?: string | null
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
  | 'Cancelled' // Phase 3: finance soft-cancel/delete (migration 018). Excluded
                // from active lists + received sums; distinct from cohort 'archived'.

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

// Gate 4.7 Step 6b: 'AIQ' added as a real GSL trainer model after the
// Pranav FY26-27 import flagged it via importNotes.trainerModelRaw=AIQ
// on 1 STEAM row. Locked decision per Anish.
export type TrainerModel = 'Bootcamp' | 'GSL-T' | 'TT' | 'AIQ' | 'Other'

export interface MOU {
  id: string                       // 'MOU-STEAM-2627-001'
  schoolId: string
  schoolName: string               // denormalised for fast list rendering
  // Phase 2: widened from the 4-value `Programme` enum to free-text so a MOU can
  // carry any registry product name (the products table is the source of truth;
  // the mous.programme CHECK was dropped in migration 014). Existing values
  // (STEAM, Young Pioneers, ...) still resolve via resolveProduct (name or a
  // product's legacyProgrammes). The legacy `Programme` union is retained for
  // back-compat in code that still references the four canonical names.
  programme: string
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
  /**
   * Region for this MOU, DERIVED from the salesperson's territories at write
   * time (do not free-type). Null when no salesperson is set, or surfaced as an
   * error when a chosen salesperson has no territory. See
   * regionForSalesPerson() in src/lib/regions.ts. (migration 015)
   */
  region?: string | null
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
  /**
   * Step 5 (mou-system port). Optional drafting fields populated by the
   * /mous/new generator + /mous/[id]/draft annexure editor. Existing 143
   * imported records carry `undefined` for every field; the list/detail
   * page does not read them, so backwards compatibility is preserved.
   *
   * The shapes are inherited verbatim from the gsl-mou-system MOU type;
   * see src/lib/mouSystem/types.ts for the canonical definitions.
   */
  effectiveDate?: string | null
  numberOfYears?: number | null
  salesChannel?: import('./mouSystem/types').SalesChannel | null
  schoolCrmId?: string | null
  draftVariables?: Record<string, string> | null
  paymentSchedules?: import('./mouSystem/types').YearPaymentSchedule[] | null
  yearlyPricing?: import('./mouSystem/types').YearlyPricingRow[] | null
  billingBlock?: import('./mouSystem/types').MouBillingBlock | null
  signedMouPdfPath?: string | null
  /**
   * Gate 3 Step 1: kits-dispatch enhancements. See
   * src/lib/mouSystem/types.ts for the canonical type definitions.
   * Optional at draft time; Sales can fill on the GeneratorWizard or
   * later in MOU Pipeline. Existing MOUs carry `undefined`.
   */
  productSelection?: import('./mouSystem/types').ProductSelection | null
  gradewiseDistribution?:
    | import('./mouSystem/types').GradewiseDistributionRow[]
    | null
  /**
   * Step 1 product-portfolio rework (2026-06-04): structured per-product
   * portfolio (PRODUCT -> GRADE -> QUANTITY) for dispatch tracking, modelled
   * on the legacy DispatchLineItem union. Supersedes the brand-only
   * `productSelection`, which stays derivable from this during transition
   * (see `deriveProductSelection`). DISPATCH TRACKING ONLY - never priced.
   * Existing MOUs carry `undefined`.
   */
  products?: import('./mouSystem/types').MouProduct[] | null
  /**
   * Step 2 two-process model (2026-06-04, Pranav Finance/Ops review).
   * The Ops-side review track, INDEPENDENT of MouStatus and the money/PI
   * gate (PI_BLOCKED_STATUSES reads MouStatus only, never this). When
   * Finance enters a signed MOU it surfaces to Ops as 'Pending for review';
   * Ops assigns products + aligns dispatch, then 'Submit to Finance for
   * Dispatch' moves it to 'Submitted to Finance'. Null/undefined on MOUs
   * that predate the flow (treated as not-in-review).
   */
  opsReviewStatus?: import('./mouSystem/types').OpsReviewStatus | null
  /**
   * Gate 4.5: free-text bag for Excel-import context that does not fit
   * the schema cleanly (acquisitionStatus, ypLevel, termination, etc.).
   * Format: `key1=value1; key2=value2`. Set by the FY26-27 import
   * scripts; null on records that did not originate from an Excel
   * import.
   */
  importNotes?: string | null
  /**
   * Gate 5A.5 Step 4: dispatch override flow. Some MOUs (trials, pilots,
   * urgent partnerships) need to dispatch kits before payment lands.
   * Sales or Ops requests an override with a reason; the configured
   * override approver (default Shashank, configurable via stage
   * responsibility) approves or rejects. When approved, the master
   * status tracker skips payment-pending and installment-1-received.
   *
   * Undefined on MOUs that never went through the flow; defaulted to
   * `{ status: 'none', ... }` when first accessed via the helper.
   */
  dispatchOverride?: MouDispatchOverride
  /**
   * Phase 5 (2026-05-19, Pranav review #4): history of
   * student-count change events for this MOU. Most-recent last.
   * `getCurrentStudentCount(mou, events)` derives the latest count;
   * pre-Phase-5 MOUs leave this undefined and fall back to
   * `studentsActual ?? studentsMou`.
   */
  studentCountEventIds?: string[]
}

/**
 * Gate 5A.5 Step 4: per-MOU dispatch override request lifecycle. See
 * MOU.dispatchOverride for context.
 */
export interface MouDispatchOverride {
  status: 'none' | 'requested' | 'approved' | 'rejected'
  requestedBy: string | null              // User.id
  requestedAt: string | null              // ISO
  requestReason: string | null
  approvedBy: string | null               // User.id
  approvedAt: string | null               // ISO
  approvalNotes: string | null
  rejectedBy: string | null               // User.id
  rejectedAt: string | null               // ISO
  rejectionReason: string | null
}

// ============================================================================
// InventoryItem (W4-G.1; SKU-level stock tracking)
//
// 18 SKU rows expected after W4-G.3 backfill: 8 Cretile per-grade rows
// + 7 TinkRworks Reusable Kits + 3 Mastersheet TinkRworks rows held
// for Anish review (TinkRsynth, TinkRsynth Mixer PCB, P3 Project Kit) +
// 2 placeholder rows for Push Pull Pin and Steam Academy (in Dispatch
// vocabulary but absent from Mastersheet; D-034 captures the round-2
// stock-set).
//
// Naming convention (Anish W4-G recon decision): Dispatch-aligned simple
// labels (Tinkrpython, Launchpad, Cretile Grade-band kit + grade) so
// the existing 27 Dispatch records and the eventual decrement hook
// stay consistent. Verbose Mastersheet names preserved on
// `mastersheetSourceName` for the audit trail; that field stays null
// for entries that originated outside Mastersheet (e.g., Push Pull Pin
// placeholders).
//
// Cretile grade-band SKUs use `category: 'Cretile'` + `cretileGrade: N`;
// TinkRworks SKUs use `category: 'TinkRworks'` + `cretileGrade: null`.
// A Dispatch line item with `kind: 'per-grade'` decrements the matching
// per-grade Cretile InventoryItem(s); a flat line item decrements the
// matching TinkRworks SKU directly.
// ============================================================================

export type InventoryCategory = 'TinkRworks' | 'Cretile' | 'Hardware' | 'Other'

export interface InventoryItem {
  id: string                       // 'INV-LAUNCHPAD' / 'INV-CRETILE-G5' / etc.
  /** Dispatch-aligned simple label; matches Dispatch.lineItems[].skuName. */
  skuName: string
  category: InventoryCategory
  /** Populated for Cretile per-grade rows; null for TinkRworks flat SKUs. */
  cretileGrade: number | null
  /** Verbose Mastersheet name preserved for audit; null when not from Mastersheet. */
  mastersheetSourceName: string | null
  currentStock: number
  /** Null until Misba/Pradeep configures via /admin/inventory/[id] (D-028). */
  reorderThreshold: number | null
  notes: string | null
  /**
   * False for sunset SKUs (e.g., TinkRsynth Mixer PCB which
   * Mastersheet flagged "we don't have this in our inventory").
   * Inactive items render in the list filtered behind the Active
   * chip; decrement attempts against an inactive item warn but do
   * not fail (round-2 will decide whether a sunset SKU should
   * hard-block).
   */
  active: boolean
  lastUpdatedAt: string
  lastUpdatedBy: string             // User.id; 'system-w4g-import' for backfill
  auditLog: AuditEntry[]
  /**
   * Gate 4.5: free-text bag for Excel-import context. Format:
   * `key1=value1; key2=value2`. Null on records that did not
   * originate from an Excel import.
   */
  importNotes?: string | null
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
  programmeProposed: SalesProgramme | null
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
  | 'inventory-low-stock'           // W4-G.5 stock crossed reorderThreshold downward
  // Gate 4 Step 2: three new triggers from Misba's 7-step workflow doc.
  | 'mou-uploaded'                  // Signed MOU PDF imported -> notify Ops + Finance
  | 'kits-allocated-for-approval'   // Ops finalises kit allocation -> notify Sales for approval
  | 'dispatch-executed'             // Tally Delivery Challan uploaded -> notify Ops (shipment) + Sales (info)
  | 'pod-uploaded'                  // POD uploaded -> notify Finance (tax invoice) + Sales (info)

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
// CommunicationTemplate (W4-I.5 Phase 3)
//
// Reusable email + WhatsApp templates editable by Ops/Admin. Handlebars-
// style {{variable}} placeholders substituted at send-time against an MOU
// + School + IntakeRecord context (see src/lib/templates/applyVariables.ts).
//
// Permission: 'template:edit' (Admin + OpsHead) gates create + edit;
// view is universal (every authenticated user can browse templates).
//
// active=false hides the template from launcher pickers but keeps the
// row + auditLog for historical reference.
// ============================================================================

export type TemplateUseCase =
  | 'welcome'
  | 'thank-you'
  | 'follow-up'
  | 'payment-reminder'
  | 'dispatch-confirmation'
  | 'feedback-request'
  | 'custom'

export type TemplateRecipient =
  | 'spoc'           // intake.recipientEmail || school.email
  | 'sales-owner'    // sales rep on the MOU
  | 'school-email'   // school.email
  | 'custom'         // operator types the recipient at send-time

export interface CommunicationTemplate {
  id: string                     // 'TPL-...'
  name: string
  useCase: TemplateUseCase
  /** Subject line; can include {{variable}} placeholders. */
  subject: string
  /** Body markdown; can include {{variable}} placeholders. */
  bodyMarkdown: string
  defaultRecipient: TemplateRecipient
  /** CC-rule context keys (e.g. 'all-communications', 'welcome-note'). */
  defaultCcRules: string[]
  /** Variable names declared as available; the launcher form picks from this. */
  variables: string[]
  createdBy: string              // User.id
  createdAt: string              // ISO
  lastEditedBy: string           // User.id
  lastEditedAt: string           // ISO
  active: boolean
  auditLog: AuditEntry[]
  /**
   * P2b.X OCC (2026-05-24): version for optimistic concurrency on
   * /admin/templates/[id]/edit. Same shape as CcRule.version.
   */
  version?: number
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

/**
 * W4-I.4 MM5: Misba's ticketing-system status vocabulary. Replaces the
 * pre-MM5 4-value enum (open / acknowledged / resolved / withdrawn) so
 * Ops can describe the workflow they actually run (work-in-progress,
 * cross-team transfer, courier-in-transit handoffs). Backfill mapping
 * applied to both data/escalations.json and data/_fixtures/escalations.json:
 *   open         -> Open
 *   acknowledged -> WIP
 *   resolved     -> Closed
 *   withdrawn    -> Closed
 *
 * Old codepaths that emitted 'open' (autoEscalation, overrideAudit,
 * OverviewContent filter) updated to 'Open'. Detail page's
 * resolved/withdrawn render gate updated to check 'Closed'.
 */
export type EscalationStatus =
  | 'WIP'
  | 'Open'
  | 'Closed'
  | 'Transferred'
  | 'Dispatched'
  | 'In Transit'
/**
 * Gate 1 Step 5: 'critical' added as the P0 tier (24h SLA per the
 * Misba ticketing-system spec). 'high' = P1 (72h), 'medium' = P2
 * (7 days), 'low' = P3 (30 days). SLA target dates computed by
 * src/lib/escalations/sla.ts.
 */
export type EscalationSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * Gate 1 Step 5: typed Category vocabulary per the Misba ticketing
 * spec. Replaces the W4-I.4 free-text string. Existing data is
 * migrated to 'Other' so legacy escalations stay valid.
 */
export type EscalationCategory =
  | 'Dispatch Delay'
  | 'Payment Issue'
  | 'Quality Complaint'
  | 'Training Issue'
  | 'School Communication'
  | 'Inventory Shortfall'
  | 'Vendor Issue'
  | 'Other'

/**
 * Gate 1 Step 5: typed Type vocabulary per the Misba ticketing spec.
 * Existing data is migrated to 'Operational'.
 */
export type EscalationType =
  | 'Internal'
  | 'Customer-facing'
  | 'Vendor-facing'
  | 'Regulatory'
  | 'Operational'

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
  /**
   * Gate 1 Step 5: typed Category + Type vocabulary per the Misba
   * ticketing spec. Replaces the W4-I.4 free-text strings. Nullable
   * to keep round 1 fixtures valid; the migration script seeds
   * 'Other' / 'Operational' for legacy entries.
   */
  category: EscalationCategory | null
  type: EscalationType | null
  /**
   * Gate 1 Step 5: dept that owns the ticket today (creator's dept by
   * default; flips on Transferred status flow). Optional on the type
   * because pre-Gate-1 escalations did not carry the field; the
   * migration script backfills from `lane` (OPS->ops, SALES->sales,
   * ACADEMICS->ops). New escalations always set it.
   */
  ownedByDepartment?: 'sales' | 'ops' | 'finance'
  /**
   * Gate 1 Step 5: transfer flow fields. transferredFromDepartment is
   * the dept that initiated the transfer; transferredToDepartment is
   * the receiving dept. transferredAt + transferReason capture the
   * audit. The receiving dept's escalation is in 'Transferred' status
   * with assignedTo cleared until claimed. All optional because
   * non-transferred escalations leave them null.
   */
  transferredFromDepartment?: 'sales' | 'ops' | 'finance' | null
  transferredToDepartment?: 'sales' | 'ops' | 'finance' | null
  transferredAt?: string | null
  transferReason?: string | null
  /**
   * Gate 1 Step 5: SLA target ISO date computed from severity +
   * createdAt by src/lib/escalations/sla.ts. slaBreached is the
   * computed flag (true when target < now AND status is not Closed).
   * Both optional pre-migration; the migration script backfills.
   */
  slaTargetDate?: string
  slaBreached?: boolean
  /**
   * Free-text "Waiting on what/whom?" populated when status is the
   * "Waiting on Someone Else" relabel of `Transferred`
   * (Swati-feedback batch). Other statuses leave this null.
   */
  waitingOn: string | null
  resolutionNotes: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  auditLog: AuditEntry[]
  /**
   * Gate 5A.6 Step 15: comment thread. Immutable per-comment (no edit
   * after post; deletion is Admin-only). Each post writes a parallel
   * audit entry on auditLog so the discussion is queryable across
   * surfaces.
   */
  comments?: EscalationComment[]
}

export interface EscalationComment {
  id: string
  timestamp: string                 // ISO
  authorUserId: string
  body: string
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
  /**
   * P2b.X OCC (2026-05-24): version for optimistic concurrency on
   * /admin/cc-rules/[ruleId] edits. cc_user_ids + contexts are
   * REPLACE-on-update form-submit fields; two wildcard admins editing
   * the same rule would otherwise clobber each other silently.
   * Defaults to 1 (column default in postgres); optional in the type
   * for pre-postgres records.
   */
  version?: number
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
  /**
   * Programmes a rep handles. SalesProgramme widens Programme with 'VEX'
   * because reps own VEX kit pursuits even though VEX is not a Programme
   * MOU type post-Gate 2.
   */
  programmes: SalesProgramme[]
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
  // Gate 5A.6 Step 10: Admin soft-delete of a payment. The record stays
  // in payments.json with the full audit trail; UI filters out Cancelled
  // rows on the open lists. Re-activating a cancelled payment is a Phase
  // 1.1 follow-up; today the only way back is a JSON edit.
  | 'Cancelled'
  // Gate 5A.6 Step 13: Finance / Admin skip a future instalment when a
  // school drops a course mid-year. Skipped rows surface with a
  // strikethrough state; balance is excluded from outstanding totals;
  // PI generation is blocked. The audit captures the operator-supplied
  // reason.
  | 'Skipped'

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
  programme: string                // Phase 2: free-text product name (see MOU.programme)
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
  /**
   * Gate 5A.6 Step 13: PI void support. piNumber is preserved as the
   * counter-integrity record per Gate 2 §3 (no counter rollback). When
   * piVoidedAt is set the row renders as VOID and the PI no longer
   * counts toward outstanding. Adjustment for the voided amount is
   * created separately. piVoidedAt / piVoidReason are nullable for
   * backwards compatibility with existing records.
   */
  piVoidedAt?: string | null
  piVoidReason?: string | null
  /**
   * Phase 4 (2026-05-19) - TDS-aware payment logging. When the new
   * batch / single forms write a payment, `receivedAmount` stays as
   * the canonical total (`bankAmount + tdsAmount`) so every existing
   * display surface continues to read the right number without
   * change. The split fields are optional: pre-Phase-4 rows leave
   * them undefined; libraries that need the bank-only or TDS-only
   * number fall back to `bankAmount = receivedAmount, tdsAmount = 0`.
   *
   * Pranav files form 26AS using these splits, so the TDS amount
   * needs to be persisted as a number rather than reconstructed from
   * narration text. tdsCertificateRef + tdsRate are forward-looking
   * placeholders for the Phase 5 TDS reconciliation report; both
   * stay optional and are not populated by this gate's forms.
   */
  bankAmount?: number | null
  tdsAmount?: number | null
  tdsCertificateRef?: string | null
  tdsRate?: number | null
  /**
   * Phase 5 (2026-05-19, Pranav review #4 + #5) - variable student
   * count + per-instalment recalc.
   *
   * The 396 pre-Phase-5 rows do NOT carry these fields. The first
   * time an operator updates the student count for a MOU via
   * /mous/[id]/student-count, the MOU's Payments gain the fields
   * lazily. Display surfaces continue reading `expectedAmount` (the
   * operational total) where the breakdown is not needed; the new
   * surfaces read `nominalAmount`, `adjustmentFromLockedInstallments`,
   * and `netDue` for transparency.
   *
   * Invariants (held by src/lib/mou/studentCountRecalc.ts):
   *   - `nominalAmount = (percentShare / 100) × currentCount × pricePerStudent`,
   *     for every row, regardless of locked status.
   *   - `adjustmentFromLockedInstallments` is non-zero only on the
   *     first unpaid row (the "adjusting" row). It captures the
   *     cumulative `currentCountNominal - receivedAmount` summed
   *     across all locked rows. Negative = excess credit; positive =
   *     shortfall.
   *   - `netDue` for a LOCKED row equals `receivedAmount` (immutable).
   *     For the first unpaid row, `nominalAmount +
   *     adjustmentFromLockedInstallments`. For subsequent unpaid
   *     rows, `nominalAmount`.
   *   - `expectedAmount` continues to mirror `netDue` for the
   *     operational read path; legacy surfaces (reports, dashboards)
   *     keep working without change.
   */
  percentShare?: number | null            // 0-100; derived from expectedAmount / contractValue if absent
  nominalAmount?: number | null           // current-count value of this share
  adjustmentFromLockedInstallments?: number | null  // 0 for locked + non-first-unpaid; cumulative on firstUnpaid
  netDue?: number | null                  // operational; equals receivedAmount when locked
  lockedAt?: string | null                // ISO when the row first got a receipt
  isLocked?: boolean                      // computed from receivedAmount > 0; persisted for explicit-lock futures
}

// ============================================================================
// StudentCountEvent (Phase 5; Pranav review #4)
//
// Each event records a real-world change in the student count for a MOU.
// The event is the audit-trail anchor: it captures the previous + new
// count, the operator-supplied reason, and the recalc impact (which
// installments changed, the cumulative delta, the row that absorbed
// the carry). The MOU's `currentStudentCount` is derived from the most
// recent event for the MOU; pre-Phase-5 MOUs without any event fall
// back to `studentsActual ?? studentsMou`.
// ============================================================================

export interface StudentCountEventRecalcImpact {
  installmentsAffected: string[]              // Payment.id values
  previousExpectedTotal: number
  newExpectedTotal: number
  adjustmentApplied: {
    toInstallmentId: string | null            // null when no unpaid row exists
    previousNetDue: number
    newNetDue: number
    cumulativeDelta: number                   // overpayment (negative) or shortfall (positive)
  }
}

export interface StudentCountEvent {
  id: string                                  // 'SCE-2026-0001'
  mouId: string
  newCount: number
  previousCount: number
  effectiveDate: string                       // ISO yyyy-mm-dd; when the count became effective in real life
  recordedAt: string                          // ISO datetime; when the operator entered it
  recordedBy: string                          // User.id
  reason: string                              // free-text, required >= 10 chars at form level
  relatedInstallmentId: string | null         // optional Payment.id hint
  notes: string | null
  recalcImpact: StudentCountEventRecalcImpact
  auditLog: AuditEntry[]
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
  auditLog?: AuditEntry[] | null
  // Soft-delete tombstone (Pass 1 finance corrections, migration 020). A voided
  // log is logically removed: its balance effect on the VexPi / instalment is
  // reversed at void time, the id is dropped from the parent, and the row is
  // KEPT for audit. Never hard-deleted. Absent/null on every active log.
  voidedAt?: string | null
  voidedBy?: string | null         // User.id who voided
  voidReason?: string | null
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

/**
 * Intake-time captured product. Wider than Programme because operators
 * have historically recorded the actual kit variant (TinkRworks) or a
 * parallel-module pursuit (VEX) at intake even when the MOU programme
 * itself is STEAM. Gate 2 §7.1: Programme reduces to 4 values; this
 * type carries the legacy intake vocabulary so 6 historical intake
 * records (5 TinkRworks + 1 VEX, all linked to STEAM MOUs) keep their
 * captured signal. Future refactor can split into productConfirmed
 * (Programme) + productVariant (free-text or controlled vocab).
 */
export type IntakeProductConfirmed = Programme | 'VEX' | 'TinkRworks'

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
  // Uses IntakeProductConfirmed (Programme | 'VEX' | 'TinkRworks') because
  // 6 W4-C.7 backfill records carry the legacy variant captured at intake.
  productConfirmed: IntakeProductConfirmed
  gslTrainingMode: GslTrainingMode // variance vs mou.trainerModel warns
  // School POC (W4-C.1: split from the Google Form's combined POC + phone field)
  schoolPointOfContactName: string
  schoolPointOfContactPhone: string  // E.164 normalised where possible; raw text preserved when not
  // Signed copy URL (operator-pasted Drive / SharePoint / Dropbox link)
  signedMouUrl: string
  // Thank-you email tracking (compose-and-copy via W3-E pattern; mark-sent action)
  thankYouEmailSentAt: string | null
  /**
   * W4-I.4 MM3: Misba ticketing-driven kit allocation breakdown.
   * Per-grade student counts (e.g. [{grade:1,students:17},{grade:2,students:21},...])
   * power the kit allocation table on /mous/[id]/dispatch. The free-text
   * `grades` field above stays as the operator's plain-language record
   * (e.g. "1-8"); gradeBreakdown is the structured per-grade count.
   * Null on every backfill record; operators populate via the intake
   * edit form when capturing kit allocation.
   */
  gradeBreakdown: { grade: number; students: number }[] | null
  /**
   * W4-I.4 MM3: per-school rechargeable battery count (Misba's PDF
   * sample showed 25 batteries for KOLKATA WB). Stays nullable for
   * backfill records and for schools / programmes that do not ship
   * batteries.
   */
  rechargeableBatteries: number | null
  auditLog: AuditEntry[]
}

// ============================================================================
// Queue + counter primitives (inherited from MOU pattern)
// ============================================================================

/**
 * Phase 1.4: admin-managed product registry (the FY26-27 finance taxonomy).
 * `legacyProgrammes` maps the app's historical `mous.programme` value(s) onto
 * this product so existing MOUs resolve without a data rewrite (migration 014).
 * A MOU's programme matches a product's `name` (new MOUs) or one of its
 * `legacyProgrammes` (existing MOUs). Distinct from `MouProduct` (the SKU
 * portfolio on a single MOU).
 */
/**
 * 'per-student' = the platform's students x price model. 'project' = project-
 * based work (e.g. lab setup) with no per-student model; tracked externally and
 * NOT expected to carry per-student MOUs, so it does not read as a reconciliation
 * gap. (migration 016)
 */
export type ProductKind = 'per-student' | 'project'

export interface Product {
  id: string
  name: string
  active: boolean
  sortOrder: number
  legacyProgrammes: string[]
  kind: ProductKind
  /**
   * Two-level hierarchy (migration 017): null = top-level category/product; set
   * = a sub-product under the category with this id. A product with a parent may
   * not itself be a parent (two-level only, enforced app-side). MOUs sit on leaf
   * products; categories are pure groupers.
   */
  parentId?: string | null
  createdAt: string
  createdBy?: string | null
  auditLog: AuditEntry[]
}

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
  | 'inventoryItem'                // W4-G.1
  | 'communicationTemplate'        // W4-I.5 Phase 3
  | 'kitDispatch'                  // Gate 3 Steps 2-9 (Misba joint spec)
  // Gate 2 entity migrations from gsl-mou-system
  | 'adjustment'                   // Phase 3 R2 adjustment-as-line-item
  | 'signedValues'                 // signed-values capture (mou-system Phase 3 §4)
  | 'piCounterMap'                 // multi-entity per-GSTIN counter (Gate 2 §3)
  | 'vexProduct'                   // 28-SKU master
  | 'vexPi'                        // VEX module proforma
  | 'vexDispatch'                  // VEX partial-dispatch records
  | 'vexOrder'                     // legacy Tally-imported VEX vouchers
  | 'vendor'                       // vendor master
  | 'agreement'                    // NDA / vendor agreement registry
  | 'piIssue'                      // mou-system pi issuance ledger
  | 'stageResponsibility'          // Gate 4.9 stage-level ownership config
  | 'studentCountEvent'            // Phase 5 (Pranav review #4): per-event log of count changes that re-price installments
  | 'homepageActionLog'            // Phase 6F Part 4: per-user/day/item seen/actioned/dismissed log for rollover semantics
  | 'product'                      // Phase 1.4: admin-managed product registry (finance taxonomy)

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
// Gate 2 §3: PiCounterMap (multi-entity per-GSTIN counter)
// ============================================================================
//
// gsl-mou-system uses a per-GST-entity counter so MTPL/MH and MTPL/UP each
// keep gap-free sequential PI numbers. Migrated verbatim. The Phase 1 Ops
// PiCounter (single counter) stays for backward compatibility; PI generation
// reads from PiCounterMap when the entity routing layer is wired.

export interface PiCounterMap {
  fiscalYear: string               // '2627'
  entities: {
    MH: { next: number }
    UP: { next: number }
  }
}

// ============================================================================
// Gate 2: Adjustment (Phase 3 R2 adjustment-as-line-item)
// ============================================================================
//
// When an actuals update changes the economics of a programme MOU after a
// PI has been issued or paid, the original PI is preserved and a separate
// Adjustment record is created. The next unpaid PI surfaces the cumulative
// adjustments as a "Balance due Previous Instalments / (Excess Received)"
// line so the school sees a clean audit trail. Status 'Reversed' marks
// adjustments cancelled in error.

export type AdjustmentTrigger =
  | 'actuals_update'
  | 'installment_plan_change'
  | 'manual'
  | 'vex_overpayment'

export type AdjustmentStatus = 'Active' | 'Reversed'

export interface Adjustment {
  id: string                            // 'ADJ-...'
  mouId: string
  schoolId: string
  triggeredByEvent: AdjustmentTrigger
  triggeredAt: string                   // ISO
  triggeredBy: string                   // User.id
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

// ============================================================================
// Gate 2: SignedValues (mou-system Phase 3 §4)
// ============================================================================
//
// Captures the signed-PDF source-of-truth values per MOU when the agreement
// returns from the school. Legal canonical for the contract; the MOU
// commercial fields stay editable for ops accuracy, but the SignedValues
// row is the legally binding snapshot.

export interface SignedValues {
  mouId: string
  signedDate: string                    // ISO yyyy-mm-dd
  signedBy: string                      // User.id of capturer
  pricePerStudent: number
  studentCount: number
  duration: string
  signedScanUrl: string | null          // link, not upload
  capturedAt: string                    // ISO
  notes: string | null
}

// ============================================================================
// Gate 2: VEX module entities (28-SKU partial dispatch)
// ============================================================================
//
// VEX kit orders are billed PI-by-PI, not under an MOU. The PI counter is
// shared with programme PIs per GST entity. One VexPi may have multiple
// VexDispatch records as warehouse stock arrives in waves.

export interface VexProduct {
  partNumber: string
  name: string
  /** Unit price set per PI; null until accounts captures one. */
  defaultUnitPrice: number | null
  active: boolean
  /**
   * P3 OCC (2026-05-24): version for optimistic concurrency on
   * /admin/operations/vex/products/[partNumber]/edit. Same pattern as
   * CcRule.version / CommunicationTemplate.version.
   */
  version?: number
}

export interface VexLineItem {
  productName: string
  quantity: number
  ratePerUnit: number
  amount: number
}

export interface VexPiLineItem {
  partNumber: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
}

export type VexPiStatus =
  | 'Generated'
  | 'Payment Pending'
  | 'Delivery Pending'
  | 'Partially Dispatched'
  | 'Completed'

export interface VexPi {
  id: string                            // 'VEXPI-MH-2627-001'
  piNumber: string                      // 'MTPL/MH/2627/0042' (shared programme + VEX counter)
  entityKey: 'MH' | 'UP'
  issueDate: string                     // ISO yyyy-mm-dd
  schoolName: string                    // ship-to
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
  gstPct: number                        // 0.18 default
  gstAmount: number
  total: number
  status: VexPiStatus
  generatedBy: string                   // User.id
  generatedAt: string                   // ISO
  paymentReceivedAmount: number
  paymentLogIds: string[]
  notes: string | null
  auditLog: AuditEntry[]
}

export interface VexDispatchItem {
  partNumber: string
  qty: number
}

export type VexDispatchStatus =
  | 'Requested'
  | 'Request Raised to Warehouse'
  | 'Invoiced'
  | 'Shipped'

export type VexDispatchMode = 'Air' | 'Surface'

export interface VexDispatch {
  id: string                            // 'VEXD-MH-2627-001'
  piId: string                          // FK to vex_pis.json
  items: VexDispatchItem[]
  freight: number
  mode: VexDispatchMode
  status: VexDispatchStatus
  requestedBy: string                   // User.id
  requestedAt: string                   // ISO
  taxInvoiceNumber: string | null
  taxInvoicePath: string | null
  invoicedAt: string | null
  notes: string | null
  supportingDocPath: string | null
  warehouseEmailSentAt: string | null
  warehouseEmailSentBy: string | null
  auditLog: AuditEntry[]
}

export type LegacyVexDispatchStatus =
  | 'Proforma Sent'
  | 'Payment Received'
  | 'Invoice Generated'
  | 'Dispatched'

export interface VexOrder {
  id: string                            // stable slug or UUID
  orderDate: string                     // ISO yyyy-mm-dd
  schoolId: string | null               // FK after normalisation
  schoolName: string                    // raw name from Tally import
  schoolNameNormalised: string | null
  buyerAddress: string | null
  consigneeAddress: string | null
  voucherNumber: string                 // e.g. MTPL/UP/2526/1
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
  dispatchStatus: LegacyVexDispatchStatus
  dispatchDate: string | null
  invoiceDate: string | null            // when GST invoice was generated in Tally
  salesPersonId: string | null
  importedFromTally: boolean
  auditLog: AuditEntry[]
}

// ============================================================================
// Gate 2: Vendor + Agreement (NDA + vendor-agreement registry)
// ============================================================================
//
// Vendor master holds the entity registry. Agreement covers both NDAs and
// vendor agreements; the type discriminator distinguishes them.

export interface Vendor {
  id: string                            // 'VEN-...'
  name: string
  legalEntity: string | null
  category: string | null               // 'Logistics' | 'Print' | 'Warehouse' | etc.
  primaryContact: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  address: string | null
  pan: string | null
  gstNumber: string | null
  bankAccount: string | null
  ifsc: string | null
  notes: string | null
  active: boolean
  createdAt: string                     // ISO
  auditLog: AuditEntry[]
}

export type AgreementType = 'Vendor' | 'NDA'

export type AgreementCustody = 'Physical' | 'Digital'

export interface Agreement {
  id: string                            // 'AGR-...'
  type: AgreementType
  partyName: string
  vendorId: string | null               // FK to vendors.json when type='Vendor'
  natureOfAgreement: string
  product: string | null
  department: string | null
  /**
   * Short summary of commercial terms shown in the Agreements registry.
   * Optional; recommend keeping under a couple of sentences.
   */
  keyTerms: string | null
  startDate: string                     // ISO yyyy-mm-dd
  endDate: string | null                // null = indefinite
  tenure: string | null                 // '5 years from date of agreement'
  noticePeriod: string | null
  vendorLocation: string | null
  physicalCustody: AgreementCustody | null
  documentUrl: string | null
  daysToExpiry: number | null           // computed by sync
  auditLog: AuditEntry[]
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

// ============================================================================
// KitDispatch (Gate 3 Steps 2-9; Misba + Shashank + Pranav joint spec)
//
// One KitDispatch record per (MOU x School) pair once the MOU is signed
// and ready for kit shipment. Per joint spec section 2: entry appears
// only after MOU lifecycle is complete (status >= 'Active'); payment
// status is computed live from payments.json and is NOT stored on the
// record (single source of truth).
//
// The record progresses through: Sales/Ops allocate grades+kits (Step 3)
// -> Sales approve or reject (Step 4) -> Sales edit dispatch summary
// (Step 5; dual-writes School Master) -> Accounts execute partial /
// full dispatch + upload Tally challan (Step 6) -> dispatchStatus
// auto-transitions per Step 7 logic -> Ops adds shipment tracking +
// POD (Step 8) -> POD upload flips status to 'Delivered' (Step 11
// updated logic).
//
// Distinct from the existing Dispatch entity (W4-D) which models the
// per-installment kit handover lifecycle. Gate 3 KitDispatch is the
// Misba-spec rebuild that consolidates allocation -> approval ->
// execution -> tracking -> POD into one record. Coexists with the
// pre-existing Dispatch records; the two systems run in parallel
// while operators migrate.
// ============================================================================

export type KitDispatchStatus = 'Not Started' | 'Pending' | 'In Transit' | 'Delivered'

export type KitSalesApprovalStatus = 'Pending' | 'Approved' | 'Rejected'

export interface KitAllocation {
  /** 1-12. */
  grade: number
  /** Per-grade student count. Pulled from MOU.gradewiseDistribution if Sales
   *  entered it at draft; entered fresh by Ops at allocation time otherwise. */
  students: number
  /** Number of physical kits to dispatch for this grade. Defaults to students
   *  but editable: Reusable kits may be shared across multiple students. */
  kitsQty: number
  /** Reusable returns to GSL post-course; Consumable stays with the student. */
  kitType: 'Reusable' | 'Consumable' | null
  /** SKU name verbatim from inventory_items.json at allocation time. Stored as
   *  a name (not an id) so the audit trail survives SKU id changes; the
   *  allocation flow validates the name exists in inventory before submit. */
  productName: string
}

export interface AccountsDispatchEntry {
  grade: number
  studentsRequested: number
  productRequested: string
  qtyRequested: number
  /** Finance-editable; the only column Accounts fill in at Step 6. Cannot
   *  exceed qtyRequested; can be 0 for partial dispatch (Cretile stock-out). */
  qtyActualDispatched: number
}

export interface DispatchSummary {
  /** Editable by Sales; dual-writes back to School master on save. */
  schoolName: string
  shippingAddress: string
  contactPerson: string
  contactNumber: string
  /** Free-text remarks Sales adds at Step 5 (e.g. "Kits are returnable"). */
  salesRemarks: string | null
  approvedBy: string                 // User.id; Sales who approved
  approvedAt: string                 // ISO
  /** Populated by Accounts at Step 6 once they record actual dispatch. */
  accountsEntries: AccountsDispatchEntry[]
  /** public/delivery-challans/<dispatchId>.pdf once uploaded by Accounts. */
  deliveryChallanPath: string | null
  /** ISO timestamp when "Email Warehouse" button was clicked at Step 6.
   *  Gate 4 wires actual SMTP delivery; for Step 6 this is intent-only. */
  warehouseEmailLoggedAt: string | null
}

export interface ShipmentTracking {
  courierName: string
  trackingId: string
  /** ISO YYYY-MM-DD. Defaults to the accounts-execute timestamp. */
  dispatchDate: string
  /** ISO YYYY-MM-DD; optional. */
  expectedDelivery: string | null
  deliveryStatus: 'In Transit' | 'Delivered'
  updatedAt: string
  updatedBy: string                  // User.id
}

export interface PODRecord {
  /** public/delivery-pods/<dispatchId>.<ext> */
  filePath: string
  uploadedAt: string
  uploadedBy: string                 // User.id
}

export interface KitDispatch {
  /** 'DISPATCH-<mouId>' format; minted at first-allocation-submit time.
   *  See STEP9_QUESTIONS.md Q2 for the timing rationale. */
  id: string
  mouId: string
  schoolId: string
  schoolName: string                 // denormalised at create time
  productSelected: 'TinkRworks' | 'Cretile' | 'Both' | 'Hardware'
  dispatchStatus: KitDispatchStatus
  allocations: KitAllocation[]
  salesApprovalStatus: KitSalesApprovalStatus
  salesApprovedBy: string | null
  salesApprovedAt: string | null
  salesRejectionReason: string | null
  /** Populated by Step 4 approve action; mutated by Step 5 (sales edit)
   *  and Step 6 (Accounts execution). */
  dispatchSummary: DispatchSummary | null
  /** Populated by Step 8 once Ops records courier metadata. */
  shipmentTracking: ShipmentTracking | null
  /** Populated by Step 8 POD upload; presence flips dispatchStatus to
   *  'Delivered' per Step 11 logic. */
  pod: PODRecord | null
  auditLog: AuditEntry[]
  createdAt: string
  /**
   * Gate 4.5: free-text bag for Excel-import context (eway bill flag,
   * billing remarks, students-served count, kit-return notes). Format:
   * `key1=value1; key2=value2`. Null on records that did not originate
   * from an Excel import.
   */
  importNotes?: string | null
  /**
   * P2b.X OCC (2026-05-24): optimistic-concurrency version. Incremented
   * on every UPDATE that touches the replace-on-update fields
   * (allocations, dispatch_summary, shipment_tracking, pod). The lib
   * loads `version` with the record; the route passes it back in the
   * write request; the repo's atomic update checks `WHERE version=$1`
   * and bumps. If 0 rows affected, the route returns 409 Conflict and
   * the UI prompts the operator to reload. Optional in the type for
   * pre-postgres records and tests; defaults to 1 in postgres.
   */
  version?: number
}

// ============================================================================
// StageResponsibility (Gate 4.9)
//
// Leadership-configurable mapping from each of the 10 master lifecycle
// stages (see src/lib/statusTracker.ts) to a responsible party.
// Single owner per stage; user override on top of the department
// default. Notification fan-out narrows to the user when set; falls
// back to department broadcast otherwise.
//
// Persisted as a single document keyed by stage in
// src/data/stage_responsibility.json. Audit log appends on every
// update via stageResponsibility.ts/updateStageResponsibility.
// ============================================================================

export type ResponsibilityDepartment =
  | 'sales'
  | 'ops'
  | 'finance'
  | 'leadership'
  | 'admin'

export interface StageResponsibility {
  /** Which lifecycle stage this row configures. Matches LifecycleStage. */
  stage: import('./statusTracker').LifecycleStage
  /** Department that owns the stage by default. */
  responsibleDepartment: ResponsibilityDepartment
  /** Optional User.id that owns the stage for the configured department.
   *  When set, narrows notifications + accountability to that user.
   *  Null means whole-department ownership. */
  responsibleUserId: string | null
  /** Department to route to when the stage stalls past its SLA. */
  escalationDepartment: ResponsibilityDepartment
  /** Free-text leadership memo describing the stage. */
  notes: string | null
  /** ISO timestamp of the last leadership-touched config change. */
  updatedAt: string
  /** User.id of the last person to touch this stage. */
  updatedBy: string
  /** Append-only history of leadership edits. */
  audit: AuditEntry[]
  /**
   * P3 OCC (2026-05-24): version for optimistic concurrency on
   * /admin/stage-responsibility. Two leadership members editing the
   * same stage concurrently would otherwise clobber.
   */
  version?: number
}


/**
 * Step 3 (2026-06-05): Welcome Note tracking. Ops triggers a templated
 * welcome note to the school after Finance enters the MOU; the system
 * tracks sent-vs-pending. One per MOU. Recorded-status only - no real
 * email send infra exists yet (see RUNBOOK / follow-up).
 */
export interface WelcomeNote {
  mouId: string
  schoolId: string | null
  noteText: string
  status: 'pending' | 'sent'
  sentAt: string | null
  sentBy: string | null
  updatedAt: string | null
  auditLog: AuditEntry[]
}

/**
 * Step 3 (2026-06-05): Recce report. A per-school record of lab
 * facilities/requirements (what the school has or is missing).
 * Record-keeping only, not a workflow. Multiple per school allowed.
 */
export interface RecceReport {
  id: string
  schoolId: string
  mouId: string | null
  requirements: string
  status: 'draft' | 'recorded'
  createdBy: string | null
  createdAt: string | null
  auditLog: AuditEntry[]
}
