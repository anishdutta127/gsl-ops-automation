'use client'

/*
 * CcRuleToggleRow (Phase C5a-2).
 *
 * Client wrapper around the existing CcRuleToggle (visual switch).
 * Owns the network call: on toggle, POSTs to
 * /api/cc-rules/[ruleId]/toggle. When the user is disabling a rule,
 * we prompt for a reason (the lib requires one for the audit anchor).
 * On any error, the inner CcRuleToggle rolls back the optimistic UI.
 *
 * The Server Component parent passes the rule + ruleId; this Client
 * Component owns the form-encoded fetch so we can stay consistent
 * with the form-POST pattern used elsewhere in the codebase rather
 * than introducing Server Actions just for this surface.
 */

import { useRouter } from 'next/navigation'
import type { CcRule } from '@/lib/types'
import { CcRuleToggle } from './CcRuleToggle'

interface Props {
  rule: CcRule
}

export function CcRuleToggleRow({ rule }: Props) {
  const router = useRouter()

  async function persistToggle(next: boolean): Promise<void> {
    let reason: string | undefined
    if (!next) {
      // Phase 1: window.prompt for disable-reason. Phase 1.1 trigger: tester feedback. Upgrade path: replace with <Dialog> from src/components/ui/dialog.tsx (already installed) + small Client Component for form submission.
      const input = window.prompt('Reason for disabling this rule:')
      if (input === null) {
        throw new Error('cancelled')
      }
      const trimmed = input.trim()
      if (trimmed === '') {
        window.alert('A reason is required when disabling a rule.')
        throw new Error('reason-required')
      }
      reason = trimmed
    }

    const body = new URLSearchParams()
    body.set('enabled', String(next))
    if (reason !== undefined) body.set('reason', reason)

    const res = await fetch(`/api/cc-rules/${encodeURIComponent(rule.id)}/toggle`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    })

    if (res.type === 'opaqueredirect' || res.status === 303 || res.ok) {
      router.refresh()
      return
    }

    throw new Error(`toggle failed (${res.status})`)
  }

  return <CcRuleToggle rule={rule} onToggle={persistToggle} />
}
