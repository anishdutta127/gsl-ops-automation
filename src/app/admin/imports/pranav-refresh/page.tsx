/*
 * /admin/imports/pranav-refresh (Gate 5A.8 Step 4).
 *
 * Server Component. Admin-only redirect. Two halves:
 *   - An "Upload a refresh file" form that hands the .xlsx to
 *     uploadRefreshAction. The action parses, classifies, and writes
 *     parsed.json + diff-report.json under import-data/<refreshTag>/.
 *   - A tabbed view over the most recent diff: New / Updates / Conflicts
 *     / Ambiguous / Unchanged. Each tab renders per-row controls that
 *     submit into applyRefreshAction.
 *
 * Tabs are URL-driven (?tab=...) so the page works without client JS.
 *
 * Conflict resolution radio set:
 *   - keep-current   default. Refresh values flagged for follow-up.
 *   - apply-refresh  refresh values overwrite live data.
 *   - keep-both      original kept; refresh stored as a parallel MOU.
 *
 * Ambiguous rows render a select with each candidate MOU id plus
 * "Create as new MOU" so the operator can disambiguate or fall through.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton } from '@/components/ops/OpsButton'
import type { ClassifiedRow } from '@/lib/imports/pranavApply'
import {
  applyRefreshAction,
  findLatestRefreshTag,
  uploadRefreshAction,
} from './actions'

const PAGE_PATH = '/admin/imports/pranav-refresh'

type TabKey = 'new' | 'updates' | 'conflicts' | 'ambiguous' | 'unchanged'

const TAB_ORDER: TabKey[] = ['new', 'updates', 'conflicts', 'ambiguous', 'unchanged']

const TAB_LABEL: Record<TabKey, string> = {
  new: 'New',
  updates: 'Updates',
  conflicts: 'Conflicts',
  ambiguous: 'Ambiguous',
  unchanged: 'Unchanged',
}

const TAB_TO_CLASSIFICATION: Record<TabKey, ClassifiedRow['classification']> = {
  new: 'NEW',
  updates: 'UPDATE',
  conflicts: 'CONFLICT',
  ambiguous: 'AMBIGUOUS',
  unchanged: 'UNCHANGED',
}

interface DiffReportFile {
  generatedAt: string
  summary: Record<string, number>
  classified: ClassifiedRow[]
}

async function loadDiff(refreshTag: string): Promise<DiffReportFile | null> {
  const root = process.cwd()
  const p = path.join(root, 'import-data', refreshTag, 'diff-report.json')
  try {
    const raw = await readFile(p, 'utf-8')
    return JSON.parse(raw) as DiffReportFile
  } catch {
    return null
  }
}

function countsFromClassified(rows: ClassifiedRow[]): Record<TabKey, number> {
  const out: Record<TabKey, number> = { new: 0, updates: 0, conflicts: 0, ambiguous: 0, unchanged: 0 }
  for (const r of rows) {
    if (r.classification === 'NEW') out.new += 1
    else if (r.classification === 'UPDATE') out.updates += 1
    else if (r.classification === 'CONFLICT') out.conflicts += 1
    else if (r.classification === 'AMBIGUOUS') out.ambiguous += 1
    else if (r.classification === 'UNCHANGED') out.unchanged += 1
  }
  return out
}

function pickTab(input: string | string[] | undefined): TabKey {
  const value = Array.isArray(input) ? input[0] : input
  if (value && (TAB_ORDER as string[]).includes(value)) return value as TabKey
  return 'new'
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'blank'
  if (typeof v === 'string' && v.trim() === '') return 'blank'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v)
    if (Number.isInteger(v)) return v.toLocaleString('en-IN')
    return v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}

export default async function PranavRefreshPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(PAGE_PATH)}`)
  if (user.role !== 'Admin') redirect('/dashboard')

  const requestedTag = typeof sp.tag === 'string' ? sp.tag : null
  const refreshTag = requestedTag ?? (await findLatestRefreshTag())
  const diff = refreshTag ? await loadDiff(refreshTag) : null
  const tab = pickTab(sp.tab)
  const uploaded = sp.uploaded === '1'
  const applied = sp.applied === '1'
  const errorCode = typeof sp.error === 'string' ? sp.error : null

  const counts = diff ? countsFromClassified(diff.classified) : null
  const tabRows = diff
    ? diff.classified.filter((r) => r.classification === TAB_TO_CLASSIFICATION[tab])
    : []

  return (
    <>
      <TopNav currentPath="/admin" />
      <div id="pranav-refresh-surface">
        <PageHeader
          title="Pranav refresh"
          subtitle={
            diff
              ? `${counts!.new} new, ${counts!.updates} updates, ${counts!.conflicts} conflicts, ${counts!.ambiguous} ambiguous, ${counts!.unchanged} unchanged. Tag: ${refreshTag}.`
              : 'Upload the FY26-27 STEAM workbook to classify and apply.'
          }
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'Import' },
            { label: 'Pranav refresh' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
          {uploaded ? (
            <p
              role="status"
              className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              Upload accepted. Diff classified for {refreshTag}.
            </p>
          ) : null}
          {applied ? (
            <p
              role="status"
              className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              Apply complete. {sp.created ?? '0'} created, {sp.updated ?? '0'} updated,
              {' '}{sp.unchanged ?? '0'} unchanged, {sp.skipped ?? '0'} skipped,
              {' '}{sp.keptCurrent ?? '0'} kept current, {sp.keptBoth ?? '0'} kept both,
              {' '}{sp.errored ?? '0'} errored.
            </p>
          ) : null}
          {errorCode ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
            >
              {errorCode === 'missing-file'
                ? 'No file was attached. Pick a .xlsx and try again.'
                : errorCode === 'diff-not-found'
                  ? 'Diff report missing for this tag; upload a fresh file.'
                  : errorCode === 'missing-tag'
                    ? 'Refresh tag missing from the apply form.'
                    : `Failed: ${errorCode}`}
            </p>
          ) : null}

          <UploadCard />

          {diff && refreshTag && counts ? (
            <DiffArea
              refreshTag={refreshTag}
              counts={counts}
              activeTab={tab}
              rows={tabRows}
              generatedAt={diff.generatedAt}
            />
          ) : (
            <section className="mt-8 rounded-md border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-brand-navy">
                No diff loaded
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a refresh file above to populate the diff view.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function UploadCard() {
  return (
    <section className="rounded-md border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-brand-navy">
        Upload a refresh file
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Accepts the FY26-27 STEAM workbook (.xlsx). The file is parsed and
        classified server-side; nothing is written to live data until you
        approve via the Apply step below.
      </p>
      <form
        action={uploadRefreshAction}
        encType="multipart/form-data"
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label htmlFor="pranav-refresh-file" className="sr-only">
          Refresh workbook
        </label>
        <input
          id="pranav-refresh-file"
          type="file"
          name="file"
          accept=".xlsx,.xlsm"
          required
          className="block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-navy"
        />
        <OpsButton type="submit" variant="primary" size="md">
          Upload and classify
        </OpsButton>
      </form>
    </section>
  )
}

function DiffArea({
  refreshTag,
  counts,
  activeTab,
  rows,
  generatedAt,
}: {
  refreshTag: string
  counts: Record<TabKey, number>
  activeTab: TabKey
  rows: ClassifiedRow[]
  generatedAt: string
}) {
  return (
    <section className="mt-8 rounded-md border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-brand-navy">Diff classification</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Generated {generatedAt.slice(0, 19).replace('T', ' ')} UTC. Tag {refreshTag}.
        </p>
      </header>
      <nav
        aria-label="Diff tabs"
        className="flex flex-wrap gap-1 border-b border-border px-2 py-2"
      >
        {TAB_ORDER.map((key) => {
          const isActive = key === activeTab
          return (
            <a
              key={key}
              href={`${PAGE_PATH}?tag=${encodeURIComponent(refreshTag)}&tab=${key}`}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'rounded-md bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
                  : 'rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy'
              }
            >
              {TAB_LABEL[key]} <span className="ml-1 tabular-nums">{counts[key]}</span>
            </a>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No rows in this tab.
        </p>
      ) : (
        <form action={applyRefreshAction} className="px-4 py-4">
          <input type="hidden" name="refreshTag" value={refreshTag} />
          <ul className="space-y-4">
            {rows.map((row) => (
              <RowCard key={row.refreshRow.rowNum} row={row} />
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Submitting will write to <code className="rounded bg-muted px-1 py-0.5">src/data/*.json</code> for the rows you have ticked.
            </p>
            <OpsButton type="submit" variant="primary" size="md">
              Apply selected changes
            </OpsButton>
          </div>
        </form>
      )}
    </section>
  )
}

function RowCard({ row }: { row: ClassifiedRow }) {
  const rowNum = row.refreshRow.rowNum
  const label = `Row ${rowNum}: ${row.refreshRow.schoolName}`
  return (
    <li className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-navy">{label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Slug {row.refreshRow.schoolSlug}
            {row.refreshRow.trainerModel ? ` · model ${row.refreshRow.trainerModel}` : ''}
            {row.refreshRow.contractValue !== null ? ` · contract Rs ${formatValue(row.refreshRow.contractValue)}` : ''}
          </p>
          {row.refreshRow.rowWarnings.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs text-signal-alert">
              {row.refreshRow.rowWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-navy">
          <input
            type="checkbox"
            name={`apply-${rowNum}`}
            value="true"
            defaultChecked
            className="size-4 rounded border-input focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          />
          Apply this row
        </label>
      </div>

      {row.mouDiffs.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DiffColumn title="Current (live)" diffs={row.mouDiffs} which="current" />
          <DiffColumn title="Refresh (incoming)" diffs={row.mouDiffs} which="refresh" />
        </div>
      ) : null}

      {row.classification === 'CONFLICT' ? (
        <fieldset className="mt-3 rounded-md border border-signal-alert/40 bg-signal-alert/5 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-signal-alert">
            Resolve conflict
          </legend>
          <div className="space-y-2 text-sm text-brand-navy">
            {[
              { value: 'keep-current', label: 'Keep current values (refresh data flagged for follow-up)' },
              { value: 'apply-refresh', label: 'Apply refresh values (overwrite live data)' },
              { value: 'keep-both', label: 'Keep both as separate MOUs' },
            ].map((opt, idx) => (
              <label key={opt.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`resolution-${rowNum}`}
                  value={opt.value}
                  defaultChecked={idx === 0}
                  className="mt-0.5 size-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {row.classification === 'AMBIGUOUS' ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <label
            htmlFor={`matched-${rowNum}`}
            className="block text-xs font-semibold uppercase tracking-wide text-amber-900"
          >
            Pick the matching MOU
          </label>
          <select
            id={`matched-${rowNum}`}
            name={`matched-${rowNum}`}
            defaultValue="new"
            className="mt-1 w-full min-h-9 rounded-md border border-input bg-card px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
          >
            {row.candidateMatchIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
            <option value="new">Create as new MOU</option>
          </select>
        </div>
      ) : null}
    </li>
  )
}

function DiffColumn({
  title,
  diffs,
  which,
}: {
  title: string
  diffs: ClassifiedRow['mouDiffs']
  which: 'current' | 'refresh'
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">
        {title}
      </h4>
      <dl className="mt-2 space-y-1 text-xs">
        {diffs.map((d) => {
          const value = which === 'current' ? d.current : d.refresh
          const isRefreshSide = which === 'refresh'
          const cls =
            isRefreshSide && d.kind === 'overwrite'
              ? 'text-signal-alert'
              : isRefreshSide && d.kind === 'fill'
                ? 'text-muted-foreground'
                : 'text-foreground'
          return (
            <div key={d.field} className="grid grid-cols-[1fr_auto] gap-2">
              <dt className="truncate font-medium text-muted-foreground">{d.field}</dt>
              <dd className={`text-right ${cls}`}>{formatValue(value)}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
