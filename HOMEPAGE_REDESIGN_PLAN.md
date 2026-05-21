# Homepage redesign plan (Phase 6F Part 1)

Ameet's directive: when a user opens the platform, they should see what they need to do today, not aggregated metrics. The current 5-zone landing gets pushed below the fold; existing health / KPI surfaces remain reachable through navigation.

This document is the audit + plan. **No code is changed yet.** Awaiting Anish review before Part 2 (engine), Part 3 (UI), Part 4 (rollover), Part 5 (role views).

---

## 1. Current 5-zone landing inventory

`src/app/page.tsx` server-renders the `ConsolidatedLanding` component at `/`. The component composes 5 zones in this order (per `ConsolidatedLanding.tsx` line 89):

| # | Zone | Surface | Data source |
|---|---|---|---|
| 1 | **Commercial position** | 4 KPI cards (signed contract value, received, balance, expected) + 12-month sparkline | `computeCommercialPosition` reading `mous.json`, `payments.json` |
| 2 | **Operational position** | 3 columns (Active MOUs by stage, dispatch states, vendor / escalation pulse) | `computeOperationalPosition` reading `mous.json`, `payments.json`, `kit_dispatches.json` |
| 3 | **Drill-down tiles** | Finance / Operations / Leadership cards with mini-stats (promoted above QuickActions per Gate 4.95 Step 4) | `computeTileSlices` reading every canonical data file |
| 4 | **Quick actions** | 5 outlined buttons: Draft MOU, Review payments, Run reconcile, Open kanban, View overview | `canDraftMou` gate on the Draft MOU button only |
| 5 | **Items requiring attention** | Up to 5 attention items (escalations, critical changes, blocked MOUs) | `computeLandingAttention` reading `mous.json`, `schools.json`, `escalations.json`, `kit_dispatches.json`, `payments.json` |

### Per-role differentiation (today)

**The current homepage is essentially role-agnostic.** Every role sees the same 5 zones with the same data; the only branching is the `canDraftMou` flag on the Quick Actions zone's "Draft MOU" button. There is no per-role filtering of attention items, KPIs, or drill-down tiles.

This is the gap Ameet's directive targets: every user lands on the same aggregated view; nobody lands on "your queue today".

### Audit screenshots (current state)

| Role | Viewport | Path |
|---|---|---|
| Anish (Admin, dept: null) | desktop 1280×800 | `.verification/2026-05-21T11-07-05/current-landing-anish-desktop.png` |
| Anish (Admin, dept: null) | mobile 375×812 | `.verification/2026-05-21T11-07-15/current-landing-anish-desktop.png` |
| `/dashboard` post-Phase-6F target | desktop | `.verification/2026-05-21T11-07-05/current-landing-dashboard-overview.png` |
| `/dashboard` post-Phase-6F target | mobile | `.verification/2026-05-21T11-07-15/current-landing-dashboard-overview.png` |

Production users all carry `role: 'Admin'` (post 2026-04-27 promotion in `docs/role-decisions.md`); the workflow distinction is the `department` field on each user. Capturing the layout once with Anish (dept: null wildcard) is sufficient for the audit: the 5-zone surface renders identically for every department because `landingData.ts` does no per-user filtering. Per-role rendering differences only surface in Phase 6F when the new action-queue UI lands; that is when we will capture the 4 role × 2 viewport = 8 screenshots the brief calls for.

`/dashboard` does not exist yet as a route. The current landing lives at `/`; Phase 6F Part 3 will create `/dashboard/overview` as the home for the relocated 5-zone view.

---

## 2. Existing data sources for the action queue (no new schema)

Every action category below resolves to a query over canonical data already present in the repo. No new tables, no new entity types.

| Data file | Read for | Already loaded by |
|---|---|---|
| `src/data/payments.json` | instalment due dates, PI numbers, received amounts, status, audit log | every dashboard + every payment surface |
| `src/data/mous.json` | MOU status, contract value, school link, programme, productSelection, audit log | every MOU surface |
| `src/data/dispatches.json` | kit dispatch stage, lineItems, raise/deliver timestamps | dispatch surfaces |
| `src/data/kit_dispatches.json` | newer-pattern dispatch records (Gate 5A+) | dispatch surfaces |
| `src/data/schools.json` | school name, GSTIN, contact details | every school surface |
| `src/data/escalations.json` | CC escalation rules + open escalations | attention zone, escalations page |
| `src/data/payment_logs.json` | bulk import + manual log records | payment surfaces |
| `src/data/users.json` + `src/lib/access.ts` | role + department + active flag for the requesting user | every authenticated render |

**Audit log:** there is **no separate `audit_log.json`**. Audit entries are embedded within each entity's `auditLog: AuditEntry[]` field (MOU, Payment, Dispatch, etc.). The brief mentioned `audit_log.json`; the actual contract is per-entity inline. This works for the action queue — `homepage_action_log.json` (Phase 6F Part 4) will be a NEW small file at `src/data/homepage_action_log.json`, recording which user saw which action item on which day, separate from per-entity audit logs.

