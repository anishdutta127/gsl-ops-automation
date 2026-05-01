/*
 * /sales-pipeline/[id] (W4-F.3 detail page).
 *
 * Server component. Reads the opportunity by id, renders all 12
 * fields plus the audit log, and surfaces the W4-F.3 did-you-mean
 * inline panel when:
 *   - opportunity.schoolId is null
 *   - opportunity.schoolMatchDismissed is false
 *   - findSchoolMatch returns a candidate above the 0.7 threshold
 *
 * Action buttons (permission-gated):
 *   - Edit              -> /sales-pipeline/[id]/edit
 *   - Mark as lost      -> /sales-pipeline/[id]/mark-lost
 *
 * Lost opportunities render a "Lost" pill at the top + dim the
 * action buttons (the row stays visible for history).
 */

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import salesOpportunitiesJson from '@/data/sales_opportunities.json'
import salesTeamJson from '@/data/sales_team.json'
import schoolsJson from '@/data/schools.json'
import usersJson from '@/data/users.json'
import type {
  SalesOpportunity,
  SalesPerson,
  School,
  User,
} from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton, opsButtonClass } from '@/components/ops/OpsButton'
import { findSchoolMatch } from '@/lib/salesOpportunity/findSchoolMatch'
import {
  linkExistingSchoolAction,
  dismissSchoolMatchAction,
} from '../actions'

const allOpportunities = salesOpportunitiesJson as unknown as SalesOpportunity[]
const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
const allSchools = schoolsJson as unknown as School[]
const allUsers = usersJson as unknown as User[]

const FLASH_MESSAGES: Record<string, string> = {
  created: 'Opportunity created.',
  edited: 'Opportunity updated.',
  'marked-lost': 'Opportunity marked as lost. The row stays visible for history.',
  linked: 'Linked to existing school.',
  dismissed: 'Did-you-mean suggestion dismissed; this opportunity stays a new school.',
}

