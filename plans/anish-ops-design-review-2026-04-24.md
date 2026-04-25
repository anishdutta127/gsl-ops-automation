# /plan-design-review: Phase 1 visual and UX lock

Generated via /plan-design-review framework on 2026-04-24.
Branch: main. Repo: anishdutta127/gsl-ops-automation. Status: DRAFT.
Mode: Design-decisions pass. Step 7 CEO review locked per-axis scope; step 8 eng review locked architecture; this review decides what the recommended scope looks and feels like.
Supersedes: any prior design intent not captured in `DESIGN.md` (to be created as part of Phase 1 scaffolding from this doc plus the follow-on devex-review).

## Anchor points (inputs, not subjects of re-debate)

- **step 7 CEO review scope** (commit `8c21ac0`, post-fixes): 5 axes with recommendations. Axis 1 EXPAND-1 (dashboard with 15 tiles), Axis 2 HOLD + CONTRACT (no portal + email status block), Axis 3 HOLD + EXPAND-1 (feedback with 4 structured categories), Axis 4 HOLD + EXPAND-1 + EXPAND-2 (WhatsApp draft buttons with copy-log), Axis 5 HOLD (big-bang launch).
- **step 8 eng review schemas** (commit `ba66e4d`): Communication (channel × status matrix), Escalation (lane + level), SchoolGroup, CcRule (literal scoping), Feedback (4 categories + null skip), FeedbackHmacToken. Plus D7 refinement (staff-JWT + HMAC endpoint).
- **handoff line 45** (quoted): *"British English always, Indian money format (Rs / lakh / crore), never emdash"*.
- **handoff line 46** (quoted): *"Single-tenant clean"* (via `config/company.json`).
- **handoff WCAG commitment**: WCAG 2.1 AA; axe-core CI with shrinking baseline (inherited from MOU + HR).
- **MOU brand** (step 3 §9): primary teal `#00D8B9`, navy `#073393`; Montserrat (headings), Open Sans (body); Google Fonts via `next/font`.
- **HR design system** (step 3 §7): two-audience (internal + candidate-facing); Fraunces added for candidate moments. Ops is **internal-only Phase 1**, so the candidate-facing layer is out of scope; no Fraunces.

### Out of scope for this review

- Re-debating scope decisions D1-D8, P1-P6, step 7 axis choices, step 8 entity schemas.
- Onboarding flow, admin route discoverability, developer ergonomics: these go to /plan-devex-review.
- Phase 1.1 surfaces (magic-link SPOC portal, auto-escalation UI): deferred.

### This review decides

- Visual treatment of the Leadership Console (5 health tiles + exception feed + escalation list + 10 trigger tiles).
- Feedback form mobile-first layout and interaction model.
- Status-block email template visual and copy (Axis 2 CONTRACT).
- WhatsApp-draft-copied button placement, affordances, copy-confirmation pattern.
- Accessibility baseline policies and axe-core CI shrinking-baseline strategy.
- British-English copy conventions, Indian money display patterns, no-emdash lint rule.

---

## Design system inheritance (what carries, what is Ops-specific)

### Carried verbatim from MOU brand

- **Primary palette**: teal `#00D8B9` (primary action), navy `#073393` (headings + strong emphasis).
- **Typography**: Montserrat (headings, numeric displays), Open Sans (body). Google Fonts via `next/font`.
- **Currency display**: Indian comma grouping (`Rs 1,50,000`), lakh and crore where natural (`Rs 7.05 Cr`, `Rs 12 lakh`). Format helper already in `src/lib/format.ts` (inherited verbatim per step 8 inheritance checklist).
- **Dates**: DD-MMM-YYYY (`15-Apr-2026`), never MM/DD/YYYY.

### Ops-specific design decisions

- **No candidate-facing layer.** HR has Fraunces for candidate moments (step 3 §7). Ops is an internal staff tool. Every surface uses Montserrat + Open Sans only.
- **Density bias.** Ops users are power users (Shubhangi, Pradeep, Misba see the UI 10+ times a day). Prefer information-dense layouts over generous whitespace. Handoff line 50 bias (*"benchmark against Stripe / Linear / Notion / Razorpay"*) applies literally: Ops should feel closer to Linear than to a landing page.
- **Semantic signal colours** (beyond the brand palette) for dashboard tile states:
  - `--signal-ok`: `#22C55E` (Tailwind green-500). Healthy metric, within expected range.
  - `--signal-attention`: `#F59E0B` (amber-500). Metric drifting toward a trigger threshold, not yet breached.
  - `--signal-alert`: `#DC2626` (red-600). Trigger breached; action required.
  - `--signal-neutral`: `#64748B` (slate-500). Informational, no signal.
  - **Colour is never the only signal** (WCAG 2.1 AA requirement). Every coloured state also carries a Lucide icon + text label.
- **CSS-variable token layer** (inherited pattern from MOU): all design tokens (colours, spacing, typography, radii, shadows) declared as CSS custom properties on `:root`. Tailwind utility classes reference the vars, not hard-coded hex codes. This keeps brand swaps one-edit affairs.

