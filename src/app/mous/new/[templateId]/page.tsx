/*
 * /mous/new/[templateId] (Step 5).
 *
 * Generator wizard host. Picks the right template from the mou-system
 * registry, hydrates schools + sales-team from Ops's data files, and
 * renders the GeneratorWizard client component. Mirrors gsl-mou-system's
 * /mous/new/[templateId] route shape so Pranav's bookmarks and muscle
 * memory survive the migration.
 *
 * Per-role: gated by canEditMOU (Sales + Admin).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SalesPerson, School } from '@/lib/mouSystem/types'
import schoolsJson from '@/data/schools.json'
import salesTeamJson from '@/data/sales_team.json'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { getTemplate, listTemplates } from '@/lib/mouSystem/templates'
import { GeneratorWizard } from '@/components/mou-system/GeneratorWizard'

const allSchools = schoolsJson as unknown as School[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]

export function generateStaticParams() {
  return listTemplates().map((t) => ({ templateId: t.id }))
}

interface PageProps {
  params: Promise<{ templateId: string }>
}

export default async function GeneratorPage({ params }: PageProps) {
  const { templateId } = await params
  const user = await getCurrentUser()
  if (!user || !canEditMOU(user)) {
    notFound()
  }
  const template = getTemplate(decodeURIComponent(templateId))
  if (!template) notFound()

  const minAcceptable = template.placeholders.PRICE_PER_STUDENT?.minAcceptable ?? null

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={template.displayName}
          subtitle={`${template.programme} · ${template.id}`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: 'New', href: '/mous/new' },
            { label: template.id },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <div className="mb-4">
            <Link
              href="/mous/new"
              className="text-sm text-muted-foreground hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              {'←'} Pick a different template
            </Link>
          </div>
          <GeneratorWizard
            template={template}
            currentUserId={user.id}
            currentUserName={user.name}
            schools={allSchools.map((s) => ({
              id: s.id,
              name: s.name,
              legalEntity: s.legalEntity,
              city: s.city,
              state: s.state,
              pinCode: s.pinCode,
              pan: s.pan,
              gstNumber: s.gstNumber,
              contactPerson: s.contactPerson,
              email: s.email,
              phone: s.phone,
              billingName: s.billingName,
            }))}
            salesTeam={allSalesTeam}
            minAcceptable={minAcceptable}
            rateCardVariant={template.rateCardVariant ?? null}
          />
        </div>
      </main>
    </>
  )
}
