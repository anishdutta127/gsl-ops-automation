/**
 * @vitest-environment node
 *
 * Contract guard for the smart-bridge atomic-update path.
 *
 * Every entity whose `update` operation is routed through
 * dispatchAuditedUpdate() in src/lib/pendingUpdates.ts MUST expose the
 * RepoWithAtomic surface (findById + updatePartial + appendAudit). If it
 * does not, the bridge throws `repo.updatePartial is not a function` at
 * runtime in postgres mode.
 *
 * This was missed for vexPiRepo: the dispatch -> Delivered PI roll-up
 * (Pass 3) is the first caller of enqueueUpdate({ entity: 'vexPi',
 * operation: 'update' }), and it 500'd in prod because vexPiRepo had no
 * updatePartial. Route unit tests mock enqueueUpdate, so only an E2E walk
 * (or this contract test) catches it. (gate-pass3-delivery, 2026-06-28.)
 *
 * Keep ATOMIC_UPDATE_REPOS in sync with the dispatchAuditedUpdate(...) call
 * sites in pendingUpdates.ts when a new entity is wired.
 */
import { describe, expect, it } from 'vitest'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { paymentRepo } from '@/lib/db/repos/payment'
import { dispatchRepo } from '@/lib/db/repos/dispatch'
import { kitDispatchRepo } from '@/lib/db/repos/kitDispatch'
import { escalationRepo } from '@/lib/db/repos/escalation'
import { vexPiRepo } from '@/lib/db/repos/vexPi'
import { vendorRepo } from '@/lib/db/repos/vendor'
import { inventoryItemRepo } from '@/lib/db/repos/inventoryItem'
import {
  agreementRepo,
  vexDispatchRepo,
  ccRuleRepo,
  schoolGroupRepo,
  communicationTemplateRepo,
  intakeRecordRepo,
  communicationRepo,
  salesOpportunityRepo,
  dispatchRequestRepo,
} from '@/lib/db/repos/leafRepos'

const ATOMIC_UPDATE_REPOS: Record<string, unknown> = {
  mouRepo,
  schoolRepo,
  paymentRepo,
  dispatchRepo,
  kitDispatchRepo,
  escalationRepo,
  vexPiRepo,
  vendorRepo,
  inventoryItemRepo,
  agreementRepo,
  vexDispatchRepo,
  ccRuleRepo,
  schoolGroupRepo,
  communicationTemplateRepo,
  intakeRecordRepo,
  communicationRepo,
  salesOpportunityRepo,
  dispatchRequestRepo,
}

describe('dispatchAuditedUpdate repo contract (RepoWithAtomic)', () => {
  for (const [name, repo] of Object.entries(ATOMIC_UPDATE_REPOS)) {
    it(`${name} exposes findById + updatePartial + appendAudit`, () => {
      const r = repo as Record<string, unknown>
      expect(typeof r.findById, `${name}.findById must be a function`).toBe('function')
      expect(typeof r.updatePartial, `${name}.updatePartial must be a function`).toBe('function')
      expect(typeof r.appendAudit, `${name}.appendAudit must be a function`).toBe('function')
    })
  }
})
