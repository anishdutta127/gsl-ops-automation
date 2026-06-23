/*
 * Sales team repo (Phase 7).
 *
 * Read-mostly. Sales reps are referenced by mous.salesPersonId,
 * intake_records.salesOwnerId, sales_opportunities.salesRepId,
 * payment_logs.salesPersonId, vex_orders.salesPersonId.
 *
 * Two reps (sp-brij-singh, sp-kranthi) have null email -- the
 * 002-fixups.sql migration relaxed the NOT NULL.
 *
 * ============================================================================
 * !!! CONDITIONALLY SAFE - NO ADMIN-EDIT FORM EXISTS !!!  (P3 trace 2026-05-24)
 * ============================================================================
 *
 * Sales reps are created via /admin/sales-team/new and `reassign` is a
 * per-MOU reassignment route, NOT a sales-team-row edit. There is NO
 * /admin/sales-team/[id]/edit page. The SalesPerson row is read-mostly
 * by design.
 *
 * That absence is the ONLY thing protecting the SalesPerson row from a
 * real concurrent-diff race. If a future dev adds a sales-team-edit
 * page (e.g., for region reassignment, email correction), two wildcard
 * admins could clobber each other silently.
 *
 * **Mandatory before adding any SalesPerson edit UI: adopt the OCC
 * pattern proven in src/lib/db/repos/vexProduct.ts (updateOCC):**
 *   1. Add `version INTEGER NOT NULL DEFAULT 1` to public.sales_team.
 *   2. Add `updateSalesPersonOCC(id, expectedVersion, patch, opts)`
 *      mirroring vexProductRepo.updateOCC.
 *   3. Wire the new admin form to pass `expectedVersion` and surface
 *      409 conflict with the reload prompt UX.
 *   4. Concurrency-prove: 10 parallel writers -> 1 winner + 9 clean 409s.
 *
 * This comment is intentionally loud. Do NOT silently add a sales-team
 * edit route without OCC. The cutover-ready gate report 2026-05-24
 * flags this as a known conditional-safety; future regressions are not
 * "discovered" - they are "reintroduced".
 */

import type { SalesPerson, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import salesTeamJson from '@/data/sales_team.json'

const jsonSalesTeam = salesTeamJson as unknown as SalesPerson[]

interface SalesTeamRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  territories: string[]
  programmes: string[]
  active: boolean
  joined_date: string | null
  audit_log: AuditEntry[]
}

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return typeof v === 'string' && v !== '' ? v : null
}

function rowToSalesPerson(r: SalesTeamRow): SalesPerson {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    phone: r.phone ?? undefined,
    territories: r.territories ?? [],
    programmes: (r.programmes ?? []) as SalesPerson['programmes'],
    active: !!r.active,
    joinedDate: dateStr(r.joined_date) ?? undefined,
  } as SalesPerson
}

export const salesTeamRepo = {
  async findAll(): Promise<SalesPerson[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SalesTeamRow[]>`SELECT * FROM sales_team ORDER BY id`
      return rows.map(rowToSalesPerson)
    }
    return jsonSalesTeam
  },

  async findById(id: string): Promise<SalesPerson | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SalesTeamRow[]>`SELECT * FROM sales_team WHERE id = ${id}`
      return rows[0] ? rowToSalesPerson(rows[0]) : null
    }
    return jsonSalesTeam.find((s) => s.id === id) ?? null
  },

  async findActive(): Promise<SalesPerson[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SalesTeamRow[]>`
        SELECT * FROM sales_team WHERE active = TRUE ORDER BY id
      `
      return rows.map(rowToSalesPerson)
    }
    return jsonSalesTeam.filter((s) => s.active)
  },

  // Sales reps are created via /admin/sales-team/new (createSalesPerson ->
  // enqueueUpdate create). Without a postgres create path the write threw in
  // dispatchToRepo and fell into the disabled dead-letter queue (silent loss).
  async create(rep: SalesPerson, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        INSERT INTO sales_team (id, name, email, phone, territories, programmes,
          active, joined_date)
        VALUES (
          ${rep.id}, ${rep.name},
          ${rep.email && rep.email !== '' ? rep.email : null},
          ${rep.phone ?? null},
          ${rep.territories ?? []}, ${rep.programmes ?? []},
          ${rep.active ?? true}, ${rep.joinedDate ?? null}
        )
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'salesTeam',
      operation: 'create',
      payload: rep as unknown as Record<string, unknown>,
    })
  },

  async update(rep: SalesPerson, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE sales_team SET
          name = ${rep.name},
          email = ${rep.email && rep.email !== '' ? rep.email : null},
          phone = ${rep.phone ?? null},
          territories = ${rep.territories ?? []},
          programmes = ${rep.programmes ?? []},
          active = ${!!rep.active},
          joined_date = ${rep.joinedDate ?? null}
        WHERE id = ${rep.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'salesTeam',
      operation: 'update',
      payload: rep as unknown as Record<string, unknown>,
    })
  },
}