const ERROR_MESSAGES: Record<string, string> = {
  permission: 'You do not have permission to perform this action.',
  'not-creator-and-not-lead': 'Only the creator or a SalesHead/Admin can edit this row.',
  'opportunity-not-found': 'Opportunity not found.',
  'no-changes': 'No fields changed.',
  'already-lost': 'This opportunity is already marked as lost.',
  'missing-loss-reason': 'A loss reason is required.',
  'missing-school-id': 'No school was selected.',
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OpportunityDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) {
    redirect(`/login?next=%2Fsales-pipeline%2F${encodeURIComponent(id)}`)
  }

  const opp = allOpportunities.find((o) => o.id === id)
  if (!opp) return notFound()

  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const flashes: string[] = []
  if (sp.created === '1') flashes.push(FLASH_MESSAGES.created!)
  if (typeof sp.edited === 'string') flashes.push(FLASH_MESSAGES.edited!)
  if (sp['marked-lost'] === '1') flashes.push(FLASH_MESSAGES['marked-lost']!)
  if (sp.linked === '1') flashes.push(FLASH_MESSAGES.linked!)
  if (sp.dismissed === '1') flashes.push(FLASH_MESSAGES.dismissed!)

  const rep = allSalesTeam.find((s) => s.id === opp.salesRepId)
  const linkedSchool = opp.schoolId ? allSchools.find((s) => s.id === opp.schoolId) : null

  const canEditAnyRow = user.role === 'Admin' || user.role === 'SalesHead'
  const canEdit = canPerform(user, 'sales-opportunity:edit')
    && (canEditAnyRow || opp.createdBy === user.id)
    && opp.lossReason === null
  const canMarkLost = canPerform(user, 'sales-opportunity:mark-lost')
    && (canEditAnyRow || opp.createdBy === user.id)
    && opp.lossReason === null

  // Did-you-mean: surfaces only when not yet linked + not dismissed +
  // a token-match candidate exists.
  const suggestion = opp.schoolId === null && !opp.schoolMatchDismissed
    ? findSchoolMatch(opp.schoolName, allSchools)
    : null

  function userName(uid: string): string {
    return allUsers.find((u) => u.id === uid)?.name ?? uid
  }

  return (
    <>
      <TopNav currentPath="/sales-pipeline" />
      <PageHeader
        title={opp.schoolName}
        breadcrumb={[
          { label: 'Sales pipeline', href: '/sales-pipeline' },
          { label: opp.id },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href="/sales-pipeline"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to pipeline
        </Link>

        {flashes.map((text, i) => (
          <p
            key={i}
            role="status"
            data-testid="opp-detail-flash"
            className="flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-2 text-xs text-signal-ok"
          >
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            <span>{text}</span>
          </p>
        ))}

        {errorKey ? (
          <p
            role="alert"
            data-testid="opp-detail-error"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-xs text-signal-alert"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_MESSAGES[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        {opp.lossReason !== null ? (
          <p
            data-testid="opp-detail-lost-pill"
            className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-xs text-foreground"
          >
            <XCircle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span>
              <strong>Lost.</strong> Reason: {opp.lossReason}
            </span>
          </p>
        ) : null}

        {suggestion ? (
          <section
            data-testid="opp-detail-school-suggestion"
            className="rounded-md border border-signal-attention bg-signal-attention/10 p-3 text-xs text-signal-attention"
          >
            <p className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              <span>
                Token match found: this opportunity&rsquo;s school name resembles{' '}
                <strong>{suggestion.schoolName}</strong>{' '}
                <span className="text-signal-attention/80">({suggestion.city}, score {suggestion.score.toFixed(2)})</span>
                {' '}in our directory. Pick one of the actions below; we won&rsquo;t auto-link.
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={linkExistingSchoolAction}>
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="schoolId" value={suggestion.schoolId} />
                <OpsButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  data-testid="opp-link-existing-school"
                >
                  Link to {suggestion.schoolName}
                </OpsButton>
              </form>
              <form action={dismissSchoolMatchAction}>
                <input type="hidden" name="id" value={opp.id} />
                <OpsButton
                  type="submit"
                  variant="outline"
                  size="sm"
                  data-testid="opp-dismiss-school-match"
                >
                  Keep as new school
                </OpsButton>
              </form>
            </div>
          </section>
        ) : null}

        <section className="rounded-md border border-border bg-card p-4">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Opportunity</p>
              <p className="font-mono text-sm text-brand-navy">{opp.id}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Link
                  href={`/sales-pipeline/${encodeURIComponent(opp.id)}/edit`}
                  data-testid="opp-detail-edit-link"
                  className={opsButtonClass({ variant: 'primary', size: 'md' })}
                >
                  <Pencil aria-hidden className="size-4" /> Edit
                </Link>
              ) : null}
              {canMarkLost ? (
                <Link
                  href={`/sales-pipeline/${encodeURIComponent(opp.id)}/mark-lost`}
                  data-testid="opp-detail-mark-lost-link"
                  className={opsButtonClass({ variant: 'outline', size: 'md' })}
                >
                  <XCircle aria-hidden className="size-4" /> Mark as lost
                </Link>
              ) : null}
            </div>
          </header>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">School</dt>
              <dd>
                {opp.schoolName}
                {linkedSchool ? (
                  <Link
                    href={`/schools/${linkedSchool.id}`}
                    className="ml-1 inline-flex items-center gap-0.5 text-xs text-brand-navy hover:underline"
                  >
                    <ExternalLink aria-hidden className="size-3" />
                    {linkedSchool.id}
                  </Link>
                ) : (
                  <span className="ml-1 text-xs text-muted-foreground">(not linked)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sales rep</dt>
              <dd>{rep ? rep.name : opp.salesRepId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">City / State</dt>
              <dd>
                {opp.city}, {opp.state}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Region</dt>
              <dd>{opp.region}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Programme proposed</dt>
              <dd>{opp.programmeProposed ?? <em className="text-muted-foreground">not set</em>}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">GSL Model</dt>
              <dd>{opp.gslModel ?? <em className="text-muted-foreground">not set</em>}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd className="font-medium">{opp.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Recce status</dt>
              <dd>{opp.recceStatus ?? <em className="text-muted-foreground">not set</em>}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Recce completed</dt>
              <dd>{opp.recceCompletedAt ?? <em className="text-muted-foreground">not set</em>}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Commitments made</dt>
              <dd className="whitespace-pre-wrap">
                {opp.commitmentsMade ?? <em className="text-muted-foreground">none</em>}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Out-of-scope requirements</dt>
              <dd className="whitespace-pre-wrap">
                {opp.outOfScopeRequirements ?? <em className="text-muted-foreground">none</em>}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Approval notes</dt>
              <dd className="whitespace-pre-wrap">
                {opp.approvalNotes ?? <em className="text-muted-foreground">none</em>}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Created</dt>
              <dd>
                {new Date(opp.createdAt).toLocaleString('en-IN')}
                {' by '}
                {userName(opp.createdBy)}
              </dd>
            </div>
            {opp.conversionMouId ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Converted to MOU</dt>
                <dd>
                  <Link
                    href={`/mous/${opp.conversionMouId}`}
                    className="inline-flex items-center gap-1 text-brand-navy hover:underline"
                  >
                    {opp.conversionMouId}
                    <ExternalLink aria-hidden className="size-3" />
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section
          data-testid="opp-detail-audit-log"
          className="rounded-md border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy">
            Audit log
          </h2>
          {opp.auditLog.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ul className="mt-2 space-y-3 text-xs">
              {[...opp.auditLog].reverse().map((entry, idx) => {
                const before = entry.before
                const after = entry.after
                const fields = before && after
                  ? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
                  : []
                return (
                  <li
                    key={idx}
                    data-testid="opp-detail-audit-entry"
                    className="rounded-md border border-border bg-muted/30 p-2"
                  >
                    <p>
                      <span className="font-mono text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString('en-IN')}
                      </span>
                      {' · '}
                      <span className="font-medium">{userName(entry.user)}</span>
                      {' · '}
                      <span className="font-mono text-brand-navy">{entry.action}</span>
                    </p>
                    {fields.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-foreground">
                        {fields.map((f) => (
                          <li key={f}>
                            <span className="font-medium">{f}</span>:{' '}
                            <span className="text-signal-alert">{JSON.stringify(before?.[f] ?? null)}</span>
                            {' → '}
                            <span className="text-signal-ok">{JSON.stringify(after?.[f] ?? null)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {entry.notes ? (
                      <p className="mt-1 text-muted-foreground">{entry.notes}</p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
