'use client'

/*
 * StatusNotesSection (W4-B.3).
 *
 * Persistent textarea on the MOU detail page that captures
 * reason-for-delay / current-blocker prose. Auto-save on blur with
 * a 600ms debounce (debounce gives the operator a beat to keep
 * typing if they paused; on blur we save immediately).
 *
 * Submit POSTs to /api/mou/delay-notes; the lib mutator
 * (updateDelayNotes) handles attribution + audit + queue. The
 * client-side state shows "Saving..." while the request is in
 * flight; "Saved <relative time>" once the response confirms the
 * write; "Save failed" on a non-OK response (rare; the lib
 * normalises empty / whitespace and never errors on those paths).
 *
 * Visible to every authenticated user (W3-B). The lib intentionally
 * has no role gate on this surface; attribution is captured on the
 * audit entry so we trail who-said-what without restricting who-
 * can-say.
 */

import { useEffect, useRef, useState } from 'react'

interface StatusNotesSectionProps {
  mouId: string
  initialNotes: string | null
  /** Already-formatted "Last updated by <name> at <ts>" string from the MOU's audit log. */
  initialMetaLine: string | null
}

const DEBOUNCE_MS = 600

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string }
  | { kind: 'no-change' }

export function StatusNotesSection({ mouId, initialNotes, initialMetaLine }: StatusNotesSectionProps) {
  const [value, setValue] = useState<string>(initialNotes ?? '')
  const [savedValue, setSavedValue] = useState<string>(initialNotes ?? '')
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [metaLine, setMetaLine] = useState<string | null>(initialMetaLine)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    }
  }, [])

  async function flushSave(): Promise<void> {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (value.trim() === savedValue.trim()) {
      setState({ kind: 'no-change' })
      return
    }
    setState({ kind: 'saving' })
    try {
      const form = new FormData()
      form.set('mouId', mouId)
      form.set('notes', value)
      const res = await fetch('/api/mou/delay-notes', { method: 'POST', body: form })
      const data = (await res.json()) as
        | { ok: true; normalised?: string | null; savedAt?: string; noChange?: true }
        | { ok: false; reason: string }
      if (!res.ok || data.ok === false) {
        setState({
          kind: 'error',
          message: 'ok' in data && data.ok === false ? `Failed: ${data.reason}` : 'Save failed',
        })
        return
      }
      if (data.noChange === true) {
        setState({ kind: 'no-change' })
        return
      }
      const normalised = data.normalised ?? ''
      setSavedValue(normalised)
      setValue(normalised)
      setState({ kind: 'saved', at: data.savedAt ?? new Date().toISOString() })
      setMetaLine(`Last updated just now`)
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message })
    }
  }

  function scheduleSave(): void {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void flushSave()
    }, DEBOUNCE_MS)
  }

  return (
    <section
      aria-labelledby="status-notes-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
      data-testid="status-notes-section"
    >
      <h3 id="status-notes-heading" className="mb-2 font-heading text-base font-semibold text-brand-navy">
        Status notes
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Capture the current blocker, the next-step owner, or context anyone picking
        up this MOU should know. Auto-saves on blur.
      </p>
      <textarea
        aria-label="Status notes"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setState({ kind: 'idle' })
          scheduleSave()
        }}
        onBlur={() => {
          void flushSave()
        }}
        placeholder="e.g., Awaiting GST upload from school; Anish escalating Tuesday standup."
        className="block min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        data-testid="status-notes-textarea"
        rows={4}
      />
      <div
        className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"
        data-testid="status-notes-meta"
      >
        <span aria-live="polite" data-testid="status-notes-state">
          {state.kind === 'saving' ? 'Saving…' : null}
          {state.kind === 'saved' ? 'Saved' : null}
          {state.kind === 'no-change' ? 'No change to save' : null}
          {state.kind === 'error' ? `Save failed: ${state.message}` : null}
          {state.kind === 'idle' ? '' : null}
        </span>
        {metaLine !== null ? <span>{metaLine}</span> : null}
      </div>
    </section>
  )
}
