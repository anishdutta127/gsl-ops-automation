/*
 * /schools/[schoolId] (Gate 3.5 Step 5 progressive disclosure rebuild).
 *
 * Single-tab-at-a-time layout. Tab state persists in the URL via the
 * ?tab=overview|mous|payments|dispatches|activity query param so the
 * view is bookmarkable and browser-back works.
 *
 * The cumulative actions visible at once collapse from the full
 * old-style flat list to the active tab's CTAs only. The "..." menu
 * for rare actions (Edit details, archive school, export, etc.) is
 * deferred to Phase 1.1; today the Edit button surfaces in the
 * header card per pre-Gate-3.5 behaviour.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type {
  KitDispatch,
  MOU,
  Payment,
  School,
  SchoolGroup,
  User,
} from '@/lib/types'
import schoolsJson from '@/data/schools.json'
import schoolGroupsJson from '@/data/school_groups.json'
import mousJson from '@/data/mous.json'
import paymentsJson from '@/data/payments.json'
import kitDispatchesJson from '@/data/kit_dispatches.json'
import escalationsJson from '@/data/escalations.json'
import type { Escalation } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { FileText, Inbox, Receipt, Truck } from 'lucide-react'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { EmptyState } from '@/components/ops/EmptyState'
import { StatusChip, type StatusChipTone } from '@/components/ops/StatusChip'
import { formatRs } from '@/lib/format'
import { AuditLogPanel } from '@/components/ops/AuditLogPanel'
import { StatusTracker } from '@/components/StatusTracker'
import { computeStage } from '@/lib/statusTracker'
import { isCriticalAudit } from '@/lib/criticalChanges'

const allSchools = schoolsJson as unknown as School[]
const allSchoolGroups = schoolGroupsJson as unknown as SchoolGroup[]
const allMous = mousJson as unknown as MOU[]
const allPayments = paymentsJson as unknown as Payment[]
const allKitDispatches = kitDispatchesJson as unknown as KitDispatch[]
const allEscalations = escalationsJson as unknown as Escalation[]

type TabKey = 'overview' | 'mous' | 'payments' | 'dispatches' | 'activity'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'mous', label: 'MOUs' },
  { key: 'payments', label: 'Payments & PIs' },
  { key: 'dispatches', label: 'Dispatches' },
  { key: 'activity', label: 'Activity' },
]

interface PageProps {
  params: Promise<{ schoolId: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const NOTICE_COPY: Record<string, string> = {
  saved: 'Saved. Will reflect everywhere within ~5 minutes.',
}

function canEdit(user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'OpsHead') return true
  if (user.testingOverride && user.testingOverridePermissions?.includes('OpsHead')) return true
  return false
}

function computeSchoolStatus(args: {
  schoolMous: MOU[]
  openEscalations: number
  overduePayments: number
  stalledDispatches: number
}): { label: 'Active' | 'At Risk' | 'Completed'; tone: StatusChipTone } {
  const { schoolMous, openEscalations, overduePayments, stalledDispatches } = args
  if (openEscalations > 0 || overduePayments > 0 || stalledDispatches > 0) {
    return { label: 'At Risk', tone: 'attention' }
  }
  if (schoolMous.length > 0 && schoolMous.every((m) => m.status === 'Completed' || m.status === 'Expired')) {
    return { label: 'Completed', tone: 'neutral' }
  }
  return { label: 'Active', tone: 'ok' }
}

export default async function SchoolDetailPage({ params, searchParams }: PageProps) {
  const { schoolId } = await params
  const sp = (await searchParams) ?? {}
  const noticeKey = typeof sp.notice === 'string' ? sp.notice : null
  const noticeMessage = noticeKey ? NOTICE_COPY[noticeKey] ?? null : null
  const activeTab: TabKey =
    typeof sp.tab === 'string' && (TABS.some((t) => t.key === sp.tab))
      ? (sp.tab as TabKey)
      : 'overview'
  // Gate 4.7 Step 5: Critical-only filter toggle on Activity tab.
  const criticalOnly = sp.critical === '1' || sp.critical === 'true'

  const school = allSchools.find((s) => s.id === schoolId)
  if (!school) notFound()

  const user = await getCurrentUser()
  const group = allSchoolGroups.find((g) => g.memberSchoolIds.includes(school.id))
  const schoolMous = allMous.filter((m) => m.schoolId === school.id)
  const mouIdsForSchool = new Set(schoolMous.map((m) => m.id))
  const schoolPayments = allPayments.filter((p) => mouIdsForSchool.has(p.mouId))
  const schoolDispatches = allKitDispatches.filter((d) => d.schoolId === school.id)
  const schoolEscalations = allEscalations.filter((e) => e.schoolId === school.id)

  const now = new Date()
  const nowMs = now.getTime()
  const openEscalations = schoolEscalations.filter((e) => e.status !== 'Closed').length
  const overduePayments = schoolPayments.filter((p) => {
    if (p.status === 'Paid') return false
    if (!p.dueDateIso) return false
    const due = new Date(p.dueDateIso).getTime()
    if (Number.isNaN(due)) return false
    return (nowMs - due) / 86400000 > 30
  }).length
  const stalledDispatches = schoolDispatches.filter((d) => {
    if (d.dispatchStatus === 'Delivered') return false
    const lastTs = d.auditLog?.[d.auditLog.length - 1]?.timestamp ?? null
    if (!lastTs) return false
    return (nowMs - new Date(lastTs).getTime()) / 86400000 > 14
  }).length

  const status = computeSchoolStatus({
    schoolMous,
    openEscalations,
    overduePayments,
    stalledDispatches,
  })
  const activeMousCount = schoolMous.filter((m) => m.status === 'Active').length
  const totalContractValue = schoolMous.reduce((s, m) => s + (m.contractValue ?? 0), 0)
  const totalBalance = schoolMous.reduce((s, m) => s + (m.balance ?? 0), 0)

  const statusBadge = (
    <StatusChip
      tone={status.tone === 'attention' ? 'alert' : status.tone}
      label={status.label}
      withDot={false}
      testId="school-status-pill"
      className="px-3 py-1 font-semibold"
    />
  )

  return (
    <>
      <TopNav currentPath="/schools" />
      <main id="main-content" data-testid="school-detail">
        {noticeMessage ? (
          <div
            role="status"
            data-testid="school-detail-notice"
            data-notice={noticeKey}
            className="border-b border-border bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {noticeMessage}
          </div>
        ) : null}
        <PageHeader
          title={school.name}
          breadcrumb={[
            { label: 'Schools', href: '/schools' },
            { label: school.id },
          ]}
        />
        <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
          {/* Header card */}
          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-heading text-2xl font-bold text-brand-navy">
                  {school.name}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {school.city}, {school.state} · {school.region}
                </p>
                {school.contactPerson || school.phone || school.email ? (
                  <p className="mt-1 text-xs text-slate-500">
                    SPOC: {school.contactPerson ?? '-'}
                    {school.phone ? ` · ${school.phone}` : ''}
                    {school.email ? ` · ${school.email}` : ''}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                {statusBadge}
                {canEdit(user) ? (
                  <Link
                    href={`/schools/${school.id}/edit`}
                    className="inline-flex min-h-9 items-center rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Edit
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Kpi label="Active MOUs" value={`${activeMousCount}`} />
              <Kpi label="Contract value" value={formatRs(totalContractValue)} />
              <Kpi label="Balance" value={formatRs(totalBalance)} />
            </div>
            {group ? (
              <p className="mt-3 text-xs text-slate-600">
                Chain membership: {group.name}{' '}
                <span className="font-mono text-[10px] text-muted-foreground">({group.id})</span>
              </p>
            ) : null}
          </section>

          {/*
           * GSTIN missing alert. Renders only on individual school detail
           * pages where PI generation against this school record is actually
           * possible. Suppressed on chain umbrella records (e.g.
           * SCH-NARAYANA_SCHOOL with city "9 Different Locations" sitting
           * as the sole member of a SchoolGroup): those carry no MOUs of
           * their own and the GROUP-scope MOUs surface GSTIN on the chain
           * parent view, not here. Misba's Gate 5A.6 audit (Step 7 Fix A).
           */}
          {school.gstNumber === null &&
          schoolMous.some((m) => m.schoolScope !== 'GROUP') ? (
            <div
              role="alert"
              className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2 text-sm text-signal-alert"
              data-testid="gstin-missing-alert"
            >
              GSTIN missing; PI generation blocked for this school.
            </div>
          ) : null}

          {/* Tab strip */}
          <div role="tablist" aria-label="School views" className="flex flex-wrap gap-1 border-b border-border" data-testid="school-tablist">
            {TABS.map((t) => {
              const isActive = t.key === activeTab
              return (
                <Link
                  key={t.key}
                  href={`/schools/${school.id}?tab=${t.key}`}
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`tab-${t.key}`}
                  data-active={isActive}
                  className={
                    'inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy ' +
                    (isActive
                      ? 'border-b-2 border-brand-teal text-brand-navy'
                      : 'border-b-2 border-transparent text-slate-600 hover:text-brand-navy')
                  }
                >
                  {t.label}
                </Link>
              )
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <OverviewPanel
              school={school}
              schoolMous={schoolMous}
              escalations={schoolEscalations}
            />
          )}
          {activeTab === 'mous' && (
            <MousPanel
              school={school}
              schoolMous={schoolMous}
              schoolPayments={schoolPayments}
              schoolKitDispatches={schoolDispatches}
              canDraftMou={user !== null && canEditMOU(user)}
            />
          )}
          {activeTab === 'payments' && (
            <PaymentsPanel payments={schoolPayments} />
          )}
          {activeTab === 'dispatches' && (
            <DispatchesPanel dispatches={schoolDispatches} />
          )}
          {activeTab === 'activity' && (
            <ActivityPanel school={school} criticalOnly={criticalOnly} />
          )}
        </div>
      </main>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 font-heading text-lg font-bold text-brand-navy">{value}</div>
    </div>
  )
}

function OverviewPanel({
  school,
  schoolMous,
  escalations,
}: {
  school: School
  schoolMous: MOU[]
  escalations: Escalation[]
}) {
  const recentMous = schoolMous.slice(0, 3)
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6" data-testid="panel-overview">
      <h2 className="font-heading text-base font-semibold text-brand-navy">
        Most recent MOU activity
      </h2>
      {recentMous.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            icon={<FileText aria-hidden className="size-6" />}
            title="No MOUs for this school yet"
            description="MOUs appear here once they are drafted against this school."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {recentMous.map((m) => (
            <li key={m.id} className="py-2 text-sm">
              <Link href={`/mous/${m.id}`} className="text-brand-navy hover:underline">
                <span className="font-mono text-xs">{m.id}</span>{' '}
                <span className="ml-1">{m.programme}</span>{' '}
                <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">{m.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {escalations.filter((e) => e.status !== 'Closed').length > 0 ? (
        <p className="mt-3 text-xs text-signal-alert">
          {escalations.filter((e) => e.status !== 'Closed').length} open escalation(s); see Activity tab.
        </p>
      ) : null}
      {school.notes ? (
        <div className="mt-4 rounded-md border border-border bg-slate-50 p-3 text-sm text-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</div>
          <p className="mt-1">{school.notes}</p>
        </div>
      ) : null}
    </section>
  )
}

function MousPanel({
  school,
  schoolMous,
  schoolPayments,
  schoolKitDispatches,
  canDraftMou,
}: {
  school: School
  schoolMous: MOU[]
  schoolPayments: Payment[]
  schoolKitDispatches: KitDispatch[]
  canDraftMou: boolean
}) {
  // Gate 4.7 Step 2: per-MOU mini-tracker (compact mode of the Gate 4
  // StatusTracker) renders below each MOU row. Pre-compute per-MOU
  // payment + dispatch slices once so the stage compute scales.
  const now = new Date()
  const paymentsByMou = new Map<string, Payment[]>()
  for (const p of schoolPayments) {
    const list = paymentsByMou.get(p.mouId) ?? []
    list.push(p)
    paymentsByMou.set(p.mouId, list)
  }
  const dispatchesByMou = new Map<string, KitDispatch[]>()
  for (const d of schoolKitDispatches) {
    const list = dispatchesByMou.get(d.mouId) ?? []
    list.push(d)
    dispatchesByMou.set(d.mouId, list)
  }
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6" data-testid="panel-mous">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          MOUs ({schoolMous.length})
        </h2>
        {canDraftMou ? (
          <Link
            href={`/mous/new?schoolId=${encodeURIComponent(school.id)}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-brand-teal bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-teal/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            data-testid="school-new-mou-cta"
          >
            + Draft new MOU
          </Link>
        ) : null}
      </div>
      {schoolMous.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden className="size-6" />}
          title="No MOUs for this school"
          description="Use Draft new MOU to create the first one."
        />
      ) : (
        <ul className="divide-y divide-border">
          {schoolMous.map((m) => {
            const stage = computeStage({
              mou: m,
              payments: paymentsByMou.get(m.id) ?? [],
              dispatches: dispatchesByMou.get(m.id) ?? [],
              now,
            })
            return (
              <li key={m.id} className="space-y-2 py-3 text-sm">
                <Link
                  href={`/mous/${m.id}`}
                  className="inline-flex flex-wrap items-baseline gap-2 text-brand-navy hover:underline focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  data-testid={`school-mou-link-${m.id}`}
                >
                  <span className="font-mono text-xs">{m.id}</span>
                  <span>
                    {m.programme}
                    {m.programmeSubType ? ' / ' + m.programmeSubType : ''}
                  </span>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                    {m.status}
                  </span>
                </Link>
                <div data-testid={`school-mou-tracker-${m.id}`}>
                  <StatusTracker
                    current={stage}
                    compact
                    mouId={m.id}
                    testId={`mini-tracker-${m.id}`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PaymentsPanel({ payments }: { payments: Payment[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6" data-testid="panel-payments">
      <h2 className="font-heading text-base font-semibold text-brand-navy">
        Payments &amp; PIs ({payments.length})
      </h2>
      {payments.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            icon={<Receipt aria-hidden className="size-6" />}
            title="No installments yet"
            description="Installment rows appear once the first MOU is signed."
          />
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="py-2 pr-3 font-medium">Instalment</th>
                <th className="py-2 pr-3 font-medium">PI</th>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Received</th>
                <th className="py-2 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 text-xs">{p.instalmentLabel}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">
                    {p.piNumber ?? '-'}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{formatRs(p.expectedAmount ?? 0)}</td>
                  <td className="py-1.5 pr-3 text-xs">
                    {p.receivedAmount ? formatRs(p.receivedAmount) : '-'}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DispatchesPanel({ dispatches }: { dispatches: KitDispatch[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6" data-testid="panel-dispatches">
      <h2 className="font-heading text-base font-semibold text-brand-navy">
        Kit dispatches ({dispatches.length})
      </h2>
      {dispatches.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            icon={<Truck aria-hidden className="size-6" />}
            title="No kit dispatches yet"
            description="Dispatches appear here once raised against an MOU."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {dispatches.map((d) => (
            <li key={d.id} className="py-2 text-sm">
              <Link
                href={`/dispatch/kits/${d.mouId}`}
                className="text-brand-navy hover:underline"
              >
                <span className="font-mono text-xs">{d.id}</span>{' '}
                <span className="ml-1">{d.productSelected}</span>{' '}
                <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px]">
                  {d.dispatchStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ActivityPanel({
  school,
  criticalOnly,
}: {
  school: School
  criticalOnly: boolean
}) {
  const allEntries = school.auditLog ?? []
  const entries = criticalOnly
    ? allEntries.filter((e) => isCriticalAudit(e))
    : allEntries
  // Toggle URL: flip ?critical=1 on / off while preserving the activity
  // tab and any other params. Constructed as a plain href so the server
  // component does not need client-side state.
  const baseQuery = `?tab=activity${criticalOnly ? '' : '&critical=1'}`
  return (
    <section
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
      data-testid="panel-activity"
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          Activity
        </h2>
        <Link
          href={`/schools/${school.id}${baseQuery}`}
          data-testid="activity-critical-only-toggle"
          aria-pressed={criticalOnly}
          className={
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy '
            + (criticalOnly
              ? 'border-brand-navy bg-brand-navy text-white hover:bg-brand-navy/90'
              : 'border-border bg-white text-brand-navy hover:bg-slate-50')
          }
        >
          {criticalOnly ? 'Showing critical only' : 'Critical only'}
        </Link>
      </header>
      {entries.length === 0 ? (
        <div data-testid="activity-empty">
          <EmptyState
            icon={<Inbox aria-hidden className="size-6" />}
            title={criticalOnly ? 'No critical changes on this school yet' : 'No activity recorded yet'}
            description={criticalOnly ? 'Toggle Critical only off to see every audit entry.' : 'Audit entries appear here as actions are taken on this school.'}
          />
        </div>
      ) : (
        <AuditLogPanel entries={entries} />
      )}
    </section>
  )
}
