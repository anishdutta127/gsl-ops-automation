'use client'

/*
 * CcRuleToggle (DESIGN.md "Surface 5 / Admin / cc-rules").
 *
 * Per-rule on/off toggle row on /admin/cc-rules. Step 6.5 Item H
 * default state for every rule is enabled: true. Toggle-off events
 * write a CcRule.disabledAt + disabledBy + disabledReason via the
 * audit trail (caller responsibility; this component only emits
 * onToggle).
 */

import { useId, useState, useTransition } from 'react'
import type { CcRule } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CcRuleToggleProps {
  rule: CcRule
  onToggle: (next: boolean) => Promise<void>
  disabled?: boolean
}

export function CcRuleToggle({ rule, onToggle, disabled = false }: CcRuleToggleProps) {
  const [enabled, setEnabled] = useState(rule.enabled)
  const [pending, startTransition] = useTransition()
  const id = useId()
  const labelId = `${id}-label`
  const descId = `${id}-desc`

  const isDisabled = disabled || pending

  function handleToggle() {
    if (isDisabled) return
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      try {
        await onToggle(next)
      } catch {
        // Roll back on failure; caller surfaces the error toast.
        setEnabled(!next)
      }
    })
  }

  return (
    <li className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div id={labelId} className="text-sm font-medium text-[var(--brand-navy)]">
          {rule.id}
        </div>
        <p id={descId} className="mt-0.5 text-xs text-slate-600">
          {rule.sourceRuleText}
        </p>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase text-slate-500">
          <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5">
            {rule.sheet}
          </span>
          <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5">
            {rule.scope}
          </span>
          {rule.contexts.map((ctx) => (
            <span
              key={ctx}
              className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5"
            >
              {ctx}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby={labelId}
        aria-describedby={descId}
        aria-busy={pending}
        disabled={isDisabled}
        onClick={handleToggle}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'focus-visible:outline-[var(--brand-navy)]',
          enabled
            ? 'bg-[var(--brand-teal)]'
            : 'bg-slate-300',
          isDisabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1',
          )}
          aria-hidden
        />
        <span className="sr-only">{enabled ? 'Enabled' : 'Disabled'}</span>
      </button>
    </li>
  )
}
