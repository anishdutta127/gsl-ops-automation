# /plan-devex-review: Phase 1 developer-experience and self-maintainability lock

Generated via /plan-devex-review framework (Option Y: read framework, produce output) on 2026-04-24.
Branch: main. Repo: anishdutta127/gsl-ops-automation. Status: DRAFT.
Mode: Final ceremony step. Locks DESIGN.md routing, docs-lint, component library, route tree, admin audit UX, runbook outline, developer first-run, self-maintainability matrix, and CLAUDE.md routing tree.
Supersedes: nothing; this is the closing review. Establishes the conventions Phase 1 implementation runs against.

## Anchor points (inputs, not subjects of re-debate)

- **step 7 CEO review** (commit `8c21ac0`): per-axis scope. Axis 1 EXPAND-1 dashboard. Axis 2 HOLD + CONTRACT email status block. Axis 3 HOLD + EXPAND-1 4-category feedback. Axis 4 HOLD + EXPAND-1 + EXPAND-2 WhatsApp button + copy log. Axis 5 HOLD big-bang.
- **step 8 eng review** (commits `2d46c06`, `ba66e4d`): six entity types (Communication, Escalation, SchoolGroup, CcRule, Feedback, FeedbackHmacToken), 8-test suite, D7 refinement, MOU inheritance checklist, Phase 1 acceptance criteria.
- **step 9 design review** (commits `f0e031e`, `8c21ac0`, `849ecfd`, `776df7a`): 5 surfaces locked. Design tokens (`--signal-ok | attention | alert | neutral`), navy + teal palette, Montserrat + Open Sans, Lucide icons, copy conventions including British English / Indian money / DD-MMM-YYYY / no em dash / no AI slop / emoji per-surface rules. WCAG 2.1 AA + axe-core shrinking baseline.
- **handoff line 25**: priorities are *accuracy > smoothness > delight*. Devex tools (lint, runbook, dev setup) bias toward accuracy; nothing in this review trades accuracy for developer convenience.
- **step 6.5 monitoring posture**: triggers ship as observational; this review owns the *how does Anish actually see them* part, which is the dashboard plus the runbook plus the CLAUDE.md routing.
- **two pending asks**: Ameet on Item C (legacy-school import), Shubhangi on Item F (GSTIN availability). Both remain non-blocking inputs; nothing in this review changes if either flips.

### This review decides

1. DESIGN.md as a discipline mechanism (not just seeding).
2. docs-lint pre-commit script (checks, tooling, warn-vs-fail, dev experience).
3. Component library (one decision with reasoning).
4. Page-level route structure (concrete tree under `src/app/`).
5. Admin audit route layout and filter UX (per step 7 Fix 5).
6. `docs/RUNBOOK.md` outline and content seed.
7. Developer-first-run experience (clone to running dev server in N steps).
8. Self-maintainability matrix (which operations need Anish, which do not).
9. CLAUDE.md routing rules (when to consult which doc).

### Out of scope for this review

- Re-debating axis decisions, entity schemas, or design tokens.
- Phase 2 multi-tenant architecture.
- Implementation timing / sprint planning.
- Hire-or-train decisions for non-Anish staff (this review names operations that need Anish; it does not propose hiring).

---

## Item 1: DESIGN.md as a discipline mechanism

### Is DESIGN.md the right mechanism?

**Yes, with the qualification that DESIGN.md alone is insufficient.** DESIGN.md is the prescriptive-rules layer in a three-layer discipline:

1. **Code layer (source of truth for values).** CSS custom properties in `src/app/globals.css` `:root` block. Tailwind config references those CSS vars. Every Tailwind class that maps to a colour, spacing unit, or radius traces back to a CSS var. Hex codes never appear in component files.
2. **Rules layer (DESIGN.md, repo root).** Prescriptive English rules: "all teal-background buttons use navy text"; "Indian money formatting via `formatRs()`, never inline `.toLocaleString`"; "feedback form is mobile-first 375px"; "every coloured state carries a Lucide icon plus a text label." Distilled from the design review artefact and Karpathy-trimmed (no rationale prose; just the rules).
3. **Enforcement layer (docs-lint + axe-core CI + code review).** Mechanically-checkable rules (em-dash zero, British-English-on-user-strings, AI-slop warning) get pre-commit + CI hooks. Visual-judgement rules (spacing, hierarchy, hover state) rely on code review with the design review artefact and DESIGN.md as the reference.

The reason DESIGN.md beats Storybook, Figma exports, or a Notion page for this project: it is plain Markdown, version-controlled, diff-readable, greppable, and CC reads it natively at session start. No extra tooling. No drift from a hosted source. The repo IS the source of truth.

### Routing rules (when does CC consult DESIGN.md, when does it not?)

CC consults DESIGN.md when:

- Creating a new component. Read DESIGN.md tokens and conventions before opening the editor.
- Writing user-facing copy (UI strings, email templates, error messages). Read British-English / no-em-dash / no-AI-slop / emoji-per-surface rules.
- Making a colour, typography, spacing, radius, or motion decision. Read the token table.
- Reviewing a PR with UI changes. Read DESIGN.md to spot diffs from the rules.
- Generating a docx template (PI, Dispatch Note, Delivery Ack). Indian-money / DD-MMM-YYYY / British-English rules apply to template-rendered output too.

CC does NOT consult DESIGN.md when:

- Editing pure backend code (lib, api routes that produce no user-facing strings). Conventions still apply if the backend produces strings, but the rules layer is read once at session start; no per-edit lookup needed.
- Writing tests (test files have their own conventions and are author-judgement).
- Editing docs under `plans/` or `docs/`. Project-internal documents have lighter conventions (no em dash and no AI slop still apply; British English is preferred but not failed).

### Maintenance ownership

**Shared model with split ownership.** Anish owns the prescriptive-rules layer (writes and updates DESIGN.md when a design decision changes). Whoever lands a PR that touches design must:

1. Check DESIGN.md does not contradict the PR before opening it. If it does, the PR proposes a DESIGN.md change first, gets that landed, then lands the implementation.
2. Update DESIGN.md if the PR establishes a new rule (a new component shape, a new copy convention, a new accessibility pattern). Update lands in the same commit or as the immediately-prior commit.

Anish's specific responsibilities:

- Quarterly DESIGN.md review (sync with axe-core baseline review). Catch drift between DESIGN.md and what the code actually does.
- Locking DESIGN.md as canonical when in conflict: if DESIGN.md and the design review artefact disagree, DESIGN.md wins (living source vs review artefact). Anish backports any clarification into DESIGN.md.
- Phase 1.1 / Phase 2 design changes: DESIGN.md gets the new rules; old rules are crossed out with a date and a reason, not deleted (audit purity).

Misba and ops staff do NOT maintain DESIGN.md. They are users of the system, not contributors to its design rules.

### Failure mode if DESIGN.md and a PR diverge

Three classes of divergence, three failure modes:

1. **Mechanically-checkable divergence** (em dash sneaks into a UI string, "color" instead of "colour", "leverage" in copy). docs-lint catches at pre-commit. PR fails CI if the dev bypassed pre-commit. **CI catches this. Good.**
2. **Visually-checkable divergence** (a button uses red-500 background with white text, violating contrast). axe-core CI catches contrast issues. Spacing, hierarchy, and hover-state issues are caught by code review against the design review artefact and DESIGN.md. **Mostly catchable. Code review is the gate.**
3. **Stale DESIGN.md** (PR establishes a new rule but the author forgets to update DESIGN.md). No hard CI gate. Honor system plus reviewer prompt.

Mitigation for the third class: PR template includes a checkbox "Did this PR establish a new design rule? If yes, DESIGN.md updated in the same commit." Reviewer can use git diff to verify if the box is ticked. Soft signal, not enforcement. Phase 1.1 watch-item: if drift becomes chronic, add a CI step that warns (does not fail) when a file under `src/app/` or `src/components/` changes without `DESIGN.md` being touched in the same commit. Phase 1 ships with the soft mitigation only; the CI warning is a tightening lever held in reserve.

