/*
 * Fy2627ImportStatus (Gate 4.7 Step 1).
 *
 * Surfaces the staged Excel-import result on /admin/data-snapshot so
 * Anish, Pranav, and Misba can see what went into the platform without
 * grepping src/data/_imports/fy2627/_meta.json.
 *
 * Sections:
 *   - Header: last-run timestamp + re-run command
 *   - Pranav (Pratik file): counts + loud-fail rows + warnings + auto-
 *     created sales reps
 *   - Misba (Kit Delivery file): counts + orphan dispatch list with
 *     suggested-match hints (school slug similarity)
 *   - Cross-Excel reconciliation buckets
 *
 * Pure presentational. The page hands in the parsed meta object.
 */

import Link from 'next/link'
import { AlertCircle, AlertTriangle, ArrowRight, RefreshCw, UserPlus } from 'lucide-react'
import type { Fy2627ImportMeta } from '@/lib/imports/fy2627Meta'

interface Props {
  meta: Fy2627ImportMeta | null
}

export function Fy2627ImportStatus({ meta }: Props) {
  if (meta === null) {
    return (
      <section
        data-testid="fy2627-status-missing"
        className="rounded-md border border-amber-200 bg-amber-50 p-6"
      >
        <h2 className="font-heading text-lg font-semibold text-amber-900">
          No FY26-27 import recorded
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          The staged-import folder
          {' '}<code className="rounded bg-amber-100 px-1 py-0.5 text-xs">src/data/_imports/fy2627/</code>{' '}
          is empty. Run the import script locally to populate it.
        </p>
        <pre className="mt-3 overflow-x-auto rounded bg-amber-100 p-3 text-xs text-amber-900">
          npm run import:fy2627
        </pre>
      </section>
    )
  }

  const errors = meta.errors ?? []
  const warnings = meta.warnings ?? []
  const autoSalesReps = meta.autoCreatedSalesReps ?? []
  const autoSchools = meta.autoCreatedSchools ?? []
  const gaps = meta.crossValidationGaps ?? []
  const orphans = gaps.filter((g) => g.message?.includes('no matching MOU found'))

  return (
    <section
      data-testid="fy2627-import-status"
      className="space-y-6"
    >
      <header className="rounded-md border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <RefreshCw aria-hidden className="size-5 shrink-0 text-brand-navy" />
          <div className="flex-1">
            <h2 className="font-heading text-2xl font-bold text-brand-navy">
              FY26-27 Excel imports
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Pranav&apos;s Pratik invoicing file + Misba&apos;s kit-delivery file
              imported into{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                src/data/_imports/fy2627/
              </code>
              . Staging only; not promoted to production until Gate 5 cutover.
            </p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Last run
                </span>
                <div
                  data-testid="fy2627-last-run"
                  className="font-mono text-xs text-slate-700"
                >
                  {meta.runStartedAt}
                </div>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Re-run command
                </span>
                <div
                  data-testid="fy2627-rerun-cmd"
                  className="font-mono text-xs text-slate-700"
                >
                  npm run import:fy2627
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section
        data-testid="fy2627-pranav-section"
        className="rounded-md border border-border bg-card p-6"
      >
        <h3 className="font-heading text-lg font-semibold text-brand-navy">
          Pranav (Pratik invoicing)
        </h3>
        <CountsGrid counts={meta.counts} />

        {errors.length > 0 ? (
          <div
            data-testid="fy2627-pranav-errors"
            className="mt-4 rounded-md border border-signal-alert bg-signal-alert/5 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-signal-alert">
              <AlertCircle aria-hidden className="size-4" />
              {errors.length} loud-fail row{errors.length === 1 ? '' : 's'}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Imported with{' '}
              <code className="rounded bg-muted px-1 py-0.5">contractValue=0</code>
              {' '}and{' '}
              <code className="rounded bg-muted px-1 py-0.5">
                importNotes.loudFail
              </code>
              . Pranav to confirm correct sale amounts.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {errors.slice(0, 20).map((e, i) => (
                <li
                  key={i}
                  data-testid={`fy2627-error-row-${i}`}
                  className="flex flex-col gap-1 rounded border border-border bg-white px-3 py-2 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-medium text-brand-navy">
                    {e.school ?? '(unknown school)'}
                  </span>
                  <span className="text-xs text-slate-600">
                    Row {e.row} - {e.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div
            data-testid="fy2627-pranav-warnings"
            className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle aria-hidden className="size-4" />
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {warnings.slice(0, 20).map((w, i) => (
                <li key={i} className="text-xs text-amber-900">
                  <span className="font-mono">{w.stage}</span> row {w.row}:{' '}
                  {w.message}
                  {w.school ? ` (${w.school})` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {autoSalesReps.length > 0 ? (
          <div
            data-testid="fy2627-auto-sales-reps"
            className="mt-4 rounded-md border border-border bg-muted/40 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
              <UserPlus aria-hidden className="size-4" />
              {autoSalesReps.length} auto-created sales rep
              {autoSalesReps.length === 1 ? '' : 's'}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Phone, email, and territories default to null. Enrich via{' '}
              <Link
                href="/admin/sales-team"
                data-testid="fy2627-sales-enrich-link"
                className="font-semibold text-brand-navy hover:underline"
              >
                /admin/sales-team
              </Link>
              .
            </p>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {autoSalesReps.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline justify-between rounded border border-border bg-white px-3 py-2"
                >
                  <span className="font-medium text-brand-navy">{r.name}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {r.id}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section
        data-testid="fy2627-misba-section"
        className="rounded-md border border-border bg-card p-6"
      >
        <h3 className="font-heading text-lg font-semibold text-brand-navy">
          Misba (kit delivery)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Auto-created schools: <strong>{autoSchools.length}</strong>. Orphan
          dispatches (no matching MOU): <strong>{orphans.length}</strong>.
        </p>

        {orphans.length > 0 ? (
          <div
            data-testid="fy2627-misba-orphans"
            className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle aria-hidden className="size-4" />
              {orphans.length} orphan dispatch
              {orphans.length === 1 ? '' : 'es'} need re-keying
            </div>
            <p className="mt-1 text-xs text-amber-900">
              Misba to distinguish spelling typos (re-key to existing MOU)
              from true orphans (school+MOU created post-cutover). The
              re-key modal lands in Phase 1.1; for now, edit the
              dispatch&apos;s{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">mouId</code>{' '}
              field in{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">
                src/data/_imports/fy2627/kit_dispatches.json
              </code>
              .
            </p>
            <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto rounded border border-amber-200 bg-white p-3 text-sm">
              {orphans.slice(0, 50).map((o, i) => (
                <li
                  key={i}
                  data-testid={`fy2627-orphan-row-${i}`}
                  className="flex flex-col gap-1 border-b border-amber-100 py-1 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <span className="font-medium text-brand-navy">
                    {o.school ?? '(unknown school)'}
                  </span>
                  <span className="font-mono text-xs text-slate-500">
                    {o.dcNumber ?? 'no DC'} - {o.stage}
                  </span>
                </li>
              ))}
              {orphans.length > 50 ? (
                <li className="pt-2 text-xs text-amber-900">
                  + {orphans.length - 50} more in{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">
                    _meta.json
                  </code>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {autoSchools.length > 0 ? (
          <div
            data-testid="fy2627-auto-schools"
            className="mt-4 rounded-md border border-border bg-muted/40 p-4"
          >
            <h4 className="text-sm font-semibold text-brand-navy">
              {autoSchools.length} auto-created school
              {autoSchools.length === 1 ? '' : 's'}
            </h4>
            <p className="mt-1 text-xs text-slate-600">
              Anish to review for chain candidates and dedup typos before
              cutover. Showing first 20:
            </p>
            <ul className="mt-2 grid gap-1 text-xs">
              {autoSchools.slice(0, 20).map((s) => (
                <li key={s.id} className="flex items-baseline gap-2">
                  <code className="font-mono text-slate-500">{s.id}</code>
                  <span className="text-slate-700">{s.name}</span>
                  <Link
                    href={`/schools/${s.id}`}
                    data-testid={`fy2627-school-link-${s.id}`}
                    className="ml-auto text-brand-navy hover:underline"
                  >
                    open <ArrowRight aria-hidden className="inline size-3" />
                  </Link>
                </li>
              ))}
              {autoSchools.length > 20 ? (
                <li className="pt-2 text-slate-500">
                  + {autoSchools.length - 20} more
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </section>
    </section>
  )
}

function CountsGrid({ counts }: { counts: Fy2627ImportMeta['counts'] }) {
  const rows = [
    { key: 'mous', label: 'MOUs' },
    { key: 'schools', label: 'Schools' },
    { key: 'salesTeam', label: 'Sales team' },
    { key: 'payments', label: 'Payments' },
    { key: 'kitDispatches', label: 'Kit dispatches' },
    { key: 'inventoryItems', label: 'Inventory items' },
  ] as const
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ key, label }) => {
        const c = counts[key]
        if (!c) return null
        return (
          <div
            key={key}
            data-testid={`fy2627-count-${key}`}
            className="rounded border border-border bg-white px-3 py-2"
          >
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {label}
            </dt>
            <dd className="mt-0.5 flex items-baseline gap-3 text-sm">
              <span className="font-mono text-brand-navy">
                <strong>{c.inserted}</strong> new
              </span>
              <span className="font-mono text-slate-500">
                {c.updated} updated
              </span>
              <span className="font-mono text-slate-400">
                {c.unchanged} unchanged
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
