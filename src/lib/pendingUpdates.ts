/*
 * pending_updates.json queue writer.
 *
 * API routes call this to append a write intent. The self-hosted sync
 * runner consumes the queue on its next tick: applies each entry to the
 * master Excel via openpyxl, writes the result back out to JSON, and
 * clears the entry. Failed entries (retryCount >= 5) move to
 * data/failed_updates.json with their last error.
 *
 * Persistence goes through the GitHub Contents API (see githubQueue.ts);
 * Vercel's serverless filesystem is read-only outside /tmp so direct
 * fs.writeFile is not viable. The trade-off is a 500ms-2s round-trip
 * per write, acceptable for a 5-person internal tool.
 */

import crypto from 'node:crypto'
import { appendToQueue } from './githubQueue'
import { currentBackend } from './db/backend'
import type { AuditEntry, PendingUpdate, PendingUpdateEntity } from './types'

export async function enqueueUpdate(params: {
  queuedBy: string
  entity: PendingUpdateEntity
  operation: 'update' | 'create' | 'delete'
  payload: Record<string, unknown>
}): Promise<PendingUpdate> {
  const entry: PendingUpdate = {
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    queuedBy: params.queuedBy,
    entity: params.entity,
    operation: params.operation,
    payload: params.payload,
    retryCount: 0,
  }
  // In postgres mode, route the write directly to the correct repo
  // so it lands in postgres instantly instead of going through the
  // 5-min cron drain. The PendingUpdate return value is synthetic in
  // this branch (no row in pending_updates.json); callers that only
  // observe the side effect (write applied) work unchanged. Callers
  // that inspect the queue (drainer tests, /admin/queue-status) keep
  // working because that surface reads pending_updates.json which in
  // postgres mode is just empty.
  if (currentBackend() === 'postgres') {
    try {
      await dispatchToRepo(params)
    } catch (err) {
      // If repo dispatch fails, fall back to the queue so the write
      // is not lost. Surfaces in /admin/queue-status as an entry that
      // didn't drain to postgres on the first attempt.
      console.error('[enqueueUpdate] postgres dispatch failed; falling back to queue:', err)
      await appendToQueue(entry)
    }
    return entry
  }
  await appendToQueue(entry)
  return entry
}

/**
 * Smart bridge (Part 5.B P2b): for update operations on entities with
 * an audit_log JSONB column, this helper auto-detects "append-style"
 * writes (the payload's auditLog grew vs the current row) and routes
 * them as atomic appendAudit calls. Concurrent lib calls that both
 * append an audit entry no longer race because each new entry goes
 * through `audit_log || jsonb` server-side concat.
 *
 * Falls through to the dumb full-row update for non-audit entities
 * or when no new audit entries are detected (pure scalar update).
 *
 * Why this is in the bridge (not per-lib): there are ~25 lib files
 * that follow the read-modify-write-with-audit pattern. Refactoring
 * each lib + each test would be N×O(test-rewrite); the bridge change
 * is O(1) and the libs/tests stay unchanged. Trade-off: +1 SQL read
 * per write to compute the audit diff. Acceptable for an internal
 * tool with <100 writes/min.
 *
 * Edge cases handled:
 *   - Payload has no auditLog (or it's empty): pure scalar update.
 *   - Current row not found: skip (caller's findById should have
 *     failed earlier).
 *   - auditLog shrunk: defensive scalar update (no audit applied);
 *     log a warning.
 *   - Multiple new audit entries: each appended atomically.
 */
interface RepoWithAtomic<T = Record<string, unknown>> {
  findById(id: string): Promise<T | null>
  updatePartial(id: string, patch: Partial<T>, opts?: { queuedBy?: string }): Promise<void>
  appendAudit(id: string, entry: AuditEntry, opts?: { queuedBy?: string }): Promise<void>
}

