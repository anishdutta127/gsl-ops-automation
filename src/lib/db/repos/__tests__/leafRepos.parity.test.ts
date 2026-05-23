/**
 * @vitest-environment node
 */

/*
 * Read-parity for all 24 leaf entities (Phase 7 Part 4).
 *
 * For each entity: assert findAll() returns the same logical row set
 * across json + postgres modes. ID comparison only; field-level
 * parity is not asserted for leaf entities (call sites consume them
 * row-by-row and field-by-field; per-field divergence shows up at
 * call-site migration time, not here).
 *
 * Documented json-only / postgres-only divergences are listed in
 * docs/PHASE_7_MIGRATION_PLAN.md §parity-divergences.
 */

import { describe, it, expect } from 'vitest'
import { hasPostgres, withBackend } from '../../__test__/parity'
import {
  adjustmentRepo,
  agreementRepo,
  ccRuleRepo,
  chainDismissalRepo,
  communicationRepo,
  communicationTemplateRepo,
  dispatchRequestRepo,
  feedbackRepo,
  homepageActionLogRepo,
  intakeRecordRepo,
  lifecycleRuleRepo,
  magicLinkTokenRepo,
  mouImportReviewRepo,
  paymentLogRepo,
  reminderThresholdRepo,
  salesOpportunityRepo,
  schoolGroupRepo,
  schoolSpocRepo,
  signedValueRepo,
  stageResponsibilityRepo,
  studentCountEventRepo,
  syncHealthRepo,
  vexDispatchRepo,
  vexOrderRepo,
} from '../leafRepos'

const desc = hasPostgres() ? describe : describe.skip

// ---------------------------------------------------------------------------
// Helper: assert json and postgres return the same row count (or same key set).
// Some entities have empty json + empty postgres (parity-trivially).
// ---------------------------------------------------------------------------

interface ParityCheck {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: { findAll(): Promise<any[]> }
  /** column used as the comparison key. Defaults to 'id'. */
  keyCol?: string
  /** Documented json-only keys (postgres-side skip). */
  jsonOnly?: string[]
  /** Documented postgres-only keys (json-side gap). */
  postgresOnly?: string[]
}

// ---------------------------------------------------------------------------
// Documented divergences. These are NOT bugs:
//   - sync_health is append-only at runtime; json picks up new rows
//     after every cron sync, postgres is the snapshot from initial seed.
//     The runtime-only entry is allow-listed dynamically (any entry
//     timestamped after the seed cutoff).
//   - dispatch_requests, communications, magic_link_tokens, feedback,
//     signed_values: demo / archive entries that reference the
//     not-seeded demo MOU / school set. Same root cause as the
//     escalation demo orphans and dispatch demo orphans documented
//     elsewhere.
// ---------------------------------------------------------------------------

