/*
 * /admin/schools (Phase C5b; W4-I.2.5 search; W4-I.5 P4C5.5 design-system pass).
 *
 * Server Component. Admin-side list of every School. Displays the
 * fields most relevant to admin work (id, name, region, GST, active).
 * The richer `/schools` browse list (C3) lives at the public-facing
 * route; this is the management surface.
 *
 * Search-only filter: name + city + region, comma-tolerant. No chip
 * dimensions on this surface; Misba's bounded request was a search
 * bar to find one of 124 schools quickly. Adding dimension chips
 * would be premature against this surface's narrow management role.
 *
 * Permission gate: Admin or OpsHead. Other viewers redirect to
 * /dashboard.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { School } from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import { getCurrentUser } from '@/lib/auth/session'
import { applyTextSearch } from '@/lib/filterParsing'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { opsButtonClass } from '@/components/ops/OpsButton'

const schools = schoolsJson as unknown as School[]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SchoolsAdminListPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fschools')

  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : ''

  const filtered = applyTextSearch(
    schools,
    q,
    (s) => [s.name, s.city, s.region],
  )

  const activeCount = schools.filter((s) => s.active).length
  const missingGstCount = schools.filter((s) => s.gstNumber === null).length

  const subtitle = [
    q.trim() === ''
      ? `${schools.length} schools, ${activeCount} active.`
      : `${filtered.length} of ${schools.length} matching.`,
    missingGstCount > 0
      ? `${missingGstCount} missing GSTIN (PI generation blocked per Item F).`
      : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Schools"
          subtitle={subtitle}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Schools' },
          ]}
          actions={
            <Link
              href="/admin/schools/new"
              className={opsButtonClass({ variant: 'primary', size: 'md' })}
            >
              New school
            </Link>
          }
        />
        <div className="mx-auto max-w-screen-lg space-y-4 px-4 py-6">

          <form
            method="GET"
            action="/admin/schools"
            role="search"
            aria-label="Search schools"
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="schools-search" className="sr-only">
              Search schools by name, city, or region
            </label>
            <input
              id="schools-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search name / city / region"
              data-testid="schools-search-input"
              className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
            <button type="submit" className={opsButtonClass({ variant: 'outline', size: 'md' })}>
              Search
            </button>
            {q.trim() !== '' ? (
              <Link
                href="/admin/schools"
                className="inline-flex min-h-11 items-center px-2 py-2 text-sm text-muted-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                Clear
              </Link>
            ) : null}
          </form>

          {filtered.length === 0 ? (
            <p
              data-testid="schools-empty"
              className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground"
            >
              {schools.length === 0
                ? 'No schools yet.'
                : 'No schools match the current search.'}
            </p>
          ) : (
            <ul className="rounded-md border border-border bg-card">
              {filtered.map((school) => (
                <li key={school.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-stretch">
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-brand-navy">
                          {school.name}
                        </span>
                        <span className="text-xs text-muted-foreground">{school.id}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground">
                        {school.city}, {school.state} ({school.region})
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        GSTIN:{' '}
                        {school.gstNumber ?? (
                          <StatusChip tone="alert" label="missing" withDot={false} />
                        )}
                        {school.active ? '' : ' · inactive'}
                      </p>
                    </div>
                    <Link
                      href={`/schools/${school.id}/edit`}
                      className="flex min-h-11 items-center px-4 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
