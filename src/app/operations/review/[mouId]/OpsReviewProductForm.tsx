'use client'

/*
 * Ops review product assignment (Step 2). A compact editor for the Step 1
 * MouProduct[] portfolio. Each row: brand -> SKU (from inventory) -> grades
 * + quantity. Cretile rows are grade-banded (perGradeQuantity), TinkRworks
 * rows are grade-agnostic (grades[] multi-select + total quantity). Saves
 * by POSTing products[] to the Step-1 kits-details route, which persists it
 * and derives productSelection.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save, CheckCircle } from 'lucide-react'
import type { MouProduct } from '@/lib/mouSystem/types'

interface SkuOption { skuName: string; category: string; cretileGrade: number | null }

interface RowState {
  product: string // brand / category
  skuName: string
  grades: number[]
  quantity: number
}

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)

function toMouProduct(r: RowState): MouProduct {
  if (r.product === 'Cretile') {
    return {
      product: 'Cretile',
      skuName: r.skuName,
      gradeSpecific: true,
      perGradeQuantity: r.grades.map((g) => ({ grade: g, quantity: r.quantity })),
    }
  }
  return {
    product: r.product,
    skuName: r.skuName,
    gradeSpecific: false,
    grades: r.grades,
    quantity: r.quantity,
  }
}

export function OpsReviewProductForm({
  mouId,
  skus,
  initialProducts,
  editable,
}: {
  mouId: string
  skus: SkuOption[]
  initialProducts: MouProduct[] | null
  editable: boolean
}) {
  const router = useRouter()
  const brands = useMemo(() => Array.from(new Set(skus.map((s) => s.category))).sort(), [skus])
  const [rows, setRows] = useState<RowState[]>(() =>
    (initialProducts ?? []).map((p) => ({
      product: p.product,
      skuName: p.skuName,
      grades: p.gradeSpecific ? (p.perGradeQuantity ?? []).map((x) => x.grade) : (p.grades ?? []),
      quantity: p.gradeSpecific ? (p.perGradeQuantity?.[0]?.quantity ?? 0) : (p.quantity ?? 0),
    })),
  )
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  function addRow() {
    const brand = brands[0] ?? 'TinkRworks'
    setRows((p) => [...p, { product: brand, skuName: '', grades: [], quantity: 0 }])
  }
  function update(i: number, patch: Partial<RowState>) {
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function remove(i: number) { setRows((p) => p.filter((_, idx) => idx !== i)) }

  async function save() {
    setState('saving'); setMsg(null)
    const products = rows
      .filter((r) => r.product && r.skuName && r.grades.length > 0 && r.quantity > 0)
      .map(toMouProduct)
    try {
      const res = await fetch(`/api/mou/${encodeURIComponent(mouId)}/kits-details`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ products }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `Save failed (${res.status})`)
      }
      setState('saved'); setMsg(`${products.length} product line(s) assigned.`)
      router.refresh()
    } catch (e) {
      setState('error'); setMsg(e instanceof Error ? e.message : 'Save failed')
    }
  }

  if (!editable) {
    return rows.length === 0
      ? <p className="text-sm text-slate-500">No products assigned yet.</p>
      : (
        <ul className="space-y-1 text-sm" data-testid="ops-products-readonly">
          {rows.map((r, i) => (
            <li key={i} className="text-slate-700">
              {r.product} - {r.skuName} - grades {r.grades.join(', ')} - qty {r.quantity}
            </li>
          ))}
        </ul>
      )
  }

  return (
    <div className="space-y-3" data-testid="ops-product-form">
      {rows.map((r, i) => {
        const opts = skus.filter((s) => s.category === r.product)
        return (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-white p-3" data-testid={`product-row-${i}`}>
            <label className="text-xs text-slate-600">Brand
              <select value={r.product} onChange={(e) => update(i, { product: e.target.value, skuName: '' })}
                className="mt-0.5 block rounded border border-border px-2 py-1 text-sm">
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">SKU
              <select value={r.skuName} onChange={(e) => update(i, { skuName: e.target.value })}
                className="mt-0.5 block w-48 rounded border border-border px-2 py-1 text-sm" data-testid={`sku-${i}`}>
                <option value="">: select :</option>
                {Array.from(new Set(opts.map((o) => o.skuName))).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <fieldset className="text-xs text-slate-600">Grades
              <div className="mt-0.5 flex flex-wrap gap-1">
                {GRADES.map((g) => (
                  <label key={g} className={'cursor-pointer rounded border px-1.5 py-0.5 ' + (r.grades.includes(g) ? 'border-brand-navy bg-brand-navy/10' : 'border-border')}>
                    <input type="checkbox" className="sr-only" checked={r.grades.includes(g)}
                      onChange={() => update(i, { grades: r.grades.includes(g) ? r.grades.filter((x) => x !== g) : [...r.grades, g].sort((a, b) => a - b) })} />
                    {g}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-xs text-slate-600">Qty{r.product === 'Cretile' ? '/grade' : ' total'}
              <input type="number" min={0} value={r.quantity || ''} onChange={(e) => update(i, { quantity: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-0.5 block w-20 rounded border border-border px-2 py-1 text-sm" data-testid={`qty-${i}`} />
            </label>
            <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-signal-alert" aria-label="Remove row">
              <Trash2 className="size-4" />
            </button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-slate-50">
          <Plus className="size-4" /> Add product
        </button>
        <button type="button" onClick={() => void save()} disabled={state === 'saving'}
          className="inline-flex min-h-9 items-center gap-2 rounded-md bg-brand-navy px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
          data-testid="save-products">
          <Save className="size-4" /> {state === 'saving' ? 'Saving...' : 'Save products'}
        </button>
        {state === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle className="size-3" /> {msg}</span>}
        {state === 'error' && <span className="text-xs text-signal-alert">{msg}</span>}
      </div>
    </div>
  )
}
