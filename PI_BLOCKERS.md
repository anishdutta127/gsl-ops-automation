# PI generation blockers

Phase 6B cutover audit. Every code path that prevents a PI from being issued, with the source location and whether `TESTING_OPEN_ACCESS=true` allows a user past that check.

Mirrors the live admin page at `/admin/pi-blockers`. The single source of truth is `src/lib/pi/blockers.ts`; this file and the admin page render from it.

## Finance-correctness invariant

`TESTING_OPEN_ACCESS=true` must NOT bypass entity-prefix, GSTIN policy, or PAN policy checks. The audit confirms:

- **Entity-prefix**: hardcoded enum check (`MH` or `UP`) and hardcoded `programmeRouting` map. Not an access-layer check. Not bypassable. PASS.
- **GSTIN**: per W4-A.6, GSTIN is deliberately NOT a blocker. The DOCX renders "GSTIN: To be added" when missing. Flagged below as a policy decision (not a defect): Anish to confirm intent at cutover.
- **PAN**: not validated per PI. Company PAN lives in `config/company.json`. No code path can bypass it because there is nothing to bypass.

No finance-correctness check is bypassed by `TESTING_OPEN_ACCESS`.

## Blocker table

| Category | Surface | Condition | Error key | Message | Source | Testing bypass | Note |
|---|---|---|---|---|---|---|---|
| cutover | Both | PI_PARALLEL_BUILD_LOCK env var is unset, empty, or any value other than "false". | `parallel-build-locked` | PI generation is locked during the parallel-build window. Pranav continues issuing PIs from gsl-mou-system. This route activates at Gate 5 cutover. | `src/lib/pi/parallelBuildLock.ts:26` | No | Cutover lock is independent of access control. Default fails closed so an accidental redeploy never collides on the counter. Production unlock: `PI_PARALLEL_BUILD_LOCK=false`. |
| auth | Both | No valid session. | `unauthenticated` | Sign in to continue. | `src/app/api/pi/generate/route.ts:51`, `src/app/api/operations/vex/pi/create/route.ts:132` | No | Auth gate runs before any access-layer check. TESTING_OPEN_ACCESS does not bypass auth. |
| auth | MOU PI | session.sub does not match any user in users.json. | `unknown-user` | User account not found. | `src/lib/pi/generatePi.ts:369` | No | Identity lookup. Cannot be bypassed without falsifying the users.json record. |
| access | MOU PI page | canGeneratePI(user) returns false (department not finance, not Admin wildcard). | (none) | Redirected back to MOU detail with `notice=pi-finance-only`. | `src/app/mous/[mouId]/pi/page.tsx:100` | Yes | Layer 1 view gate. Opens when TESTING_OPEN_ACCESS=true so testers can walk the flow. Layer 2 canPerform stays as defence in depth. |
| access | VEX PI | canEditFinanceData(user) returns false (department not finance, not Admin wildcard). | `forbidden` | Only Finance can generate VEX PIs. | `src/app/api/operations/vex/pi/create/route.ts:139` | Yes | Layer 1 edit gate. Opens when TESTING_OPEN_ACCESS=true. Layer 2 canPerform stays as defence in depth. |
| access | MOU PI | canPerform(user, "mou:generate-pi") returns false. Only Admin role (wildcard) and Finance role grant this action. | `permission` | Permission denied. | `src/lib/pi/generatePi.ts:370` | No | Layer 2 action gate. NOT bypassed by TESTING_OPEN_ACCESS per design. All current test users carry role=Admin so they trip ADMIN_WILDCARD and pass regardless. |
| validation | MOU PI | mouId form field missing or empty. | `missing-mou` | No MOU was specified. | `src/app/api/pi/generate/route.ts:63` | No | Form payload validation. |
| validation | MOU PI | instalmentSeq is not a positive finite number. | `invalid-instalment-seq` | Instalment sequence number is invalid. | `src/app/api/pi/generate/route.ts:64` | No | Form payload validation. |
| data | MOU PI | No MOU in mous.json matches the supplied mouId. | `mou-not-found` | MOU not found. | `src/lib/pi/generatePi.ts:375` | No | Data lookup. |
| data | MOU PI | MOU status is not "Active". | `wrong-status` | PI generation is only allowed on Active MOUs. | `src/lib/pi/generatePi.ts:376` | No | Lifecycle gate. Drafts and signed-but-pending MOUs cannot issue PIs. |
| data | MOU PI | No School in schools.json matches the MOU.schoolId. | `school-not-found` | Linked school not found. | `src/lib/pi/generatePi.ts:379` | No | Data integrity. |
| system | MOU PI | The PI .docx template file is missing on the deploy. | `template-missing` | PI template missing on the server. Operator must restore the template and retry. | `src/lib/pi/generatePi.ts:127` | No | Filesystem-side check. Unrelated to access control. |
| system | MOU PI | A Payment row already exists for this (mouId, instalmentSeq) AND has a piNumber. The call re-renders the existing PI instead of advancing the counter. | (none) | PI re-rendered for existing payment row (no new number minted). | `src/lib/pi/generatePi.ts:386` | No | Idempotency guardrail; not strictly a blocker. Listed for audit completeness. |
| validation | VEX PI | POST body is not valid JSON. | `invalid-json` | Request body must be valid JSON. | `src/app/api/operations/vex/pi/create/route.ts:149` | No | Payload parse. |
| finance-correctness | VEX PI | entityKey is not "MH" or "UP". | `invalid-entity` | Pick MH or UP. | `src/app/api/operations/vex/pi/create/route.ts:154` | No | ENTITY-PREFIX CHECK. Hardcoded enum check. NOT an access-layer gate so TESTING_OPEN_ACCESS cannot bypass it. Programme-PI uses the equivalent invariant via getEntityForProgramme (hardcoded programmeRouting map). |
| validation | VEX PI | schoolName, shippingAddress, billingName, or billingAddress is missing. | `missing-billing-block` | Fill every school billing field. | `src/app/api/operations/vex/pi/create/route.ts:167` | No | Document-integrity validation. |
| validation | VEX PI | contactPerson or contactNo is missing. | `missing-contact` | Contact person and number required. | `src/app/api/operations/vex/pi/create/route.ts:173` | No | Document-integrity validation. |
| validation | VEX PI | No line items, or any line item has an unknown partNumber / non-positive quantity / non-positive unitPrice. | `invalid-line-items` | Add at least one valid product row. | `src/app/api/operations/vex/pi/create/route.ts:180` | No | Catalog lookup against vex_products.json runs inside this check. |
| system | VEX PI | Counter atomic update exhausted retries (3) on the GitHub Contents API. | `counter-failure` | Failed to issue PI number. Retry. | `src/app/api/operations/vex/pi/create/route.ts:196` | No | Infrastructure-side failure. Operator must check queue health and retry. |
| system | VEX PI | enqueueUpdate failed to commit the new VexPi record to pending_updates.json. | `queue-failure` | Failed to queue the new VEX PI. Retry or WhatsApp Anish. | `src/app/api/operations/vex/pi/create/route.ts:262` | No | Side-effect of GitHub Contents API failure. The counter has already advanced at this point, so the PI number will gap. Numbers never duplicate. |
| finance-correctness | MOU PI | school.gstNumber is null or empty. Per W4-A.6, GSTIN is NOT a blocker; the .docx renders "GSTIN: To be added" placeholder. | (none) | Inline note on the PI page: "GSTIN: To be added". | `src/lib/pi/generatePi.ts:178` (placeholder render only) | N/A | POLICY FLAG for Anish: GSTIN is deliberately non-blocking per W4-A.6. PI can be issued without GSTIN and the .docx surfaces the placeholder. Confirm this remains intended at cutover; if GSTIN should block PI generation for finance correctness, this is a code change, not a config flip. |
| finance-correctness | Both | PAN is not validated per PI. Company PAN (AAOCM1035E) lives in config/company.json as identity configuration. | (none) | (no per-PI PAN check exists) | `config/company.json` (`company.pan`) | N/A | POLICY FLAG for Anish: PAN is not a per-PI input; it is company-side identity. No code path can bypass it because there is nothing to bypass. Listed here so the audit is complete. |

