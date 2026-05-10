/*
 * VEX order import + school-name normalisation.
 */

import type { School, VexOrder } from './types'

/**
 * Minimal CSV parser that handles quoted fields with embedded commas and
 * double-quote escapes. Good enough for Tally exports; swap for a real
 * library if we hit exotic edge cases.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        current.push(field)
        field = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++
        current.push(field)
        rows.push(current)
        current = []
        field = ''
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  // Drop trailing empty row
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) {
    rows.pop()
  }
  return rows
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Best-effort fuzzy match of a raw Tally school name against the schools
 * roster. Returns the top candidate with a confidence score (0-1) or null
 * when nothing scores above 0.3.
 */
export function matchSchool(
  raw: string,
  schools: School[],
): { school: School; confidence: number } | null {
  const rawSlug = slugify(raw)
  if (!rawSlug) return null
  let best: { school: School; confidence: number } | null = null
  for (const s of schools) {
    const candidates = [s.name, s.legalEntity, s.billingName].filter(
      (x): x is string => typeof x === 'string',
    )
    for (const cand of candidates) {
      const candSlug = slugify(cand)
      if (!candSlug) continue
      let score = 0
      if (candSlug === rawSlug) score = 1
      else if (candSlug.includes(rawSlug) || rawSlug.includes(candSlug)) score = 0.85
      else {
        // Token overlap
        const rawTokens = new Set(rawSlug.split(' '))
        const candTokens = new Set(candSlug.split(' '))
        const shared = Array.from(rawTokens).filter((t) => candTokens.has(t) && t.length > 2).length
        score = shared / Math.max(rawTokens.size, candTokens.size, 1)
      }
      if (score > (best?.confidence ?? 0)) {
        best = { school: s, confidence: score }
      }
    }
  }
  if (best && best.confidence >= 0.3) return best
  return null
}

export interface VexCsvRow {
  orderDate: string
  schoolName: string
  voucherNumber: string
  productName: string
  quantity: number
  ratePerUnit: number
  amount: number
  igst: number
  cgst: number
  sgst: number
  total: number
  paymentReceived: boolean
  dispatchStatus: VexOrder['dispatchStatus']
}

/**
 * Given parsed CSV rows (first row = header), produce VexCsvRow draft
 * records. Unknown columns are tolerated. Tally Prime default export
 * columns: Date, Voucher No, Party Ledger, Item Name, Qty, Rate, Amount.
 */
export function mapCsvToDraftRows(rows: string[][]): VexCsvRow[] {
  if (rows.length < 2) return []
  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const col = (names: string[]): number => {
    for (const n of names) {
      const idx = header.indexOf(n.toLowerCase())
      if (idx >= 0) return idx
    }
    return -1
  }
  const iDate = col(['date', 'order date', 'invoice date'])
  const iParty = col(['party ledger', 'party name', 'school', 'school name'])
  const iVoucher = col(['voucher no', 'voucher number', 'invoice no'])
  const iItem = col(['item name', 'product', 'product name'])
  const iQty = col(['qty', 'quantity'])
  const iRate = col(['rate', 'rate per unit', 'price'])
  const iAmount = col(['amount', 'sub total', 'subtotal'])
  const iIgst = col(['igst', 'integrated gst'])
  const iCgst = col(['cgst', 'central gst'])
  const iSgst = col(['sgst', 'state gst'])
  const iTotal = col(['total', 'net amount', 'grand total'])
  const iPaid = col(['paid', 'payment received'])
  const iStatus = col(['dispatch status', 'status'])

  const out: VexCsvRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!
    const get = (idx: number, fallback = ''): string => (idx >= 0 ? (r[idx] ?? fallback).trim() : fallback)
    const num = (idx: number): number => {
      if (idx < 0) return 0
      const n = parseFloat((r[idx] ?? '').replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) ? n : 0
    }
    const status = get(iStatus).toLowerCase()
    const statusMapped: VexOrder['dispatchStatus'] =
      status.includes('dispatch') ? 'Dispatched' :
      status.includes('invoice') ? 'Invoice Generated' :
      status.includes('payment') ? 'Payment Received' :
      'Proforma Sent'
    const paid = get(iPaid).toLowerCase()
    const paidBool = paid === 'yes' || paid === 'y' || paid === 'true' || statusMapped !== 'Proforma Sent'
    out.push({
      orderDate: get(iDate) || new Date().toISOString().slice(0, 10),
      schoolName: get(iParty),
      voucherNumber: get(iVoucher),
      productName: get(iItem),
      quantity: num(iQty) || 1,
      ratePerUnit: num(iRate),
      amount: num(iAmount),
      igst: num(iIgst),
      cgst: num(iCgst),
      sgst: num(iSgst),
      total: num(iTotal) || num(iAmount),
      paymentReceived: paidBool,
      dispatchStatus: statusMapped,
    })
  }
  return out.filter((r) => r.schoolName || r.voucherNumber)
}