### DESIGN.md seed (Phase 1 launch content)

The seed content for `DESIGN.md` is the design review artefact rewritten as prescriptive rules (no rationale prose; just imperatives). Specifically:

- Token table from step 9 §"Design system inheritance" plus the per-surface decisions, distilled to ~5-line-per-rule shape.
- Copy conventions from step 9 §"Copy conventions" verbatim (already prescriptive).
- Accessibility rules from step 9 §"Surface 5 Policy rules" verbatim.
- Per-surface rules from step 9 §"Surface 1-4" distilled to: tile anatomy, segment-button behaviour, status-block structure, copy-button morph timing, etc.

Estimated DESIGN.md size at launch: ~250-350 lines, ~12-18 KB. Smaller than the design review artefact because rationale is stripped.

Implementation owner: Anish, during Week 1 scaffolding. Lands in a single commit titled `docs(design): initial DESIGN.md from step 9 review`.

---

## Item 2: docs-lint pre-commit script

### Checks (Phase 1 scope)

Three checks, all locked at step 9:

1. **Em-dash zero.** grep for U+2014 across `src/**/*.{ts,tsx,md}`, `docs/**/*.md`, `plans/**/*.md`, `DESIGN.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md`. Match count must be 0. Also greps the staged commit message (catches em dashes in commit subject and body).
2. **British English on user-facing strings.** grep for the American-spelling list (`color`, `center`, `behavior`, `organize`, `organizing`, `program` when not preceded by `pro-`, `recognize`, `recognized`, `analyze`, `apologize`, `licensing`, plus the `-ize / -ization` family) across `src/**/*.{ts,tsx}` (UI strings, email templates), `public/ops-templates/**/*` (docx template files when text-extractable), and `docs/**/*.md`. Code-comment matches are excluded (regex anchors on string-literal-context heuristics; if the heuristic misses, author overrides per match).
3. **AI-slop warning.** grep for the slop list (`dive deep`, `robust`, `leverage`, `comprehensive solution`, `seamless`, `cutting-edge`, `best-in-class`, `revolutionary`, `unleash`, `empower`, `elevate`, `game-changer`) across the same paths as British-English. Warns; does not fail.

Phase 1 explicitly does not lint:

- Inline `style=` (no token-discipline check yet).
- Hardcoded hex codes in component files (no token-discipline check yet).
- Class-name discipline (e.g., `text-red-500` vs semantic alias).

These are Phase 1.1 watch-items. Reasoning: token-discipline lint is high-value but high-false-positive at start (legitimate hex codes appear in shadcn/ui copied components). Better to add after one quarter of real PR data shows where the patterns drift.

### Tooling