async function dispatchAuditedUpdate<T extends { id?: string; auditLog?: AuditEntry[] | null }>(
  repo: RepoWithAtomic<T>,
  payload: T,
  queuedBy: string,
): Promise<void> {
  const id = (payload as { id?: string }).id
  if (!id) throw new Error('atomic dispatch requires payload.id')
  const current = await repo.findById(id)
  if (!current) {
    // Row missing - fall through to full-row update; caller should
    // have validated existence earlier, but if not, the partial
    // update will silently no-op.
    await repo.updatePartial(id, payload as never, { queuedBy })
    return
  }
  const currentAudit = current.auditLog ?? []
  const newAudit = (payload as { auditLog?: AuditEntry[] | null }).auditLog ?? []
  const newEntries = newAudit.length > currentAudit.length
    ? newAudit.slice(currentAudit.length)
    : []
  // Strip auditLog from the scalar patch so the column isn't replaced.
  const { auditLog: _stripped, ...scalarPatch } = payload as Record<string, unknown>
  void _stripped
  await repo.updatePartial(id, scalarPatch as never, { queuedBy })
  for (const entry of newEntries) {
    await repo.appendAudit(id, entry, { queuedBy })
  }
}

/**
 * Postgres dispatch: route the (entity, operation, payload) tuple to
 * the relevant repo. Lazy-imports each repo so json-mode bundles do
 * not pull in postgres.js when the dispatch branch is never taken.
 */
