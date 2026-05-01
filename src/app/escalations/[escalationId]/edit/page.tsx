/*
 * /escalations/[escalationId]/edit (W4-I.4 MM5).
 *
 * Mirrors the W4-F.3 sales-pipeline edit form pattern. Pre-fills the
 * MM5 ticketing fields (status, category, type) plus severity,
 * assignedTo, description, resolutionNotes. Submit calls
 * editEscalationAction; failure redirects back with ?error=.
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import escalationsJson from '@/data/escalations.json'
import schoolsJson from '@/data/schools.json'
import type { Escalation, School, User } from '@/lib/types'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { editEscalationAction } from '../../actions'

const allEscalations = escalationsJson as unknown as Escalation[]
const allSchools = schoolsJson as unknown as School[]

const STATUS_OPTIONS: ReadonlyArray<Escalation['status']> = [
  'Open', 'WIP', 'Closed', 'Transfer to Other Department',
  'Dispatched', 'In Transit',
]
const SEVERITY_OPTIONS: ReadonlyArray<Escalation['severity']> = ['low', 'medium', 'high']

const ERROR_FLASH: Record<string, string> = {
  permission: 'You do not have permission to edit this escalation.',
  'unknown-user': 'Session user not found. Please log in again.',
  'escalation-not-found': 'Escalation not found.',
  'invalid-status': 'Status is not one of the allowed values.',
  'invalid-severity': 'Severity must be low / medium / high.',
  'missing-description': 'Description cannot be empty.',
  'no-changes': 'No fields changed.',
}

interface PageProps {
  params: Promise<{ escalationId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function isVisibleToUser(esc: Escalation, user: User | null): boolean {
  if (!user) return false
  if (user.role === 'Admin' || user.role === 'Leadership') return true
  const roles = new Set<string>([user.role])
  if (user.testingOverride && user.testingOverridePermissions) {
    for (const r of user.testingOverridePermissions) roles.add(r)
  }
  if (roles.has('OpsHead')) return esc.lane === 'OPS'
  if (roles.has('SalesHead')) return esc.lane === 'SALES'
  if (roles.has('TrainerHead')) return esc.lane === 'ACADEMICS'
  return false
}

export default async function EscalationEditPage({ params, searchParams }: PageProps) {
  const { escalationId } = await params
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=%2Fescalations%2F${encodeURIComponent(escalationId)}%2Fedit`)
  if (!canPerform(user, 'escalation:resolve')) {
    redirect(`/escalations/${encodeURIComponent(escalationId)}?error=permission`)
  }

  const esc = allEscalations.find((e) => e.id === escalationId)
  if (!esc || !isVisibleToUser(esc, user)) notFound()

  const school = allSchools.find((s) => s.id === esc.schoolId)
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_FLASH[errorKey] ?? `Failed: ${errorKey}` : null

  return (
    <>
      <TopNav currentPath="/escalations" />
      <PageHeader
        title={`Edit ${esc.id}`}
        breadcrumb={[
          { label: 'Escalations', href: '/escalations' },
          { label: esc.id, href: `/escalations/${encodeURIComponent(esc.id)}` },
          { label: 'Edit' },
        ]}
      />
      <div className="mx-auto flex max-w-screen-md flex-col gap-4 px-4 py-6">
        <Link
          href={`/escalations/${encodeURIComponent(esc.id)}`}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to detail
        </Link>

        {errorMessage ? (
          <p
            role="alert"
            data-testid="esc-edit-error"
            className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 px-3 py-2 text-sm text-signal-alert"
          >
            <AlertTriangle aria-hidden className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          Editing {esc.lane} / {esc.level} escalation for{' '}
          <span className="text-foreground">{school?.name ?? esc.schoolId}</span>.
        </p>

        <form
          action={editEscalationAction}
          className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
        >
          <input type="hidden" name="id" value={esc.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-brand-navy">
                Status <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <select
                id="status" name="status" required
                defaultValue={esc.status}
                data-testid="edit-status"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="severity" className="block text-sm font-medium text-brand-navy">
                Severity <span aria-hidden className="text-signal-alert">*</span>
              </label>
              <select
                id="severity" name="severity" required
                defaultValue={esc.severity}
                data-testid="edit-severity"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-brand-navy">
                Category
              </label>
              <input
                id="category" name="category" type="text"
                defaultValue={esc.category ?? ''}
                data-testid="edit-category"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                placeholder="e.g., Logistics, Communication"
              />
            </div>
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-brand-navy">
                Type
              </label>
              <input
                id="type" name="type" type="text"
                defaultValue={esc.type ?? ''}
                data-testid="edit-type"
                className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                placeholder="e.g., Courier delay, Address mismatch"
              />
            </div>
          </div>

          <div>
            <label htmlFor="assignedTo" className="block text-sm font-medium text-brand-navy">
              Assigned to (User.id)
            </label>
            <input
              id="assignedTo" name="assignedTo" type="text"
              defaultValue={esc.assignedTo ?? ''}
              data-testid="edit-assignedTo"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              placeholder="e.g., misba.m"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to unassign. Use Transfer to Other Department status when re-routing.
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-brand-navy">
              Description <span aria-hidden className="text-signal-alert">*</span>
            </label>
            <textarea
              id="description" name="description" required rows={3}
              defaultValue={esc.description}
              data-testid="edit-description"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            />
          </div>

          <div>
            <label htmlFor="resolutionNotes" className="block text-sm font-medium text-brand-navy">
              Resolution notes
            </label>
            <textarea
              id="resolutionNotes" name="resolutionNotes" rows={3}
              defaultValue={esc.resolutionNotes ?? ''}
              data-testid="edit-resolutionNotes"
              className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              placeholder="Closing notes; populated when status flips to Closed"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              data-testid="edit-submit"
              className="inline-flex min-h-11 items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-medium text-brand-navy hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Save changes
            </button>
            <Link
              href={`/escalations/${encodeURIComponent(esc.id)}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  )
}
