/*
 * School repo (Phase 7).
 *
 * Read/write surface for the `schools` entity behind the DATA_BACKEND
 * flag. Most-referenced master in the app (mous, dispatches, kit_dispatches,
 * communications, escalations, feedback, school_spocs all FK here).
 *
 * Audit log is on the school row (JSONB column on postgres side).
 */

import type { School, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import schoolsJson from '@/data/schools.json'

const jsonSchools = schoolsJson as unknown as School[]

interface SchoolRow {
  id: string
  name: string
  legal_entity: string | null
  city: string | null
  state: string | null
  region: string | null
  pin_code: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  billing_name: string | null
  pan: string | null
  gst_number: string | null
  notes: string | null
  active: boolean
  audit_log: AuditEntry[]
  created_at: string
}

function rowToSchool(r: SchoolRow): School {
  return {
    id: r.id,
    name: r.name,
    legalEntity: r.legal_entity ?? undefined,
    city: r.city ?? '',
    state: r.state ?? '',
    region: r.region as School['region'],
    pinCode: r.pin_code ?? undefined,
    contactPerson: r.contact_person ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone ?? undefined,
    billingName: r.billing_name ?? undefined,
    pan: r.pan ?? undefined,
    gstNumber: r.gst_number ?? null,
    notes: r.notes ?? undefined,
    active: !!r.active,
    createdAt: r.created_at,
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as School
}

export const schoolRepo = {
  async findAll(): Promise<School[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SchoolRow[]>`SELECT * FROM schools ORDER BY id`
      return rows.map(rowToSchool)
    }
    return jsonSchools
  },

  async findById(id: string): Promise<School | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SchoolRow[]>`SELECT * FROM schools WHERE id = ${id}`
      return rows[0] ? rowToSchool(rows[0]) : null
    }
    return jsonSchools.find((s) => s.id === id) ?? null
  },

  async findByRegion(region: string): Promise<School[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<SchoolRow[]>`
        SELECT * FROM schools WHERE region = ${region} AND active = TRUE ORDER BY id
      `
      return rows.map(rowToSchool)
    }
    return jsonSchools.filter((s) => s.region === region && s.active)
  },

  async update(school: School, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE schools SET
          name = ${school.name},
          legal_entity = ${school.legalEntity ?? null},
          city = ${school.city ?? null},
          state = ${school.state ?? null},
          region = ${school.region ?? null},
          pin_code = ${school.pinCode ?? null},
          contact_person = ${school.contactPerson ?? null},
          email = ${school.email ?? null},
          phone = ${school.phone ?? null},
          billing_name = ${school.billingName ?? null},
          pan = ${school.pan ?? null},
          gst_number = ${school.gstNumber ?? null},
          notes = ${school.notes ?? null},
          active = ${!!school.active},
          audit_log = ${sql.json((school.auditLog ?? []) as never)}::jsonb
        WHERE id = ${school.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'school',
      operation: 'update',
      payload: school as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE schools
        SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const s = jsonSchools.find((x) => x.id === id)
    if (!s) return
    const updated: School = { ...s, auditLog: [...(s.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'school',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },
}
