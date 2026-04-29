/*
 * Region taxonomy + super-region overlay (Phase X filters).
 *
 * The canonical school taxonomy is 3-value:
 *
 *     'East' | 'North' | 'South-West'
 *
 * sourced from the SPOC DB nomenclature ('South-West' is already a
 * pre-collapsed combined region, not separate 'South' + 'West'). The
 * Sales Pipeline form (createOpportunity.REGION_OPTIONS) extends to
 * 6 values for forward-looking pipeline data: schools scouted
 * pre-MOU may sit in regions where no MOUs yet exist:
 *
 *     'South-West' | 'East' | 'North' | 'Central' | 'West' | 'South'
 *
 * Super-region (Ameet's grouping): two coarse buckets across the
 * map. Members enumerate every primary value that belongs to the
 * bucket in EITHER taxonomy, so the same shortcut works on all
 * surfaces. Filter machinery (applyDimensionFilters) does
 * OR-within-dimension; primary values absent from a dataset are
 * silent no-ops.
 *
 *     NE  = North + East
 *     SW  = South-West + South + West
 *
 * 'Central' belongs to neither super-region (it's central by
 * definition); selecting either super-region excludes Central rows.
 */

export type SuperRegion = 'NE' | 'SW'

export const SUPER_REGION_MEMBERS: Record<SuperRegion, readonly string[]> = {
  NE: ['North', 'East'],
  SW: ['South-West', 'South', 'West'],
}

export const SUPER_REGIONS: ReadonlyArray<{ key: SuperRegion; label: string }> = [
  { key: 'NE', label: 'NE (North + East)' },
  { key: 'SW', label: 'SW (South-West + South + West)' },
]

export function regionsForSuperRegion(superRegion: SuperRegion): readonly string[] {
  return SUPER_REGION_MEMBERS[superRegion]
}

export function superRegionFor(region: string): SuperRegion | null {
  for (const sr of Object.keys(SUPER_REGION_MEMBERS) as SuperRegion[]) {
    if (SUPER_REGION_MEMBERS[sr].includes(region)) return sr
  }
  return null
}
