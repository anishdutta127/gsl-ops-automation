/*
 * /operations/recce (Step 3 Recce reports).
 *
 * Per-school lab-requirement reconnaissance, kept as a record. A simple
 * add-a-record form + a list of existing records. Record-keeping only.
 */

import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { schoolRepo } from '@/lib/db/repos/school'
import { recceReportRepo } from '@/lib/db/repos/step3'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import { formatDate } from '@/lib/format'

const NOTICES: Record<string, string> = { created: 'Recce report saved.' }
const ERRORS: Record<string, string> = {
  permission: 'Only Ops and Admin can record recce reports.',
  'missing-school': 'Select a school.',
  empty: 'Enter the lab requirements / findings.',
  'school-not-found': 'School not found.',
  'save-failed': 'Save failed. Retry.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RecceReportsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Frecce')
  const sp = await searchParams

  const [schools, reports] = await Promise.all([
    schoolRepo.findAll(),
    recceReportRepo.findAll(),
  ])
  const schoolName = new Map(schools.map((s) => [s.id, s.name]))
  const activeSchools = schools.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name))
  const canAct = canRaiseDispatch(user!)
  const notice = typeof sp.created === 'string' ? 'created' : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="Recce reports"
          subtitle="Lab-requirement reconnaissance per school - what facilities exist or are missing. Kept as a record."
          breadcrumb={[{ label: 'Operations', href: '/operations' }, { label: 'Recce' }]}
        />
        <div className="mx-auto max-w-screen-lg space-y-6 px-4 py-6">
          {notice && <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" data-testid="recce-notice">{NOTICES[notice]}</div>}
          {errorKey && <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="recce-error">{ERRORS[errorKey] ?? errorKey}</div>}

          {canAct && (
            <form method="POST" action="/api/recce/create" className="space-y-3 rounded-md border border-border bg-card p-4" data-testid="recce-form">
              <h2 className="font-heading text-sm font-semibold text-brand-navy">Record a recce</h2>
              <div>
                <label htmlFor="schoolId" className="block text-sm font-medium text-brand-navy">School</label>
                <select id="schoolId" name="schoolId" required defaultValue="" className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" data-testid="recce-school">
                  <option value="" disabled>: select a school :</option>
                  {activeSchools.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="requirements" className="block text-sm font-medium text-brand-navy">Lab requirements / findings</label>
                <textarea id="requirements" name="requirements" rows={4} required placeholder="e.g. No dedicated lab room; 8 power sockets available; needs projector + 10 worktables for Cretile kits." className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" data-testid="recce-requirements" />
              </div>
              <button type="submit" className="inline-flex min-h-10 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90" data-testid="recce-save">
                Save recce
              </button>
            </form>
          )}

          <section className="rounded-md border border-border bg-card" data-testid="recce-list">
            <header className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold text-brand-navy">Recorded recces ({reports.length})</h2>
            </header>
            {reports.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500" data-testid="recce-empty">No recce reports yet.</div>
            ) : (
              <ul className="divide-y divide-border/70">
                {reports.map((r) => (
                  <li key={r.id} className="px-4 py-3" data-testid={`recce-row-${r.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-brand-navy">{schoolName.get(r.schoolId) ?? r.schoolId}</span>
                      <span className="text-xs text-slate-500">{r.createdAt ? formatDate(r.createdAt) : ''} · {r.createdBy ?? ''}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{r.requirements}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
