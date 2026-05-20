/*
 * /admin/pi-counter-status (Phase 6B cutover diagnostics).
 *
 * Admin-only read-only surface that displays src/data/pi_counter_map.json
 * as a table: entity prefix, current counter, next PI number that
 * would be issued. No mutations. The per-MOU page /admin/pi-counter is
 * the older single-counter health view (Phase D); this one is the
 * post-cutover per-entity (MH / UP) view.
 */

import fs from 'node:fs'
import path from 'node:path'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { company, formatPiNumber } from '@/lib/mouSystem/company'
import type { EntityKey } from '@/lib/mouSystem/company'

interface CounterEntities {
  [key: string]: { next: number }
}

interface PiCounterMap {
  _comment?: string
  fiscalYear: string
  entities: CounterEntities
}

function loadCounter(): PiCounterMap | null {
  const p = path.join(process.cwd(), 'src/data/pi_counter_map.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PiCounterMap
  } catch {
    return null
  }
}

export default async function PiCounterStatusPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fpi-counter-status')
  if (!canManageUsers(user)) notFound()

  const counter = loadCounter()

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="PI counter status"
          subtitle="Per-entity counter snapshot. Read-only."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'PI counter status' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6 sm:px-6">
          {counter === null ? (
            <section
              className="rounded-md border border-amber-200 bg-amber-50 p-6"
              data-testid="pi-counter-missing"
            >
              <h2 className="font-heading text-lg font-semibold text-amber-900">
                pi_counter_map.json not found
              </h2>
              <p className="mt-2 text-sm text-amber-900">
                Run the snapshot script:
              </p>
              <pre className="mt-3 overflow-x-auto rounded bg-amber-100 p-3 text-xs text-amber-900">
                node scripts/snapshot-pi-counter.mjs
              </pre>
            </section>
          ) : (
            <>
              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Counter map
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  Counter fiscal year:{' '}
                  <span className="font-mono">{counter.fiscalYear}</span>.
                  Output format uses{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    company.fiscalYear
                  </code>{' '}
                  =<span className="font-mono"> {company.fiscalYear}</span>.
                </p>
                <table
                  className="mt-4 w-full table-auto border-collapse text-sm"
                  data-testid="pi-counter-table"
                >
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Entity
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Prefix
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Counter (next)
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Next PI number
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(counter.entities).map(([key, val]) => {
                      const entityKey = key as EntityKey
                      const cfg = company.entities[entityKey]
                      const formatted = cfg
                        ? formatPiNumber(entityKey, val.next)
                        : '(unknown entity)'
                      return (
                        <tr
                          key={key}
                          className="border-b border-border"
                          data-testid={`pi-counter-row-${key}`}
                        >
                          <td className="px-3 py-3 font-mono text-sm font-semibold text-brand-navy">
                            {key}
                          </td>
                          <td className="px-3 py-3 font-mono text-sm text-slate-700">
                            {cfg?.piPrefix ?? '(unknown)'}
                          </td>
                          <td className="px-3 py-3 font-mono text-sm text-slate-700">
                            {val.next}
                          </td>
                          <td className="px-3 py-3 font-mono text-sm font-semibold text-brand-navy">
                            {formatted}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>

              {counter._comment ? (
                <section className="rounded-md border border-border bg-card p-6">
                  <h2 className="font-heading text-lg font-semibold text-brand-navy">
                    Snapshot note
                  </h2>
                  <p className="mt-2 text-sm text-slate-700">
                    {counter._comment}
                  </p>
                </section>
              ) : null}

              <section className="rounded-md border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-semibold text-brand-navy">
                  Refresh
                </h2>
                <p className="mt-2 text-sm text-slate-700">
                  The snapshot script reads gsl-mou-system/src/data/pi_counter.json,
                  verifies it against the issued PI ledger, and writes the
                  per-entity map here. Run from Anish&apos;s local machine:
                </p>
                <pre className="mt-3 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                  node scripts/snapshot-pi-counter.mjs
                </pre>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}