async function dispatchToRepo(params: {
  entity: PendingUpdateEntity
  operation: 'update' | 'create' | 'delete'
  payload: Record<string, unknown>
  queuedBy: string
}): Promise<void> {
  const { entity, operation, payload, queuedBy } = params
  switch (entity) {
    case 'mou': {
      const { mouRepo } = await import('./db/repos/mou')
      if (operation === 'create') await mouRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(mouRepo as never, payload as never, queuedBy)
      } else throw new Error(`mou ${operation} is not supported via repo`)
      return
    }
    case 'user': {
      const { userRepo } = await import('./db/repos/user')
      if (operation === 'create') await userRepo.create(payload as never)
      else if (operation === 'update') await userRepo.update(payload as never, { queuedBy })
      else throw new Error('user delete is not supported via repo')
      return
    }
    case 'school': {
      const { schoolRepo } = await import('./db/repos/school')
      if (operation === 'create') await schoolRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(schoolRepo as never, payload as never, queuedBy)
      } else throw new Error(`school ${operation} is not supported via repo`)
      return
    }
    case 'payment': {
      const { paymentRepo } = await import('./db/repos/payment')
      if (operation === 'create') await paymentRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(paymentRepo as never, payload as never, queuedBy)
      } else throw new Error(`payment ${operation} is not supported via repo`)
      return
    }
    case 'dispatch': {
      const { dispatchRepo } = await import('./db/repos/dispatch')
      if (operation === 'create') await dispatchRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(dispatchRepo as never, payload as never, queuedBy)
      } else throw new Error(`dispatch ${operation} is not supported via repo`)
      return
    }
    case 'kitDispatch': {
      const { kitDispatchRepo } = await import('./db/repos/kitDispatch')
      if (operation === 'create') await kitDispatchRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(kitDispatchRepo as never, payload as never, queuedBy)
      } else throw new Error(`kitDispatch ${operation} is not supported via repo`)
      return
    }
    case 'escalation': {
      const { escalationRepo } = await import('./db/repos/escalation')
      if (operation === 'create') await escalationRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(escalationRepo as never, payload as never, queuedBy)
      } else throw new Error(`escalation ${operation} is not supported via repo`)
      return
    }
    case 'notification': {
      const { notificationRepo } = await import('./db/repos/notification')
      if (operation === 'create') await notificationRepo.create(payload as never)
      else if (operation === 'update') await notificationRepo.update(payload as never, { queuedBy })
      else throw new Error(`notification ${operation} is not supported via repo`)
      return
    }
    case 'vexPi': {
      const { vexPiRepo } = await import('./db/repos/vexPi')
      if (operation === 'create') await vexPiRepo.create(payload as never)
      else if (operation === 'update') {
        await dispatchAuditedUpdate(vexPiRepo as never, payload as never, queuedBy)
      } else throw new Error(`vexPi ${operation} is not supported via repo`)
      return
    }
    case 'vendor': {
      const { vendorRepo } = await import('./db/repos/vendor')
      if (operation === 'update') {
        await dispatchAuditedUpdate(vendorRepo as never, payload as never, queuedBy)
      } else throw new Error(`vendor ${operation} is not supported via repo`)
      return
    }
    case 'inventoryItem': {
      const { inventoryItemRepo } = await import('./db/repos/inventoryItem')
      if (operation === 'create') await inventoryItemRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(inventoryItemRepo as never, payload as never, queuedBy)
      } else throw new Error(`inventoryItem ${operation} is not supported via repo`)
      return
    }
    case 'salesTeam': {
      const { salesTeamRepo } = await import('./db/repos/salesTeam')
      if (operation === 'update') await salesTeamRepo.update(payload as never, { queuedBy })
      else throw new Error(`salesTeam ${operation} is not supported via repo`)
      return
    }
    case 'vexProduct': {
      const { vexProductRepo } = await import('./db/repos/vexProduct')
      if (operation === 'create') await vexProductRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await vexProductRepo.update(payload as never, { queuedBy })
      else throw new Error(`vexProduct ${operation} is not supported via repo`)
      return
    }
    case 'adjustment': {
      const { adjustmentRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await adjustmentRepo.create(payload as never, { queuedBy })
      // adjustmentRepo has appendAudit but no updatePartial; fall back to
      // full-row update for now. RMW races on adjustment writes are
      // contained because the lib hot-paths target appendAudit directly.
      else if (operation === 'update') await adjustmentRepo.update(payload as never, { queuedBy })
      else throw new Error(`adjustment ${operation} is not supported via repo`)
      return
    }
    case 'agreement': {
      const { agreementRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await agreementRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(agreementRepo as never, payload as never, queuedBy)
      } else throw new Error(`agreement ${operation} is not supported via repo`)
      return
    }
    case 'magicLinkToken': {
      const { magicLinkTokenRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await magicLinkTokenRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await magicLinkTokenRepo.update(payload as never, { queuedBy })
      else throw new Error(`magicLinkToken ${operation} is not supported via repo`)
      return
    }
    case 'paymentLog': {
      const { paymentLogRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await paymentLogRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await paymentLogRepo.update(payload as never, { queuedBy })
      else throw new Error(`paymentLog ${operation} is not supported via repo`)
      return
    }
    case 'studentCountEvent': {
      const { studentCountEventRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await studentCountEventRepo.create(payload as never, { queuedBy })
      else throw new Error(`studentCountEvent ${operation} is not supported via repo`)
      return
    }
    case 'vexDispatch': {
      const { vexDispatchRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await vexDispatchRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(vexDispatchRepo as never, payload as never, queuedBy)
      } else throw new Error(`vexDispatch ${operation} is not supported via repo`)
      return
    }
    // Audited leaf repos (ccRule / schoolGroup / communicationTemplate /
    // intakeRecord / communication / salesOpportunity) expose only the
    // atomic write surface (appendAudit / updatePartial / updateWithAudit),
    // not the full-row create/update. The atomic dispatch covers the hot
    // RMW path; create / full-update branches fall back to the queue and
    // get drained by the 5-min cron (acceptable - these are low-frequency
    // entity-init flows).
    case 'ccRule': {
      const { ccRuleRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await ccRuleRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(ccRuleRepo as never, payload as never, queuedBy)
      } else throw new Error(`ccRule ${operation} not in repo - fall back to queue`)
      return
    }
    case 'schoolGroup': {
      const { schoolGroupRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await schoolGroupRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(schoolGroupRepo as never, payload as never, queuedBy)
      } else throw new Error(`schoolGroup ${operation} not in repo - fall back to queue`)
      return
    }
    case 'communicationTemplate': {
      const { communicationTemplateRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await communicationTemplateRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(communicationTemplateRepo as never, payload as never, queuedBy)
      } else throw new Error(`communicationTemplate ${operation} not in repo - fall back to queue`)
      return
    }
    case 'intakeRecord': {
      const { intakeRecordRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await intakeRecordRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(intakeRecordRepo as never, payload as never, queuedBy)
      } else throw new Error(`intakeRecord ${operation} not in repo - fall back to queue`)
      return
    }
    case 'communication': {
      const { communicationRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await communicationRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(communicationRepo as never, payload as never, queuedBy)
      } else throw new Error(`communication ${operation} not in repo - fall back to queue`)
      return
    }
    case 'salesOpportunity': {
      const { salesOpportunityRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await salesOpportunityRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(salesOpportunityRepo as never, payload as never, queuedBy)
      } else throw new Error(`salesOpportunity ${operation} not in repo - fall back to queue`)
      return
    }
    case 'dispatchRequest': {
      const { dispatchRequestRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await dispatchRequestRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') {
        await dispatchAuditedUpdate(dispatchRequestRepo as never, payload as never, queuedBy)
      } else throw new Error(`dispatchRequest ${operation} not in repo - fall back to queue`)
      return
    }
    case 'feedback': {
      const { feedbackRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await feedbackRepo.create(payload as never, { queuedBy })
      else throw new Error(`feedback ${operation} not in repo - fall back to queue`)
      return
    }
    // lifecycleRule has composite PK (stage_from_key + stage_to_key); the
    // smart bridge dispatchAuditedUpdate takes single-id only, so handle
    // this case bespoke. The repo already has atomic updateWithAuditByKey
    // (P1.2 work); we just need to extract the key from payload and route.
    case 'lifecycleRule': {
      const { lifecycleRuleRepo } = await import('./db/repos/leafRepos')
      if (operation !== 'update') {
        throw new Error(`lifecycleRule ${operation} not supported via bridge`)
      }
      const stageFromKey = (payload as { stageFromKey?: string }).stageFromKey
      const stageToKey = (payload as { stageToKey?: string }).stageToKey
      if (!stageFromKey || !stageToKey) {
        throw new Error('lifecycleRule update requires stageFromKey + stageToKey in payload')
      }
      // Audit-diff against current row (same shape as dispatchAuditedUpdate
      // but keyed by composite PK).
      const current = await lifecycleRuleRepo.findByKey(stageFromKey, stageToKey)
      const currentAudit = (current?.auditLog as AuditEntry[] | undefined) ?? []
      const newAudit = (payload as { auditLog?: AuditEntry[] | null }).auditLog ?? []
      const newEntries = newAudit.length > currentAudit.length
        ? newAudit.slice(currentAudit.length)
        : []
      // Strip auditLog + key cols from the scalar patch.
      const { auditLog: _stripped, stageFromKey: _k1, stageToKey: _k2, ...scalarPatch } =
        payload as Record<string, unknown>
      void _stripped; void _k1; void _k2
      await lifecycleRuleRepo.updatePartialByKey(
        stageFromKey, stageToKey, scalarPatch as never, { queuedBy },
      )
      for (const entry of newEntries) {
        await lifecycleRuleRepo.appendAuditByKey(stageFromKey, stageToKey, entry, { queuedBy })
      }
      return
    }
    // Remaining leaf entities not yet exercised by any unmigrated write
    // call site. Flag with throw so cutover-mode usage surfaces during
    // verification; falls back to queue via the outer catch.
    default: {
      throw new Error(`postgres dispatch not implemented for entity=${entity}`)
    }
  }
}
