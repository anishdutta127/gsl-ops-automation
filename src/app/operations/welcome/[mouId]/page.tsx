/*
 * /operations/welcome/[mouId] (Step 3 Welcome Note).
 *
 * Ops reviews/edits the templated welcome note for a school and sends it.
 * Recorded-status only (no email send infra): "Send" records sent + the
 * Ops dashboard tracks sent-vs-pending. Source list is the MOUs Finance
 * entered (per Pranav).
 */

import { notFound, redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { mouRepo } from '@/lib/db/repos/mou'
import { schoolRepo } from '@/lib/db/repos/school'
import { welcomeNoteRepo } from '@/lib/db/repos/step3'
import { getCurrentUser } from '@/lib/auth/session'
import { canRaiseDispatch } from '@/lib/access'
import { buildDefaultWelcomeNote } from '@/lib/welcomeNote'
import { formatDate } from '@/lib/format'

const NOTICES: Record<string, string> = {
  sent: 'Welcome note recorded as sent. (No email is dispatched yet - send-wiring is a follow-up.)',
  saved: 'Draft saved.',
}
const ERRORS: Record<string, string> = {
  permission: 'Only Ops and Admin can send welcome notes.',
  empty: 'The note cannot be empty.',
  'save-failed': 'Save failed. Retry.',
}

interface PageProps {
  params: Promise<{ mouId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function WelcomeNotePage({ params, searchParams }: PageProps) {
  const { mouId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/operations/welcome/${mouId}`)}`)

  const mou = await mouRepo.findById(mouId)
  if (!mou) notFound()
  const [school, existing] = await Promise.all([
    schoolRepo.findById(mou.schoolId),
    welcomeNoteRepo.findByMouId(mouId),
  ])

  const noteText = existing?.noteText?.trim() ? existing.noteText : buildDefaultWelcomeNote(mou, school)
  const isSent = existing?.status === 'sent'
  const canAct = canRaiseDispatch(user!)
  const notice = typeof sp.sent === 'string' ? 'sent' : typeof sp.saved === 'string' ? 'saved' : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null

  return (
    <>
      <TopNav currentPath="/work/ops" />
      <main id="main-content">
        <PageHeader
          title={`Welcome note - ${mou.schoolName}`}
          subtitle={`${mou.id} - ${mou.programme} - AY ${mou.academicYear}`}
          breadcrumb={[{ label: 'Ops', href: '/work/ops' }, { label: 'Welcome note' }]}
        />
        <div className="mx-auto max-w-2xl px-4 py-6">
          {notice && (
            <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" data-testid="welcome-notice">
              {NOTICES[notice]}
            </div>
          )}
          {errorKey && (
            <div className="mb-4 rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert" data-testid="welcome-error">
              {ERRORS[errorKey] ?? errorKey}
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-slate-700">Status:</span>
            <StatusChip tone={isSent ? 'ok' : 'attention'} label={isSent ? 'Sent' : 'Pending'} withDot={false} testId="welcome-status-chip" />
            {isSent && existing?.sentAt && (
              <span className="text-xs text-slate-500">on {formatDate(existing.sentAt)} by {existing.sentBy ?? 'unknown'}</span>
            )}
          </div>

          <form method="POST" action={`/api/mou/${mou.id}/welcome-note`} className="space-y-3 rounded-md border border-border bg-card p-4" data-testid="welcome-form">
            <label htmlFor="noteText" className="block text-sm font-medium text-brand-navy">Welcome note (editable)</label>
            <textarea
              id="noteText" name="noteText" rows={14} defaultValue={noteText}
              readOnly={!canAct}
              className="w-full rounded-md border border-border bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
              data-testid="welcome-textarea"
            />
            {canAct && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" name="action" value="save"
                  className="inline-flex min-h-10 items-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-slate-50"
                  data-testid="welcome-save">
                  Save draft
                </button>
                <button type="submit" name="action" value="send"
                  className="inline-flex min-h-10 items-center rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
                  data-testid="welcome-send">
                  {isSent ? 'Re-record as sent' : 'Send welcome note'}
                </button>
                <span className="text-xs text-slate-500">Sending records the note; no email is dispatched yet.</span>
              </div>
            )}
          </form>
        </div>
      </main>
    </>
  )
}
