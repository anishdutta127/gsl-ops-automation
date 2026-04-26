/*
 * /admin/spocs (Phase C5b placeholder).
 *
 * The SPOC entity model is deferred to Phase 1.1. The cardinality
 * decision (single-per-school vs multi-per-school vs per-MOU
 * overrides) is product-level and depends on tester workflow
 * feedback. In Phase 1, SPOC contact information lives as embedded
 * fields on School (contactPerson / email / phone) and is edited via
 * /schools/[id]/edit.
 *
 * Permission gate: Admin or OpsHead. Other viewers redirect to
 * /dashboard so the route shape stays consistent with the live admin
 * surfaces.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { effectiveRoles } from '@/lib/auth/permissions'

export default async function SpocsPlaceholderPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fspocs')

  const roles = effectiveRoles(user)
  const allowed = roles.includes('Admin') || roles.includes('OpsHead')
  if (!allowed) redirect('/dashboard')

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">SPOCs</h1>
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Phase 1 note: SPOC editing happens via the school detail page. To update
        a school&rsquo;s contact person, email, or phone, go to{' '}
        <Link
          href="/schools"
          className="font-medium text-[var(--brand-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
        >
          Schools
        </Link>
        , find the school, click Edit. The SPOC fields are part of the school
        record. A separate SPOC management surface is deferred to Phase 1.1
        once cardinality requirements are clear.
      </p>
      <p className="mt-3 text-xs text-slate-600">
        See <code className="rounded bg-slate-100 px-1">docs/RUNBOOK.md</code> &sect; 10 for the deferral note and trigger.
      </p>
    </div>
  )
}
