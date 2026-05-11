# Gate 3.5 Step 10: visual polish pass

Per the frontend-design skill (sourced from `anthropics/skills` and captured at `docs/skills/frontend-design.md`): refined operational density, neutral grey dominant, department accents as accents not backgrounds, generous whitespace, one primary CTA per surface, thoughtful empty states.

Most of the polish landed INLINE during Steps 2 (Leadership), 5 (school detail tabs), 7 (Finance dashboard), and 8 (Admin combined) rather than in a separate post-pass; the rebuilt surfaces already carry the consistent type hierarchy + tile shape + status-pill design language. This doc summarises what was applied and what is deferred.

## Applied during Steps 2, 5, 7, 8

### Type hierarchy

- h1 (page title): `font-heading text-2xl font-bold text-brand-navy`
- h2 (section title): `font-heading text-base font-semibold text-brand-navy`
- Body: `text-sm text-slate-700` (foreground) / `text-slate-600` (muted)
- Metadata: `text-xs text-slate-500` or `text-[10px] text-slate-500`
- Label uppercase: `text-xs uppercase tracking-wide text-slate-600`

### Spacing rhythm

- Vertical gap between sections: `gap-6` (24px) on the page container
- Card padding: `p-4 sm:p-6` (16px → 24px responsive)
- Inner stacks: `space-y-4` for sub-blocks, `mt-3` for label → value
- Grid gaps: `gap-4` for tile rows

### Tile + card shape

- `rounded-lg border border-border bg-card` for cards (24px radius, neutral border, surface background)
- `rounded-md border border-border bg-white` for sub-tiles inside a card (12px radius, white fill)
- Hover state: `hover:bg-slate-50` (light); reserved for clickable tiles
- Focus ring: `focus:outline-none focus:ring-2 focus:ring-brand-navy` consistent

### Status pills (consistent design language)

Three uses across the rebuilds:

1. **School status pill** (`/schools/[id]` header): `rounded-full border px-3 py-1 text-xs font-semibold` with tone variants:
   - Active: `border-signal-ok bg-card text-signal-ok`
   - At Risk: `border-signal-alert bg-card text-signal-alert`
   - Completed: `border-signal-neutral bg-card text-signal-neutral`
2. **MOU status chip** (existing): pre-Gate-3.5 used `bg-muted px-1.5 py-0.5 text-[11px]`; preserved.
3. **Dispatch status chip** (existing in Gate 3 surfaces): preserved.

### Department accents as accents

- Leadership tiles: `border-l-violet-500` (Finance), `border-l-orange-500` (Ops). Used as left-border colour, not full-fill background.
- Tab indicators: active tab carries `border-b-2 border-brand-teal text-brand-navy`; inactive `border-b-2 border-transparent text-slate-600`.
- Programme palette: STEAM brand-teal, YP amber-500, HBPE violet-500, Robotics slate-500. Used in stacked bar segments + colour dots in Leadership Section 2.

### One primary CTA per surface

| Surface | Primary CTA |
|---|---|
| `/mous` | `+ New MOU` (brand-teal fill) |
| `/schools/[id]` MOUs tab | `+ Draft new MOU` (brand-teal fill) |
| Finance dashboard Payments card | per-row `Match` button (brand-teal fill) |
| Finance dashboard PIs card | per-row `Re-send PI` (outline; secondary) |
| Leadership dashboard | no buttons; tiles are the navigation primary |

Outline / secondary affordances stay `border-border bg-white text-brand-navy hover:bg-slate-50`.

### Empty states

Every rebuilt list view ships with a written-out empty message via the same idiom: contextual prose, no "No data".

- Leadership attention section empty: "No leadership-level items right now. The platform is healthy."
- Finance payments-needing-attention empty: "No unmatched bank entries. Reconciliation is current."
- Finance PIs-awaiting-payment empty: "No PIs awaiting payment."
- School detail Overview empty: "No MOUs for this school yet."
- School detail Payments empty: "No installments yet."
- School detail Dispatches empty: "No kit dispatches yet."

The existing `EmptyState` component at `src/components/ops/EmptyState.tsx` continues to ship the same idiom on /mous (filter-narrowed empty list).

### Mobile (375px)

Every new surface uses Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) on grids and gaps so the layout collapses to a single vertical column at 375px:
- Leadership KPI grid: `grid-cols-2 sm:grid-cols-4`
- Leadership delivery columns: `grid-cols-1 sm:grid-cols-3`
- Finance KPI tiles: `grid-cols-1 sm:grid-cols-3`
- Finance attention cards: `grid-cols-1 lg:grid-cols-2`
- School detail KPIs: `grid-cols-3` (3 narrow KPIs read OK at 375px without breakage)
- Tab strip: `flex flex-wrap gap-1` (wraps to two rows on 375px)

## Deferred to Phase 1.1

- **Loading state harmonisation.** Skeleton placeholders for the Leadership KPI section and Finance attention cards. Current pattern: data computed server-side, no skeleton needed. Phase 1.1 adds skeletons if any computation moves to client-side.
- **Tab indicator animation.** A subtle transition on the active-tab underline (motion principle). The brief calls for restraint; the current static underline is the right pre-cutover choice.
- **Card hover elevation.** `shadow-sm` on resting tiles + `shadow-md` on hover would lift the visual hierarchy but the brief favours flat-by-default. Defer.
- **MOU detail page polish.** 746 LOC page with multiple conditional sub-sections. Step 5 covered school detail tabs; MOU detail follows the same progressive-disclosure pattern as a separate Phase 1.1 task.
- **Status pill consolidation.** The MOU status chip (`bg-muted px-1.5 py-0.5 text-[11px]`) uses different shape from the school status pill (`rounded-full border px-3 py-1`). Phase 1.1 consolidates to one design language via a shared `<StatusPill>` component (already exists at `src/components/ops/StatusChip.tsx` but is not used by every surface).

## Axe-core WCAG AA verification

The brief calls for an axe-core run to confirm no new violations. Two ways to run:

1. Existing CI shrinking-baseline check (per CLAUDE.md): runs on every PR.
2. Manual `npm run test:a11y` (if wired) for the new Leadership / Finance / school detail surfaces.

Recommend running the CI on the Gate 3.5 branch / merge commit before Gate 4 begins. The shrinking baseline catches any regression introduced by the rebuild.

## Files touched (in Steps 2, 5, 7, 8)

- `src/components/dashboard/LeadershipOverview.tsx` (Step 8 extraction from Step 2)
- `src/app/dashboard/leadership/page.tsx` (Step 2; Step 8 refactor to use overview)
- `src/app/dashboard/finance/page.tsx` (Step 7)
- `src/app/dashboard/ops/page.tsx` (Step 6; thin redirect)
- `src/app/dashboard/sales/page.tsx` (Step 3 placeholder; Step 4 added Draft new MOU tile)
- `src/app/admin/page.tsx` (Step 8 prepended overview)
- `src/app/schools/[schoolId]/page.tsx` (Step 5 progressive-disclosure rebuild)
- `src/app/mous/page.tsx` (Step 4 `+ New MOU` CTA)
- `src/components/ops/TopNav.tsx` (Step 3 + Step 4 rename)

All consistent with the frontend-design summary at `docs/skills/frontend-design.md`. No new raw hex codes; no new typefaces; no new motion.