/**
 * Group raw row records (one per line item, as produced by mapCsvToDraftRows
 * + the import client's manual school mapping) into VexOrder records
 * (one per voucher, multiple line items each). Phase 3 fix: this used
 * to live inside the legacy sync runner; we do the grouping in-process
 * now since the runner is gone.
 */
export interface VexImportRow {
  orderDate: string
  schoolName: string
  schoolId: string | null
  voucherNumber: string
  productName: string
  quantity: number
  ratePerUnit: number
  amount: number
  igst: number
  cgst: number
  sgst: number
  total: number
  paymentReceived: boolean
  dispatchStatus: VexOrder['dispatchStatus']
}

export function buildVexOrdersFromRows(rows: VexImportRow[]): VexOrder[] {
  const groups = new Map<string, VexImportRow[]>()
  for (const r of rows) {
    const key = r.voucherNumber || `${r.schoolName}|${r.orderDate}|${r.productName}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  const orders: VexOrder[] = []
  for (const [voucher, items] of Array.from(groups.entries())) {
    const head = items[0]!
    const subtotal = items.reduce((s, x) => s + x.amount, 0)
    const igst = items.reduce((s, x) => s + x.igst, 0)
    const cgst = items.reduce((s, x) => s + x.cgst, 0)
    const sgst = items.reduce((s, x) => s + x.sgst, 0)
    const total = items.reduce((s, x) => s + (x.total || x.amount), 0)
    orders.push({
      id: voucher.replace(/[^a-zA-Z0-9-]/g, '_') || `vex-${Date.now()}`,
      orderDate: head.orderDate,
      schoolId: head.schoolId,
      schoolName: head.schoolName,
      schoolNameNormalised: null,
      buyerAddress: null,
      consigneeAddress: null,
      voucherNumber: voucher,
      voucherType: null,
      lineItems: items.map((r) => ({
        productName: r.productName,
        quantity: r.quantity,
        ratePerUnit: r.ratePerUnit,
        amount: r.amount,
      })),
      subtotal,
      freightCharges: 0,
      sgst,
      cgst,
      igst,
      roundOff: Math.round(total - (subtotal + igst + cgst + sgst)),
      total,
      paymentReceived: head.paymentReceived,
      paymentDate: null,
      dispatchStatus: head.dispatchStatus,
      dispatchDate: null,
      invoiceDate: null,
      salesPersonId: null,
      importedFromTally: true,
      auditLog: [],
    })
  }
  return orders
}

export function vexFunnelCounts(orders: VexOrder[]): Record<VexOrder['dispatchStatus'], number> {
  const out: Record<VexOrder['dispatchStatus'], number> = {
    'Proforma Sent': 0,
    'Payment Received': 0,
    'Invoice Generated': 0,
    Dispatched: 0,
  }
  for (const o of orders) {
    out[o.dispatchStatus] = (out[o.dispatchStatus] ?? 0) + 1
  }
  return out
}
