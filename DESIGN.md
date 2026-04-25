# DESIGN.md

Prescriptive design rules for GSL Ops Automation. Read this before opening any UI file.

Rationale, push-back, and ceremony history live in `plans/anish-ops-design-review-2026-04-24.md`. This doc is the rules-only reference card. If a rule contradicts the review artefact, this doc wins (living source vs review snapshot).

---

## How to use this doc

CC reads this file at the start of any UI-touching task. Skip when editing pure backend code with no user-facing strings.

For "why" questions: `plans/anish-ops-design-review-2026-04-24.md`. For entity / endpoint / test: `plans/anish-ops-eng-review-2026-04-24.md`. For project conventions: `CLAUDE.md`.

---

## Design tokens

CSS custom properties on `:root` in `src/app/globals.css`. Tailwind classes reference these; component code never uses raw hex values.

### Brand palette

| Token | Hex | Use |
|---|---|---|
| `--brand-teal` | `#00D8B9` | Primary action buttons, completed-stage indicators |
| `--brand-navy` | `#073393` | Headings, strong emphasis, focus rings, text on teal |

### Semantic signal palette

| Token | Hex | Use |
|---|---|---|
| `--signal-ok` | `#22C55E` | Healthy metric (icon-only on white; never as text background) |
| `--signal-attention` | `#F59E0B` | Drifting toward threshold (use amber-700 `#B45309` if white text needed) |
| `--signal-alert` | `#DC2626` | Trigger breached, action required |
| `--signal-neutral` | `#64748B` | Informational, no signal |

### Greyscale

Tailwind slate: `slate-50` through `slate-900`. Use `slate-100` for hover backgrounds, `slate-200` for borders, `slate-400` for placeholder text, `slate-500` for unit labels, `slate-700` for body de-emphasis.

### Colour rules

- Colour is never the only signal. Every coloured state carries a Lucide icon AND a text label.
- Teal background: navy text. White-on-teal is forbidden (fails 4.5:1).
- Amber background: navy text, OR upgrade to amber-700 with white text.
- Green-500: icon-only on white. Never green background with white text.
- Red-600 background: white text (4.83:1, passes AA).
- Hex values appear nowhere in component code. Use CSS vars or Tailwind classes that map to them.

---

## Typography

Google Fonts via `next/font` (loaded in `src/app/layout.tsx`).

| Font | Family | Use |
|---|---|---|
| Heading + numeric display | Montserrat | Page titles, tile primary numbers, button labels |
| Body | Open Sans | All body copy, table cells, form labels |

Sizes (apply via Tailwind utilities):

| Use | Size | Family |
|---|---|---|
| Page title | 24px | Montserrat |
| Tile primary number (health) | 32px | Montserrat |
| Tile primary number (trigger) | 24px | Montserrat |
| Body | 14px or 16px | Open Sans |
| Tile label | 12px uppercase, 0.05em letter-spacing | Open Sans |
| Threshold caption | 11px | Open Sans |

`<html lang="en-IN">` per British-English-on-Indian-context.

---

## Icons

Lucide React (`lucide-react@^1.9.0`). Standard sizes: 14px (inline text), 16px (body row), 20px (buttons), 24px (tile/card headers), 32px (hero/empty-state). Stroke width 2.

Every icon-only button carries `aria-label`.

---

## Spacing + radii

- Card padding: 16px.
- Card border radius: 8px.
- Card border: 1px solid `--signal-neutral` at 20% opacity.
- Card shadow: 2px offset, 4px blur, 4% opacity.
- Grid gap: 16px.
- Section gap: 64px (between feedback-form category cards).
- Email status block top/bottom margin: 16px each, with 1px slate-200 borders.

---

## Surface 1: Leadership Console (dashboard)

Route: `/dashboard`. Server Component. Reads `src/data/*.json` at build time. Desktop-first; ops staff use laptops.

### Layout

