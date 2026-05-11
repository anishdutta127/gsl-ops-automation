/*
 * /admin/chain-mou-reconciliation (Gate 5A Step 4).
 *
 * Admin-only surface listing chain MOU candidates from the Gate 2
 * snapshot _meta.json + the Gate 4.5 FY26-27 import (Techno India Group
 * trio). Per row: suggested chain name, member school name, member
 * region, two actions (Consolidate / Mark as standalone).
 *
 * Actions persist via /api/admin/chain-reconciliation/{consolidate,
 * dismiss} POST handlers. Consolidate creates a SchoolGroup row +
 * updates each member School with schoolGroupId. Dismiss flags the
 * schoolId in chain_dismissals.json; subsequent views filter it out.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Info } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import type { School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import snapshotMetaJson from '@/data/_snapshots/mou-system/_meta.json'
import chainDismissalsJson from '@/data/chain_dismissals.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  buildChainCandidates,
  suggestChainName,
} from '@/lib/admin/chainReconciliation'

const allSchools = schoolsJson as unknown as School[]
const snapshotCandidates =
  (snapshotMetaJson as { chainCandidates?: Array<{ schoolId: string; name: string }> }).chainCandidates ?? []
const dismissedSchoolIds =
  (chainDismissalsJson as { dismissedSchoolIds?: string[] }).dismissedSchoolIds ?? []

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ChainMouReconciliationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fchain-mou-reconciliation')
  if (!canManageUsers(user)) redirect('/?notice=admin-only')

  const sp = await searchParams
  const flash = typeof sp.flash === 'string' ? sp.flash : null
  const error = typeof sp.error === 'string' ? sp.error : null

  const candidates = buildChainCandidates({
    snapshotCandidates,
    dismissedIds: dismissedSchoolIds,
  })
  const schoolById = new Map(allSchools.map((s) => [s.id, s]))
  const rows = candidates.map((c) => {
    const school = schoolById.get(c.schoolId)
    return {
      ...c,
      region: school?.region ?? 'unknown',
      city: school?.city ?? null,
      suggestedChainName: suggestChainName([c.name]),
    }
  })

  return (
    <>
      <TopNav currentPath="/admin/chain-mou-reconciliation" />
      <div data-testid="chain-reconciliation-page">
        <PageHeader
          title="Chain MOU reconciliation"
          subtitle="Group multi-branch school candidates into a single SchoolGroup so chain MOUs bill centrally."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Chain MOU reconciliation' },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6 sm:px-6">
          {flash ? (
            <p
              role="status"
              data-testid="chain-reconciliation-flash"
              className="flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-3 text-sm text-signal-ok"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>{flash}</span>
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}

          {rows.length === 0 ? (
            <section
              data-testid="chain-reconciliation-empty"
              className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground"
            >
              No chain candidates pending review. All flagged schools have
              been consolidated or dismissed.
            </section>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li
                  key={row.schoolId}
                  data-testid={`chain-candidate-${row.schoolId}`}
                  className="rounded-md border border-border bg-card p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-heading text-sm font-semibold text-brand-navy">
                        {row.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.city ?? '-'} · region: {row.region} · source:{' '}
                        {row.source === 'fy26-27-import'
                          ? 'FY 2026-27 import'
                          : 'Gate 2 snapshot'}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">
                        Suggested chain name:{' '}
                        <span className="font-medium text-brand-navy">
                          {row.suggestedChainName}
                        </span>
                      </p>
                      <Link
                        href={`/schools/${row.schoolId}`}
                        className="mt-1 inline-block text-xs text-brand-navy underline-offset-2 hover:underline"
                      >
                        Open school detail
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      <form
                        method="POST"
                        action="/api/admin/chain-reconciliation/consolidate"
                      >
                        <input type="hidden" name="memberSchoolIds" value={row.schoolId} />
                        <input
                          type="hidden"
                          name="chainName"
                          value={row.suggestedChainName}
                        />
                        <input type="hidden" name="region" value={row.region} />
                        <button
                          type="submit"
                          data-testid={`chain-consolidate-${row.schoolId}`}
                          className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                        >
                          Consolidate
                        </button>
                      </form>
                      <form
                        method="POST"
                        action="/api/admin/chain-reconciliation/dismiss"
                      >
                        <input
                          type="hidden"
                          name="schoolId"
                          value={row.schoolId}
                        />
                        <button
                          type="submit"
                          data-testid={`chain-dismiss-${row.schoolId}`}
                          className="inline-flex min-h-11 items-center rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-brand-navy hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                        >
                          Mark as standalone
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Audit log lives on the School record (Consolidate) or in
            chain_dismissals.json (Mark as standalone). Writes propagate
            via the GitHub Contents queue and surface within five
            minutes.
          </p>
        </div>
      </div>
    </>
  )
}
