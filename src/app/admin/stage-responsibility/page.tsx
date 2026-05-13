/*
 * /admin/stage-responsibility (Gate 4.9 Step 3).
 *
 * Leadership-configurable matrix of who owns each of the 10 master
 * lifecycle stages. One row per stage; each row has dropdowns for
 * responsible department + user override + escalation department,
 * a free-text notes field, and shows the last-updated timestamp.
 *
 * Permission gate: stage-responsibility:configure (Admin + Leadership).
 * Other roles get a 404 (notFound) to avoid leaking the matrix even
 * read-only.
 */

import { notFound, redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { User } from '@/lib/types'
import usersJson from '@/data/users.json'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { OpsButton } from '@/components/ops/OpsButton'
import { getResponsibilityMatrix } from '@/lib/stageResponsibility'
import { STAGE_LABEL, STAGE_ORDER } from '@/lib/statusTracker'
import type { ResponsibilityDepartment } from '@/lib/types'
import { saveStageResponsibilityAction, resetStageResponsibilityAction } from './actions'

const allUsers = usersJson as unknown as User[]

const DEPT_OPTIONS: ResponsibilityDepartment[] = [
  'sales',
  'ops',
  'finance',
  'leadership',
  'admin',
]

const DEPT_LABEL: Record<ResponsibilityDepartment, string> = {
  sales: 'Sales',
  ops: 'Ops',
  finance: 'Finance',
  leadership: 'Leadership',
  admin: 'Admin',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StageResponsibilityPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fstage-responsibility')
  if (!canPerform(user, 'stage-responsibility:configure')) {
    notFound()
  }

  const sp = await searchParams
  const savedRaw = typeof sp.saved === 'string' ? sp.saved : null
  const errorRaw = typeof sp.error === 'string' ? sp.error : null

  const matrix = getResponsibilityMatrix()
  const activeUsers = allUsers
    .filter((u) => u.active)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="Stage responsibility"
          subtitle="Configure who owns each lifecycle stage. Saves apply to all entities at that stage."
          breadcrumb={[
            { label: 'Admin', href: '/admin' },
            { label: 'Stage responsibility' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
          {savedRaw !== null ? (
            <div
              role="status"
              data-testid="stage-resp-saved"
              className="mb-4 flex items-start gap-2 rounded-md border border-signal-ok bg-signal-ok/10 p-3 text-sm text-signal-ok"
            >
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
              <span>
                Stage responsibility updated.{' '}
                {Number(savedRaw) > 0
                  ? `${savedRaw} stage${Number(savedRaw) === 1 ? '' : 's'} changed.`
                  : 'No fields changed.'}
                {' '}Will reflect everywhere within ~5 minutes.
              </span>
            </div>
          ) : null}
          {errorRaw !== null ? (
            <div
              role="alert"
              data-testid="stage-resp-error"
              className="mb-4 flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <AlertCircle aria-hidden className="size-4 shrink-0" />
              <span>{errorRaw}</span>
            </div>
          ) : null}

          <form
            action={saveStageResponsibilityAction}
            method="POST"
            data-testid="stage-resp-form"
          >
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Responsible dept</th>
                    <th className="px-3 py-2 font-medium">User override</th>
                    <th className="px-3 py-2 font-medium">Escalation dept</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGE_ORDER.map((stage) => {
                    const row = matrix[stage]
                    return (
                      <tr
                        key={stage}
                        data-testid={`stage-row-${stage}`}
                        className="border-b border-border last:border-b-0 align-top"
                      >
                        <td className="px-3 py-3">
                          <div className="font-medium text-brand-navy">
                            {STAGE_LABEL[stage]}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                            {stage}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            name={`${stage}.responsibleDepartment`}
                            defaultValue={row.responsibleDepartment}
                            data-testid={`field-${stage}-dept`}
                            className="block w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                          >
                            {DEPT_OPTIONS.map((d) => (
                              <option key={d} value={d}>
                                {DEPT_LABEL[d]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            name={`${stage}.responsibleUserId`}
                            defaultValue={row.responsibleUserId ?? ''}
                            data-testid={`field-${stage}-user`}
                            className="block w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                          >
                            <option value="">(department default)</option>
                            {activeUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            name={`${stage}.escalationDepartment`}
                            defaultValue={row.escalationDepartment}
                            data-testid={`field-${stage}-escalation`}
                            className="block w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                          >
                            {DEPT_OPTIONS.map((d) => (
                              <option key={d} value={d}>
                                {DEPT_LABEL[d]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            name={`${stage}.notes`}
                            defaultValue={row.notes ?? ''}
                            maxLength={200}
                            data-testid={`field-${stage}-notes`}
                            className="block w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                            placeholder="(none)"
                          />
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          <div className="font-mono">
                            {row.updatedAt.slice(0, 10)}
                          </div>
                          <div>{row.updatedBy}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <OpsButton
                variant="primary"
                size="md"
                type="submit"
                data-testid="stage-resp-save"
              >
                Save changes
              </OpsButton>
            </div>
          </form>

          {/*
           * Gate 5A.6 Step 15: Reset all stages to the Gate 4.9 defaults
           * (DEFAULT_RESPONSIBILITY in src/lib/stageResponsibility.ts).
           * Each per-stage audit array preserves the operator's prior
           * customisations.
           */}
          <form
            action={resetStageResponsibilityAction}
            method="POST"
            data-testid="stage-resp-reset-form"
            className="mt-8 rounded-md border border-signal-attention bg-card p-4 space-y-3"
          >
            <div>
              <h2 className="font-heading text-sm font-semibold text-brand-navy">
                Reset to defaults
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Restores the original 10-stage default mapping (per
                docs/MERGE_PLAN.md §6). Audit log preserves your customisations.
              </p>
            </div>
            <div>
              <label
                htmlFor="resetReason"
                className="block text-xs font-medium text-brand-navy mb-1"
              >
                Reason (optional)
              </label>
              <input
                id="resetReason"
                name="reason"
                type="text"
                className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                data-testid="stage-resp-reset-reason"
              />
            </div>
            <div>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-md border border-signal-attention bg-card px-3 py-2 text-sm font-semibold text-signal-attention hover:bg-signal-attention/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                data-testid="stage-resp-reset-submit"
              >
                Reset all stages to defaults
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
