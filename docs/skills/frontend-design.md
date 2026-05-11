# Frontend design skill (referenced for Gate 3.5 Step 10)

Sourced from `anthropics/skills/skills/frontend-design/SKILL.md` (upstream public skill repo). Captured as a summary by WebFetch on 2026-05-11; the full verbatim text lives upstream. Mirror the principles below for Gate 3.5 Step 10 polish.

## Core purpose

The skill produces production-grade frontend interfaces with high design quality. Real working code paired with exceptional attention to aesthetic details. Avoid generic AI-generated aesthetics.

## Key design principles

1. **Strategic direction first.** Identify purpose. Pick a bold tonal direction (minimalist, maximalist, retro-futuristic, brutalist, etc.). Decide what makes the interface unforgettable BEFORE coding.

2. **Typography.** Choose fonts that are beautiful, unique, interesting. Not defaults. (For Ops: we live with Inter and the brand-navy palette today; the polish pass tightens hierarchy through weight + size, not new fonts.)

3. **Colour and theme.** Commit to cohesive palettes using CSS variables. (Ops has Tailwind tokens for brand-navy, brand-teal, signal-ok / attention / alert / neutral, muted, card, border, foreground. Use them; do not introduce raw hex.)

4. **Motion.** CSS animations and scroll-triggered effects when they reinforce the design.

5. **Composition.** Asymmetry, overlap, unexpected layouts where they fit. Symmetric grids are fine for dashboards; reach for asymmetry when it carries meaning.

6. **Details.** Atmospheric effects, contextual visual elements. Status icons, sparklines, the small things.

## What to avoid

- Overused typefaces, predictable colour schemes, standard layouts, cookie-cutter patterns that lack context-specific character.
- Cramped layouts that fight the design.
- Every section getting equal visual weight (kills hierarchy).
- More than one primary CTA per surface.
- "No data" empty states; write thoughtful empty states instead.

## Implementation approach

Match code complexity to aesthetic vision. Maximalist designs warrant elaborate implementations with extensive animations; refined designs demand restraint and precision in spacing and typography.

For Gate 3.5 Ops platform, the chosen direction is **refined operational density**: neutral grey dominant, department accents used as accents (left-border colour, badge, icon tint) not backgrounds, generous whitespace, status pills the only colourful chrome at rest. The Ameet "looks complex" reaction is the signal we are over-decorating; the polish pass reduces visual noise.

## Concrete application to Gate 3.5 Step 10

- Status pills: single design language. Pill shape (rounded-full), uppercase tracking-wide xs/sm, signal-ok / attention / alert tonality.
- Dashboard tiles: consistent height (no orphan tiles in a row), consistent border, light hover elevation.
- Tab indicators: same shape and active-state colour across school detail, MOU detail, escalation detail.
- Loading states: skeleton for content-shaped placeholders, spinner only for brief async operations.
- Spacing rhythm: 4 / 6 / 8 / 12 / 16 unit scale; consistent vertical gap between sections.
- Type hierarchy: brand-navy text-2xl bold for h1, text-base font-semibold brand-navy for h3, text-sm slate-700 for body, text-xs muted-foreground for metadata.
- Action prominence: one primary CTA per surface (filled brand-teal or brand-navy), secondary as outline, tertiary as plain text link.
- Empty states: every list view carries a thoughtful empty message via `EmptyState` component (already exists at `src/components/ops/EmptyState.tsx`).

## Upstream link

The full skill source at `anthropics/skills/skills/frontend-design/SKILL.md` is the canonical reference. This summary is for ambient context inside the Ops repo when working without internet access.