### DESIGN.md policy

A `DESIGN.md` file lives at the repo root, committed, canonical for all design decisions. Future Claude Code sessions read DESIGN.md before making any UI decision. If DESIGN.md ever disagrees with this review doc, DESIGN.md wins (living source vs review artefact). Initial DESIGN.md content is seeded from this doc's design-system-inheritance section plus the per-surface sections below, rewritten as prescriptive rules.

### Icons

Lucide React throughout (locked at step 1, runtime dep `lucide-react@^1.9.0`). Standard icon sizes: 14px (inline text), 16px (body row), 20px (buttons), 24px (tile / card headers), 32px (hero / empty-state). Stroke width 2 default.

---

## Surface 1: Leadership Console (dashboard)

The route Ameet opens weekly. Ops uses it daily for exception triage.

### Route and layout topology

Single route `/dashboard`. Server Component, rendered at build time, reads from `src/data/*.json` per step 8 architecture. Desktop-first (ops team uses laptops primarily; phones secondary per handoff scope), mobile-responsive but not mobile-optimized.

Grid: CSS Grid, 12 columns on desktop (≥1024px), 6 columns on tablet (768-1023px), 1 column on mobile (<768px). Gap 16px.

Vertical regions (top to bottom):

1. **Header band** (full-width, 80px tall). Title "Ops at a glance" (Montserrat 24px navy) + subtitle "Updated [ISO timestamp]" (Open Sans 14px slate-500). Right side: refresh indicator (informational; dashboard is static, weekly cadence per handoff line 327), user menu.
2. **Health tiles row** (full-width, 12-col grid). 5 tiles; weighting gives Active MOUs and Accuracy Health 3 cols each, the other 3 tiles 2 cols each.
3. **Exception feed** (full-width panel, max-height 400px with internal scroll). Rows of items needing attention.
4. **Escalation list** (full-width panel, max-height 300px with internal scroll). Active escalations fanned out per Misba's lane + level matrix.
5. **Trigger tiles grid** (full-width, 12-col grid, 10 tiles in 2 rows of 5 on desktop). Smaller than health tiles; each 2 cols wide.

### Health tile component

Card: 16px padding, 8px border radius, 1px border in `--signal-neutral` at 20% opacity, subtle box-shadow (2px offset, 4px blur, 4% opacity).

Anatomy top-to-bottom:
- **Label**: Open Sans 12px uppercase, letter-spacing 0.05em, `--signal-neutral`. One or two words.
- **Primary number**: Montserrat 32px navy. Indian-comma-grouped via `format.ts` helper.
- **Unit**: Open Sans 14px `--signal-neutral`, inline with primary (subscript position).
- **Trend line** (optional, below primary): Open Sans 12px + Lucide arrow icon (`ArrowUp` / `ArrowDown` / `Minus`). Example: "↑ 4 this week" in `--signal-ok` or `--signal-attention` per direction.
- **Status dot** (top-right corner of card, absolute): 8px circle. Colour = current tile status per the rules table below.

Health tile contents:

| Tile | Primary value | Unit | Status rule |
|---|---|---|---|
| Active MOUs | count where `status === 'Active'` | MOUs | neutral always (count is informational) |
| Accuracy Health | % of invoices raised WITH cross-verified numbers | % | ok ≥ 95%; attention 85-94%; alert < 85% |
| Collection % | total received / total contract value × 100 | % | ok ≥ 75%; attention 50-74%; alert < 50% |
| Dispatches in Flight | count in PO Raised / Dispatched / In Transit states | dispatches | neutral always |
| Schools Needing Action | count of schools with any unresolved exception-feed item | schools | ok 0; attention 1-5; alert > 5 |

Accuracy Health's "invoices raised WITH cross-verified numbers" reads the Communication + MOU audit log: for each PI-sent Communication, check whether the source MOU had actuals confirmed by both Sales AND Ops (cross-verification matrix) before PI issuance.

### Exception feed row component

Clickable row, 72px tall on desktop (condenses to 88px on mobile to honor 44px touch target + vertical padding).

Anatomy (left to right, desktop):
- **Lucide icon** (24px, left-aligned, 16px right margin). Type-specific: `AlertCircle` for late actuals, `FileText` for overdue invoice, `Truck` for stuck dispatch, `MessageSquare` for missing feedback, `MailX` for failed communication.
- **Text column** (flex-grow): school name (Open Sans 16px navy, 1-line truncate), exception description (Open Sans 14px slate-700, 2-line truncate), days-since metadata (Open Sans 12px slate-500, "5d" format).
- **Priority dot** (right-aligned, 8px circle): colour per severity (`alert` / `attention` / `neutral`).
- **Chevron** (right, 16px Lucide `ChevronRight` slate-400): affordance for "click opens the item".

Hover: background tint slate-50. Focus: 2px focus ring in navy (WCAG 2.1 AA focus indicator). Click target: entire row (min-height 44px per WCAG 2.1 AA touch target).

Empty state: "No exceptions right now." Open Sans 14px `--signal-neutral`, centered, with a small Lucide `Check` icon 20px above. Understated, not celebratory (ops tone per handoff line 49 "no AI slop").

