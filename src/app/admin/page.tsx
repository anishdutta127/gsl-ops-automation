/*
 * /admin index (W4-I.5 P4C2 restructure).
 *
 * Pre-W4-I.5 this page hand-rolled its own header + tile grid. P4C2
 * brings it onto the design system: PageHeader with breadcrumb +
 * StatCard-style tiles for areas with meaningful counts (dispatch
 * requests pending, reminders pending, inventory low-stock, MOU
 * import review queue, communication templates) plus plain link
 * tiles for everything else (Audit, CC rules, Lifecycle rules, MOU
 * cohort status, PI counter, Schools, SPOCs, Sales team, School
 * groups).
 *
 * The System sync panel keeps its own card; that panel renders
 * status + flash + per-trigger forms which would fight the StatCard
 * shape if forced into it.
 *
 * Role gating: every authenticated tester reaches this page (W3-B).
 * Sub-page server-side guards still enforce per-action gates.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle,
  ClipboardList,
  Database,
  FileBox,
  Mail,
  PackageCheck,
  RefreshCcw,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import syncHealthJson from '@/data/sync_health.json'
import dispatchRequestsJson from '@/data/dispatch_requests.json'
import inventoryItemsJson from '@/data/inventory_items.json'
import mouImportReviewJson from '@/data/mou_import_review.json'
import templatesJson from '@/data/communication_templates.json'
import type {
  CommunicationTemplate,
  DispatchRequest,
  InventoryItem,
  MouImportReviewItem,
} from '@/lib/types'
import type { SyncHealthEntry } from '@/lib/syncHealth/appendEntry'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton } from '@/components/ops/OpsButton'
import { detectDueReminders } from '@/lib/reminders/detectDueReminders'

const syncHealth = syncHealthJson as unknown as SyncHealthEntry[]
const allDispatchRequests = dispatchRequestsJson as unknown as DispatchRequest[]
const allInventoryItems = inventoryItemsJson as unknown as InventoryItem[]
const allImportReview = mouImportReviewJson as unknown as MouImportReviewItem[]
const allTemplates = templatesJson as unknown as CommunicationTemplate[]

interface MetricTile {
  href: string
  label: string
  description: string
  count: number
  unit: string
  subtitle: string
  iconKey: 'orders' | 'reminders' | 'inventory' | 'review' | 'templates'
}

interface PlainTile {
  href: string
  label: string
  description: string
  iconKey: 'audit' | 'cc-rules' | 'lifecycle' | 'cohort' | 'pi-counter'
    | 'schools' | 'spocs' | 'sales-team' | 'groups'
  status?: 'placeholder'
}

const METRIC_ICON: Record<MetricTile['iconKey'], LucideIcon> = {
  orders: PackageCheck,
  reminders: Mail,
  inventory: Boxes,
  review: ShieldAlert,
  templates: FileBox,
}

const PLAIN_ICON: Record<PlainTile['iconKey'], LucideIcon> = {
  audit: ScrollText,
  'cc-rules': Settings,
  lifecycle: Settings,
  cohort: ClipboardList,
  'pi-counter': Database,
  schools: ClipboardList,
  spocs: Users,
  'sales-team': Users,
  groups: Users,
}

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

  const syncedKey = typeof sp.synced === 'string' ? sp.synced : null
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const syncFlash = syncedKey ? SYNC_FLASH[syncedKey] ?? null : null
  const errorMessage = errorKey ? ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}` : null

  const latest: SyncHealthEntry | null =
    syncHealth.length > 0 ? syncHealth[syncHealth.length - 1] ?? null : null

  // Compute metrics for the StatCard-style tiles.
  const pendingApproval = allDispatchRequests.filter(
    (r) => r.status === 'pending-approval',
  ).length
  const dueReminders = detectDueReminders().length
  const lowStock = allInventoryItems.filter(
    (i) => i.reorderThreshold !== null && i.currentStock <= i.reorderThreshold,
  ).length
  const openReview = allImportReview.filter((r) => r.resolution === null).length
  const activeTemplates = allTemplates.filter((t) => t.active).length

  const metricTiles: MetricTile[] = [
    {
      href: '/admin/dispatch-requests',
      label: 'Dispatch requests',
      description: 'Sales-submitted requests pending Ops approval.',
      count: pendingApproval,
      unit: pendingApproval === 1 ? 'Pending' : 'Pending',
      subtitle: pendingApproval === 0 ? 'Queue is clear' : 'Awaiting Ops review',
      iconKey: 'orders',
    },
    {
      href: '/admin/reminders',
      label: 'Reminders',
      description: 'Due reminders across intake, payment, delivery acknowledgement, and feedback chase.',
      count: dueReminders,
      unit: 'Due',
      subtitle: dueReminders === 0 ? 'No reminders due' : 'Compose-and-copy ready',
      iconKey: 'reminders',
    },
    {
      href: '/admin/inventory',
      label: 'Inventory',
      description: 'Per-SKU stock + reorder thresholds.',
      count: lowStock,
      unit: 'Low Stock',
      subtitle: lowStock === 0 ? 'All above threshold' : 'Replenish soon',
      iconKey: 'inventory',
    },
    {
      href: '/admin/templates',
      label: 'Communication templates',
      description: 'Reusable email templates with variable substitution.',
      count: activeTemplates,
      unit: activeTemplates === 1 ? 'Active' : 'Active',
      subtitle: 'Welcome / Thank-you / Follow-up / Payment / Dispatch',
      iconKey: 'templates',
    },
    {
      href: '/admin/mou-import-review',
      label: 'MOU import review',
      description: 'Quarantined MOUs awaiting human resolution.',
      count: openReview,
      unit: 'Open',
      subtitle: openReview === 0 ? 'No items in queue' : 'Resolve to import',
      iconKey: 'review',
    },
  ]

  const plainTiles: PlainTile[] = [
    {
      href: '/admin/audit',
      label: 'Audit log',
      description: 'Filterable cross-entity audit history.',
      iconKey: 'audit',
    },
    {
      href: '/admin/cc-rules',
      label: 'CC rules',
      description: 'Per-context cc fan-out rules; toggle, edit, create.',
      iconKey: 'cc-rules',
    },
    {
      href: '/admin/lifecycle-rules',
      label: 'Lifecycle rules',
      description: 'Editable per-stage default durations; drives kanban overdue badges.',
      iconKey: 'lifecycle',
    },
    {
      href: '/admin/mou-status',
      label: 'MOU cohort status',
      description: 'Per-row + bulk active / archived flips; Admin-gated; full audit trail.',
      iconKey: 'cohort',
    },
    {
      href: '/admin/pi-counter',
      label: 'PI counter',
      description: 'Read-only health view for the proforma-invoice counter.',
      iconKey: 'pi-counter',
      status: 'placeholder',
    },
    {
      href: '/admin/schools',
      label: 'Schools',
      description: 'Self-serve school directory.',
      iconKey: 'schools',
      status: 'placeholder',
    },
    {
      href: '/admin/spocs',
      label: 'SPOCs',
      description: 'Per-school point-of-contact records.',
      iconKey: 'spocs',
      status: 'placeholder',
    },
    {
      href: '/admin/sales-team',
      label: 'Sales team',
      description: 'Sales rep directory.',
      iconKey: 'sales-team',
      status: 'placeholder',
    },
    {
      href: '/admin/school-groups',
      label: 'School groups',
      description: 'Chain-MOU group memberships.',
      iconKey: 'groups',
      status: 'placeholder',
    },
  ]

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Admin"
          subtitle={`Welcome, ${user.name}. Pick an area to manage.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-6 px-4 py-6">
          {/* System sync panel keeps its dedicated card; the trigger
              forms + flash banners + latest-entry summary do not fit
              the StatCard shape. */}
          <section
            aria-labelledby="system-sync-heading"
            className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
            data-testid="admin-system-sync"
          >
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <Activity aria-hidden className="size-4 text-brand-navy" />
                <h2
                  id="system-sync-heading"
                  className="text-sm font-semibold uppercase tracking-wide text-brand-navy"
                >
                  System sync
                </h2>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Auto-sync every 5 min (cron)
              </span>
            </header>
            <p className="mb-3 text-xs text-muted-foreground">
              Pending writes drain into the canonical JSON files automatically every 5 minutes via a scheduled job. The buttons below trigger MOU import and health-check on demand; queue drain does not need a manual click.
            </p>

            {syncFlash ? (
              <p
                role="status"
                className={
                  syncFlash.tone === 'ok'
                    ? 'mb-3 flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-2 text-xs text-signal-ok'
                    : 'mb-3 flex items-start gap-2 rounded-md border border-signal-attention bg-signal-attention/10 p-2 text-xs text-signal-attention'
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
                className="mb-3 flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-2 text-xs text-signal-alert"
              >
                <AlertTriangle aria-hidden className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <form method="POST" action="/api/mou/import-tick">
                <OpsButton variant="primary" size="md" type="submit" className="w-full">
                  <RefreshCcw aria-hidden className="size-4" />
                  Run import sync now
                </OpsButton>
              </form>
              <form method="POST" action="/api/sync/tick">
                <OpsButton variant="outline" size="md" type="submit" className="w-full">
                  <Activity aria-hidden className="size-4" />
                  Run health check now
                </OpsButton>
              </form>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest entry</p>
              {latest === null ? (
                <p className="mt-1 text-sm text-foreground">
                  No sync recorded yet. Triggers above append entries to the rolling log.
                </p>
              ) : (
                <div className="mt-1 text-sm text-foreground">
                  <p>
                    <span className="font-medium text-brand-navy">{latest.kind}</span>
                    {' '}sync at {latest.at.slice(0, 16).replace('T', ' ')}
                    {' by '}
                    <span className="text-muted-foreground">{latest.triggeredBy}</span>
                    {' '}(
                    <span className={latest.ok ? 'text-signal-ok' : 'text-signal-alert'}>
                      {latest.ok ? 'ok' : 'anomaly'}
                    </span>
                    )
                  </p>
                  {latest.importSummary ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Written: {latest.importSummary.written} <span aria-hidden>&middot;</span>{' '}
                      Quarantined: {latest.importSummary.quarantined}{' '}
                      <span aria-hidden>&middot;</span>{' '}
                      Filtered: {latest.importSummary.filtered}{' '}
                      <span aria-hidden>&middot;</span>{' '}
                      Errors: {latest.importSummary.errors.length}
                    </p>
                  ) : null}
                  {latest.healthChecks ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Queue depth: {latest.healthChecks.queueDepth}{' '}
                      <span aria-hidden>&middot;</span>{' '}
                      JSON valid: {latest.healthChecks.jsonValid ? 'yes' : 'no'}{' '}
                      <span aria-hidden>&middot;</span>{' '}
                      Counter monotonic: {latest.healthChecks.counterMonotonic ? 'yes' : 'no'}
                    </p>
                  ) : null}
                  {latest.anomalies.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5 text-xs text-signal-attention">
                      {latest.anomalies.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          {/* Metric tiles: areas where a meaningful count drives Ops attention. */}
          <section
            aria-labelledby="admin-metrics-heading"
            data-testid="admin-metric-tiles"
          >
            <h2
              id="admin-metrics-heading"
              className="mb-3 font-heading text-base font-semibold text-brand-navy"
            >
              Ops focus
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {metricTiles.map((tile) => {
                const Icon = METRIC_ICON[tile.iconKey]
                return (
                  <article
                    key={tile.href}
                    data-testid={`admin-metric-${tile.iconKey}`}
                    className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md sm:p-5"
                  >
                    <header className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {tile.label}
                      </p>
                      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-navy">
                        <Icon className="size-5" />
                      </span>
                    </header>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="font-heading text-3xl font-bold text-brand-navy">
                        {tile.count}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">{tile.unit}</span>
                    </div>
                    <p className="mt-1 min-h-[18px] text-xs text-muted-foreground">{tile.subtitle}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{tile.description}</p>
                    <Link
                      href={tile.href}
                      data-testid={`admin-metric-${tile.iconKey}-cta`}
                      className="mt-4 inline-flex min-h-9 items-center gap-1.5 self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      Open
                      <ArrowRight aria-hidden className="size-3" />
                    </Link>
                  </article>
                )
              })}
            </div>
          </section>

          {/* Plain tiles: directories + read-only views without a primary metric. */}
          <section
            aria-labelledby="admin-areas-heading"
            data-testid="admin-plain-tiles"
          >
            <h2
              id="admin-areas-heading"
              className="mb-3 font-heading text-base font-semibold text-brand-navy"
            >
              Other admin areas
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plainTiles.map((tile) => {
                const Icon = PLAIN_ICON[tile.iconKey]
                return (
                  <li key={tile.href}>
                    <Link
                      href={tile.href}
                      data-testid={`admin-plain-${tile.iconKey}`}
                      className="flex h-full min-h-[88px] items-start gap-3 rounded-xl border border-border bg-card p-4 transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-brand-navy">
                            {tile.label}
                          </span>
                          {tile.status === 'placeholder' ? (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Phase 1 placeholder
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {tile.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </main>
    </>
  )
}