12-col grid desktop (≥1024px) / 6-col tablet (768-1023px) / 1-col mobile (<768px). Vertical regions, top to bottom:

1. Header band, 80px tall: title "Ops at a glance" (Montserrat 24px navy), updated-timestamp, user menu.
2. Health tiles row: 5 tiles. Active MOUs and Accuracy Health 3 cols each; the other 3 tiles 2 cols each.
3. Exception feed panel, max-height 400px with internal scroll.
4. Escalation list panel, max-height 300px with internal scroll.
5. Trigger tiles grid: 10 tiles in 2 rows of 5 desktop; 2 cols each.

### Health tile

- Card: padding 16, radius 8, border + shadow per spacing tokens.
- Label: Open Sans 12px uppercase 0.05em letter-spacing, `--signal-neutral`.
- Primary number: Montserrat 32px navy. Indian-comma-grouped via `formatRs()` / `formatCount()` from `src/lib/format.ts`.
- Unit: Open Sans 14px `--signal-neutral`, inline subscript.
- Trend (optional): Open Sans 12px + Lucide arrow icon.
- Status dot top-right, absolute positioned, 8px circle.

Tiles: Active MOUs (neutral), Accuracy Health (% cross-verified; ok ≥95%, attention 85-94%, alert <85%), Collection % (ok ≥75%, attention 50-74%, alert <50%), Dispatches in Flight (neutral), Schools Needing Action (ok 0, attention 1-5, alert >5).

### Exception feed row

- 72px tall desktop / 88px tall mobile (44px touch target preserved).
- Lucide icon 24px left-aligned, 16px right margin.
- Text column: school name (Open Sans 16px navy 1-line truncate), description (Open Sans 14px slate-700 2-line truncate), days-since (Open Sans 12px slate-500 "5d" format).
- Priority dot 8px right-aligned (alert / attention / neutral).
- Lucide `ChevronRight` 16px slate-400.
- Hover: bg slate-50. Focus: 2px navy ring.
- Empty state: "No exceptions right now." + small `Check` icon.

### Escalation list row

Same anatomy as exception feed plus:
- Lane pill: OPS = teal bg + navy text + `Wrench`; SALES = navy bg + white text + `Briefcase`; ACADEMICS = amber-700 bg + white text + `GraduationCap`.
- Level pill: "L1" / "L2" / "L3", matching border colour, white background.
- Fan-out indicator: "Notified: <names>" Open Sans 12px slate-600 below description.

### Trigger tile