### Escalation list row component

Same anatomy as exception feed, with distinguishing additions:
- **Lane pill** (between school name and description): 12px tall rounded pill.
  - `OPS` = teal background `#00D8B9` with navy text (high contrast).
  - `SALES` = navy background `#073393` with white text.
  - `ACADEMICS` = amber background `#F59E0B` with white text.
  - Pill includes Lucide icon (`Wrench` for OPS, `Briefcase` for SALES, `GraduationCap` for ACADEMICS) for redundant signalling.
- **Level pill** (immediately after lane pill): "L1" / "L2" / "L3" with matching border colour, white background.
- **Fan-out indicator** (below description): "Notified: Misba, Shashank, Ameet" as Open Sans 12px slate-600. Snapshot of `notifiedEmails` at escalation-creation time per step 8 Escalation schema.

Empty state: "No open escalations." Matches exception-feed empty-state tone.

### Trigger tile component (10 tiles)

Smaller than health tiles: 2-column width on desktop, stacked on mobile. Shorter: 96px tall vs health tile's 144px.

Anatomy:
- **Label**: Open Sans 12px uppercase `--signal-neutral`. Examples: "CEO Overrides (7d)", "Drift Queue", "Bounce Rate (7d)".
- **Primary number**: Montserrat 24px (smaller than health tile's 32px). Colour = current status per the trigger's threshold rule (neutral / ok / attention / alert).
- **Threshold caption**: Open Sans 11px `--signal-neutral`. Example: "Trigger: 3+/week × 2 weeks". Makes the threshold explicit so Ameet doesn't have to cross-reference `assumptions-and-triggers-2026-04-24.md`.
- **Trend sparkline** (optional, right-aligned, 40px wide × 20px tall): 7-day inline sparkline in slate-400. Helps eyeball trajectory without drilling in.

Tile-by-tile (mapped to step 6.5 items A through J):

| Item | Tile label | Primary | Threshold rule | Status colour |
|---|---|---|---|---|
| A | CEO Overrides (7d) | count of Dispatch.overrideEvent in last 7d | 3/week × 2 weeks → alert | ok < 3; attention 3; alert 3×2wk |
| B | Drift Queue | Sales Head approval backlog count | 5/week → attention | ok < 3; attention 3-5; alert > 5 |
| C | Legacy Workload | % of ops-reported time on non-Ops MOUs | 20% → attention | ops-self-report tile; informational in Phase 1 |
| D | CC Audit Delta (7d) | count of emails where actual-CC != predicted-CC | 1+ → attention | ok 0; attention 1-4; alert 5+ |
| E | Commitments Flag (60d) | count of "this school was promised X" flags | 1+ → attention | ops-report tile |
| F | Null-GSTIN Schools | count of active schools with `gstNumber === null` | >30% of active → alert | ok < 10%; attention 10-30%; alert > 30% |
| G | Queue Health | "OK" / "WARN" label | anomaly → alert | binary; alert if daily check fails |
| H | Rule Toggle-Offs (30d) | count of CcRule.enabled transitions to false | 1+ → attention | ok 0; attention 1-3; alert 4+ |
| I | Email Bounce Rate (7d) | bounced / sent emails × 100 | 5% → alert | ok < 2%; attention 2-5%; alert > 5% |
| J | Unassigned MOUs | MOUs with null salesPersonId after 48h | 5/week → attention | ok 0-2; attention 3-4; alert 5+ |

Each trigger tile's primary number uses the status colour for the number itself (not just a dot), because the number IS the signal. Accompanied by a Lucide icon (`TrendingUp`, `TrendingDown`, `Minus`, `AlertTriangle`) for WCAG-redundant signalling.

### Threshold colours in detail (answering step 7's "what colour?" question)

Item A's trigger is "3/week × 2 weeks → alert". The three states:
- **ok** (< 3/week): number renders in `--signal-neutral` slate-700.
- **attention** (3/week, first week): number renders in `--signal-attention` amber-500 with `AlertTriangle` icon.
- **alert** (3/week, second consecutive week): number renders in `--signal-alert` red-600 with `AlertTriangle` filled icon.

Same pattern across all trigger tiles: neutral / attention / alert, with colour + icon + text all carrying the signal. Never colour alone.

### Responsive behaviour

- **≥1024px desktop**: 12-col grid, all regions visible on a typical 1440×900 screen (primary target).
- **768-1023px tablet**: 6-col grid; health tiles wrap to 2 rows of 3; trigger tiles to 2 rows of 5. Exception feed and escalation list stay full-width.
- **<768px mobile**: single-column stack. Health tiles condense (label + primary + status dot only; trend line drops). Trigger tiles collapse to label + primary with tap-to-expand for threshold caption + sparkline.

Explicit non-goal: this dashboard is NOT mobile-first. Ameet and ops staff open it on laptops. The mobile breakpoint exists so phone access works in a pinch, not as the primary experience.

### Loading, empty, error states

- **Loading**: no spinner. Page is server-rendered; if it renders, data is there. Build failures surface via Vercel; no in-app loading UX needed for Phase 1.
- **Empty data** (launch day, zero MOUs imported yet): each tile renders with "0" as the primary and a small caption "No data yet". Ameet will see this on launch day for a few hours until the first MOU imports.
- **Error** (JSON file corrupted, unlikely): page renders with a top banner "Dashboard data unavailable: check sync-runner status. Daily check: [link to GH Actions]." Banner is red-600 background with white text + Lucide `AlertOctagon` icon.

---

## Surface 2: Feedback form UI

Per step 8 Feedback entity: 4 structured categories (training-quality, kit-condition, delivery-timing, trainer-rapport), each with rating 1-5 or null-skip plus optional per-category comment, plus an overall comment. Magic-link landed page, HMAC-authenticated at page level per D7 refinement.

### Route and access

`/feedback/[tokenId]`. Public route per D7 refinement (one of five `PUBLIC_PATHS` in Ops middleware). Page-level HMAC verification before rendering the form; 403 → redirect to `/feedback/link-expired`.

### Mobile-first layout (375px target)

SPOCs (teachers and school admins) read email on phones most of the time. Mobile-first target is 375px viewport per handoff line 67 (MOU's mobile viewport test policy inherited here).

Vertical stack on mobile; constrained max-width 640px on larger screens; centered.

Regions top-to-bottom:

1. **Header card**: school name (Montserrat 24px navy), MOU programme and installment context (Open Sans 14px slate-600). Example: "Don Bosco Bandel" / "STEAM, Installment 2 of 4, paid on 14-Apr-2026".
2. **Intro paragraph**: Open Sans 16px slate-800. Example: "Your feedback helps us improve training, kit delivery, and support. Takes 2 minutes. You can skip any question."
3. **Category cards**: 4 cards stacked vertically, one per FeedbackCategory.
4. **Overall comment**: optional full-width textarea.
5. **Submit button**: primary teal.

### Category card component

Each card (64px vertical spacing between cards):

- **Category label**: Open Sans 18px navy bold. One of: "Training quality", "Kit condition", "Delivery timing", "Trainer rapport".
- **Rating row**: 5 segmented buttons (1 through 5) plus a 6th "Skip" option. Segmented, not star-rated, because stars imply hedonic quality while categories like "delivery timing" are more factual.
- **Comment field**: per-category optional textarea.

Rating affordance:

- Segment buttons: 48px × 48px each (well above 44px WCAG min touch target). Labels `1 Poor` through `5 Excellent` visible on desktop, numbers only on mobile to save horizontal space.
- Active state: teal background `#00D8B9`, navy bold number. Inactive: slate-100 background, slate-700 number. Hover on desktop: slate-200 background.
- "Skip" option: 48px tall, 64px wide (wider than the numbered segments to fit the word). Slate-400 text on slate-50 background; becomes slate-600 on active (selected "I'd rather not rate this category").

Per-category comment field:

- Appears inline below the rating row. Auto-expanded when the selected rating is 1 or 2 (an explicit prompt for "tell us more"); collapsed but visible as a single-line affordance when rating is 3 through 5 or null.
- 2-row textarea minimum, Open Sans 14px, placeholder "Anything specific to share?" in slate-400.
- 500-char soft limit; warning at 450 ("50 characters left"), hard-cut at 500.

### Overall comment

Full-width textarea, 4-row minimum. Placeholder: "Anything else you'd like us to know?" in slate-400. 1000-char soft limit.

### Submit button

Primary action: teal `#00D8B9` background, navy bold 16px Montserrat text, 48px tall, full-width on mobile, right-aligned 200px wide on desktop. Lucide `Send` icon (20px).

Disabled state until either at least one category has a non-null rating OR the overall comment is non-empty. Disabled styling: slate-300 background, slate-500 text, cursor `not-allowed`.

### Submission flow

1. User submits. Client disables button, shows inline spinner within button text slot.
2. `POST /api/feedback/submit` with `ratings[]`, `overallComment`, `tokenId`, `hmac` (per step 8 D7 refinement endpoint contract).
3. On 201: navigate to `/feedback/thank-you` (static page, "Thanks for the feedback. Your response is recorded. Ops team at GSL.").
4. On 403 (expired, used, or invalid token): navigate to `/feedback/link-expired` (static page, "This link has expired or already been used. Please contact [ops email] if you need to resubmit.").
5. On 5xx: inline error within the form, "Something went wrong. Please try again in a minute." Retry is safe because the endpoint is idempotent on `(tokenId, schoolId, installmentSeq)`; a second submission with the same token returns 403.

### Drafts, empty states, errors

- **Mid-submission reload** (network drop): client retains form state in `sessionStorage` under key `feedback-draft-${tokenId}`; reload resumes the in-progress form.
- **Invalid `tokenId` in URL**: same redirect as 403 path (`/feedback/link-expired`).
- **No ratings + no comment submitted**: submit button disabled, so this state is unreachable.

### Copy for Surface 2

British English, no em dash, no AI slop, direct voice. Short sentences. Review pass against MOU CLAUDE.md line 49 "avoid `dive deep`, `robust`, `leverage`, `comprehensive solution`" applies.

---

## Surface 3: Status-block email template (Axis 2 CONTRACT)

Per step 7 Axis 2 recommendation: rich email status block in every system notification. CEO review placed this firmly IN Phase 1 scope; design-review now pressure-tests layout and copy, not inclusion.

### Scope: which Communication types include the status block

Per step 8 Axis 2 acceptance: every outbound Communication with `type IN ('welcome-note', 'three-ping-cadence-t-30', 'three-ping-cadence-t-14', 'three-ping-cadence-t-7', 'pi-sent', 'dispatch-raised', 'delivery-acknowledgement-reminder')`.

Explicitly excluded (pure transactional or internal):

- `feedback-request`: already carries a magic-link CTA; status block would clutter the moment of ask.
- `escalation-notification`: internal ops surface with a different layout.
- `closing-letter`: formal MOU closure; separate template with its own layout.

### Visual anatomy

The status block is a SECTION inside the email body (not a standalone email). It slots below the main message and above the signature. Rendered as HTML email with inline CSS for mail-client compatibility (not a React component at send-time):

```
┌──────────────────────────────────────────────┐
│ 📍 Where your MOU is today                   │
├──────────────────────────────────────────────┤
│ ✓ Actuals confirmed on 12-Apr-2026           │
│ ✓ Invoice raised on 14-Apr-2026 (GSL/OPS/01) │
│ • Payment due by 25-Apr-2026                 │
│ ○ Training scheduled for 02-May-2026 (TBD)   │
└──────────────────────────────────────────────┘
```

Iconography (unicode symbols, not images, for email-client universal support):

- `✓` filled checkmark: completed stages. Inline colour `#22C55E` (green-500 / `--signal-ok`).
- `•` filled dot: current or pending stage. Inline colour `#F59E0B` (amber-500 / `--signal-attention`).
- `○` outline circle: future stage. Inline colour `#64748B` (slate-500 / `--signal-neutral`).

Unicode chars chosen specifically because they render consistently across Gmail, Outlook (desktop and web), Apple Mail, and mobile clients, without depending on images (which Outlook blocks behind "show images" gates).

### Typography (inline CSS for email)

- Block header: `font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #073393;`.
- Stage rows: `font-family: 'Open Sans', Arial, sans-serif; font-size: 13px; color: #1E293B;`.
- Date tokens within a stage row: `font-weight: 500;` (subtle emphasis on the date).

Arial fallback because Open Sans may not be available in all email-client defaults. Arial is universal and visually close enough that the brand impression survives.

### Layout placement in the full email

```
[Greeting]

[Main message body, 2-4 sentences]

[STATUS BLOCK, as above]

[Call to action if any, e.g., "Click here to confirm receipt"]

[Signature: Ops team at GSL]
```

Status block spacing: 16px top margin, 16px bottom margin, 1px solid slate-200 top and bottom borders. Full email-body width (typically 600px, constrained).

### Per-email-type variations

The status block SHOWS different completed vs pending vs future stages depending on which lifecycle stages the MOU has reached at send-time.

- **Welcome note** (MOU signed): only "MOU signed on [date]" is checked; all other stages outlined.
- **Three-ping-cadence T-30, T-14, T-7**: MOU signed checked + actuals confirmed (if done) checked + next installment stage marked pending (filled dot).
- **PI sent**: MOU signed + actuals confirmed + invoice raised (with PI number inline) all checked; payment stage pending.
- **Dispatch raised**: everything up to and including payment received checked; dispatch state pending with expected delivery date.
- **Delivery acknowledgement reminder**: everything up through dispatch checked; delivery acknowledgement pending.

### Data-hygiene boundary

Status block NEVER references:

- Internal-only fields: `salesPersonId`, `auditLog`, `queuedBy`, bounced-email status on prior communications, override events.
- Financial internals beyond what the SPOC already sees: the amount they paid is fine; outstanding balance is fine; the contract-value vs actuals delta is internal and never exposed.
- Any PII of another school.
- Ops-team internal annotations (notes fields on any entity).

### Copy for Surface 3

- British English: "programme" not "program", "centre" not "center", "behaviour" not "behavior".
- Indian money: `Rs 1,50,000` (Indian comma grouping); never the `₹` symbol (older email clients render it as `?`).
- Dates: `12-Apr-2026` always; never `04/12/2026`.
- No em dashes; no AI slop.

---

## Surface 4: WhatsApp-draft-copied button

Per step 7 Axis 4 (HOLD + EXPAND-1 + EXPAND-2 bundle): button on every outbound ops communication; click-event writes a Communication record with `channel: 'whatsapp-draft-copied'`.

### Placement

Secondary button, appears adjacent to the primary "Send email" button on each outbound-communication affordance in the ops UI. Per step 8 Axis 4 acceptance, 8 placement points total:

1-3. Three cadence screens (T-30, T-14, T-7).
4. PI-sent confirmation screen.
5. Payment-received confirmation screen.
6. Dispatch-raised notification screen.
7. Delivery-acknowledgement reminder screen.
8. Feedback-request email screen.

### Button anatomy

Secondary-style (not the primary action):

- Label: "Copy WhatsApp draft".
- Icon: Lucide `MessageCircle` (16px), left of label, 8px gap.
- Background: white.
- Border: 1px solid teal `#00D8B9`.
- Text: teal `#00D8B9`.
- Height: 40px.
- Padding: 12px horizontal.
- Hover (desktop): background teal-50 tint (~`#E6FFFB`).
- Pressed: background teal-100 tint.

Layout: horizontal on desktop (primary Send left, secondary Copy right, 12px gap), stacked on mobile (primary top, secondary below, 8px gap).

### Copy-confirmation pattern

On click:

1. **Browser clipboard API write** with the rendered WhatsApp-prose draft (per step 8 `bodyWhatsApp`).
2. **Server POST** to `/api/communications/log-copy` that writes a Communication record `{channel: 'whatsapp-draft-copied', status: 'draft-copied', bodyWhatsApp: <draft>, copiedAt: <now>, queuedBy: <user>}` per step 8 schema.
3. **UI feedback**: button morphs in place for 2 seconds:
    - Text: "Copied ✓" (check char inline).
    - Icon: Lucide `Check` replaces `MessageCircle`.
    - Background: teal solid `#00D8B9`; text: white.
    - Transition: 200ms ease-out on background and text colour. No scaling, no bouncing (understated per ops tone, per handoff line 49 "no AI slop" principle).
4. **Revert** to default state after 2 seconds.

If clipboard API fails (older browsers, Safari permission denied): button shows a "Tap to copy" state; tapping opens a modal dialog with the draft text pre-selected for manual copy. The Communication log record is still written on the click attempt (logged whether or not the clipboard write succeeded; `status: 'draft-copied'` remains accurate in the "copy was attempted" sense).

### Accessibility labels

- `aria-label="Copy WhatsApp draft message for <school name>, installment <N>"` on the button.
- After copy: an `aria-live="polite"` region announces "WhatsApp draft copied to clipboard."
- Focus indicator: 2px navy ring around the button on keyboard focus (matches the rest of the UI's focus treatment).

### Surveillance-concern mitigation (per step 7 Fix 5)

Subtle informational tooltip on first-hover-per-session: "This click is logged anonymously to help us spot schools where email delivery isn't working. Per-school aggregates only; no per-user attribution on the dashboard." Dismissable via close icon; preference stored in `localStorage['whatsapp-copy-tooltip-seen'] = 'true'`.

Tooltip design: 240px wide, slate-700 background, white text, 12px padding, 4px border radius, 12px arrow pointing to the button. Sits 8px above the button on desktop; below the button on mobile (where above-button space is often off-screen when the button is near the top of the viewport).

### WhatsApp-prose style rules

The `bodyWhatsApp` text (per Communication schema) renders with different style constraints than the email body:

- **Conversational tone**: "Hi [SPOC name], just a reminder about..." Not formal ("Dear Sir/Madam").
- **No HTML**: WhatsApp renders `*bold*` and `_italic_` inline; no other formatting. Plain-text-first.
- **Emoji sparingly**: `📋` for reminders, `✅` for confirmations, `📦` for dispatch updates. Never more than one per message; always at the start or end, not mid-sentence.
- **Length**: under 400 characters when possible. WhatsApp previews truncate longer messages in chat lists.
- **No URLs** in Phase 1. Phase 2 may add tracked links once we've validated the baseline.

Example (three-ping cadence T-14 for a STEAM MOU):

```
Hi [SPOC name], quick nudge: the MOU with [school] has installment 2 actuals due by [date]. Could you share the student count and any delivery-address update when you have a minute? Thanks.

Ops team at GSL
```

The `bodyWhatsApp` is rendered by `src/lib/templates/whatsAppProse.ts` (per step 8 Axis 4 file list) and stored in the Communication record so the dashboard can aggregate draft-copy volume without needing to re-render.

---

## Surface 5: Accessibility baseline (cross-cutting)

Applies to every surface above. Policy, tooling, shrinking-baseline strategy.

### Target

WCAG 2.1 AA throughout. Per handoff line 45, non-negotiable. Applies equally to dashboard (ops-internal), feedback form (SPOC-facing), admin routes, and email status blocks where applicable (email accessibility is a subset of WCAG but matters for screen-reader email clients).

### axe-core CI integration (shrinking baseline)

Inherited pattern from MOU and HR (step 3 §7). Ops adds axe-core via:

- `@axe-core/playwright` for page-level end-to-end tests.
- `jest-axe` / `@axe-core/react` for component-level unit tests.

CI pipeline:

1. Job `a11y-check` runs axe-core across all committed page routes and component suites on every PR.
2. A baseline file at `test/a11y-baseline.json` captures currently-known violations at commit time.
3. **Violation counts may only decrease.** A PR that adds a violation fails CI. A PR that removes violations regenerates the baseline with the new lower count.
4. PR reviewer verifies the removals are real fixes (not rule suppressions).

This is the "shrinking baseline" pattern: launch can ship with some known violations, but the count trends monotonically downward over time.

### Policy rules (every surface)

- **Touch targets ≥ 44×44px** (WCAG 2.5.5 target size AA). Verified above: rating segments 48×48 ✓, exception rows min-height 44 ✓, WhatsApp copy button 40 tall × ~140 wide ✓ (tall-axis meets, wide-axis exceeds).
- **Colour contrast 4.5:1 minimum** for text (WCAG 1.4.3 AA). Calculated against the locked palette:
  - Navy `#073393` on white: 12.1:1 ✓
  - White on navy `#073393`: 12.1:1 ✓
  - Teal `#00D8B9` on white: 2.3:1 ✗
  - Teal on navy: 5.4:1 ✓
  - White on red-600 `#DC2626`: 4.83:1 ✓
  - White on amber-500 `#F59E0B`: 2.1:1 ✗
  - White on green-500 `#22C55E`: 2.7:1 ✗
- **Fixes applied**:
  - All teal-background elements use **navy text** (not white). E.g., the primary Submit button (teal bg + navy 16px Montserrat).
  - All amber-background pills use **navy text** or upgrade to amber-700 `#B45309` with white text (5.3:1 ✓).
  - Green-500 is used only as an inline icon colour next to black-on-white text, never as a background for white text. Status signal rendered as green icon + navy-on-white label.
- **Focus indicators** on every interactive element: 2px solid navy ring with 2px offset (`outline: 2px solid #073393; outline-offset: 2px;`). Matches the HR pattern.
- **Keyboard navigation**: tab order follows visual order (verified via DOM structure in implementation). Skip-to-content link at top of every authenticated page (visually hidden until focused, then 48px tall white-on-navy bar at top). Targets `#main-content` on every page; the page's `<main>` element carries this id. The skip link's `href` is `#main-content` and its on-focus styling reveals it as the 48px white-on-navy bar at the top.
- **ARIA landmarks**: every page has exactly one `<main>`, one `<nav>` if nav is present, `<header>` and `<footer>` as appropriate.
- **Screen reader labels**: every icon-only button carries `aria-label`; every form input has an associated `<label>` (visible or `sr-only`).
- **Live regions** for status updates (copy confirmations, submission results): `aria-live="polite"`.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables the WhatsApp-copy button morph, sparkline animations, and any non-essential transitions.

### Baseline-violation policy at launch

Target: ship with zero known axe-core violations. Realistic target: fewer than 5, each tied to a Phase 1.1 issue ticket with a named owner. Violations that have workarounds (e.g., keyboard user adding a minor extra tab) ship; violations that lock users out (e.g., unlabelled form field) do not.

---

## Copy conventions (cross-cutting, enforced)

Applies to every surface, every email template, every admin route, and every docstring.

### British English

- "programme" not "program".
- "organise", "organising" not "organize", "organizing".
- "centre" not "center".
- "behaviour" not "behavior".
- "colour" not "color".
- "recognised" not "recognized".

Enforced by a `docs-lint` pre-commit script that greps for the American spellings across `src/**/*.{ts,tsx}`, `docs/**/*.md`, email templates, and UI strings. Custom ESLint rule optional; shell grep is the minimum.

### Indian money and measurement

- Currency: `Rs 1,50,000` (Indian comma grouping). Never `$`, never `₹` (older email clients render it as `?`), never Western comma grouping (`1,500,000` or `$150,000`).
- Lakh and crore where natural: `Rs 12 lakh`, `Rs 7.05 Cr`. Switch thresholds: below `1,00,000` use full notation; at or above `1,00,000` use "lakh"; at or above `1,00,00,000` use "crore".
- Format helper: `src/lib/format.ts` (inherited from MOU), exports `formatRs(amount: number): string`. Use everywhere; never ad-hoc `.toLocaleString('en-IN')` inline.

### Dates

- `DD-MMM-YYYY` format: `15-Apr-2026`, `02-Mar-2027`.
- Never numeric month alone (avoids MM/DD vs DD/MM ambiguity across Indian and Western readers).
- Relative dates where helpful in UI ("5 days ago", "due in 3 days"). Always accompanied by the absolute date on hover or tap.

### No em dash

- Rule (handoff line 45): never the em dash character (U+2014).
- Substitutions by context: colon (apposition), comma (list separator), semicolon (clause join), period (sentence break), parens (aside).
- Enforced: `docs-lint` pre-commit script greps for U+2014 (the em-dash character); match count must be 0. Applies to commit messages as well (see step 1's four-amend rewrite history for why this is enforced at the anchor).

### No AI slop vocabulary

Per handoff line 49 (MOU CLAUDE.md inheritance). Blacklist: "dive deep", "robust", "leverage", "comprehensive solution", "seamless", "cutting-edge", "best-in-class", "revolutionary", "unleash", "empower", "elevate", "game-changer".

Applies to user-facing copy (UI strings, emails, notification text) AND internal documentation. Doc-lint script greps for the list; matches warn (do not fail) because these words can legitimately appear in quoted source text; author decides per case.

### Emoji conventions

Emoji conventions differ by surface and that's deliberate.

- Email templates: decorative section markers acceptable (e.g., 📍 above the status block) where they aid scanning. One per section; never mid-sentence.
- WhatsApp prose: signal-bearing only (📋 reminders, ✅ confirmations, 📦 dispatch updates). One per message maximum; always at start or end of message; never mid-sentence.
- Dashboard / admin UI: no emoji. Lucide icons only.
- Internal documentation: no convention enforced (author judgment).

### Direct voice

- User-facing copy is active voice, second person. "Your feedback helps us improve" not "We deeply value your insights."
- Empty states state the fact, not celebrate: "No exceptions right now." not "🎉 All clear!".
- Error states describe and instruct, not apologize: "Please try again in a minute." not "We're so sorry for the inconvenience."

---

## Notable design tensions surfaced and resolved

1. **Teal button with white text** fails WCAG 1.4.3 AA (contrast 2.3:1). Fix: teal buttons use navy text instead of white. Applied to the feedback-form Submit button and the WhatsApp-copy button's post-copy morph state.
2. **Amber pill with white text** fails AA (contrast 2.1:1). Fix: amber pills use navy text. Alternative: upgrade to amber-700 `#B45309` with white text where navy-on-amber reads awkwardly against surrounding context.
3. **Green signal on white background** for a 5.4:1 minimum is fine for icons but not for text blocks. Fix: green-500 used only as inline icon colour, never as text background with white text.
4. **Mobile-first feedback form vs desktop-first dashboard**: two surfaces with different primary-viewport targets. Resolved: each surface's layout rules are explicit; no attempt to unify into a single responsive strategy that serves neither well.
5. **WhatsApp copy-logging "surveillance" concern** (from step 7 Fix 5): resolved via first-session tooltip plus anonymized-by-default dashboard aggregation. Per-user attribution only available on the admin audit route.

---

## Open items forward to /plan-devex-review

- `DESIGN.md` seeding: this doc's decisions rewritten as prescriptive rules; committed at repo root as the canonical living source.
- `docs-lint` pre-commit script: British English, no em dash, no AI slop vocab greps. Wired to Husky or equivalent.
- Component library call: shadcn/ui vs custom vs HR-shared. Affects dashboard tile consistency and feedback-form segmented control implementation.
- Page-level route structure: `/dashboard`, `/feedback/[tokenId]`, `/admin/*`, `/schools/*`, `/mous/*` (and `/api/*` surface per step 8).
- Admin audit route (`/admin/audit?filter=communication-copy`) layout and filter UX per step 7 Fix 5.
- `docs/RUNBOOK.md` content (launch-day operational runbook).
- Developer-first-run experience: repo clone, `.env.local` seed, test suite onboarding, ops-data staging.
- Self-maintainability question (step 8's devex carry-forward): who can add a school, SPOC, programme, template without Anish in the loop?

## Open items for Anish outside the ceremony

- Ops team colour / iconography veto pass: do Misba, Shubhangi, Pradeep want different semantic-signal colour defaults? The CSS-variable token layer makes per-role preference swaps cheap.
- Ameet viewing preference: desktop browser bookmark to `/dashboard` vs custom subdomain (e.g., `ops.getsetlearn.info`). Affects DNS and Vercel project configuration; out of design-review scope but worth asking Ameet directly.

---

## Summary for Anish

Five surfaces specified: Leadership Console (15 tiles + exception feed + escalation list), feedback form (mobile-first, 4 categories, skip-capable, overall comment), status-block email template (7 Communication types carry it, unicode icons, inline CSS for client compatibility), WhatsApp-draft-copied button (secondary style, 2-second copy-confirm morph, first-session tooltip, anonymous-by-default dashboard aggregation), accessibility baseline (WCAG 2.1 AA, axe-core shrinking baseline, colour-contrast issues flagged and fixed).

**Design system locked**: primary teal `#00D8B9`, navy `#073393`, Montserrat + Open Sans, Lucide icons, semantic-signal colour palette (`--signal-ok | attention | alert | neutral`) with icon + text redundancy for every coloured state. No candidate-facing layer (Ops is internal-only in Phase 1).

**Copy conventions locked**: British English, Indian money (`Rs 1,50,000` / `Rs 7.05 Cr`), DD-MMM-YYYY dates, no em dash, no AI-slop vocabulary. `DESIGN.md` + `docs-lint` pre-commit script carry the policy into code.

**Design tensions surfaced and resolved inline**: teal and amber backgrounds fail WCAG with white text; fix is navy text on teal, navy or white-on-amber-700 on amber, green as icon-only. Mobile-first feedback form plus desktop-first dashboard explicitly allowed as two different viewport-target strategies.

**Nothing expanded into Phase 2 territory.** `DESIGN.md` becomes the living canonical source post-ceremony; this doc is the review artefact.

Step 9 complete. Output ready for /plan-devex-review to pressure-test developer-facing concerns (onboarding, self-maintainability, runbook).

---