const CHECKS: ParityCheck[] = [
  { name: 'communicationTemplate', repo: communicationTemplateRepo },
  { name: 'ccRule', repo: ccRuleRepo },
  { name: 'schoolGroup', repo: schoolGroupRepo },
  { name: 'schoolSpoc', repo: schoolSpocRepo },
  { name: 'studentCountEvent', repo: studentCountEventRepo },
  { name: 'paymentLog', repo: paymentLogRepo },
  { name: 'adjustment', repo: adjustmentRepo },
  {
    name: 'dispatchRequest',
    repo: dispatchRequestRepo,
    jsonOnly: ['DR-MOU-STEAM-2627-001-i1-20260427100000', 'DR-MOU-STEAM-2627-009-i1-20260426093000'],
  },
  { name: 'intakeRecord', repo: intakeRecordRepo },
  {
    name: 'communication',
    repo: communicationRepo,
    jsonOnly: [
      'COM-WLC-001','COM-T30-001','COM-T14-001','COM-T7-001','COM-ACR-001',
      'COM-PIS-001','COM-PRC-001','COM-DSR-001','COM-DAR-001','COM-FBR-001',
      'COM-CLT-001','COM-WAD-001','COM-WAD-002','COM-BNC-001',
    ],
  },
  { name: 'magicLinkToken', repo: magicLinkTokenRepo, jsonOnly: ['MLT-FB-001', 'MLT-SV-001'] },
  {
    name: 'feedback',
    repo: feedbackRepo,
    jsonOnly: ['FBK-001', 'FBK-002', 'FBK-004', 'FBK-005', 'FBK-006', 'FBK-007'],
  },
  { name: 'vexDispatch', repo: vexDispatchRepo },
  { name: 'vexOrder', repo: vexOrderRepo },
  { name: 'agreement', repo: agreementRepo },
  { name: 'salesOpportunity', repo: salesOpportunityRepo },
  { name: 'homepageActionLog', repo: homepageActionLogRepo },
  { name: 'mouImportReview', repo: mouImportReviewRepo, keyCol: 'queuedAt' },
  // sync_health: append-only timestamped log. Both backends drift
  // independently (json gets new rows from the cron drainer; postgres
  // would once call-site migration happens). Not parity-checkable by
  // ID. Asserted separately below: both backends are reachable and
  // return arrays.
  { name: 'stageResponsibility', repo: stageResponsibilityRepo, keyCol: 'stage' },
  { name: 'signedValue', repo: signedValueRepo, keyCol: 'mouId', jsonOnly: ['MOU-YP-2627-DRAFT-003'] },
  { name: 'reminderThreshold', repo: reminderThresholdRepo, keyCol: 'kind' },
  // chainDismissal: shape-divergent. Json has dismissedSchoolIds=[]; postgres
  // is per-row. With both empty, the parity check is trivially satisfied.
  { name: 'chainDismissal', repo: chainDismissalRepo, keyCol: 'schoolId' },
  // lifecycleRule: composite key (stageFromKey + stageToKey). Use a synthetic
  // join for parity.
  {
    name: 'lifecycleRule',
    repo: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findAll: async (): Promise<any[]> => {
        const rows = await lifecycleRuleRepo.findAll()
        return rows.map((r) => ({ key: `${r.stageFromKey}::${r.stageToKey}` }))
      },
    },
    keyCol: 'key',
  },
]

desc('leafRepos read-parity (Phase 7 Part 4)', () => {
  it('syncHealth: both backends reachable and return arrays (timestamps drift independently)', async () => {
    const j = await withBackend('json', () => syncHealthRepo.findAll())
    const p = await withBackend('postgres', () => syncHealthRepo.findAll())
    expect(Array.isArray(j)).toBe(true)
    expect(Array.isArray(p)).toBe(true)
    expect(j.length).toBeGreaterThan(0)
    expect(p.length).toBeGreaterThan(0)
  }, 30_000)

  for (const c of CHECKS) {
    it(`${c.name}: json + postgres key sets agree (modulo documented divergences)`, async () => {
      const keyCol = c.keyCol ?? 'id'
      const j = await withBackend('json', () => c.repo.findAll())
      const p = await withBackend('postgres', () => c.repo.findAll())
      const jKeys = new Set(j.map((r) => r[keyCol]))
      const pKeys = new Set(p.map((r) => r[keyCol]))
      const jOnly = [...jKeys].filter((k) => !pKeys.has(k)).sort()
      const pOnly = [...pKeys].filter((k) => !jKeys.has(k)).sort()
      const allowedJsonOnly = (c.jsonOnly ?? []).slice().sort()
      const allowedPostgresOnly = (c.postgresOnly ?? []).slice().sort()
      expect(jOnly, `${c.name} json-only divergence (un-allow-listed)`).toEqual(allowedJsonOnly)
      expect(pOnly, `${c.name} postgres-only divergence (un-allow-listed)`).toEqual(allowedPostgresOnly)
    }, 30_000)
  }
})
