'use client'

/*
 * DraftAnnexureEditor (Step 5).
 *
 * Standalone annexure editor for /mous/[id]/draft. Mirrors the
 * GeneratorWizard "Annexure A" fieldset field-by-field so Pranav sees
 * the same shape regardless of whether he's on the generator or the
 * post-create draft route.
 *
 * Save behaviour: explicit "Save draft" button posts to
 * /api/mou/save-draft (the same endpoint the wizard uses; we pass
 * draftMouId so the writer updates instead of creating). On every
 * keystroke we also flush to sessionStorage with key `mou-draft-{mouId}`
 * so an accidental tab close / refresh recovers via the inline banner
 * on next mount.
 *
 * The toast strings are fixed by the brief:
 * "Saved. Will reflect everywhere within ~5 minutes."
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle, Save, Undo2, X, AlertCircle } from 'lucide-react'
import type { PlaceholderSpec } from '@/lib/mouSystem/templates'
import type { Programme } from '@/lib/mouSystem/types'

interface Props {
  mouId: string
  templateId: string
  programme: Programme
  placeholders: Record<string, PlaceholderSpec>
  initialValues: Record<string, string>
  initialAnnexureHtml: string
  currentUserId: string
  currentUserName: string
}

interface RecoverySnapshot {
  values: Record<string, string>
  annexureHtml: string
  savedAt: string
}

function storageKey(mouId: string): string {
  return `mou-draft-${mouId}`
}

function readSnapshot(mouId: string): RecoverySnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(storageKey(mouId))
    if (!raw) return null
    return JSON.parse(raw) as RecoverySnapshot
  } catch {
    return null
  }
}

function writeSnapshot(mouId: string, snapshot: RecoverySnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey(mouId), JSON.stringify(snapshot))
  } catch {
    // sessionStorage may be unavailable (private mode); silently no-op.
  }
}

function clearSnapshot(mouId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKey(mouId))
  } catch {
    // ignore
  }
}

function formatRelative(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const diff = Date.now() - then
    if (!Number.isFinite(diff) || diff < 0) return 'just now'
    const mins = Math.round(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins === 1) return '1 minute ago'
    if (mins < 60) return `${mins} minutes ago`
    const hrs = Math.round(mins / 60)
    if (hrs === 1) return '1 hour ago'
    return `${hrs} hours ago`
  } catch {
    return 'recently'
  }
}

export function DraftAnnexureEditor({
  mouId,
  templateId,
  programme,
  placeholders,
  initialValues,
  initialAnnexureHtml,
  currentUserId,
  currentUserName,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(initialValues)
  const [annexureHtml, setAnnexureHtml] = useState<string>(initialAnnexureHtml)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null)

  // Mount: check for an unsaved snapshot. If it differs from the
  // server-supplied initialValues, surface the recovery banner.
  useEffect(() => {
    const snap = readSnapshot(mouId)
    if (!snap) return
    const sameValues = JSON.stringify(snap.values) === JSON.stringify(initialValues)
    const sameAnnex = snap.annexureHtml === initialAnnexureHtml
    if (sameValues && sameAnnex) {
      // Snapshot matches what's on the server; clear it.
      clearSnapshot(mouId)
      return
    }
    setRecovery(snap)
  }, [mouId, initialValues, initialAnnexureHtml])

  // Flush every change to sessionStorage so an accidental tab close
  // doesn't drop work.
  useEffect(() => {
    writeSnapshot(mouId, {
      values,
      annexureHtml,
      savedAt: new Date().toISOString(),
    })
  }, [mouId, values, annexureHtml])

  function restoreSnapshot() {
    if (!recovery) return
    setValues(recovery.values)
    setAnnexureHtml(recovery.annexureHtml)
    setRecovery(null)
  }

  function discardSnapshot() {
    clearSnapshot(mouId)
    setRecovery(null)
  }

  const annexureFields = useMemo(
    () => Object.entries(placeholders).filter(([, s]) => s.section === 'annexure'),
    [placeholders],
  )

  const validationError = useMemo(() => {
    for (const [name, spec] of annexureFields) {
      if (spec.required && !(values[name] ?? '').trim()) {
        return `${spec.label} is required.`
      }
    }
    return null
  }, [annexureFields, values])

  const save = useCallback(async () => {
    if (validationError) {
      setServerError(validationError)
      setSaveState('error')
      return
    }
    setSaveState('saving')
    setServerError(null)
    try {
      const res = await fetch('/api/mou/save-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          identityName: currentUserName,
          identityId: currentUserId,
          draftMouId: mouId,
          templateId,
          programme,
          schoolId: null,
          schoolName: '',
          variables: values,
          annexureHtml,
          // The MOU already has these on file from the wizard or the
          // import. Don't overwrite them on annexure-only saves: the
          // saveDraftMou writer merges by spread, so passing null/empty
          // doesn't blow away existing values when those fields stay
          // null on the input.
          trainerModel: null,
          salesChannel: null,
          salesPersonId: null,
          schoolCrmId: null,
          paymentSchedules: null,
          yearlyPricing: null,
          billingBlock: null,
        }),
      })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? `Save failed (${res.status})`)
      }
      setSaveState('saved')
      clearSnapshot(mouId)
      setTimeout(() => setSaveState('idle'), 6000)
    } catch (e) {
      setSaveState('error')
      setServerError(e instanceof Error ? e.message : 'Save failed')
    }
  }, [
    annexureHtml,
    currentUserId,
    currentUserName,
    mouId,
    programme,
    templateId,
    validationError,
    values,
  ])

  const fieldClass =
    'mt-1 w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-muted-foreground'

  return (
    <div className="max-w-3xl space-y-6">
      {recovery ? (
        <div
          role="status"
          data-testid="draft-recovery-banner"
          className="flex flex-wrap items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Unsaved annexure draft from {formatRelative(recovery.savedAt)}.</p>
            <p className="text-xs">
              Looks like you closed the tab before saving. Restore the unsaved version, or discard it
              to keep working from what is currently saved on the server.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreSnapshot}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-amber-700 bg-card px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-700"
            >
              <Undo2 aria-hidden className="size-3" /> Restore
            </button>
            <button
              type="button"
              onClick={discardSnapshot}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <X aria-hidden className="size-3" /> Discard
            </button>
          </div>
        </div>
      ) : null}

      <fieldset className="rounded-lg border border-border bg-card p-5">
        <legend className="px-1 font-heading text-sm font-semibold uppercase tracking-wide text-brand-navy">
          Annexure A {'-'} commercial terms
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {annexureFields.map(([name, spec]) => (
            <label key={name} className="block">
              <span className={labelClass}>
                {spec.label}
                {spec.required && <span className="ml-1 text-signal-alert">*</span>}
              </span>
              <input
                type={spec.type === 'date' ? 'date' : 'text'}
                value={values[name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                placeholder={spec.placeholder}
                aria-label={spec.label}
                className={fieldClass}
              />
            </label>
          ))}
        </div>
        <label className="mt-4 block">
          <span className={labelClass}>Annexure free text (optional)</span>
          <textarea
            value={annexureHtml}
            onChange={(e) => setAnnexureHtml(e.target.value)}
            rows={8}
            placeholder="Add scope, deliverables, sub-clauses, etc. Each new line becomes a paragraph in the .docx."
            aria-label="Annexure free text"
            className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
        </label>
      </fieldset>

      {serverError ? (
        <div className="rounded border border-signal-alert/40 bg-red-50 px-4 py-3 text-sm text-signal-alert">
          {serverError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saveState === 'saving'}
          data-testid="annexure-save"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
        >
          <Save aria-hidden className="size-4" /> {saveState === 'saving' ? 'Saving…' : 'Save annexure'}
        </button>
        {saveState === 'saved' ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle aria-hidden className="size-3" /> Saved. Will reflect everywhere within ~5 minutes.
          </span>
        ) : null}
      </div>
    </div>
  )
}
