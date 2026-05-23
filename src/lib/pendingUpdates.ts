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
import type { PendingUpdate, PendingUpdateEntity } from './types'

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
      if (operation === 'update') await mouRepo.update(payload as never, { queuedBy })
      else throw new Error(`mou ${operation} is not supported via repo`)
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
      if (operation === 'update') await schoolRepo.update(payload as never, { queuedBy })
      else throw new Error(`school ${operation} is not supported via repo`)
      return
    }
    case 'payment': {
      const { paymentRepo } = await import('./db/repos/payment')
      if (operation === 'update') await paymentRepo.update(payload as never, { queuedBy })
      else throw new Error(`payment ${operation} is not supported via repo`)
      return
    }
    case 'dispatch': {
      const { dispatchRepo } = await import('./db/repos/dispatch')
      if (operation === 'update') await dispatchRepo.update(payload as never, { queuedBy })
      else throw new Error(`dispatch ${operation} is not supported via repo`)
      return
    }
    case 'kitDispatch': {
      const { kitDispatchRepo } = await import('./db/repos/kitDispatch')
      if (operation === 'create') await kitDispatchRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await kitDispatchRepo.update(payload as never, { queuedBy })
      else throw new Error(`kitDispatch ${operation} is not supported via repo`)
      return
    }
    case 'escalation': {
      const { escalationRepo } = await import('./db/repos/escalation')
      if (operation === 'update') await escalationRepo.update(payload as never, { queuedBy })
      else throw new Error(`escalation ${operation} is not supported via repo`)
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
      else if (operation === 'update') await vexPiRepo.update(payload as never, { queuedBy })
      else throw new Error(`vexPi ${operation} is not supported via repo`)
      return
    }
    case 'vendor': {
      const { vendorRepo } = await import('./db/repos/vendor')
      if (operation === 'update') await vendorRepo.update(payload as never, { queuedBy })
      else throw new Error(`vendor ${operation} is not supported via repo`)
      return
    }
    case 'inventoryItem': {
      const { inventoryItemRepo } = await import('./db/repos/inventoryItem')
      if (operation === 'update') await inventoryItemRepo.update(payload as never, { queuedBy })
      else throw new Error(`inventoryItem ${operation} is not supported via repo`)
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
      if (operation === 'update') await vexProductRepo.update(payload as never, { queuedBy })
      else throw new Error(`vexProduct ${operation} is not supported via repo`)
      return
    }
    case 'adjustment': {
      const { adjustmentRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await adjustmentRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await adjustmentRepo.update(payload as never, { queuedBy })
      else throw new Error(`adjustment ${operation} is not supported via repo`)
      return
    }
    case 'agreement': {
      const { agreementRepo } = await import('./db/repos/leafRepos')
      if (operation === 'create') await agreementRepo.create(payload as never, { queuedBy })
      else if (operation === 'update') await agreementRepo.update(payload as never, { queuedBy })
      else throw new Error(`agreement ${operation} is not supported via repo`)
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
      else if (operation === 'update') await vexDispatchRepo.update(payload as never, { queuedBy })
      else throw new Error(`vexDispatch ${operation} is not supported via repo`)
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
