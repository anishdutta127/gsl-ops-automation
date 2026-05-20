/*
 * Phase 6C: resolve Series B PI entity attribution.
 *
 * Series B is the historic FY 25-26 PI numbers from the Pratik Excel
 * import that carry the no-entity-prefix shape: MTPL/25-26/<seq>. They
 * sit on YP MOUs in payments.json. The Phase 6B defensive double-seed
 * (both MH and UP at next=27) hedged against ambiguity in the source
 * data; this resolver runs the actual lookup:
 *
 *   payment.mouId -> MOU (or orphan-MOU programme inference from id) ->
 *   programmeRouting -> definitive entity.
 *
 * For each Series B PI, the resolver collects (entity, seq) pairs and
 * returns max(seq)+1 per entity. Entities with no Series B rows seed
 * at next=1 (clean slate; the FY 25-26 stream simply does not have any
 * issued PIs under that entity yet).
 *
 * Discipline: pure function, deterministic. No IO. Tests mock the
 * programmeRouting and inputs.
 */

import type { MOU, Payment } from '@/lib/types'

export type EntityKey = 'MH' | 'UP'

export interface ResolveSeriesBArgs {
  payments: Payment[]
  mous: MOU[]
  /** company.json programmeRouting block. */
  programmeRouting: Record<string, EntityKey>
}

export interface ResolvedSeed {
  MH: { next: number }
  UP: { next: number }
  /** Trace for the audit log: which seq landed on which entity. */
  resolutions: Array<{
    piNumber: string
    seq: number
    paymentId: string
    mouId: string
    schoolName: string | null
    resolvedEntity: EntityKey | null
    reason: string
  }>
}

const SERIES_B_PATTERN = /^MTPL\/25-26\/(\d+)/

const MOU_ID_PROGRAMME_PREFIX: Record<string, string> = {
  STEAM: 'STEAM',
  YP: 'Young Pioneers',
  HBPE: 'Harvard HBPE',
  ROB: 'Robotics',
}

export function resolveSeriesBSeed(args: ResolveSeriesBArgs): ResolvedSeed {
  const { payments, mous, programmeRouting } = args
  const mouById = new Map(mous.map((m) => [m.id, m]))
  const maxByEntity: Record<EntityKey, number> = { MH: 0, UP: 0 }
  const resolutions: ResolvedSeed['resolutions'] = []

  for (const p of payments) {
    if (!p.piNumber) continue
    const match = p.piNumber.match(SERIES_B_PATTERN)
    if (!match) continue
    const seq = Number(match[1])
    if (!Number.isFinite(seq)) continue
    const mou = mouById.get(p.mouId)
    let resolvedEntity: EntityKey | null = null
    let reason: string
    if (mou) {
      const entity = programmeRouting[mou.programme]
      resolvedEntity = entity ?? null
      reason = `mou.programme=${mou.programme}`
    } else {
      const prefix = p.mouId.match(/^MOU-([A-Z]+)-/)
      const programmeFromId = prefix
        ? MOU_ID_PROGRAMME_PREFIX[prefix[1] ?? '']
        : undefined
      const entity = programmeFromId
        ? programmeRouting[programmeFromId]
        : undefined
      resolvedEntity = entity ?? null
      reason = `orphan MOU; inferred programme from id prefix = ${programmeFromId ?? '(unknown)'}`
    }
    resolutions.push({
      piNumber: p.piNumber,
      seq,
      paymentId: p.id,
      mouId: p.mouId,
      schoolName: p.schoolName ?? null,
      resolvedEntity,
      reason,
    })
    if (resolvedEntity !== null) {
      if (seq > maxByEntity[resolvedEntity]) {
        maxByEntity[resolvedEntity] = seq
      }
    }
  }

  return {
    MH: { next: maxByEntity.MH + 1 },
    UP: { next: maxByEntity.UP + 1 },
    resolutions,
  }
}
