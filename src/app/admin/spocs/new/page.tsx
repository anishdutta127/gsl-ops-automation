/*
 * /admin/spocs/new (Phase 1 placeholder).
 *
 * SPOC creation surface deferred to Phase 1.1 (see /admin/spocs).
 * W4-I.5 P4C2 wraps the placeholder in TopNav + PageHeader so the
 * breadcrumb stays consistent across the admin surface.
 */

import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

export default function Page() {
  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="New SPOC"
          subtitle="Phase 1 placeholder. SPOC creation (self-serve) is deferred to Phase 1.1."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'SPOCs', href: '/admin/spocs' },
            { label: 'New' },
          ]}
        />
      </main>
    </>
  )
}
