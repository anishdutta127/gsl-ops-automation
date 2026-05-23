/*
 * Sales team repo (Phase 7).
 *
 * Read-mostly. Sales reps are referenced by mous.salesPersonId,
 * intake_records.salesOwnerId, sales_opportunities.salesRepId,
 * payment_logs.salesPersonId, vex_orders.salesPersonId.
 *
 * Two reps (sp-brij-singh, sp-kranthi) have null email -- the
 * 002-fixups.sql migration relaxed the NOT NULL.
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

function rowToSalesPerson(r: SalesTeamRow): SalesPerson {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? '',
    phone: r.phone ?? undefined,
    territories: r.territories ?? [],
    programmes: (r.programmes ?? []) as SalesPerson['programmes'],
    active: !!r.active,
    joinedDate: r.joined_date ?? undefined,
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

  async update(rep: SalesPerson): Promise<void> {
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
      queuedBy: 'system',
      entity: 'salesTeam',
      operation: 'update',
      payload: rep as unknown as Record<string, unknown>,
    })
  },
}
