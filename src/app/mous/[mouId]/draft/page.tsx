/*
 * /mous/[mouId]/draft (Step 5).
 *
 * In-browser annexure editor. Reads the MOU's draftVariables (or empty
 * map for non-draft MOUs that haven't been touched by the generator),
 * renders the per-template placeholder catalog, and autosaves to
 * mous.json's draftVariables via /api/mou/save-draft.
 *
 * gsl-mou-system did NOT have a separate draft route; the annexure
 * editor was a section of GeneratorWizard. The brief asks for a
 * separate Ops route. To preserve Pranav's muscle memory, we keep the
 * field shape, validation messages, and the field-by-field layout
 * identical to gsl-mou-system's GeneratorWizard "Annexure A" fieldset
 * - see DraftAnnexureEditor for the client part.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ops/BackButton'
import type { MOU, User } from '@/lib/types'
import { mouRepo } from '@/lib/db/repos/mou'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { getTemplate } from '@/lib/mouSystem/templates'
import type { Programme } from '@/lib/mouSystem/types'
import { DraftAnnexureEditor } from '@/components/mou-system/DraftAnnexureEditor'

interface PageProps {
  params: Promise<{ mouId: string }>
}

function isVisibleToUser(mou: MOU, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'SalesRep') return mou.salesPersonId === user.id
  return true
}

export default async function DraftAnnexurePage({ params }: PageProps) {
  const { mouId } = await params
  const user = await getCurrentUser()
  const allMous = await mouRepo.findAll()
  const mou = allMous.find((m) => m.id === mouId)
  if (!mou || !isVisibleToUser(mou, user)) notFound()
  if (!user || !canEditMOU(user)) notFound()

  // Resolve template. Drafts saved by the wizard carry templateVersion
  // = templateId (e.g., 'STEAM-v3'); imported MOUs carry null. Fall
  // back to the programme-default template so the editor still has a
  // placeholder catalog to render.
  const template =
    (mou.templateVersion ? getTemplate(mou.templateVersion) : null) ??
    getTemplate(`${mou.programme === 'Young Pioneers' ? 'YP' : mou.programme === 'Harvard HBPE' ? 'HBPE' : 'STEAM'}-v3`)

  if (!template) notFound()

  return (
    <>
      <TopNav currentPath="/mous" />
      <main id="main-content">
        <PageHeader
          title={`${mou.schoolName} {'·'} Annexure`}
          breadcrumb={[
            { label: 'MOUs', href: '/mous' },
            { label: mou.id, href: `/mous/${mou.id}` },
            { label: 'Annexure' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6">
          <BackButton />
          <div className="mb-4 mt-3 text-xs text-muted-foreground">
            <Link
              href={`/mous/${mou.id}`}
              className="hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              {'←'} Back to MOU detail
            </Link>
          </div>
          <DraftAnnexureEditor
            mouId={mou.id}
            templateId={template.id}
            programme={mou.programme as Programme}
            placeholders={template.placeholders}
            initialValues={mou.draftVariables ?? {}}
            initialAnnexureHtml={mou.draftVariables?._ANNEXURE_HTML ?? ''}
            currentUserId={user.id}
            currentUserName={user.name}
          />
        </div>
      </main>
    </>
  )
}
