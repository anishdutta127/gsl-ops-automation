/*
 * /operations/welcome (Step 3/4) - Welcome notes index.
 *
 * The front door for the Welcome Note feature: the MOUs Finance entered,
 * with their welcome sent/pending status, linking to each note. Source is
 * the same MOU list (entered by Finance), per Pranav.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { StatusChip } from '@/components/ops/StatusChip'
import { mouRepo } from '@/lib/db/repos/mou'
import { welcomeNoteRepo } from '@/lib/db/repos/step3'
import { getCurrentUser } from '@/lib/auth/session'

export default async function WelcomeNotesIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fwelcome')

  const [mous, notes] = await Promise.all([mouRepo.findAll(), welcomeNoteRepo.findAll()])
  const sentByMou = new Map(notes.map((n) => [n.mouId, n]))
  const rows = mous
    .filter((m) => m.status === 'Active')
    .map((m) => ({ mou: m, note: sentByMou.get(m.id) ?? null }))
    // pending first
    .sort((a, b) => Number(a.note?.status === 'sent') - Number(b.note?.status === 'sent') || a.mou.schoolName.localeCompare(b.mou.schoolName))

  const pendingCount = rows.filter((r) => r.note?.status !== 'sent').length

  return (
    <>
      <TopNav currentPath="/operations/welcome" />
      <main id="main-content">
        <PageHeader
          title="Welcome notes"
          subtitle={`${pendingCount} school(s) awaiting a welcome note. Recorded-status only - no email is dispatched yet.`}
          breadcrumb={[{ label: 'Operations', href: '/work/ops' }, { label: 'Welcome notes' }]}
        />
        <div className="mx-auto max-w-screen-lg px-4 py-6">
          <div className="overflow-hidden rounded-md border border-border bg-card" data-testid="welcome-index">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2 font-medium">School</th>
                  <th className="px-4 py-2 font-medium">Programme / Year</th>
                  <th className="px-4 py-2 font-medium">Welcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ mou, note }) => (
                  <tr key={mou.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Link href={`/operations/welcome/${mou.id}`} className="font-medium text-brand-navy underline-offset-2 hover:underline">
                        {mou.schoolName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{mou.programme} · {mou.academicYear}</td>
                    <td className="px-4 py-2">
                      <StatusChip tone={note?.status === 'sent' ? 'ok' : 'attention'} label={note?.status === 'sent' ? 'Sent' : 'Pending'} withDot={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  )
}
