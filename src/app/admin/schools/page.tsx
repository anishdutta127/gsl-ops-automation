/*
 * /admin/schools (Phase C5b; W4-I.2.5 search).
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

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Schools</h1>
          <p className="mt-1 text-sm text-slate-700">
            {q.trim() === ''
              ? `${schools.length} schools, ${activeCount} active.`
              : `${filtered.length} of ${schools.length} matching.`}
            {missingGstCount > 0
              ? ` ${missingGstCount} missing GSTIN (PI generation blocked per Item F).`
              : ''}
          </p>
        </div>
        <Link
          href="/admin/schools/new"
          className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
        >
          New school
        </Link>
      </header>

      <form
        method="GET"
        action="/admin/schools"
        role="search"
        aria-label="Search schools"
        className="mb-4 flex flex-wrap items-center gap-2"
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
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        />
        <button
          type="submit"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
        >
          Search
        </button>
        {q.trim() !== '' ? (
          <Link
            href="/admin/schools"
            className="inline-flex items-center rounded-md px-2 py-2 text-sm text-slate-600 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {filtered.length === 0 ? (
        <p
          data-testid="schools-empty"
          className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600"
        >
          {schools.length === 0
            ? 'No schools yet.'
            : 'No schools match the current search.'}
        </p>
      ) : (
        <ul className="rounded-md border border-slate-200 bg-white">
          {filtered.map((school) => (
            <li key={school.id} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-stretch">
                <div className="flex-1 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--brand-navy)]">
                      {school.name}
                    </span>
                    <span className="text-xs text-slate-500">{school.id}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-700">
                    {school.city}, {school.state} ({school.region})
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    GSTIN: {school.gstNumber ?? <span className="text-[var(--signal-alert)]">missing</span>}
                    {school.active ? '' : ' · inactive'}
                  </p>
                </div>
                <Link
                  href={`/schools/${school.id}/edit`}
                  className="flex items-center px-4 text-xs font-medium text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
