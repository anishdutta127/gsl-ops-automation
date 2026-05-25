/*
 * Vendor repo (Phase 7). Vendor master for agreements.vendor_id FK.
 */

import type { Vendor, AuditEntry } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import vendorsJson from '@/data/vendors.json'

const jsonVendors = vendorsJson as unknown as Vendor[]

interface VendorRow {
  id: string
  name: string
  legal_entity: string | null
  category: string | null
  primary_contact: string | null
  primary_email: string | null
  primary_phone: string | null
  address: string | null
  pan: string | null
  gst_number: string | null
  bank_account: string | null
  ifsc: string | null
  notes: string | null
  active: boolean
  created_at: string
  audit_log: AuditEntry[]
}

function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' && v !== '' ? v : null
}

function rowToVendor(r: VendorRow): Vendor {
  return {
    id: r.id,
    name: r.name,
    legalEntity: r.legal_entity ?? undefined,
    category: (r.category ?? '') as Vendor['category'],
    primaryContact: r.primary_contact ?? undefined,
    primaryEmail: r.primary_email ?? undefined,
    primaryPhone: r.primary_phone ?? undefined,
    address: r.address ?? undefined,
    pan: r.pan ?? undefined,
    gstNumber: r.gst_number ?? undefined,
    bankAccount: r.bank_account ?? undefined,
    ifsc: r.ifsc ?? undefined,
    notes: r.notes ?? undefined,
    active: !!r.active,
    createdAt: dateStr(r.created_at) ?? new Date().toISOString(),
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  } as Vendor
}

export const vendorRepo = {
  async findAll(): Promise<Vendor[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VendorRow[]>`SELECT * FROM vendors ORDER BY id`
      return rows.map(rowToVendor)
    }
    return jsonVendors
  },

  async findById(id: string): Promise<Vendor | null> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VendorRow[]>`SELECT * FROM vendors WHERE id = ${id}`
      return rows[0] ? rowToVendor(rows[0]) : null
    }
    return jsonVendors.find((v) => v.id === id) ?? null
  },

  async findActive(): Promise<Vendor[]> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const rows = await sql<VendorRow[]>`SELECT * FROM vendors WHERE active = TRUE ORDER BY id`
      return rows.map(rowToVendor)
    }
    return jsonVendors.filter((v) => v.active)
  },

  async update(v: Vendor, opts?: { queuedBy?: string }): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vendors SET
          name = ${v.name},
          legal_entity = ${v.legalEntity ?? null},
          category = ${v.category ?? null},
          primary_contact = ${v.primaryContact ?? null},
          primary_email = ${v.primaryEmail ?? null},
          primary_phone = ${v.primaryPhone ?? null},
          address = ${v.address ?? null},
          pan = ${v.pan ?? null},
          gst_number = ${v.gstNumber ?? null},
          bank_account = ${v.bankAccount ?? null},
          ifsc = ${v.ifsc ?? null},
          notes = ${v.notes ?? null},
          active = ${!!v.active},
          audit_log = ${sql.json((v.auditLog ?? []) as never)}::jsonb
        WHERE id = ${v.id}
      `
      return
    }
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vendor',
      operation: 'update',
      payload: v as unknown as Record<string, unknown>,
    })
  },

  async appendAudit(id: string, entry: AuditEntry): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      await sql`
        UPDATE vendors SET audit_log = audit_log || ${sql.json([entry] as never)}::jsonb
        WHERE id = ${id}
      `
      return
    }
    const cur = jsonVendors.find((x) => x.id === id)
    if (!cur) return
    const updated: Vendor = { ...cur, auditLog: [...(cur.auditLog ?? []), entry] }
    await enqueueUpdate({
      queuedBy: 'system',
      entity: 'vendor',
      operation: 'update',
      payload: updated as unknown as Record<string, unknown>,
    })
  },

  async updatePartial(
    id: string,
    patch: Partial<Vendor>,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      const sql = getSql()
      const CAMEL_TO_SNAKE: Record<string, string> = {
        name: 'name', legalEntity: 'legal_entity', category: 'category',
        primaryContact: 'primary_contact', primaryEmail: 'primary_email',
        primaryPhone: 'primary_phone', address: 'address',
        pan: 'pan', gstNumber: 'gst_number',
        bankAccount: 'bank_account', ifsc: 'ifsc',
        notes: 'notes', active: 'active',
      }
      const setObj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'id' || k === 'auditLog') continue
        const col = CAMEL_TO_SNAKE[k]
        if (!col) continue
        setObj[col] = v ?? null
      }
      if (Object.keys(setObj).length === 0) return
      await sql`UPDATE vendors SET ${sql(setObj)} WHERE id = ${id}`
      return
    }
    const cur = jsonVendors.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vendor',
      operation: 'update',
      payload: { ...cur, ...patch } as unknown as Record<string, unknown>,
    })
  },

  async updateWithAudit(
    id: string,
    patch: Partial<Vendor>,
    audit: AuditEntry,
    opts?: { queuedBy?: string },
  ): Promise<void> {
    if (currentBackend() === 'postgres') {
      await this.updatePartial(id, patch, opts)
      await this.appendAudit(id, audit)
      return
    }
    const cur = jsonVendors.find((x) => x.id === id)
    if (!cur) return
    await enqueueUpdate({
      queuedBy: opts?.queuedBy ?? 'system',
      entity: 'vendor',
      operation: 'update',
      payload: {
        ...cur, ...patch,
        auditLog: [...(cur.auditLog ?? []), audit],
      } as unknown as Record<string, unknown>,
    })
  },
}
