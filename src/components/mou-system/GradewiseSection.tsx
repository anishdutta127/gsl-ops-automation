'use client'

/*
 * GradewiseSection (Gate 3 Step 1).
 *
 * Self-contained, collapsible section for Product Selection +
 * Grade-wise Student Distribution. Mounted by GeneratorWizard
 * (draft surface) and the MOU Pipeline detail page (late-stage
 * data entry).
 *
 * Per joint spec section 1:
 * - Product Selection: TinkRworks / Cretile / Both (radio choices).
 *   Drives downstream allocation dropdowns at Step 3.
 * - Grade-wise distribution: optional, grades 1-12, students + kit
 *   type per row, auto-summed total.
 *
 * The form is fully optional; submitting with everything blank
 * persists null on both fields so existing MOUs and skip-on-draft
 * flows stay backwards-compatible.
 */

import { useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  GradewiseDistributionRow,
  ProductSelection,
} from '@/lib/mouSystem/types'

interface Props {
  productSelection: ProductSelection | null
  gradewiseDistribution: GradewiseDistributionRow[] | null
  onProductSelectionChange: (next: ProductSelection | null) => void
  onGradewiseDistributionChange: (next: GradewiseDistributionRow[] | null) => void
  expanded: boolean
  onToggle: () => void
}

const GRADES = Array.from({ length: 12 }, (_, i) => i + 1)
const KIT_TYPES: Array<'Reusable' | 'Consumable'> = ['Reusable', 'Consumable']
const PRODUCT_OPTIONS: ProductSelection[] = ['TinkRworks', 'Cretile', 'Both']

export function GradewiseSection({
  productSelection,
  gradewiseDistribution,
  onProductSelectionChange,
  onGradewiseDistributionChange,
  expanded,
  onToggle,
}: Props) {
  const rowsByGrade = useMemo(() => {
    const map = new Map<number, GradewiseDistributionRow>()
    for (const row of gradewiseDistribution ?? []) {
      map.set(row.grade, row)
    }
    return map
  }, [gradewiseDistribution])

  const totalStudents = useMemo(() => {
    return (gradewiseDistribution ?? []).reduce(
      (sum, row) => sum + (Number.isFinite(row.students) ? row.students : 0),
      0,
    )
  }, [gradewiseDistribution])

  function setRow(grade: number, partial: Partial<GradewiseDistributionRow>): void {
    const existing = rowsByGrade.get(grade)
    const updated: GradewiseDistributionRow = {
      grade,
      students: existing?.students ?? 0,
      kitType: existing?.kitType ?? null,
      ...partial,
    }
    const others = (gradewiseDistribution ?? []).filter((r) => r.grade !== grade)
    // Drop the row if it carries no data (students 0 and kitType null)
    // so the persisted array stays minimal.
    const hasData =
      (updated.students && updated.students > 0) || updated.kitType !== null
    const next = hasData ? [...others, updated] : others
    next.sort((a, b) => a.grade - b.grade)
    onGradewiseDistributionChange(next.length > 0 ? next : null)
  }

  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-brand-navy"
        aria-expanded={expanded}
        aria-controls="gradewise-section-body"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown aria-hidden className="size-4 text-slate-500" />
          ) : (
            <ChevronRight aria-hidden className="size-4 text-slate-500" />
          )}
          <span className="font-medium text-brand-navy">
            Kits dispatch details
          </span>
          <span className="text-xs text-slate-500">(optional)</span>
        </div>
        <div className="text-xs text-slate-600">
          {productSelection ? `Product: ${productSelection}` : 'Product: not set'}
          {(gradewiseDistribution?.length ?? 0) > 0 && (
            <span className="ml-3">Total students: {totalStudents}</span>
          )}
        </div>
      </button>
      {expanded && (
        <div id="gradewise-section-body" className="border-t border-border px-4 py-4 space-y-6">
          <div>
            <div className="text-sm font-medium text-brand-navy">
              Product line (TinkRworks / Cretile)
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              The product line shipped under this MOU. Drives the SKU dropdown at the Kits for Dispatch allocation stage.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {PRODUCT_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="productSelection"
                    value={opt}
                    checked={productSelection === opt}
                    onChange={() => onProductSelectionChange(opt)}
                    className="size-4"
                  />
                  <span>{opt}</span>
                </label>
              ))}
              {productSelection && (
                <button
                  type="button"
                  onClick={() => onProductSelectionChange(null)}
                  className="text-xs text-slate-500 underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-brand-navy">
              Grade-wise Student Distribution
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              Fill in only the grades that apply. Sales can complete this later
              in MOU Pipeline if data is not ready at draft time.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="py-2 pr-3 font-medium">Grade</th>
                    <th className="py-2 pr-3 font-medium">No. of Students</th>
                    <th className="py-2 pr-3 font-medium">
                      Kit type
                      <span className="ml-1 font-normal normal-case text-[10px] text-slate-500">
                        (Reusable / Consumable)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {GRADES.map((grade) => {
                    const row = rowsByGrade.get(grade)
                    const students = row?.students ?? 0
                    const kitType = row?.kitType ?? null
                    return (
                      <tr key={grade} className="border-b border-border/60">
                        <td className="py-1.5 pr-3 font-medium text-slate-700">
                          Grade {grade}
                        </td>
                        <td className="py-1.5 pr-3">
                          <input
                            type="number"
                            min={0}
                            value={students || ''}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              setRow(grade, {
                                students: Number.isFinite(n) && n >= 0 ? n : 0,
                              })
                            }}
                            placeholder="0"
                            className="w-24 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            aria-label={`Grade ${grade} students`}
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <select
                            value={kitType ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setRow(grade, {
                                kitType:
                                  v === 'Reusable' || v === 'Consumable' ? v : null,
                              })
                            }}
                            className="w-32 rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                            aria-label={`Grade ${grade} kit type`}
                          >
                            <option value="">: select :</option>
                            {KIT_TYPES.map((kt) => (
                              <option key={kt} value={kt}>
                                {kt}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-50 font-medium">
                    <td className="py-2 pr-3">Total</td>
                    <td className="py-2 pr-3" data-testid="gradewise-total">
                      {totalStudents}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
