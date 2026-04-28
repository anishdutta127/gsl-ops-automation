/*
 * /admin/reminders (W4-E.4 list page).
 *
 * Server component. Loads the system state, runs detectDueReminders,
 * groups by kind, applies the kind+sales-rep filters from the URL
 * search params, and renders one row per reminder with a Compose
 * link that routes to /admin/reminders/[reminderId].
 *
 * Visible to every authenticated user (W3-B). The compose / mark-sent
 * libs enforce canPerform('reminder:create') server-side. The Admin-
 * only 'reminder:view-all' gate is informational on this page; Phase 1
 * shows the full list to every authenticated user (UI gating off).
 *
 * Filters in the URL:
 *   ?kind=<intake|payment|delivery-ack|feedback-chase|all>
 *   ?owner=<sp-... | all>
 *   ?error=<reason>          (set by actions.ts on failure)
 *   ?sent=<communicationId>  (set by actions.ts on success)
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Bell, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { detectDueReminders, type ReminderKind } from '@/lib/reminders/detectDueReminders'
import salesTeamJson from '@/data/sales_team.json'
import mousJson from '@/data/mous.json'
import type { MOU, SalesPerson } from '@/lib/types'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'

const ALL_KINDS: ReadonlyArray<ReminderKind | 'all'> = [
  'all',
  'intake',
  'payment',
  'delivery-ack',
  'feedback-chase',
]

const KIND_LABEL: Record<ReminderKind | 'all', string> = {
  all: 'All',
  intake: 'Intake',
  payment: 'Payment',
  'delivery-ack': 'Delivery ack',
  'feedback-chase': 'Feedback chase',
}

const KIND_BADGE: Record<ReminderKind, string> = {
  intake: 'bg-amber-100 text-amber-900 border-amber-300',
  payment: 'bg-rose-100 text-rose-900 border-rose-300',
  'delivery-ack': 'bg-sky-100 text-sky-900 border-sky-300',
  'feedback-chase': 'bg-violet-100 text-violet-900 border-violet-300',
}

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to compose reminders. The reminder:create action covers Sales, Ops, and Admin.',
  'unknown-user': 'Session user not recognised; sign in again.',
  'reminder-not-found': 'That reminder is no longer due (state changed since the page loaded).',
  'no-recipient': 'The reminder has no resolved recipient. Check the MOU sales-owner or school SPOC email.',
  'missing-app-url': 'NEXT_PUBLIC_APP_URL is not set; ask Ops to configure the env var.',
  'already-sent': 'That reminder has already been marked as sent.',
  'not-a-reminder': 'Communication is not a reminder type; cannot mark via this surface.',
  'wrong-status': 'Communication is not in queued-for-manual status; cannot mark sent.',
  'communication-not-found': 'Communication record not found.',
  'missing-reminder-id': 'No reminder id was passed; refresh the page and try again.',
  'missing-communication-id': 'No communication id was passed; refresh the page and try again.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RemindersListPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Freminders')

  const sp = await searchParams
  const rawKind = typeof sp.kind === 'string' ? sp.kind : 'all'
  const kind: ReminderKind | 'all' = (ALL_KINDS as ReadonlyArray<string>).includes(rawKind)
    ? (rawKind as ReminderKind | 'all')
    : 'all'
  const owner = typeof sp.owner === 'string' ? sp.owner : 'all'
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const sentId = typeof sp.sent === 'string' ? sp.sent : null

  const reminders = detectDueReminders()
  const allMous = mousJson as unknown as MOU[]
  const allSalesTeam = salesTeamJson as unknown as SalesPerson[]
  const mouById = new Map(allMous.map((m) => [m.id, m]))

  const ownerOptions = Array.from(
    new Set(
      reminders
        .map((r) => (r.mouId ? mouById.get(r.mouId)?.salesPersonId ?? null : null))
        .filter((id): id is string => Boolean(id)),
    ),
  )
    .map((id) => allSalesTeam.find((s) => s.id === id))
    .filter((sp): sp is SalesPerson => sp != null)

  const filtered = reminders.filter((r) => {
    if (kind !== 'all' && r.kind !== kind) return false
    if (owner !== 'all') {
      const m = r.mouId ? mouById.get(r.mouId) : null
      if (!m || m.salesPersonId !== owner) return false
    }
    return true
  })

  const counts: Record<ReminderKind | 'all', number> = {
    all: reminders.length,
    intake: reminders.filter((r) => r.kind === 'intake').length,
    payment: reminders.filter((r) => r.kind === 'payment').length,
    'delivery-ack': reminders.filter((r) => r.kind === 'delivery-ack').length,
    'feedback-chase': reminders.filter((r) => r.kind === 'feedback-chase').length,
  }

  return (
    <>
      <TopNav currentPath="/admin" />
      <PageHeader
        title="Reminders"
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Reminders' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-6">
        <p className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <Bell aria-hidden className="size-4 shrink-0 text-slate-500" />
          <span>
            {reminders.length} reminder{reminders.length === 1 ? '' : 's'} due across the active cohort.
            Compose runs the manual-send pattern (compose, copy to Outlook, mark sent).
          </span>
        </p>

        {sentId ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900"
          >
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            <span>Reminder marked as sent ({sentId}).</span>
          </p>
        ) : null}

        {errorKey ? (
          <p
            role="alert"
            data-testid="reminders-error"
            className="flex items-start gap-2 rounded-md border border-rose-300 bg-rose-50 p-2 text-xs text-rose-900"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}`}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Kind filter">
          {ALL_KINDS.map((k) => {
            const isActive = k === kind
            const qs = new URLSearchParams()
            if (k !== 'all') qs.set('kind', k)
            if (owner !== 'all') qs.set('owner', owner)
            const tail = qs.toString()
            const href = tail === '' ? '/admin/reminders' : `/admin/reminders?${tail}`
            return (
              <Link
                key={k}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`rem-filter-${k}`}
                className={
                  isActive
                    ? 'inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-sm font-medium text-white'
                    : 'inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy'
                }
              >
                {KIND_LABEL[k]} ({counts[k]})
              </Link>
            )
          })}
        </div>

        {ownerOptions.length > 0 ? (
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <label htmlFor="owner-filter" className="text-xs text-slate-600">
              Sales owner
            </label>
            <select
              id="owner-filter"
              name="owner"
              defaultValue={owner}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <option value="all">All</option>
              {ownerOptions.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
            {kind !== 'all' ? <input type="hidden" name="kind" value={kind} /> : null}
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Apply
            </button>
          </form>
        ) : null}

        {filtered.length === 0 ? (
          <p
            data-testid="reminders-empty"
            className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"
          >
            No reminders match the current filter. Either nothing is overdue, or the active filter is too narrow.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card" data-testid="reminders-list">
            {filtered.map((r) => {
              const m = r.mouId ? mouById.get(r.mouId) : null
              const ownerName = m?.salesPersonId
                ? allSalesTeam.find((s) => s.id === m.salesPersonId)?.name ?? null
                : null
              return (
                <li
                  key={r.id}
                  data-testid={`rem-row-${r.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-sm border px-2 py-0.5 text-xs ${KIND_BADGE[r.kind]}`}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="font-medium">{r.schoolName}</span>
                      {r.programme ? (
                        <span className="text-xs text-muted-foreground">· {r.programme}</span>
                      ) : null}
                      {r.installmentSeq ? (
                        <span className="text-xs text-muted-foreground">· Inst {r.installmentSeq}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.daysOverdue} days overdue {r.anchorEventLabel}
                      {ownerName ? ` · sales: ${ownerName}` : ''}
                      {r.suggestedRecipient
                        ? ` · to: ${r.suggestedRecipient.name}`
                        : ' · no recipient on file'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{r.context}</p>
                  </div>
                  <Link
                    href={`/admin/reminders/${encodeURIComponent(r.id)}`}
                    data-testid={`rem-compose-${r.id}`}
                    className="inline-flex min-h-11 items-center rounded-md bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    Compose
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
