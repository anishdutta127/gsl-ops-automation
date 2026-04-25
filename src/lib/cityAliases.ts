/*
 * Shared city alias map.
 *
 * Source-data drift between SPOC-DB rule text, MOU records, and
 * school-record canonical names is handled by mapping each legacy
 * form to the canonical (lowercased) city name. New aliases are
 * added on observation, never silently. DESIGN.md "Known data
 * normalisations" is the authoritative documentation pointer.
 *
 * Two consumers:
 *   - src/lib/ccResolver.ts (sub-region scope matching)
 *   - src/lib/importer/schoolMatcher.ts (incoming MOU vs Ops school
 *     identity tuple)
 *
 * Single source of truth lives here; the alias map is not duplicated
 * across consumers. To add a new alias, edit CITY_ALIASES below and
 * write a regression test in the consumer that needed it.
 */

export const CITY_ALIASES: Readonly<Record<string, string>> = {
  bengaluru: 'bangalore',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
}

export function normaliseCity(city: string): string {
  const lower = city.toLowerCase().trim()
  return CITY_ALIASES[lower] ?? lower
}
