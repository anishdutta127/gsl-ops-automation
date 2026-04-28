/*
 * /admin index (Phase C5a-1; Phase E adds System sync panel).
 *
 * Role-gated landing. Non-Admin / non-OpsHead viewers redirect to
 * /dashboard (admin surfaces are not for them; the audit-route page
 * has its own narrower gate). Effective roles include testingOverride
 * grants so Misba's OpsHead override lets her in.
 *
 * Renders the System sync panel (Phase E manual triggers) above
 * a directory of admin surfaces.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle, RefreshCcw } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import syncHealthJson from '@/data/sync_health.json'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'

const syncHealth = syncHealthJson as unknown as SyncHealthEntry[]

interface AdminLink {
  href: string
  label: string
  description: string
  status: 'real' | 'placeholder'
}

const ADMIN_LINKS: AdminLink[] = [
  {
    href: '/admin/audit',
    label: 'Audit log',
    description: 'Filterable cross-entity audit history.',
    status: 'real',
  },
  {
    href: '/admin/dispatch-requests',
    label: 'Dispatch requests',
    description: 'Sales-submitted requests pending Ops approval; approve / reject / cancel.',
    status: 'real',
  },
  {
    href: '/admin/reminders',
    label: 'Reminders',
    description: 'Due reminders across intake, payment, delivery acknowledgement, and feedback chase. Compose-and-copy.',
    status: 'real',
  },
  {
    href: '/admin/cc-rules',
    label: 'CC rules',
    description: 'Per-context cc fan-out rules; toggle, edit, create.',
    status: 'real',
  },
  {
    href: '/admin/lifecycle-rules',
    label: 'Lifecycle rules',
    description: 'Editable per-stage default durations; drives kanban overdue badges.',
    status: 'real',
  },
  {
    href: '/admin/mou-status',
    label: 'MOU cohort status',
    description: 'Per-row + bulk active / archived flips; Admin-gated; full audit trail.',
    status: 'real',
  },
  {
    href: '/admin/mou-import-review',
    label: 'MOU import review',
    description: 'Quarantined MOUs awaiting human resolution.',
    status: 'placeholder',
  },
  {
    href: '/admin/pi-counter',
    label: 'PI counter',
    description: 'Read-only health view for the proforma-invoice counter.',
    status: 'placeholder',
  },
  {
    href: '/admin/schools',
    label: 'Schools',
    description: 'Self-serve school directory (Item 8).',
    status: 'placeholder',
  },
  {
    href: '/admin/spocs',
    label: 'SPOCs',
    description: 'Per-school SPOC contact records.',
    status: 'placeholder',
  },
  {
    href: '/admin/sales-team',
    label: 'Sales team',
    description: 'Sales rep directory.',
    status: 'placeholder',
  },
  {
    href: '/admin/school-groups',
    label: 'School groups',
    description: 'Chain-MOU group memberships.',
    status: 'placeholder',
  },
]

const SYNC_FLASH: Record<string, { tone: 'ok' | 'anomaly'; text: string }> = {
  'import-ok': { tone: 'ok', text: 'Import sync completed without anomalies.' },
  'import-anomaly': { tone: 'anomaly', text: 'Import sync completed with anomalies. See latest entry below.' },
  'health-ok': { tone: 'ok', text: 'Health check completed; all signals green.' },
  'health-anomaly': { tone: 'anomaly', text: 'Health check found anomalies. See latest entry below.' },
}

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to trigger sync. The system:trigger-sync action is Admin + OpsHead.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin')

  // Phase 1 W3-B: UI gates disabled. Sync triggers render for any
  // authenticated tester. Server-side canPerform('system:trigger-sync')
  // in /api/sync/tick + /api/mou/import-tick still enforces.
  const canTriggerSync = true

  const syncedKey = typeof sp.synced === 'string' ? sp.synced : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const syncFlash = syncedKey ? SYNC_FLASH[syncedKey] ?? null : null
  const errorMessage = errorKey ? ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}` : null

  const latest: SyncHealthEntry | null =
    syncHealth.length > 0 ? syncHealth[syncHealth.length - 1] ?? null : null

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Admin</h1>
      <p className="mt-1 text-sm text-slate-700">
        Welcome, {user.name}. Pick an area to manage.
      </p>

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-4">
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <Activity aria-hidden className="size-4 text-[var(--brand-navy)]" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--brand-navy)]">
              System sync
            </h2>
          </div>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            Phase 1: manual trigger
          </span>
        </header>

        {syncFlash ? (
          <p
            role="status"
            className={
              syncFlash.tone === 'ok'
                ? 'mb-3 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800'
                : 'mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900'
            }
          >
            {syncFlash.tone === 'ok' ? (
              <CheckCircle aria-hidden className="size-4 shrink-0" />
            ) : (
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
            )}
            <span>{syncFlash.text}</span>
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        ) : null}

        {canTriggerSync ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <form method="POST" action="/api/mou/import-tick">
              <button
                type="submit"
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              >
                <RefreshCcw aria-hidden className="size-4" />
                Run import sync now
              </button>
            </form>
            <form method="POST" action="/api/sync/tick">
              <button
                type="submit"
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-md border border-[var(--brand-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              >
                <Activity aria-hidden className="size-4" />
                Run health check now
              </button>
            </form>
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            Triggering sync requires the system:trigger-sync action (Admin + OpsHead).
          </p>
        )}

        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Latest entry</p>
          {latest === null ? (
            <p className="mt-1 text-sm text-slate-700">
              No sync recorded yet. Triggers above append entries to the rolling log.
            </p>
          ) : (
            <div className="mt-1 text-sm text-slate-800">
              <p>
                <span className="font-medium text-[var(--brand-navy)]">{latest.kind}</span>
                {' '}sync at {latest.at.slice(0, 16).replace('T', ' ')}
                {' by '}
                <span className="text-slate-700">{latest.triggeredBy}</span>
                {' '}(
                <span className={latest.ok ? 'text-[var(--signal-ok)]' : 'text-[var(--signal-alert)]'}>
                  {latest.ok ? 'ok' : 'anomaly'}
                </span>
                )
              </p>
              {latest.importSummary ? (
                <p className="mt-1 text-xs text-slate-600">
                  Written: {latest.importSummary.written} · Quarantined:{' '}
                  {latest.importSummary.quarantined} · Filtered:{' '}
                  {latest.importSummary.filtered} · Errors:{' '}
                  {latest.importSummary.errors.length}
                </p>
              ) : null}
              {latest.healthChecks ? (
                <p className="mt-1 text-xs text-slate-600">
                  Queue depth: {latest.healthChecks.queueDepth} · JSON valid:{' '}
                  {latest.healthChecks.jsonValid ? 'yes' : 'no'} · Counter monotonic:{' '}
                  {latest.healthChecks.counterMonotonic ? 'yes' : 'no'}
                </p>
              ) : null}
              {latest.anomalies.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
                  {latest.anomalies.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {ADMIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--brand-navy)]">
                  {link.label}
                </span>
                {link.status === 'placeholder' ? (
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">
                    Phase 1 placeholder
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-600">{link.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