## Policy flags for Anish

1. **GSTIN non-blocking** (W4-A.6). The .docx surfaces "To be added" instead of refusing to issue. If at cutover Anish wants GSTIN to block PI generation, that is a one-line `&&` change at `src/lib/pi/generatePi.ts:178`. Not changed in this gate.
2. **PAN not validated per PI**. Company PAN is configuration; the PI documents read it from `config/company.json`. No per-PI PAN check exists, and there is no school-side PAN field on the PI record either. Worth re-validating at cutover whether finance needs PAN validation introduced.

## PI-missing backfill candidates (live counter on `/admin/pi-blockers`)

Paid payment rows (`receivedAmount > 0`) with no `piNumber` set. These came in via the Pratik / Pranav Excel imports where the PI column was blank on the source sheet. They are NOT blocked by code; the system can generate fresh PIs against any of these instalments and the counter advances normally.

At Phase 6B cutover the count was ~126 rows (split: ~105 MOU-STEAM-2526, ~15 MOU-STEAM-2627, ~6 MOU-YP-2526). The live `/admin/pi-blockers` page surfaces the current count and lists the first 50 with payment id, MOU, school, instalment seq, and received amount so Pranav can backfill at his pace. The full filter is `receivedAmount > 0 AND piNumber IS NULL` against `src/data/payments.json`.
