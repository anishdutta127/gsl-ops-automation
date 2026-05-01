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
 * W4-I.5 P4C2: wrapped in TopNav + PageHeader so the admin nav and
 * breadcrumb stay consistent with the rest of the admin surface.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

export default async function SpocsPlaceholderPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fspocs')

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="SPOCs"
          subtitle="Phase 1 placeholder; SPOC editing lives on the school detail page."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'SPOCs' },
          ]}
        />
        <div className="mx-auto max-w-screen-md space-y-3 px-4 py-6">
          <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground">
            Phase 1 note: SPOC editing happens via the school detail page. To update
            a school&rsquo;s contact person, email, or phone, go to{' '}
            <Link
              href="/schools"
              className="font-medium text-brand-navy underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
            >
              Schools
            </Link>
            , find the school, click Edit. The SPOC fields are part of the school
            record. A separate SPOC management surface is deferred to Phase 1.1
            once cardinality requirements are clear.
          </p>
          <p className="text-xs text-muted-foreground">
            See <code className="rounded bg-muted px-1">docs/RUNBOOK.md</code> &sect; 10 for the deferral note and trigger.
          </p>
        </div>
      </main>
    </>
  )
}