---

## 3. Field-level mapping per action category

For each category, the exact filter that produces the list. All examples use today = 2026-05-21 (current date).

### Category 1 — Overdue & escalating (urgency colour: signal-alert red)

| Action | Source | Filter | Live count (2026-05-21) |
|---|---|---|---|
| Instalments past due > 7 days, Pending | `payments.json` | `status === 'Pending' && dueDateIso !== null && dueDateIso < today - 7 days` | **56** |
| PIs unissued > 14 days post-due | `payments.json` | `status === 'Pending' && piNumber === null && dueDateIso !== null && dueDateIso < today - 14 days` | **54** |
| Signed MOUs not activated > 30 days | `mous.json` | `status === 'Pending Signature' && startDate !== null && startDate < today - 30 days` | **22** |
| Payments received > 7 days, not matched to an instalment | `payment_logs.json` | logs with `matchedPaymentId === null && receivedDate < today - 7 days` | (existing PaymentMatcher surface; need a count probe) |

### Category 2 — Today's actions (urgency colour: signal-attention amber)

| Action | Source | Filter | Live count |
|---|---|---|---|
| Instalments due today | `payments.json` | `status === 'Pending' && dueDateIso === today` | **0** today |
| Active MOUs eligible for first PI | `mous.json` + `payments.json` | `mou.status === 'Active'` AND `payments[mouId][seq=1].piNumber === null` | **119** |
| Unmatched payments with auto-suggested instalment match | `payment_logs.json` | logs where amount + date is within tolerance of a single Pending instalment on a single MOU | (existing PaymentMatcher heuristic; reuse `src/lib/payments/matchCandidates.ts`) |

### Category 3 — This week (urgency colour: brand-navy blue)

| Action | Source | Filter | Live count |
|---|---|---|---|
| Instalments due in next 7 days | `payments.json` | `status === 'Pending' && dueDateIso > today && dueDateIso <= today + 7 days` | **0** in next 7 days |
| MOUs entering next payment milestone in next 7 days | `mous.json` + `payments.json` | derive next-due-by-MOU; bucket those with `dueDateIso` within 7 days where prior instalment is `Paid` or `PI Sent` | (count probe needed) |
| Renewal-eligible MOUs (AY ending in next 60 days) | `mous.json` | `endDate !== null && endDate <= today + 60 days && status === 'Active'` | (count probe needed) |

### Category 4 — Data quality (urgency colour: muted slate grey)

| Action | Source | Filter | Live count |
|---|---|---|---|
| Paid-no-PI backfill candidates | `payments.json` | `receivedAmount > 0 && piNumber === null` (already surfaced on `/admin/imports/pi-backfill`) | **126** (per Phase 6C audit) |
| Stored-vs-derived contract value mismatch > Rs 100 | `mous.json` | `\|mou.contractValue - mou.studentsActual * mou.spWithTax\| > 100` (BAPUJI Rs 69,230, Julien class) | ~5 |
| Active MOUs with school missing GSTIN | `mous.json` + `schools.json` | `mou.status === 'Active' && (school.gstNumber === null \|\| school.gstNumber.trim() === '')` | **153** schools missing GSTIN (subset have active MOUs) |
| Orphan payment rows (Phase 6C finding) | `payments.json` + `mous.json` | `payment.mouId !== null && mous.find(m => m.id === payment.mouId) === undefined` | **9** |
| MOUs with null productSelection | `mous.json` | `productSelection === null` | **161** (post Phase 6E backfill, was 183) |

### Category 5 — AI insights (urgency colour: brand-teal purple)

- Stub returning empty array for now.
- **Contract for future integration:**
  ```ts
  interface AiInsightProvider {
    listInsights(context: {
      now: Date
      user: User
      data: { mous: MOU[]; payments: Payment[]; ... }
    }): Promise<ActionItem[]>
  }
  const NO_OP_AI_INSIGHTS: AiInsightProvider = {
    listInsights: async () => [],
  }
  ```
- The stub lives at `src/lib/homepage/aiInsights.ts`. No `await fetch(...)`, no API key, no provider import in Phase 6F. Future ChatGPT / local-model wiring replaces `NO_OP_AI_INSIGHTS` with a real implementation; the call site does not change.

---

## 4. Role-tagging logic

Production users (all 13 carry `role: 'Admin'`; the gate is `department`):