**simple-git-hooks** (https://github.com/toplenboren/simple-git-hooks) over Husky.

Reasoning:

- simple-git-hooks is one binary plus a JSON block in `package.json`. Husky installs a `.husky/` directory with shell scripts and registers itself via `package.json` `prepare` script.
- For Phase 1 with three checks, simple-git-hooks is the lighter setup. ~5 lines in `package.json`; one shell script under `scripts/docs-lint.sh`.
- Phase 1.1 if the check matrix grows past ~6 checks: re-evaluate. Migration to Husky is a 30-minute swap.
- MOU and HR currently use no pre-commit framework (verified: no `.husky/` directory, no `simple-git-hooks` in package.json on either repo per step 3 inheritance read). Ops introduces simple-git-hooks first; if patterns prove out, MOU and HR can adopt.

### Warn-vs-fail policy per check

| Check | Pre-commit | CI | Reasoning |
|---|---|---|---|
| Em-dash zero | FAIL | FAIL | Hard rule per CLAUDE.md and handoff line 45. Locked. |
| British English on user-facing strings | FAIL | FAIL | Hard rule per CLAUDE.md. Heuristic excludes code comments to avoid false positives. |
| AI-slop vocabulary | WARN | WARN | Words can appear in quoted source text legitimately. Author decides per match. |

Pre-commit and CI run the same `scripts/docs-lint.sh` script. No logic duplication. CI invokes via the GitHub Actions workflow already in place for the queue runner; adds one new job `docs-lint` that runs on every PR.

### Dev experience when a check trips

Em-dash failure example:

```
docs-lint: FAIL
  src/app/dashboard/page.tsx:42  unexpected em dash (U+2014)
  Replace with the appropriate substitute by grammatical role:
    apposition  → colon (:)
    list        → comma (,)
    clause join → semicolon (;)
    sentence    → period (.)
    aside       → parentheses ( )
  See DESIGN.md §"Copy conventions / No em dash" for the full table.
```

British-English failure example:

```
docs-lint: FAIL
  src/lib/templates/welcomeNote.ts:18  American spelling: "color"
  Use British: "colour"
  Suggested replacement: 1 occurrence in user-facing string.
```

AI-slop warning example:

```
docs-lint: WARN
  src/app/dashboard/page.tsx:88  AI-slop word: "leverage"
  This is a warning; commit will proceed.
  If "leverage" appears in a quoted source text, no action needed.
  Otherwise, replace with: "use", "rely on", "build on", or remove.
```

Output is monospace and column-aligned for readability when the dev hits one in their terminal. No emoji. No celebratory framing. Direct voice (per step 9 conventions).

Bypass: `git commit --no-verify` works at the local level for emergencies; the same checks run in CI and block the PR. So bypass is local-only. Anish is the gatekeeper for genuine `--no-verify` cases via PR review.

### CI integration

GitHub Actions workflow `.github/workflows/docs-lint.yml`:

```yaml
name: docs-lint
on:
  pull_request:
    branches: [main]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/docs-lint.sh
```

Same script, same exit codes, same output format. CI runtime: under 5 seconds (three grep passes over the repo). Negligible.

---

## Item 3: Component library decision

### Decision: shadcn/ui

Locks Week 1 setup work on the shadcn/ui scaffold (Tailwind plugins, Radix primitives, the `components/ui/` directory pattern with copy-paste-not-import-as-dep approach).

### Reasoning

Anchored to step 8/9 inheritance, Ameet's tempo, and Phase 2 multi-tenant implications.

**Why not custom**:

- Ops needs Button, Input, Textarea, Card, Pill (lane / level), Badge (status), Modal / Dialog, Dropdown, Tooltip, Skeleton, Segmented control (feedback ratings), Toast (live regions). Twelve components minimum.
- Custom build cost: 0.5 to 1 day per component for production-grade with WCAG 2.1 AA compliance (focus rings, ARIA labels, keyboard nav, screen-reader behaviour). Six to twelve days total.
- Radix primitives (which shadcn/ui wraps) already have those a11y behaviours. Buying back six to twelve days for free is the right trade.
- axe-core baseline starts shorter with Radix's a11y-correct primitives than with hand-built ones (fewer launch-day violations to document).

**Why not HR-shared**:

- HR's components are candidate-portal-flavoured (Fraunces accent, hedonic micro-animations) plus internal-staff-flavoured. Ops is internal-only. Sharing would require either a shared package extraction (~3-5 days of cross-repo refactor work for an unproven shared layer) or two-tier component variants (more complexity than custom would have been).
- Cross-repo coordination overhead: every Ops PR that touches a shared component must be reviewed against HR's usage. HR is in active development; coordinating release windows is a real cost.
- Phase 2 multi-tenant: if HR is single-tenant when multi-tenant arrives for Ops, Ops becomes blocked on HR's adoption. Decoupling means two independent rollouts.

**Why shadcn/ui specifically**:

- Day 1 setup is ~1.5 days (Tailwind config, CSS-variable theme layer, Radix primitives install, copying ~12 components from the shadcn registry, customising tokens to step 9 palette). Amortised across 5 surfaces and ~12 components, this is the cheapest path.
- Copy-paste-not-import-as-dep means Ops owns the component code. No dep-version churn surprises. Customisation lives in the repo, not in a yarn.lock entry.
- Tailwind + CSS-variable theming layer is portable to Phase 2 multi-tenant: per-tenant variables swap at the `:root` layer; component code is unchanged. Compatible with `config/company.json` brand-bundle pattern.
- Radix primitives carry WCAG 2.1 AA a11y by default. Step 9's axe-core shrinking-baseline strategy starts from a near-zero violation count.
- Cross-repo independence: HR can stay on its own components; Ops adopts shadcn cleanly without cross-coordination.

### Push-back

The 1.5 days of Day 1 setup is real. Ameet's tempo is *quality over speed but not at infinite cost*. 1.5 days for a component library that pays back across 5 surfaces and ~12 components, plus the WCAG-AA freebie, is well under "infinite cost." Accepted.

Counter-push-back: shadcn/ui adds Radix as a transitive dep surface. Radix is well-maintained but is novel surface area for Ops. Mitigation: Ops uses only the Radix primitives shadcn copies in (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-slot`). No Radix import outside what shadcn brings. If Radix has a security or stability incident, surface area is bounded.

### Phase 1 component inventory (locked)

Twelve components copied from shadcn registry into `src/components/ui/`:

```
button.tsx           # primary teal, secondary white-bordered, ghost
input.tsx            # text input + form association
textarea.tsx         # 2-row default, 1000-char limit support
card.tsx             # health tile and feedback category card base
badge.tsx            # status pills, lane pills, level pills
dialog.tsx           # confirmation modals, manual-copy fallback for WhatsApp
dropdown-menu.tsx    # admin filter chips, user menu
tooltip.tsx          # WhatsApp-button first-session tooltip, threshold caption
skeleton.tsx         # loading states (rare; mostly server-rendered, but admin lists may need)
toast.tsx            # aria-live polite for copy confirmations and submission results
separator.tsx        # status block top-and-bottom dividers in email; hr equivalents in UI
label.tsx            # form labels with sr-only support
```

Custom components built on top of shadcn primitives (not from shadcn directly):

```
src/components/ops/
  HealthTile.tsx           # 5 dashboard health tiles
  TriggerTile.tsx          # 10 dashboard trigger tiles
  ExceptionRow.tsx         # exception feed row
  EscalationRow.tsx        # escalation list row
  StatusBlock.tsx          # email-template SECTION (not a route component)
  CopyWhatsAppButton.tsx   # 8-placement secondary button with morph-on-copy
  RatingSegments.tsx       # feedback 1-5 plus skip segmented control
  FeedbackCategoryCard.tsx # feedback per-category card
  AuditRow.tsx             # admin audit route row
  CcRuleToggle.tsx         # per-rule on/off toggle row
```

Ten Ops-specific components, twelve shadcn-derived primitives. Twenty-two components total in Phase 1.

---

## Item 4: Page-level route structure

### Concrete tree

```
src/app/
├── layout.tsx                    # root layout: fonts, CSS vars, skip-link, <main id="main-content">
├── page.tsx                      # / → redirect to /dashboard
├── globals.css                   # CSS vars on :root, Tailwind directives
├── login/
│   └── page.tsx                  # staff login (HR-pattern fork)
├── logout/
│   └── page.tsx                  # logout confirmation (rare; usually direct API)
├── dashboard/
│   ├── layout.tsx                # dashboard chrome (header band, user menu)
│   ├── page.tsx                  # Leadership Console (5 health + 10 trigger + exception + escalation)
│   └── exceptions/
│       └── page.tsx              # CONTRACT-style flat exception feed (inner route from email pings)
├── feedback/
│   ├── [tokenId]/
│   │   └── page.tsx              # SPOC-facing form (PUBLIC; HMAC-gated at page level)
│   ├── thank-you/
│   │   └── page.tsx              # PUBLIC; static thank-you
│   └── link-expired/
│       └── page.tsx              # PUBLIC; static expired/used redirect target
├── schools/
│   ├── page.tsx                  # list view (search + filter by region)
│   └── [schoolId]/
│       ├── page.tsx              # detail view (GSTIN, SPOCs, MOUs, escalation history)
│       └── edit/
│           └── page.tsx          # edit page (rare; mostly admin route does this)
├── mous/
│   ├── page.tsx                  # list view (filter by stage, by programme, by region)
│   └── [mouId]/
│       ├── page.tsx              # detail view (lifecycle stages 1-8 inline)
│       ├── actuals/
│       │   └── page.tsx          # Stage 2: actuals confirmation (Sales + Ops cross-verify)
│       ├── pi/
│       │   └── page.tsx          # Stage 4: PI generation (Send + Copy WhatsApp draft)
│       ├── dispatch/
│       │   └── page.tsx          # Stages 5-7: dispatch flow + override-gate UI for Leadership
│       ├── feedback-request/
│       │   └── page.tsx          # Stage 8 trigger: send feedback magic-link
│       └── delivery-ack/
│           └── page.tsx          # Stage 7 reminder: delivery acknowledgement upload
├── escalations/
│   ├── page.tsx                  # list view (filter by lane, level, status)
│   └── [escalationId]/
│       └── page.tsx              # detail view (notifiedEmails snapshot, resolution flow)
├── admin/
│   ├── layout.tsx                # admin chrome (left nav with sub-routes)
│   ├── page.tsx                  # admin index → redirect to /admin/audit
│   ├── audit/
│   │   └── page.tsx              # audit log (Item 5 below)
│   ├── schools/
│   │   ├── page.tsx              # schools admin list
│   │   └── new/
│   │       └── page.tsx          # add-school flow (Item 8: self-serve)
│   ├── spocs/
│   │   ├── page.tsx              # SPOCs list
│   │   └── new/
│   │       └── page.tsx          # add-SPOC flow (Item 8: self-serve)
│   ├── cc-rules/
│   │   ├── page.tsx              # 10 rules list with per-rule enabled toggle
│   │   ├── new/
│   │   │   └── page.tsx          # rule creation (Phase 1: Anish for first 30 days, then Misba)
│   │   └── [ruleId]/
│   │       └── page.tsx          # rule edit detail
│   ├── sales-team/
│   │   ├── page.tsx
│   │   └── new/
│   │       └── page.tsx          # add-rep flow (Item 8: self-serve)
│   ├── school-groups/
│   │   ├── page.tsx              # 3 pre-seeded groups + ability to create
│   │   └── new/
│   │       └── page.tsx          # Phase 1: Anish-required (Item 8)
│   ├── mou-import-review/
│   │   └── page.tsx              # review queue from Q-A
│   └── pi-counter/
│       └── page.tsx              # counter health + monotonicity check (Item G)
└── api/
    ├── login/route.ts            # POST staff login
    ├── logout/route.ts           # POST staff logout
    ├── health/route.ts           # GET; PUBLIC
    ├── feedback/
    │   └── submit/route.ts       # POST; PUBLIC; HMAC-verified (D7 refinement)
    ├── communications/
    │   ├── send/route.ts         # POST email send
    │   └── log-copy/route.ts     # POST WhatsApp-draft-copy log (Axis 4 EXPAND-2)
    ├── pi/
    │   └── generate/route.ts     # POST PI docx generation
    ├── dispatch/
    │   └── generate/route.ts     # POST Dispatch Note docx generation
    ├── delivery-ack/
    │   └── generate/route.ts     # POST Delivery Ack docx generation
    ├── mou/
    │   └── import-tick/route.ts  # GET; cron-driven (Q-A)
    └── sync/
        └── tick/route.ts         # GET; daily sync-runner check (Q-G)
```

### Inheritance from MOU

MOU's route structure (per step 3 §3): `/`, `/dashboard`, `/admin/*`, `/api/*`. Ops mirrors that. Ops adds:

- `/feedback/*` (entirely new; PUBLIC routes per D7).
- `/escalations/*` (new entity; replaces MOU's lighter-touch escalation surface).
- `/mous/[mouId]/*` deeper nesting (MOU app handles up to Stage 4; Ops covers all 8 stages).
- `/admin/cc-rules`, `/admin/school-groups`, `/admin/mou-import-review`, `/admin/pi-counter` (Ops-specific admin surfaces).

Routes that are FLAT (single page route, no nested children):

- `/login`, `/logout`, `/feedback/thank-you`, `/feedback/link-expired`, `/dashboard/exceptions`, `/admin/audit`, `/admin/pi-counter`, `/admin/mou-import-review`.

Routes that need NESTED routing:

- `/dashboard` (chrome via layout.tsx).
- `/admin` (chrome via layout.tsx with left nav).
- `/mous/[mouId]/*` (lifecycle stages as sub-routes; the parent shows the overview, sub-routes show stage-specific UI).
- `/feedback/[tokenId]` (dynamic segment; HMAC-gated at page level).
- `/schools/[schoolId]`, `/escalations/[escalationId]`, `/admin/cc-rules/[ruleId]` (entity detail).

Total Phase 1 routes: ~32 page routes + ~12 API routes = ~44 routes. MOU has ~25, HR has ~30. Ops is largest at ~44 because it covers all 8 lifecycle stages.

### Layout chrome decisions

- `src/app/layout.tsx` (root): `<html lang="en-IN">` (per step 9 British-English-on-Indian-context choice; en-IN signals the Indian variant), font loading via `next/font` (Montserrat + Open Sans), CSS-var initialisation, the skip-to-content link target (`#main-content`), and the `<main id="main-content">` wrapper.
- `src/app/dashboard/layout.tsx`: header band with title, refresh indicator, user menu. Wraps the dashboard page and any future inner routes.
- `src/app/admin/layout.tsx`: left nav with sections (Audit, Schools, SPOCs, CcRules, Sales Team, School Groups, Import Review, PI Counter). Right side renders the page-route content.
- No layout.tsx for `/feedback/*` (each feedback route is standalone; SPOCs do not navigate between them).
- No layout.tsx for `/mous/[mouId]/*` (the mou detail page renders the full lifecycle inline; stage-specific sub-routes are full-page contexts for actions like "Generate PI" that benefit from focus).

### Route-level auth

- PUBLIC: `/login`, `/feedback/[tokenId]`, `/feedback/thank-you`, `/feedback/link-expired`, `/api/login`, `/api/logout`, `/api/health`, `/api/feedback/submit`. Listed in `PUBLIC_PATHS` in `src/middleware.ts` per D7 refinement.
- STAFF-JWT-GATED: everything else. Middleware redirects to `/login` on no-cookie or expired-cookie.
- ROLE-FILTERED (within staff-JWT): `/admin/*` requires Admin or Ops Head role (Anish or Misba). `/escalations/*` shows entries filtered by role per Item 5's permissions matrix. `/dashboard` shows the same data to everyone but tile values are role-scoped (a sales rep sees their own MOUs).

---

## Item 5: Admin audit route layout and filter UX

Per step 7 Fix 5: `/admin/audit?filter=communication-copy` is the admin route where per-user attribution lives (the dashboard's WhatsApp-copy tile is anonymized-by-default).

### Layout

Single page at `/admin/audit`. Left filter rail (240px), right results pane (flex-grow). Mobile: filters collapse to a top accordion.

Filter rail components, top to bottom:

- **Date range**: presets (Last 24h, Last 7 days, Last 30 days, Custom). Custom opens an inline date picker with start/end. Default: Last 7 days.
- **Entity type chips** (multi-select): MOU, School, SPOC, CcRule, Communication, Dispatch, Escalation, FeedbackHmacToken, Feedback, SchoolGroup, SalesRep, PiCounter. Default: all selected.
- **Action chips** (multi-select): a flat list of `auditLog` actions present in the data. Examples: `auto-link-exact-match`, `manual-relink`, `p2-override`, `p2-override-acknowledged`, `actuals-confirmed`, `pi-issued`, `dispatch-raised`, `delivery-acknowledged`, `feedback-submitted`, `cc-rule-toggle-on`, `cc-rule-toggle-off`, `cc-rule-created`, `whatsapp-draft-copied`. Default: all selected.
- **User select** (typeahead): filter by acting user. Admin (Anish) sees all users; Ops Head (Misba) sees Ops users plus shared; Sales Head (Pratik) sees Sales users plus shared.
- **Search** (free text): matches against entity id, school name, MOU id, action, notes free-text. Case-insensitive.
- **Quick filters** (preset chip row above the rest): "Communication copies" (sets entity=Communication, action=`whatsapp-draft-copied`), "P2 overrides" (sets entity=Dispatch, action=`p2-override`), "CcRule toggles" (sets entity=CcRule, action=`cc-rule-toggle-*`), "Import auto-links" (sets entity=MOU, action=`auto-link-exact-match`). Sets the URL query string for shareability.

Results pane:

- Top: result count, current filter chip-summary, "Export CSV" button (Phase 1 outputs CSV; Phase 1.1 may add JSON export).
- Below: AuditRow components, 50 per page, cursor-based pagination ("Load older entries" at the bottom).
- Each row: timestamp (DD-MMM-YYYY HH:mm IST), user (name + role badge), action (with icon), entity link (school name or MOU id; click opens entity detail in new tab), before→after compact diff (collapsed by default; click to expand), notes (1-line truncate; tooltip on hover).
- Diff format: monospace, two-line `before: { ... }` / `after: { ... }`. Long values truncate with ellipsis. Full diff in a Dialog on click.

### Filter UX details

Filter chips toggle on click. Multi-select within a category (entity types, actions). All filters AND together. URL query string updates on every filter change for shareability (Anish can paste a filtered URL into Slack to point Ameet at a specific incident).

URL examples:

- `/admin/audit?filter=communication-copy` (Step 7 Fix 5 reference) → entity=Communication, action=whatsapp-draft-copied, last 7 days.
- `/admin/audit?entity=Dispatch&action=p2-override&days=30` → all P2 overrides in the last 30 days.
- `/admin/audit?user=ameet@gsl.in&days=14` → all of Ameet's actions in the last 14 days.
- `/admin/audit?search=Narayana` → all audit entries mentioning Narayana in any field.

### Permissions matrix

| Role | Can see | Cannot see |
|---|---|---|
| Admin (Anish) | all entries, all users, all entities, all actions | nothing |
| Ops Head (Misba) | OPS-lane actions; communication-copy events; CcRule toggles; dispatch state changes; escalation actions on OPS lane; mou-import-review resolutions | Sales drift approvals; Sales-only escalations; admin-level meta-events (e.g., user-account creation) |
| Sales Head (Pratik) | SALES-lane actions; drift approvals; sales-rep activity; escalation actions on SALES lane; communication-copy events on Sales-owned MOUs | Ops-only escalations; CcRule toggles; admin-level meta-events |
| Sales rep / Ops staff (Shubhangi, Pradeep, individual reps) | only entries about MOUs they own or schools they SPOC-manage | everything else; specifically cannot see other users' communication-copy events |
| Leadership (Ameet) | all entries (read-only) | nothing |

The mechanism: server-side filter applies on every load. The client never receives entries the role cannot see. URL-query-string filters refine the role-filtered base set; they cannot widen it. (A Sales rep cannot construct a URL that exposes Ops-only data.)

### Per-user attribution rendering

For Admin and Leadership, the user column shows `name (role) <email>`. For other roles, the user column shows `name (role)` only; email hidden to match the dashboard's anonymisation framing.

For `whatsapp-draft-copied` events specifically (step 7 Fix 5 mitigation): the audit row shows full user attribution to the roles that can see it (Admin, Leadership, Ops Head); the dashboard tile aggregates without user attribution. The audit route is the only surface where the click-to-user mapping is visible.

### Acceptance for Item 5

- Filter chips, search, and date range work; URL query string reflects state.
- Role-based filtering verified by automated test: a Sales rep session loading `/admin/audit?action=cc-rule-toggle-off` returns zero entries (CcRule toggles are Ops-only).
- Quick-filter chip "Communication copies" lands a working `/admin/audit?filter=communication-copy` view.
- Export CSV produces a row per audit entry with the same fields visible in the UI; respects permissions.

---

## Item 6: docs/RUNBOOK.md (launch-day operational runbook)

### Outline (Phase 1 launch content)

```
docs/RUNBOOK.md

1. Pre-launch checklist (T-7 days to T-0)
   1.1  Data seeding (MOUs, schools, SPOCs, CcRules, sales_team, SchoolGroups)
   1.2  Credentials distribution (Shubhangi, Pradeep, Misba, Ameet, named sales reps)
   1.3  GSTIN backfill status (per Item F result; bulk import or per-school capture)
   1.4  Excel-tracker freeze plan (read-only export contract; communication to ops team)
   1.5  Sync runner laptop state (plugged in, awake, Windows Update deferred)
   1.6  Test suite green on main, axe-core baseline at zero
   1.7  Vercel deployment verified (queue commit ignore + non-queue commit deploy)

2. Launch day sequence (D-day, hour by hour)
   2.1  T+00h: Anish runs initial MOU import pass against the 2026-04 cohort
   2.2  T+01h: validation sweep on all imported records (programme enum, GSTIN, scope)
   2.3  T+02h: credential email to all users with link to /login
   2.4  T+03h: brief Misba on dashboard tour, exception feed, escalation list
   2.5  T+04h-end: monitor first sync ticks, queue depth, axe-core CI, cold-load times

3. Per-user Day-1 actions
   3.1  Anish: monitor sync runner, dashboard, exception feed; respond to mou-import-review queue
   3.2  Shubhangi: log in; verify school list and SPOC list; flag missing GSTINs
   3.3  Pradeep: log in; review escalation list; verify dispatch flow on a non-real test MOU
   3.4  Misba: log in; review CcRules toggle state; verify dashboard tile values
   3.5  Ameet: log in; verify Leadership Console renders; test override-gate UI on a test Dispatch
   3.6  Sales reps: log in; verify their own MOU list scoping

4. Cron-runner monitoring expectations
   4.1  Hourly sync (Mon-Fri IST business hours): expected behaviour, normal log shape
   4.2  Daily sync-runner check: pi_counter monotonicity, pending_updates JSON validity
   4.3  Weekly hmac-token pruning: archive-then-delete; output location
   4.4  GitHub Actions failure: how Anish gets paged (notifications config), recovery steps

5. Failure modes and recovery
   5.1  Sync runner offline (laptop sleeping, Windows Update reboot)
        Symptom: dashboard "last sync" timestamp drifts past 1 hour during business hours
        Recovery: wake laptop; check GitHub Actions runner status; trigger manual run if needed
        Phase 1.1 fix: cloud runner migration (per step 8 risk 7)
   5.2  Queue corruption (invalid JSON in pending_updates.json)
        Symptom: daily sync-runner check fires; PI generation may fail
        Recovery: git history archaeology; manual JSON repair; commit with manual queue-fix prefix
        Prevention: 8-test suite; pre-commit JSON validation
   5.3  3rd-party API outage (GitHub Contents API rate limited or down)
        Symptom: queue commits fail; dashboard shows "Dashboard data unavailable" banner
        Recovery: wait for API restoration; retry on next sync tick; the queue is idempotent
   5.4  Deploy failure (Vercel build broken on a non-queue commit)
        Symptom: CI green but Vercel deploy fails
        Recovery: revert the commit; investigate; redeploy
   5.5  PI-counter skip or duplicate
        Symptom: daily sync-runner check fires monotonicity violation
        Recovery: emergency review per step 6.5 Item G; archaeology + manual reconciliation
   5.6  Email bounce surge (>5% in any 7-day window)
        Symptom: step 6.5 Item I trigger fires; dashboard tile alerts
        Recovery: per Item I rollback path; switch to WhatsApp-copy fallback; investigate sender reputation

6. Trigger response (when step 6.5 trigger fires)
   For each of the 10 items A through J: trigger condition, immediate response, escalation to Phase 1.1 if persistent.

7. Phase 1.1 escalation criteria
   When does Anish stop adding to Phase 1 and start planning Phase 1.1?
   - Two consecutive trigger fires in Items A, F, or G.
   - Single trigger fire in Items C or G (data-integrity-incident class).
   - Ops team explicit request for a Phase 1.1 feature.
   - 60 days post-launch regardless (forced cadence).

8. Contacts
   Roles, escalation chains, who to call at what hour for what failure mode.
```

### Content seed (Phase 1 launch ships with sections 1-3 written; 4-7 outlined; 8 with placeholder names)

Sections 1-3 are pre-launch deliverables; Anish writes them as part of Week 1 scaffolding using this outline as the structure. Sections 4-7 ship as bullet-form outlines and get filled in as actual incidents and triggers occur (post-launch living document). Section 8 lands at credentials-distribution day with real contact info filled in.

### RUNBOOK.md length target

~800-1200 lines, ~30-50 KB at full content. Phase 1 launch ships with ~400-500 lines, ~15-20 KB (sections 1-3 written; 4-7 outlined). Living document; grows as incidents land.

### Maintenance

Anish owns RUNBOOK.md. Updates land:

- After every incident (post-mortem captured in section 5.x).
- After every trigger fire (response captured in section 6.x).
- Weekly during the first 4-week post-launch review cadence.
- Monthly thereafter through month 3.
- Quarterly after stable.

Misba and ops staff are READERS of RUNBOOK.md; they consult section 3 for their Day-1 actions and section 5 when they hit a failure mode. They do not write RUNBOOK.md.

---

## Item 7: Developer-first-run experience

### Repo clone to running dev server

Six commands, ~15-30 minutes for a developer who already has Node 20+ and has read CLAUDE.md:

```bash
# 1. Clone
git clone https://github.com/anishdutta127/gsl-ops-automation.git
cd gsl-ops-automation

# 2. Install
npm install

# 3. Seed local dev environment
cp .env.local.example .env.local
# Fill in 4 secrets from 1Password "GSL Ops" vault (instructions in .env.local.example)

# 4. Seed fixture data
npm run seed:dev
# Populates src/data/*.json from src/data/_fixtures/*.json

# 5. Run tests
npm test
# 8 tests should pass; if any fail, the dev environment is broken

# 6. Start dev server
npm run dev
# localhost:3000; should redirect to /login
```

### Time-to-first-PR target

- 15 minutes from `git clone` to a green `npm test` and a running dev server.
- 15 minutes to read CLAUDE.md, DESIGN.md, and the routing tree (Item 4).
- 15 minutes to find the entity / route / component the PR will touch.
- ~45 minutes total to scoped, ready-to-edit context.

If a developer takes longer than 60 minutes from clone to opened editor, that is a documentation gap (or a missing fixture, or a missing secret, or a missing dep). Anish reviews the developer-first-run flow quarterly using the same target.

### .env.local secrets

Five entries:

| Var | Source | Purpose | Rotation |
|---|---|---|---|
| `GITHUB_PAT_QUEUE` | 1Password "GSL Ops" vault | Personal Access Token for Contents API queue writes; scope `repo` only | 90 days |
| `GSL_SNAPSHOT_SIGNING_KEY` | 1Password "GSL Ops" vault | HMAC key for feedback magic-link tokens (matches the key HR uses for candidate magic links) | yearly |
| `JWT_SECRET` | 1Password "GSL Ops" vault | Staff session JWT signing | 6 months |
| `OPS_DATA_PATH` | local file path | Absolute path to the OneDrive-synced ops-data folder containing the 4 source xlsx files (used for periodic re-imports, not for dev work) | n/a (per-machine) |
| `NEXT_PUBLIC_APP_URL` | static | `http://localhost:3000` in dev; `https://ops.getsetlearn.info` in prod | n/a |

`.env.local.example` ships in the repo with placeholder values, comments explaining each secret's purpose, and a 1Password search-string for each (e.g., "search 'GSL Ops PAT' in 1Password"). New developers (Phase 2 onwards if Anish brings on help) get 1Password vault access first, then the file copy is a 5-minute operation.

### Test suite onboarding

Eight tests in `src/lib/**/*.test.ts` colocated with subjects (per step 8 Q-G). Vitest config in `vitest.config.ts` (matches MOU's pattern). No test-database setup; tests use in-memory JSON fixtures and mock GitHub Contents API responses.

Running tests:

- `npm test`: full suite, ~5 seconds.
- `npm test -- queueAppend`: single-file watch mode for a focused test.
- `npm run test:coverage`: with coverage report; CI runs this and asserts >80% for `src/lib/`.

The 8 tests are documented in `src/lib/__tests__/README.md` (or equivalent) with the names from step 8 Q-G plus a one-line description each. New developer reads this README to understand what each test guards.

### ops-data staging

`ops-data/` contains 7 files total: 3 tracked documents (handoff, executive brief, ground-truth data report) plus 4 gitignored xlsx files containing contact data and source spreadsheets (`MOU_Signing_Details_2026-2027__Responses_.xlsx`, `Mastersheet-Implementation_-_AnishD.xlsx`, `SCHOOL_SPOC_DATABASE.xlsx`, `Regular_Kits_Handover_template.xlsx`). Per the kickoff gitignore decision, the 3 documents stay in git as project context; the 4 xlsx files stay on disk only because they contain SPOC contact data. The dev environment does NOT read xlsx files directly; instead, fixture JSON committed to `src/data/_fixtures/` is seeded into `src/data/` via `npm run seed:dev`. Real ops-data xlsx imports are run by Anish only, never as part of dev workflow.

Fixture content:

- `_fixtures/mous.json`: 6 representative MOUs (1 SINGLE STEAM, 1 SINGLE TinkRworks, 1 SINGLE GSLT-Cretile, 1 GROUP Narayana, 1 with null GSTIN, 1 with mid-import-review state).
- `_fixtures/schools.json`: ~15 representative schools across regions, programmes, and group memberships.
- `_fixtures/sales_team.json`: 5 placeholder reps (anonymised; not real names).
- `_fixtures/cc_rules.json`: the 10 SPOC-DB rules per ground-truth §3b.
- `_fixtures/school_groups.json`: 3 pre-seeded groups (Narayana WB, Techno India, Carmel).
- `_fixtures/users.json`: ~10 placeholder users covering all roles (Admin, Ops Head, Sales Head, sales rep, ops staff, Leadership).
- `_fixtures/feedback_hmac_tokens.json`: 2 fixtures (1 unused, 1 expired) for testing the public route.
- `_fixtures/communications.json`: ~20 entries covering all CommunicationType values.
- `_fixtures/escalations.json`: ~5 entries across lanes and levels.
- `_fixtures/dispatches.json`: ~5 entries covering all DispatchStage values plus 1 with overrideEvent set.
- `_fixtures/feedback.json`: ~10 entries with varied rating patterns including null skips.

Fixtures are anonymised (no real school names, no real SPOC emails). Fixture re-seed is destructive: `npm run seed:dev` overwrites `src/data/*.json` with fixture content. Real data lives in production via the Contents API queue; never on dev machines except via xlsx imports run explicitly by Anish.

### CLAUDE.md routing for first PR

A new developer's first PR touches one entity or one component. CLAUDE.md (Item 9 below) routes them to:

- DESIGN.md for the prescriptive rules.
- The relevant ceremony artifact (eng review for entity questions, design review for visual questions).
- The route tree in this devex review for where the file lives.

---

## Item 8: Self-maintainability matrix (honest assessment)

Each operation, classified Phase 1 self-serve / Phase 1 Anish-required / never-self-serve, with effort estimate to flip Anish-required to self-serve.

| Operation | Phase 1 status | Effort to flip | Phase 1.1 verdict |
|---|---|---|---|
| Add a school | self-serve via `/admin/schools/new` | already self-serve | done |
| Edit a school (GSTIN, name, region) | self-serve via `/admin/schools/[id]/edit` | already self-serve | done |
| Add a SPOC | self-serve via `/admin/spocs/new` | already self-serve | done |
| Toggle CcRule on/off | self-serve via `/admin/cc-rules` (Misba role) | already self-serve | done |
| Create a new CcRule | Anish-required first 30 days, then Misba (Ops Head role) | already in design | Phase 1 |
| Edit existing CcRule (scope, contexts, ccUserIds) | Misba (Ops Head role) | already in design | Phase 1 |
| Add a sales rep | self-serve via `/admin/sales-team/new` | already self-serve | done |
| Edit sales-rep details | self-serve via `/admin/sales-team/[id]/edit` | already self-serve | done |
| Resolve mou_import_review queue item | self-serve via `/admin/mou-import-review` (Anish or Misba) | already self-serve | done |
| Override dispatch gate (P2 exception) | self-serve via `/mous/[mouId]/dispatch` (Leadership role only) | already self-serve | done |
| Approve actuals drift (Sales Head) | self-serve via the drift-approval queue (Pratik) | already self-serve | done |
| Resolve an escalation | self-serve via `/escalations/[id]` (assigned-to user) | already self-serve | done |
| Create a SchoolGroup | Anish-required (data-model judgement per group) | 1 day (admin UI) | Phase 1.1 |
| Add to existing SchoolGroup memberSchoolIds | self-serve via `/admin/school-groups/[id]/edit` | already self-serve | done |
| Add a programme to the enum | Anish-required (involves rate-card + template + tests) | 3-5 days for UI; templates still Anish | Phase 2 |
| Add or edit a docx template (PI / Dispatch / Delivery Ack) | Anish-required (placeholder spec + outputFileTracingIncludes path + send-test) | 5+ days for upload UI with placeholder validation | Phase 2 |
| Pre-seed at launch (one-time) | Anish-required | n/a | Phase 1 launch only |
| Delete a MOU | never-self-serve (audit purity) | not in scope | never |
| Delete a school | Anish-required (manual audit-log surgery; rare) | not in scope; one-off | Phase 2 maybe |
| Adjust drift threshold (10% default per Item B) | Anish (config edit) | 0.5 days for admin UI | Phase 1.1 |
| Adjust trigger thresholds (step 6.5 items) | Anish (config edit + dashboard re-tile) | 1-2 days for an admin tuning UI | Phase 1.1 |
| Roll a CcRule back to a prior state | Anish (audit-log archaeology) | 2 days for a "rule history" UI with revert | Phase 2 |

### Honest summary

Phase 1 self-serve covers the high-volume operations:

- Add school, add SPOC, add sales rep, add SPOC-DB-rule member.
- Toggle a CcRule, edit a CcRule, resolve a review queue item, override a dispatch gate, approve drift, resolve an escalation.
- Add to existing SchoolGroup, edit existing fields.

Phase 1 Anish-required for low-volume operations:

- Create a new CcRule (first 30 days; flips to Misba at day 31).
- Create a new SchoolGroup (until Phase 1.1).
- Add a programme (Phase 2).
- Add or edit a docx template (Phase 2).
- Adjust drift threshold or trigger thresholds (Phase 1.1).

Never-self-serve:

- Delete a MOU. Audit-log purity is non-negotiable. Phase 1 ships with no delete affordance.
- Delete a school. Same reasoning. Closing or marking-inactive is allowed (status field), but row deletion never.
- Roll back the audit log itself. Never.

### Ameet's tempo check

The matrix biases self-serve where the operation is high-volume and routine; biases Anish-required where the operation is low-volume and judgement-heavy or schema-touching. This matches *accuracy > smoothness > delight*: routine ops smoothness is high (10+ self-serve operations), but the rare schema-touching ops sit with Anish to preserve accuracy.

### Phase 1.1 self-serve roadmap

Estimated 5-7 days of work to flip the Phase 1 Anish-required items that have low-effort UIs:

- SchoolGroup creation UI: 1 day.
- Drift threshold admin UI: 0.5 days.
- Trigger threshold admin UI: 1-2 days.
- CcRule history + revert UI: 2 days.
- Total: ~5-7 days.

Phase 2 items (programme add, template upload) are deferred because they involve schema migrations and rate-card coordination; not pure UI work.

---

## Item 9: CLAUDE.md routing rules for the prompt library

### Routing tree (the heart of Item 9)

```
Question type                                  → Document to consult first
─────────────────────────────────────────────────────────────────────────────────
"What does the system do?"                    → ops-data/GSL_Ops_Handoff.md
"What's locked from Phase 1 scope?"           → plans/anish-ops-ceo-review-2026-04-24.md
"What entity / schema / endpoint / test?"     → plans/anish-ops-eng-review-2026-04-24.md
"What does it look like / what copy?"         → DESIGN.md (canonical)
                                                 → plans/anish-ops-design-review-2026-04-24.md (review artefact)
"How do I run / debug / launch / recover?"    → docs/RUNBOOK.md
"How do I contribute / first PR?"             → docs/DEVELOPER.md (this review's Item 7 written up)
"What's the Phase 1.1 backlog?"               → plans/anish-ops-eng-review-2026-04-24.md §"Phase 1.1 backlog"
"Who can do X without Anish?"                 → DESIGN.md self-maintainability table
                                                 OR plans/anish-ops-devex-review-2026-04-24.md §"Item 8"
"Why does X have a weird shape?"              → grep plans/ for the relevant Q-x or Tension-x
"What was my Karpathy commitment?"            → CLAUDE.md §"Karpathy coding principles"
"What do British / Indian / no-em-dash mean?" → DESIGN.md §"Copy conventions"
                                                 OR CLAUDE.md (top-of-file)
"What's the trigger for Item A through J?"    → plans/assumptions-and-triggers-2026-04-24.md
"What was decided at office hours?"           → plans/anish-ops-office-hours-2026-04-24.md
```

### CLAUDE.md sections (post-devex-review final shape)

Order:

1. **Project conventions** (existing). Top-of-file. British English, Indian money, no em dash, WCAG 2.1 AA, no in-app AI calls, single-tenant, every-write-audited.
2. **Inheritance from sibling projects** (existing). What carries from MOU and HR; what does not.
3. **Routing tree** (NEW; from this review). The table above plus one-line description per row.
4. **Read-order for fresh sessions** (NEW; from this review):
   ```
   For every fresh CC session opening this repo:
   1. Read CLAUDE.md (you're already doing this).
   2. Read DESIGN.md (always; visual + copy rules).
   3. If the task touches a Phase 1 decision: read the relevant plans/ artefact.
   4. If the task is implementation: read the file you're touching plus its sibling tests.
   5. If the task is a launch / monitoring / failure question: read docs/RUNBOOK.md.
   ```
5. **Planning discipline** (existing). gstack ceremony in order. Step-by-step pause.
6. **Karpathy coding principles** (existing). Behavioural rules.
7. **Decision log pointer** (NEW): "Plans under `plans/` are the decision archive. They are not implementation guides; once Phase 1 lands, they answer 'why' questions, not 'how' questions. For 'how', read the code."

### When does CC consult DESIGN.md vs CLAUDE.md?

- **CLAUDE.md is behavioural**: how CC acts (terse, Karpathy, paste-in-full, conventional commits, em-dash discipline at draft-time).
- **DESIGN.md is design rules**: what to build (token values, copy patterns, accessibility policies).
- **Both are loaded into context at session start**: CLAUDE.md by harness convention (project file at repo root); DESIGN.md by explicit read on any UI-touching task.

If a rule is *behaviour* (e.g., "never em dash"), CLAUDE.md owns it. If a rule is *output property* (e.g., "primary teal is #00D8B9"), DESIGN.md owns it. If a rule is both (e.g., "Indian money formatting via `formatRs()`"), it lives in both with one-line cross-reference.

### When does CC look at docs/RUNBOOK.md vs plans/ reviews?

- **RUNBOOK.md = operational**: pre-launch checklist, launch-day sequence, failure-mode recovery, post-launch trigger response. Active during the launch window and for trigger responses.
- **plans/ reviews = decision archive**: why was the schema this shape, why was the launch big-bang, why is the dashboard at EXPAND-1 not EXPAND-2. Active during post-launch retrospectives, Phase 1.1 planning, and "why did we do this?" investigations.

A failure incident: CC starts in RUNBOOK.md §5 to find the failure mode, then dives into the affected entity / route / lib code. If RUNBOOK.md does not cover the incident, the post-mortem adds a section to RUNBOOK.md and (if the post-mortem reveals a design assumption was wrong) flags an update for the relevant plans/ artefact.

A Phase 1.1 planning question: CC starts in `plans/anish-ops-eng-review-2026-04-24.md §"Phase 1.1 backlog"` for the list, then reads the original review section that proposed each item to refresh the rationale.

### CLAUDE.md updates this review proposes

Append a new section to existing CLAUDE.md:

```markdown
## Routing tree (post-ceremony, 2026-04)

For any question CC encounters, this table picks the first document to consult.

| Question type | First document | Notes |
|---|---|---|
| "What does the system do?" | `ops-data/GSL_Ops_Handoff.md` | Plus the exec brief if the question is strategic. |
| "What's in Phase 1 scope?" | `plans/anish-ops-ceo-review-2026-04-24.md` | 5 axes; out-of-scope items are explicit. |
| "What entity / endpoint?" | `plans/anish-ops-eng-review-2026-04-24.md` | 6 entity types, 8-test suite, D7. |
| "What does it look like?" | `DESIGN.md` (canonical), then `plans/anish-ops-design-review-2026-04-24.md` (rationale) | DESIGN.md wins on conflict. |
| "How do I run / launch / recover?" | `docs/RUNBOOK.md` | Living document; post-incident updates here. |
| "How do I contribute?" | `docs/DEVELOPER.md` | Repo clone to working dev server in 6 commands. |
| "What's deferred?" | `plans/anish-ops-eng-review-2026-04-24.md` §"Phase 1.1 backlog" | Plus risk registry above. |
| "Who can do X without Anish?" | `plans/anish-ops-devex-review-2026-04-24.md` §"Item 8" | Self-maintainability matrix. |
| "Why this shape?" | grep `plans/` for the Q-x or Tension-x | Decision archive; never silently re-litigated. |

For any UI-touching task: always read DESIGN.md before the editor opens.
For any task: always read CLAUDE.md (this file) at session start.
```

Plus one new top-level rule:

```markdown
## Plans are an archive, not a guide

Documents under `plans/` are the decision archive. They explain *why* a Phase 1
decision is the way it is. They are NOT implementation guides; once Phase 1 has
landed, the code is the implementation guide and `plans/` answers historical
questions only. Do not reference `plans/` line numbers in implementation code or
docstrings; use code self-evidence and DESIGN.md cross-references instead.
```

### Implementation owner

Anish updates CLAUDE.md as part of Week 1 scaffolding, after this review lands. Lands as a single commit titled `docs(claude): add routing tree and decision-archive rule (devex review)`.

---

## Risks surfaced and mitigations

Six new risks specific to this review's scope.

| # | Risk | Mitigation |
|---|---|---|
| 1 | DESIGN.md drift over time (PRs forget to update DESIGN.md when establishing new rules). | PR template checkbox for "DESIGN.md updated if a new rule was established"; quarterly Anish review; Phase 1.1 CI warning if `src/app/` or `src/components/` changes without DESIGN.md touched. |
| 2 | docs-lint becomes a developer-friction-tax (false positives on legitimate quoted source). | AI-slop is WARN-only. British-English heuristic excludes code-comment context. Em-dash is the only zero-tolerance check; bypass via `--no-verify` is available in genuine emergencies and CI re-catches. |
| 3 | shadcn/ui Day 1 setup blows past 1.5 days (Tailwind plugin issues, Radix dep version conflicts). | Time-box to 2 days; if it slips past 2 days, escalate to custom-component fallback (~6-8 days but with no surprises). Decision point at end of Day 2. |
| 4 | Audit-route filtering becomes a performance bottleneck once auditLog grows past ~10k entries per file. | Phase 1 ships with cursor-based pagination (50 per page); reads the whole JSON file and filters in-memory. Phase 1.1 watch-item: if any single audit-aware JSON file passes 5 MB, plan a per-month rollover into `_audit/auditLog_YYYY-MM.json` files. |
| 5 | RUNBOOK.md becomes stale because incidents are fixed but not written up. | Anish writes a one-paragraph entry in RUNBOOK.md §5 for every prod incident, BEFORE closing the fix PR. Code review checks for the entry. Living-document discipline. |
| 6 | Self-maintainability matrix promises that don't materialize (UI exists but is hard to use). | Quarterly Anish review; for each Phase-1 self-serve operation, confirm Misba (or the relevant role) has used it at least once successfully. If not, the operation is *aspirationally* self-serve, not actually; downgrade to Anish-required and add a Phase 1.1 UX fix to the backlog. |

---

## Open items forward to Phase 1 implementation (Week 1)

- DESIGN.md initial commit from this review's Item 1 seed plan. Owner: Anish.
- `scripts/docs-lint.sh` plus simple-git-hooks wiring. Owner: Anish.
- shadcn/ui scaffold (Tailwind plugins, ~12 primitives copied, Ops-specific components stubbed). Owner: Anish.
- Route tree creation (~32 page routes + ~12 API routes scaffolded as empty-but-rendering). Owner: Anish.
- `/admin/audit` route built per Item 5. Owner: Anish.
- `docs/RUNBOOK.md` initial commit (sections 1-3 written, 4-7 outlined). Owner: Anish.
- `docs/DEVELOPER.md` initial commit (Item 7 written up). Owner: Anish.
- CLAUDE.md routing-tree append. Owner: Anish.
- Fixture data seeded under `src/data/_fixtures/`. Owner: Anish.
- `npm run seed:dev` script. Owner: Anish.

Phase 1 Week-1 scaffolding scope: all of the above plus the entity-types module per step 8 Q-I, plus one end-to-end smoke test that exercises the queue. Estimated 5-7 working days of focused Anish time.

## Open items for Anish outside the ceremony

- 1Password vault setup ("GSL Ops" vault) before the .env.local example is meaningful. Out-of-band; pre-launch dependency.
- Decide whether to use `ops.getsetlearn.info` subdomain (DNS work) or the default Vercel project URL for launch. Out of design-review scope per step 9.
- Confirm with Pratik (Sales Head) and Misba (Ops Head) that the audit-route role-permissions matrix matches what they expect to see vs not see. Pre-launch ask; can wait until credentials are distributed.

---

## Notable design tensions surfaced and resolved

1. **DESIGN.md vs Storybook vs Figma**: chose DESIGN.md because it is plain Markdown (CC-native), version-controlled, diff-readable, greppable. Storybook has a heavy toolchain; Figma has drift-from-code risk. Trade-off accepted: visual rendering of components is not in DESIGN.md; design review artefact carries that.
2. **simple-git-hooks vs Husky**: chose simple-git-hooks for Phase 1 lightness. Migration to Husky is a 30-minute swap if the check matrix grows.
3. **shadcn/ui vs HR-shared**: rejected HR-shared because of cross-repo coordination cost and Phase 2 multi-tenant decoupling. shadcn/ui's copy-paste-not-import-as-dep model avoids both problems.
4. **Audit route as the only per-user-attribution surface**: dashboard is anonymized-by-default per step 7 Fix 5; the admin audit route is the authoritative surface for per-user mapping. The split is preserved by server-side role-filtering at audit-route load time.
5. **Self-maintainability honest assessment**: 5 operations are Anish-required in Phase 1 with named effort estimates to flip them. The matrix does not promise more self-serve than the code actually delivers.
6. **CLAUDE.md vs DESIGN.md vs RUNBOOK.md vs plans/**: four different documents with four different jobs. Routing tree codifies which to consult when, so future CC sessions don't search every file.

---

## Summary for Anish

Nine items resolved.

1. **DESIGN.md as a discipline mechanism**: three-layer model (CSS-var code, prescriptive rules, enforcement). Anish owns the rules; whoever lands a UI PR keeps DESIGN.md current. Failure modes are mostly catchable; one soft mitigation for stale-DESIGN.md drift (PR-template checkbox), with a Phase 1.1 CI warning held in reserve.
2. **docs-lint pre-commit script**: three checks (em-dash zero, British English, AI-slop warning). simple-git-hooks tooling. Em-dash and British English fail; AI-slop warns. Same script in CI. Output is monospace and direct-voice; bypass available via `--no-verify` for emergencies, re-caught by CI.
3. **Component library**: shadcn/ui. ~1.5 days of Day 1 setup pays back across 5 surfaces and ~12 primitives plus ~10 Ops-specific components. WCAG 2.1 AA freebie via Radix. Phase 2 multi-tenant compatible via the CSS-variable theming layer.
4. **Page-level route structure**: ~32 page routes + ~12 API routes. Concrete tree under `src/app/`. Inheritance from MOU's flat-page pattern with deeper nesting under `/mous/[mouId]/*` for the 8 lifecycle stages. Five PUBLIC routes per D7. Three role-filtered surfaces (`/admin/*`, `/escalations/*`, `/dashboard`).
5. **Admin audit route layout**: filter rail (date range, entity chips, action chips, user select, search, quick-filter chips) plus results pane (50 per page, cursor-based, Export CSV). Role-based server-side filtering. Per-user attribution shown to Admin / Leadership / Ops Head; redacted for sales reps and ops staff. URL-shareable filter state.
6. **docs/RUNBOOK.md outline**: 8 sections. Pre-launch checklist, launch-day sequence, per-user Day-1 actions, cron monitoring expectations, failure modes and recovery, trigger response, Phase 1.1 escalation criteria, contacts. Phase 1 launch ships sections 1-3 written; 4-7 outlined and grow as incidents land. Living document, owned by Anish.
7. **Developer-first-run experience**: 6 commands from `git clone` to running dev server. ~45 minutes total. 5 secrets in `.env.local` (4 from 1Password, 1 from local file path). Fixture-based seed (no xlsx-read in dev). 8-test suite green within 5 seconds.
8. **Self-maintainability matrix**: 22 operations classified. ~14 Phase-1 self-serve, ~5 Phase-1 Anish-required, 3 never-self-serve (delete operations preserved for audit purity). Phase 1.1 roadmap to flip the high-leverage Anish-required operations: ~5-7 days of work.
9. **CLAUDE.md routing tree**: 11-row table mapping question types to first-document-to-consult. Plus a "plans are an archive" rule preventing implementation code from referencing decision documents directly.

**Net Phase 1 scaffolding scope** (post-ceremony): 5-7 working days of focused Anish time covering DESIGN.md seed, docs-lint, shadcn/ui scaffold, route tree, admin audit, RUNBOOK seed, DEVELOPER seed, CLAUDE.md update, fixtures, seed script, types module, and one end-to-end smoke test.

**Nothing expanded into Phase 2 territory.** All decisions hold the line on Phase 1 scope. Multi-tenant, programme-add-UI, template-upload-UI, drift-threshold-UI, trigger-threshold-UI, full per-tenant theming are all Phase 1.1 or Phase 2.

**Pending asks remain non-blocking.** Ameet on Item C (legacy import) does not change any review item. Shubhangi on Item F (GSTIN availability) does not change any review item.

**No D1-D8 reopened. No prior axis decisions revisited. No prior schemas reshaped.**

Step 10 complete. Ceremony closed. Phase 1 implementation begins.

---
