# Backlog

Phase 1.1+ items deferred from Phase 1. Each entry names the trigger
that should pull it onto the active plan.

## Stage-scoped side navigation (Gate 5 polish)

- **Stage-scoped side rail.** The Gate 1 brief calls for a side nav
  within each top-level stage (e.g., inside Operations: Schools /
  Escalations / VEX / Vendors / Inventory; inside Pipeline: Drafts /
  Sent / Awaiting Signature / Signed). Gate 1 Step 3 ships card-list
  index stub pages at `/dispatch`, `/finance`, `/operations`,
  `/reports` instead, because the entity routes those side rails
  would point at are still scattered across the existing app shape
  and Gates 2-4 will migrate the canonical entities into the new
  stage routes. Building the side rail before that migration means
  rebuilding it after each gate as routes shift.
  Trigger: after Gate 4 ships (Status Tracker + Notifications +
  Audit + Workflow handoff), before Gate 5 polish. At that point
  every entity has a stable stage home and the side rail can be
  built once against the final route shape.

## Filters (Phase X)

- **Sales Channel filter dimension.** Deferred pending the MOU phase 3a
  sales-channel field landing. Today MOU records do not carry a
  channel attribute (school programmes vs bootcamps vs partnerships
  vs others); without source data on every row, the chip set would
  always evaluate to "match all" or "match none". Trigger: when
  `MOU.salesChannel` (or equivalent) lands as a typed enum on every
  active-cohort record, add it as a fifth dimension on the kanban,
  /mous, and /sales-pipeline FilterRails.

- **Stage filter dimension on the kanban.** Deferred indefinitely:
  the kanban column IS the stage, so a stage filter would either
  hide entire columns (confusing) or duplicate the column-level
  scrolling that already exists. The /mous list page already
  supports `?stage=<key>` deep-links from the column headers for
  the all-MOUs-at-this-stage view. Trigger: only revisit if
  operators ask for a multi-stage subset view that the column +
  list-deeplink combination cannot already serve.

- **Notion-style chip+dropdown multi-select UI.** v2 alternative
  to today's chip-toggle FilterRail. Today's pattern is one click
  per value, with every selection visible inline; Notion's
  pattern is chip → dropdown → checkboxes → Apply, which trades
  more clicks for compactness. Trigger: when any dimension grows
  past ~12 chip options or operators report the chip rail feels
  cluttered under real use, evaluate migration. The Region,
  Programme, Sales Rep, and Status dimensions are well within the
  chip-toggle sweet spot today.

- **Sales Pipeline owner select unification.** The /sales-pipeline
  page keeps its existing Owner select (mine / all / sp-XXX) outside
  FilterRail because it carries a SalesRep "mine" default scope
  semantic: empty filter = own opps only, `?owner=all` opt-out
  expands to the team. Trigger: when the "mine" default is no
  longer the dominant SalesRep workflow, fold the salesRep dimension
  into FilterRail with a multi-select chip set and drop the legacy
  owner param. Existing tests for `?owner=mine|all|sp-X` would need
  updating in the same migration.

- **Inventory + Notifications filter unification.** Inventory
  (/admin/inventory) and Notifications (/notifications) skipped the
  Phase X Region/Programme/Sales Rep/Status dimension set per the
  "skip silently; don't show filters that would not do anything"
  rule: SKU rows have no school / region / programme / sales-rep
  attribute, and notification rows are scoped per-user with kind as
  the only meaningful filter. Trigger: if either page grows
  cross-cutting attributes (e.g., notification → MOU → school region
  cascade for an Ops dashboard), revisit and add the matching
  FilterRail dimensions.

- **City → region inference helper.** Originally proposed for a
  one-time backfill plus a default suggestion in school create /
  edit forms. Backfill skipped because school.region is already
  populated from SPOC source. Trigger: when a school create form
  lands and operators want a city-typed-first → region-defaulted
  flow, port the major-metro mapping from the original Phase X
  brief into `src/lib/regions.ts` as `inferRegionFromCity(city)` and
  wire to the form's onChange.
