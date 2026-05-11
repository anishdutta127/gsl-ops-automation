/*
 * EditHistoryReveal (Gate 4.7 Step 4).
 *
 * Drop-in companion to a field label: shows a small "i" icon and on
 * hover/click reveals the field's edit history pulled from the parent
 * entity's auditLog. Zero client JS by default: native HTML
 * <details>/<summary> animation keeps the reveal touch- and keyboard-
 * accessible without a React state hook.
 *
 * Usage:
 *   <span className="inline-flex items-baseline gap-1">
 *     <span>Students MOU</span>
 *     <EditHistoryReveal entries={mou.auditLog} field="studentsMou" />
 *   </span>
 *
 * Surface coverage (Step 4 brief): MOU detail (students, fees, status,
 * sales rep), School detail (SPOC, contact, billing), Installment
 * detail (amount, due date, status). Each call site picks the audit
 * field name(s) the reveal cares about; unrelated audit entries are
 * filtered out.
 */

import { History } from 'lucide-react'
import type { AuditEntry } from '@/lib/types'

interface EditHistoryEntry {
  timestamp: string
  user: string
  before: unknown
  after: unknown
  notes?: string
}

interface Props {
  /** AuditLog from the parent entity (MOU, School, Installment, etc.). */
  entries: AuditEntry[] | null | undefined
  /** Field key(s) the reveal cares about. An audit entry counts if its
   *  before or after object contains any of these keys. */
  field: string | string[]
  /** Optional ARIA label override; defaults to "Edit history". */
  ariaLabel?: string
  /** Optional id-friendly slug for test selectors. */
  testIdSlug?: string
}

export function EditHistoryReveal({
  entries,
  field,
  ariaLabel = 'Edit history',
  testIdSlug,
}: Props) {
  const fields = Array.isArray(field) ? field : [field]
  const matches = filterEntries(entries ?? [], fields)
  const testIdRoot = testIdSlug ?? fields.join('-')

  return (
    <details
      className="group inline-block align-baseline"
      data-testid={`edit-history-${testIdRoot}`}
    >
      <summary
        aria-label={`${ariaLabel} for ${fields.join(', ')}`}
        className="inline-flex cursor-pointer items-baseline rounded-sm text-slate-400 hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy [&::-webkit-details-marker]:hidden"
      >
        <History aria-hidden className="size-3" />
      </summary>
      <div
        role="region"
        className="absolute z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-white p-3 text-xs shadow-lg"
      >
        {matches.length === 0 ? (
          <p
            className="text-slate-500"
            data-testid={`edit-history-empty-${testIdRoot}`}
          >
            No previous changes recorded.
          </p>
        ) : (
          <>
            <p className="mb-2 font-semibold text-brand-navy">
              Last changed {matches.length} time{matches.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-2">
              {matches.slice(0, 10).map((m, i) => (
                <li
                  key={`${m.timestamp}-${i}`}
                  data-testid={`edit-history-row-${testIdRoot}-${i}`}
                  className="border-l-2 border-slate-200 pl-2"
                >
                  <div className="font-mono text-[10px] text-slate-500">
                    {m.timestamp.slice(0, 10)} {m.user}
                  </div>
                  <div className="mt-0.5 text-slate-700">
                    <span className="text-slate-400">before:</span>{' '}
                    <code>{stringify(m.before)}</code>
                  </div>
                  <div className="text-slate-700">
                    <span className="text-slate-400">after:</span>{' '}
                    <code>{stringify(m.after)}</code>
                  </div>
                  {m.notes ? (
                    <div className="mt-0.5 italic text-slate-500">{m.notes}</div>
                  ) : null}
                </li>
              ))}
              {matches.length > 10 ? (
                <li className="text-slate-500">
                  + {matches.length - 10} earlier change
                  {matches.length - 10 === 1 ? '' : 's'} not shown
                </li>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </details>
  )
}

function filterEntries(
  entries: AuditEntry[],
  fields: string[],
): EditHistoryEntry[] {
  const out: EditHistoryEntry[] = []
  for (const e of entries) {
    const before = (e.before ?? {}) as Record<string, unknown>
    const after = (e.after ?? {}) as Record<string, unknown>
    let beforeVal: unknown = undefined
    let afterVal: unknown = undefined
    for (const f of fields) {
      if (f in before) beforeVal = before[f]
      if (f in after) afterVal = after[f]
    }
    if (beforeVal === undefined && afterVal === undefined) continue
    if (beforeVal === afterVal) continue
    out.push({
      timestamp: e.timestamp,
      user: e.user,
      before: beforeVal,
      after: afterVal,
      notes: e.notes,
    })
  }
  out.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return out
}

function stringify(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '-'
  if (typeof value === 'string') {
    return value.length > 40 ? `"${value.slice(0, 37)}..."` : `"${value}"`
  }
  return JSON.stringify(value)
}
