'use client'

/*
 * AllocationForm (Gate 3 Step 3).
 *
 * Grade-wise allocation table. Per joint spec section 3: one row per
 * grade with No. of Students, Kits Qty, Type, Product Name. Product
 * dropdown only shows SKUs matching the MOU productSelection. Soft
 * warning when kitsQty exceeds available stock; server enforces.
 *
 * Default students value pulled from MOU.gradewiseDistribution when
 * Sales pre-filled it (Step 1).
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle, AlertTriangle } from 'lucide-react'
import type { KitAllocation } from '@/lib/types'
import type { GradewiseDistributionRow } from '@/lib/mouSystem/types'

interface SkuOption {
  skuName: string
  category: string
  currentStock: number
}

interface Props {
  mouId: string
  initialAllocations: KitAllocation[] | null
  initialGradewiseDistribution: GradewiseDistributionRow[] | null
  productSelection: 'TinkRworks' | 'Cretile' | 'Both' | null
  eligibleSkus: SkuOption[]
  editable: boolean
  rejectionReason: string | null
}

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)
const KIT_TYPES: Array<'Reusable' | 'Consumable'> = ['Reusable', 'Consumable']

interface RowState {
  grade: number
  students: number
  kitsQty: number
  kitType: 'Reusable' | 'Consumable' | null
  productName: string
}

function buildInitialRows(
  allocations: KitAllocation[] | null,
  gradewise: GradewiseDistributionRow[] | null,
): RowState[] {
  const byGrade = new Map<number, RowState>()
  if (allocations) {
    for (const a of allocations) {
      byGrade.set(a.grade, {
        grade: a.grade,
        students: a.students,
        kitsQty: a.kitsQty,
        kitType: a.kitType,
        productName: a.productName,
      })
    }
  }
  if (gradewise) {
    for (const g of gradewise) {
      if (!byGrade.has(g.grade)) {
        byGrade.set(g.grade, {
          grade: g.grade,
          students: g.students,
          kitsQty: g.students,
          kitType: g.kitType,
          productName: '',
        })
      }
    }
  }
  return GRADES.map(
    (g) =>
      byGrade.get(g) ?? {
        grade: g,
        students: 0,
        kitsQty: 0,
        kitType: null,
        productName: '',
      },
  )
}

export function AllocationForm({
  mouId,
  initialAllocations,
  initialGradewiseDistribution,
  productSelection,
  eligibleSkus,
  editable,
  rejectionReason,
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<RowState[]>(() =>
    buildInitialRows(initialAllocations, initialGradewiseDistribution),
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stockByName = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of eligibleSkus) m.set(s.skuName, s.currentStock)
    return m
  }, [eligibleSkus])

  const submittableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.kitsQty > 0
          && r.kitType !== null
          && r.productName.trim() !== '',
      ),
    [rows],
  )

  const overAllocatedSkus = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of submittableRows) {
      totals.set(r.productName, (totals.get(r.productName) ?? 0) + r.kitsQty)
    }
    const offenders: Array<{ skuName: string; requested: number; available: number }> = []
    Array.from(totals.entries()).forEach(([skuName, requested]) => {
      const available = stockByName.get(skuName) ?? 0
      if (requested > available) offenders.push({ skuName, requested, available })
    })
    return offenders
  }, [submittableRows, stockByName])

  function update(idx: number, partial: Partial<RowState>): void {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...partial } : r)))
  }

  async function save(): Promise<void> {
    setSaveState('saving')
    setErrorMessage(null)
    try {
      const payload = submittableRows.map((r) => ({
        grade: r.grade,
        students: r.students,
        kitsQty: r.kitsQty,
        kitType: r.kitType,
        productName: r.productName,
      }))
      if (payload.length === 0) {
        throw new Error('At least one row with kits qty + type + product is required.')
      }
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/allocate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allocations: payload }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          offendingSkuName?: string
        }
        const msg = body.offendingSkuName
          ? `${body.error}: ${body.offendingSkuName}`
          : (body.error ?? `Save failed (${res.status})`)
        throw new Error(msg)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setSaveState('error')
      setErrorMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  if (!editable) {
    return (
      <div className="mt-3">
        {rejectionReason && (
          <div className="mb-3 rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
            Last allocation rejected: {rejectionReason}
          </div>
        )}
        <AllocationReadonly rows={rows} />
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {rejectionReason && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="rejection-banner">
          Last allocation rejected: {rejectionReason}
        </div>
      )}
      {productSelection === null && (
        <div className="rounded-md border border-signal-attention/40 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Product selection is not yet set on the MOU. Dropdown is empty until then.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" data-testid="allocation-table">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="py-2 pr-3 font-medium">Grade</th>
              <th className="py-2 pr-3 font-medium">Students</th>
              <th className="py-2 pr-3 font-medium">Kits Qty</th>
              <th className="py-2 pr-3 font-medium">
                Kit type
                <span className="ml-1 font-normal normal-case text-[10px] text-slate-500">
                  (Reusable / Consumable)
                </span>
              </th>
              <th className="py-2 pr-3 font-medium">
                Product
                <span className="ml-1 font-normal normal-case text-[10px] text-slate-500">
                  (TinkRworks / Cretile SKU)
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const available = stockByName.get(r.productName)
              const over = available !== undefined && r.kitsQty > available
              return (
                <tr key={r.grade} className="border-b border-border/60" data-testid={`row-grade-${r.grade}`}>
                  <td className="py-1.5 pr-3 font-medium text-slate-700">
                    Grade {r.grade}
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={0}
                      value={r.students || ''}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        update(idx, { students: Number.isFinite(n) && n >= 0 ? n : 0 })
                      }}
                      placeholder="0"
                      className="w-20 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      aria-label={`Grade ${r.grade} students`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number"
                      min={0}
                      value={r.kitsQty || ''}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        update(idx, { kitsQty: Number.isFinite(n) && n >= 0 ? n : 0 })
                      }}
                      placeholder="0"
                      className={
                        'w-20 rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy '
                        + (over ? 'border-signal-alert text-signal-alert' : 'border-border')
                      }
                      aria-label={`Grade ${r.grade} kits qty`}
                      data-testid={`kits-qty-${r.grade}`}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <select
                      value={r.kitType ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        update(idx, {
                          kitType: v === 'Reusable' || v === 'Consumable' ? v : null,
                        })
                      }}
                      className="w-28 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      aria-label={`Grade ${r.grade} kit type`}
                    >
                      <option value="">: select :</option>
                      {KIT_TYPES.map((kt) => (
                        <option key={kt} value={kt}>{kt}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-3">
                    <select
                      value={r.productName}
                      onChange={(e) => update(idx, { productName: e.target.value })}
                      className="w-56 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      aria-label={`Grade ${r.grade} product`}
                      data-testid={`product-select-${r.grade}`}
                    >
                      <option value="">: select :</option>
                      {eligibleSkus.map((s) => (
                        <option key={s.skuName + '|' + s.category} value={s.skuName}>
                          {s.skuName} ({s.category}, stock {s.currentStock})
                        </option>
                      ))}
                    </select>
                    {over && available !== undefined && (
                      <p className="mt-0.5 text-xs text-signal-alert">
                        Over by {r.kitsQty - available}. Stock: {available}.
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {overAllocatedSkus.length > 0 && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="over-allocated-warning">
          <AlertTriangle aria-hidden className="mr-1 inline size-3.5" />
          {overAllocatedSkus.map((o) => (
            <div key={o.skuName}>
              {o.skuName}: requested {o.requested}, available {o.available}.
            </div>
          ))}
          Adjust qty or pick a different SKU before submitting.
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saveState === 'saving' || overAllocatedSkus.length > 0 || submittableRows.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
          data-testid="submit-allocation"
        >
          <Save aria-hidden className="size-4" />
          {saveState === 'saving' ? 'Submitting...' : 'Submit allocation'}
        </button>
        {saveState === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle aria-hidden className="size-3" />
            Allocation submitted. Sales rep will receive a notification at next cron drain.
          </span>
        )}
      </div>
    </div>
  )
}

function AllocationReadonly({ rows }: { rows: RowState[] }) {
  const filled = rows.filter((r) => r.kitsQty > 0)
  if (filled.length === 0) {
    return <p className="text-sm text-slate-500">No allocation entered yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm" data-testid="allocation-readonly">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
            <th className="py-2 pr-3 font-medium">Grade</th>
            <th className="py-2 pr-3 font-medium">Students</th>
            <th className="py-2 pr-3 font-medium">Kits Qty</th>
            <th className="py-2 pr-3 font-medium">Kit type</th>
            <th className="py-2 pr-3 font-medium">Product</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((r) => (
            <tr key={r.grade} className="border-b border-border/60">
              <td className="py-1.5 pr-3 font-medium text-slate-700">Grade {r.grade}</td>
              <td className="py-1.5 pr-3">{r.students}</td>
              <td className="py-1.5 pr-3">{r.kitsQty}</td>
              <td className="py-1.5 pr-3">{r.kitType ?? '-'}</td>
              <td className="py-1.5 pr-3">{r.productName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