| User | Department | Effective homepage view |
|---|---|---|
| anish.d, ameet.z, shashank.s, gowri.r, ajith.n | `null` (wildcard) | Anish: Admin (full action queue). Ameet: Leadership aggregate per Part 5. Shashank / Gowri / Ajith inherit the wildcard but the homepage uses their `department === null` as Admin signal. **Action**: Phase 6F Part 5 introduces an explicit `homepageView` resolution: `Admin` for anish.d, `Leadership` for ameet.z, default Admin for the other 3 (revisable). |
| pratik.d, vishwanath.g | `sales` | Sales view: subset of Ops + finance-adjacent actions (renewal-eligible MOUs, signed-not-activated, PI-blocker school escalations). Brief did not enumerate a Sales view; **action**: confirm with Anish whether Sales gets its own action queue or rolls into Both/Ops. |
| misba.m, pradeep.r, swati.p | `ops` | Ops view: cards tagged `'ops'` or `'both'`. |
| shubhangi.g, pranav.b, anita.c | `finance` | Finance view: cards tagged `'finance'` or `'both'`. |

Implementation:

```ts
function resolveHomepageView(user: User): 'admin' | 'leadership' | 'finance' | 'ops' | 'sales' {
  if (user.id === 'ameet.z') return 'leadership'
  const dept = getDepartment(user)          // src/lib/access.ts
  if (dept === null) return 'admin'         // wildcard sees everything
  return dept                               // 'sales' | 'ops' | 'finance'
}
```

The brief's four explicit roles map to:
- **Anish** → `admin` (sees everything, no filtering)
- **Pranav** → `finance` (sees `role: 'finance' | 'both'` cards)
- **Misba** → `ops` (sees `role: 'ops' | 'both'` cards)
- **Ameet** → `leadership` (no personal queue, only "Platform pulse" counts)

The `ActionItem.role` field is the discriminator: `'finance' | 'ops' | 'both'`. There is no `'sales'` value; Sales users see Both + Ops by default until Anish confirms otherwise.

**`role: 'both'` cards** are seen by every department-scoped role plus Admin. Example: "Paid-no-PI backfill candidates" is data-quality work both Finance and Ops should know about; tag it `'both'`.

---

## 5. Mobile breakpoint plan (375px)

| Surface | Desktop ≥ 1024px | Tablet 768-1023px | Mobile 375-767px |
|---|---|---|---|
| Greeting strip | full-width header | full-width | full-width, compact (drop the weekday-prose; show only "Good morning, Pranav · 21 May") |
| "Your queue" (personal) | left column 60% | full-width above team blockers | full-width, shown by default |
| "Team blockers" | right column 40% | full-width below personal | collapsed behind "Show team blockers (n)" toggle button |
| AI insights row | inline below "Your queue" | inline below personal | collapsed behind "Show AI insights" toggle |
| Below-the-fold link to `/dashboard/overview` | inline at bottom | inline at bottom | inline at bottom |

### Mobile-specific layout rules

- Single column at < 768px.
- Each `ActionCard` becomes full-width with the category-stripe on the left edge (4px wide), the count badge top-right, the CTA button bottom-right.
- Dismiss-for-today is a swipe-left gesture OR a "⋮" menu inside each card (both desktop and mobile use the menu; swipe is a stretch).
- Empty state (all-clear) is a single celebratory tile, not a hidden empty card.
- Team blockers toggle reveals an accordion that expands inline; do not navigate away.

### Accessibility (WCAG AA)

- Category stripes carry their own colour but also a text label (eg "Overdue", "Today") for screen readers.
- Action counts ("12 PI backfills") are announced via `aria-label="12 paid-no-PI backfill candidates"`.
- Keyboard navigation: each card is a focusable region; CTA + dismiss-menu are keyboard-reachable from the card region.
- Focus state on cards uses 2px brand-navy ring (matching existing OpsButton focus pattern).

---

## 6. Open questions for Anish

1. **Sales department**: pratik.d and vishwanath.g currently fall outside the brief's four roles. Default proposal: Sales sees `'both'` cards plus a Sales-specific subset (renewal-eligible, signed-not-activated, PI-blocker escalations). Confirm or override.
2. **Shashank / Gowri / Ajith homepage view**: these three carry `department: null` but aren't explicitly Leadership. Default proposal: they see the Admin view (full queue, no filtering). Confirm.
3. **Renewal-eligible MOU horizon**: 60 days is the proposed window per the brief. Confirm or adjust.
4. **Dismiss-for-today TTL**: 24 hours per the brief. Action items reappear tomorrow if still actionable. Confirm.
5. **Rollover promotion threshold**: 3 days of carry-over before an item moves to "Overdue & escalating" regardless of original category. Confirm.
6. **AI insights stub category 5**: confirm that an empty-array stub is acceptable for Phase 6F and the contract above is the right interface for future integration.

---

## Pause and review

Reply **GO** with any adjustments to scope, ordering, or open questions above. After GO, Parts 2-5 land sequentially with commits:

- Part 2: `feat(homepage): action queue engine with 4 deterministic categories + AI stub`
- Part 3: `feat(homepage): action-first dashboard with role-tagged personal + team queues`
- Part 4: `feat(homepage): rollover + urgency promotion for unactioned items`
- Part 5: `feat(homepage): role-specific view filtering + Ameet leadership aggregate`

The old 5-zone landing is preserved at `/dashboard/overview` (not deleted) per the brief.
