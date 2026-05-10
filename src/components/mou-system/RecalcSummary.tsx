/*
 * RecalcSummary (Step 5; ported from gsl-mou-system).
 *
 * Read-only recalc preview card. Renders what the payment schedule
 * WOULD look like if every paid amount was re-allocated against the
 * current actual student count + per-student price. The MOU detail
 * page passes `installments` (Ops Payment[] filtered by mouId) and
 * the current MOU pricing; the engine in
 * `src/lib/mouSystem/recalc.ts:recalculatePaymentSchedule` is pure.
 *
 * This is preview only; the real lock + adjustment-as-line-item write
 * path lives in `computeRecalcWithAdjustments` (also in recalc.ts) and
 * is wired by the actuals confirm flow. The card surfaces drift before
 * the operator commits.
 */

import { recalculatePaymentSchedule } from '@/lib/mouSystem/recalc'
import { formatRs } from '@/lib/format'
import type { Payment } from '@/lib/types'

interface Props {
  studentsMou: number
  studentsActual: number | null
  perStudentPrice: number
  installments: Payment[]
}

function deriveSchedule(installments: Payment[]): { pcts: number[]; paidByInst: number[] } {
  const sorted = installments.slice().sort((a, b) => a.instalmentSeq - b.instalmentSeq)
  if (sorted.length === 0) return { pcts: [], paidByInst: [] }
  const total = sorted.reduce((s, p) => s + p.expectedAmount, 0)
  const pcts = sorted.map((p) => (total > 0 ? (p.expectedAmount / total) * 100 : 0))
  const paidByInst = sorted.map((p) => p.receivedAmount ?? 0)
  return { pcts, paidByInst }
}

export function RecalcSummary({ studentsMou, studentsActual, perStudentPrice, installments }: Props) {
  const currentStudents = studentsActual ?? studentsMou
  const { pcts, paidByInst } = deriveSchedule(installments)
  const result = recalculatePaymentSchedule({
    perStudentPrice,
    currentStudents,
    pcts,
    paymentsByInstalment: paidByInst,
  })

  if (result.instalments.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        No instalments yet. Recalc will appear once a payment schedule is set.
      </p>
    )
  }

  return (
    <section
      className="rounded-lg border border-border bg-card"
      data-testid="recalc-summary-card"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="font-heading text-sm font-semibold text-brand-navy">
            Net due (recalc)
          </h3>
          <p className="text-xs text-muted-foreground">
            {currentStudents.toLocaleString('en-IN')} students × {formatRs(perStudentPrice)} per student
          </p>
        </div>
        <div className="text-right">
          <span className="block text-xs uppercase tracking-wider text-muted-foreground">Total due</span>
          <span className="font-mono text-sm tabular-nums text-foreground">{formatRs(result.totalDue)}</span>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Inst</th>
              <th className="px-3 py-2 font-medium text-right">% Due</th>
              <th className="px-3 py-2 font-medium text-right">New expected</th>
              <th className="px-3 py-2 font-medium text-right">Paid applied</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.instalments.map((it) => (
              <tr key={it.seq}>
                <td className="px-3 py-2 font-medium text-foreground">{it.seq}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{it.pctDue.toFixed(0)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRs(it.newExpected)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRs(it.paidApplied)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRs(it.balance)}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      'inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ' +
                      (it.status === 'Paid'
                        ? 'bg-emerald-100 text-emerald-900'
                        : it.status === 'Partial'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-muted text-foreground')
                    }
                  >
                    {it.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.surplusCredit > 0 ? (
        <p className="border-t border-border px-4 py-2 text-xs text-amber-700">
          Surplus credit (paid in excess of the entire schedule): {formatRs(result.surplusCredit)}.
        </p>
      ) : null}
    </section>
  )
}