- 96px tall (smaller than health tile's 144px). 2-col width desktop.
- Label: Open Sans 12px uppercase `--signal-neutral`.
- Primary number: Montserrat 24px. Colour = current status.
- Threshold caption: Open Sans 11px `--signal-neutral`.
- Optional 7-day sparkline 40x20px slate-400.

10 trigger tiles map to step 6.5 items A through J. Each tile's status = neutral / attention / alert per the item's threshold rule. Coloured number is accompanied by a Lucide icon (`TrendingUp`, `TrendingDown`, `Minus`, `AlertTriangle`).

### Loading + error states

- No spinner. Page is server-rendered.
- Empty data (launch day): each tile renders "0" with caption "No data yet".
- Error (corrupted JSON): top banner, red-600 bg + white text + `AlertOctagon`, message "Dashboard data unavailable: check sync-runner status."

---

## Surface 2: Feedback form

Route: `/feedback/[tokenId]`. Public route per D7. Page-level HMAC verification before render; on failure, redirect to `/feedback/link-expired`.

### Mobile-first 375px

Vertical stack mobile; max-width 640px on larger screens, centered.

Regions top-to-bottom:
1. Header card: school name (Montserrat 24px navy), MOU programme + sub-type + installment context (Open Sans 14px slate-600).
2. Intro paragraph: Open Sans 16px slate-800. "Your feedback helps us improve training, kit delivery, and support. Takes 2 minutes. You can skip any question."
3. 4 category cards stacked, 64px gap.
4. Overall comment textarea, 4 rows minimum, 1000-char soft limit.
5. Submit button.

### Category card

- Label: Open Sans 18px navy bold.
- Rating row: 5 segmented buttons (1 through 5) plus 6th "Skip" segment.
- Per-category comment field below.

Segment buttons: 48x48px each. Active: teal bg + navy bold number. Inactive: slate-100 bg + slate-700 number. Hover desktop: slate-200 bg. "Skip" segment: 48x64px, slate-400 on slate-50 (becomes slate-600 on active).

Per-category comment: 2-row textarea, Open Sans 14px, placeholder "Anything specific to share?". Auto-expanded when rating is 1 or 2. 500-char soft limit, warning at 450, hard cut at 500.

Categories: training-quality, kit-condition, delivery-timing, trainer-rapport. Display labels: "Training quality", "Kit condition", "Delivery timing", "Trainer rapport".

### Submit button

Teal `--brand-teal` bg, navy bold 16px Montserrat text, 48px tall, full-width mobile / 200px right-aligned desktop. `Send` icon 20px. Disabled until at least one rating is non-null OR overall comment is non-empty.

### Submission flow

POST `/api/feedback/submit` with `ratings[]`, `overallComment`, `tokenId`, `hmac`. On 201: navigate `/feedback/thank-you`. On 403: `/feedback/link-expired`. On 5xx: inline error "Something went wrong. Please try again in a minute." Mid-flight reload restores form via `sessionStorage[feedback-draft-${tokenId}]`.

### Internal-only auto-escalation (no SPOC-visible warning)

Server-side hook on every Feedback write fires an Escalation if any rating <=2. Form does NOT display "your low rating will create an escalation". Post-submit thank-you reads identically regardless of rating.

---

## Surface 3: Status-block email template

Included in 7 Communication types: welcome-note, the 3 ping-cadence stages, pi-sent, dispatch-raised, delivery-acknowledgement-reminder. Excluded: feedback-request, escalation-notification, closing-letter. Rendered as HTML email with inline CSS (not React at send-time).

### Visual anatomy

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

Unicode iconography (universal email-client support):
- `✓` filled checkmark, inline `#22C55E` (`--signal-ok`): completed stages.
- `•` filled dot, inline `#F59E0B` (`--signal-attention`): current/pending.
- `○` outline circle, inline `#64748B` (`--signal-neutral`): future stages.

### Inline CSS

- Block header: `font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; font-weight: 600; color: #073393;`.
- Stage rows: `font-family: 'Open Sans', Arial, sans-serif; font-size: 13px; color: #1E293B;`.
- Date tokens: `font-weight: 500;`.

Arial fallback (some email clients lack Open Sans).

### Per-type variations

Stages shown vary per Communication type. Each type renders all stages up through its lifecycle moment as completed (`✓`); the next-pending stage as `•`; remaining stages as `○`.

### Data-hygiene boundary

NEVER references: `salesPersonId`, `auditLog`, `queuedBy`, bounce status, override events, contract-vs-actuals delta, PII of other schools, internal annotations.

---

## Surface 4: WhatsApp-draft-copied button

Adjacent to primary "Send email" button on every outbound-communication affordance (8 placement points: 3 cadence screens + PI-sent + payment-received + dispatch-raised + delivery-ack-reminder + feedback-request).

### Anatomy

- Label: "Copy WhatsApp draft".
- Icon: Lucide `MessageCircle` 16px, left of label, 8px gap.
- Background: white. Border: 1px solid `--brand-teal`. Text: `--brand-teal`.
- Height: 40px. Padding: 12px horizontal.
- Hover desktop: bg teal-50 tint (~`#E6FFFB`). Pressed: teal-100 tint.

Layout: horizontal desktop (Send left, Copy right, 12px gap), stacked mobile (primary top, secondary below, 8px gap).

### Copy-confirmation pattern

On click: (1) clipboard write `bodyWhatsApp`; (2) POST `/api/communications/log-copy` writes a Communication record `{channel: 'whatsapp-draft-copied', status: 'draft-copied'}`; (3) button morphs in place 2 seconds: "Copied ✓", `Check` icon, teal solid bg, white text, 200ms ease-out transition (no scaling/bouncing); (4) revert.

Clipboard API failure fallback: button shows "Tap to copy"; tap opens a modal Dialog with draft text pre-selected. Communication log record is still written on click attempt regardless of clipboard success.

### Accessibility labels

- `aria-label="Copy WhatsApp draft message for <school name>, installment <N>"`.
- `aria-live="polite"` region announces "WhatsApp draft copied to clipboard." after copy.
- Focus: 2px navy ring.

### Surveillance-mitigation tooltip (first-hover-per-session)

Text: "This click is logged anonymously to help us spot schools where email delivery isn't working. Per-school aggregates only; no per-user attribution on the dashboard."

Tooltip: 240px wide, slate-700 bg, white text, 12px padding, 4px radius, arrow pointing to button. Above button desktop, below button mobile. Dismissable. Preference stored in `localStorage['whatsapp-copy-tooltip-seen']`.

### WhatsApp-prose constraints

- Conversational tone ("Hi <SPOC>, just a reminder..."), not formal.
- No HTML. WhatsApp `*bold*` and `_italic_` only.
- Emoji sparingly: `📋` reminders, `✅` confirmations, `📦` dispatch. One per message max; start or end, never mid-sentence.
- Length: under 400 characters where possible.
- No URLs in Phase 1.

---

## Surface 5: Status portal (read-only)

Route: `/portal/status/[tokenId]`. Public route per D7 + Update 2. Page-level HMAC verification; on failure render `link-expired` UI (same pattern as feedback form).

MagicLinkToken `purpose: 'status-view'`, 30-day expiry, multi-use. Each GET updates `lastViewedAt` and increments `viewCount`.

### Mobile-first 375px

Same primary-viewport target as feedback form. Max-width 640px larger screens, centered.

Vertical regions:
1. Header card: school name (Montserrat 24px navy), programme + sub-type + installment context (Open Sans 14px slate-600).
2. Lifecycle progress visualisation: 8-stage horizontal stepper desktop ≥640px / vertical stack mobile.
3. Per-installment summary card.
4. Next expected milestone callout.
5. Footer note (live-data timestamp, ops contact link, no interactive elements).

### Lifecycle progress

8 stages: MOU signed, Actuals confirmed, Cross-verification, Invoice raised, Payment received, Kit dispatched, Delivery acknowledged, Feedback submitted.

Per-stage visual:
- Completed: filled `--brand-teal` circle, white `Check` 16px, date below (Open Sans 12px navy).
- Current: filled `--signal-attention` circle, white `Circle` 16px, "In progress" label (Open Sans 12px amber-700 `#B45309`), expected next-action date.
- Future: outline slate-300 circle no icon, "TBD" or projected date (Open Sans 12px slate-500).

Stage labels: Open Sans 14px navy bold above each circle desktop / beside on mobile.

Lifecycle stage state computed by `src/lib/portal/lifecycleProgress.ts`; same helper feeds Surface 3 email status block.

### Per-installment summary

- Total contract value: Montserrat 24px navy. `formatRs()` Indian-comma-grouped.
- Paid to date: Open Sans 16px slate-700. Inline progress bar (teal fill, slate-100 bg). Percentage right.
- Pending: Open Sans 16px navy with "due by <date>" if known.
- Per-installment grid: max 4 rows; installment number, status (Paid/Pending/Overdue), amount, date.

### Next milestone callout

- Title "What's next" Open Sans 16px navy bold.
- Action text Open Sans 14px navy.
- Date Open Sans 14px slate-700.
- `ArrowRight` icon 20px navy.

If MOU at Stage 8 (feedback submitted): "MOU is complete. Thanks for your engagement this academic year." No action prompt.

### Data-hygiene boundary

Same as Surface 3. No internal-only fields, no auto-escalation surfacing, no PII of other schools.

---

## Surface 6: Accessibility (cross-cutting)

WCAG 2.1 AA throughout. Non-negotiable.

### Policy rules

- Touch targets ≥ 44x44px (WCAG 2.5.5).
- Colour contrast ≥ 4.5:1 for normal text (WCAG 1.4.3).
- Focus indicators: `outline: 2px solid #073393; outline-offset: 2px;` on every interactive element.
- Tab order follows visual order.
- Skip-to-content link at top of every authenticated page (visually hidden until focused, then 48px tall white-on-navy bar). Targets `#main-content`. The page's `<main>` element carries `id="main-content"`; skip link's `href="#main-content"`.
- Exactly one `<main>` per page; one `<nav>` if nav present; `<header>` and `<footer>` as appropriate.
- Every icon-only button: `aria-label`. Every form input: associated `<label>` (visible or `sr-only`).
- Live regions for status updates: `aria-live="polite"`.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables button morph, sparkline animations, non-essential transitions.

### axe-core CI baseline

`@axe-core/playwright` for page-level e2e + `jest-axe` / `@axe-core/react` for component-level. CI job `a11y-check` runs on every PR. Baseline file `test/a11y-baseline.json`. Violation counts may only decrease. PR adding a violation fails CI; PR removing violations regenerates the baseline.

Launch target: 0 known violations. Ship-with-acceptable: <5, each tied to a Phase 1.1 issue ticket. Violations that lock users out (unlabelled form field, etc.) never ship.

### Computed contrast against the locked palette

| Combination | Ratio | Pass |
|---|---|---|
| Navy `#073393` on white | 12.1:1 | ✓ |
| White on navy | 12.1:1 | ✓ |
| Teal on white | 2.3:1 | ✗ (use navy text on teal bg) |
| Teal on navy | 5.4:1 | ✓ |
| White on red-600 `#DC2626` | 4.83:1 | ✓ |
| White on amber-500 | 2.1:1 | ✗ (use navy or upgrade to amber-700) |
| White on amber-700 `#B45309` | 5.3:1 | ✓ |
| White on green-500 | 2.7:1 | ✗ (icon-only on white, never as bg) |

---

## Copy conventions

Applies to every UI string, email template, admin route, and docstring. Enforced by `scripts/docs-lint.sh` pre-commit + CI.

### British English

- programme (not program)
- organise / organising (not organize / organizing)
- centre (not center)
- behaviour (not behavior)
- colour (not color)
- recognised (not recognized)

`docs-lint` greps for the American spellings. FAIL on user-facing strings; code comments excluded by heuristic.

### Indian money + measurement

- Currency: `Rs 1,50,000` (Indian comma grouping). Never `$`. Never `₹` (older email clients render as `?`). Never Western comma grouping.
- Lakh / crore where natural: `Rs 12 lakh`, `Rs 7.05 Cr`. Switch thresholds: <1,00,000 full notation; ≥1,00,000 lakh; ≥1,00,00,000 crore.
- Format helper: `formatRs(amount)` from `src/lib/format.ts`. Never inline `.toLocaleString('en-IN')`.

### Dates

- `DD-MMM-YYYY` format: `15-Apr-2026`.
- Never numeric-month-only (avoids MM/DD vs DD/MM ambiguity).
- Relative dates ("5 days ago", "due in 3 days") fine in UI when accompanied by absolute date on hover or tap.

### No em dash

- Rule: never the em dash character (U+2014).
- Substitutions by grammatical role: colon (apposition), comma (list separator), semicolon (clause join), period (sentence break), parens (aside).
- `docs-lint` greps for U+2014; match count must be 0. FAIL.

### No AI slop vocabulary

Blacklist: "dive deep", "robust", "leverage", "comprehensive solution", "seamless", "cutting-edge", "best-in-class", "revolutionary", "unleash", "empower", "elevate", "game-changer".

`docs-lint` warns (does not fail). Author decides per match.

### Direct voice

- Active voice, second person. "Your feedback helps us improve" not "We deeply value your insights."
- Empty states state the fact: "No exceptions right now." not "🎉 All clear!".
- Error states describe and instruct: "Please try again in a minute." not "We're so sorry for the inconvenience."

---

## Emoji conventions

Differ by surface. Deliberate.

- Email templates: decorative section markers acceptable (e.g., 📍 above the status block) where they aid scanning. One per section; never mid-sentence.
- WhatsApp prose: signal-bearing only (📋 reminders, ✅ confirmations, 📦 dispatch updates). One per message maximum; always at start or end of message; never mid-sentence.
- Dashboard / admin UI: no emoji. Lucide icons only.
- Internal documentation: no convention enforced (author judgment).

---

## Audit log conventions

Audit log entries record the EVENT, not the cascade. When entity B is created as a consequence of an action on entity A, A's auditLog carries the semantic action ('p2-override', 'feedback-submitted', etc.); B's auditLog uses generic 'create' with a forward-pointer in notes. Single source of truth on originating events. Queries like "how many P2 overrides occurred this week" read from A's auditLog only.

Examples:
- A `Dispatch` p2-override fires `'p2-override'` on `Dispatch.auditLog`. The paired `Escalation` record uses `'create'` with notes `"Auto-created from dispatch p2-override on <id>"`.
- A `Feedback` submission fires `'feedback-submitted'` on `Feedback.auditLog`. The auto-created `Escalation` (Update 3 hook) uses `'auto-create-from-feedback'` (a domain-specific create-action) with notes pointing back at the originating Feedback id; the originating event still lives on the Feedback, not the Escalation.

When introducing a new domain action, decide first whether the EVENT happens on the originating entity (likely yes) and avoid coining a parallel action on the consequent entity.

---

## Known data normalisations

Source-data drift between SPOC-DB rule text and current canonical fixtures is handled by small alias maps in the resolver layer, never silently. Each new alias is added on observation (not pre-emptively) and lives in the file that uses it.

- City aliases (Bengaluru ≡ Bangalore, Bombay ≡ Mumbai, Calcutta ≡ Kolkata, Madras ≡ Chennai): `src/lib/ccResolver.ts` `CITY_ALIASES`. Used by sub-region scope matching where SPOC-DB rules name legacy city forms while school records carry the official current name.
- Trainer-mode aliases (TTT ≡ TT, GSL-Trainer ≡ GSL-T): same file, `TRAINER_MODE_ALIASES`. Used by training-mode scope matching where SPOC-DB phrasing differs from the canonical `TrainerModel` enum.

When you encounter a third drift form, add the alias entry, document it here in one line, and write a regression test in the resolver's test file. Do not "fix upstream" by mutating fixtures or renaming canonical enums; the resolver layer absorbs source variance.

---

## Tooling notes

- shadcn/ui primitives in `src/components/ui/`. Ops-specific components in `src/components/ops/`.
- Format helpers in `src/lib/format.ts` (inherited from MOU). Use `formatRs()`, `formatDate()`, `formatPct()`, `formatCount()`. Never inline `toLocaleString` or manual date formatting.
- Fonts loaded via `next/font` in `src/app/layout.tsx`.

### First-party scope

`src/components/ui/` contains shadcn primitives copied from the upstream registry; conventions follow upstream and the directory is treated as vendored (similar to `node_modules` for lint and review purposes). First-party Ops conventions in this doc apply only to `src/components/ops/`, `src/app/`, and `src/lib/`. Updates to a `src/components/ui/` primitive happen via `npx shadcn@latest add <component>` re-fetch (with manual review) or via a focused customisation commit that documents the divergence from upstream.
