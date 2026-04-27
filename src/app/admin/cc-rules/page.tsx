/*
 * /admin/cc-rules (Phase C5a-2; toggle persistence wired).
 *
 * Server Component. Lists every CcRule with a per-row toggle.
 * Toggle persistence routes through CcRuleToggleRow (a Client wrapper
 * that POSTs to /api/cc-rules/[ruleId]/toggle). The page itself reads
 * cc_rules.json for the current state.
 *
 * Permission gate: Admin or OpsHead. Other viewers redirect to
 * /dashboard.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { CcRule } from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import { getCurrentUser } from '@/lib/auth/session'
import { CcRuleToggleRow } from '@/components/ops/CcRuleToggleRow'

const rules = ccRulesJson as unknown as CcRule[]

export default async function CcRulesListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fcc-rules')

  // Phase 1 W3-B: UI gates disabled; every authenticated tester can
  // see and use the New rule button. Server-side canPerform() in
  // lib/ccRules/createCcRule.ts still enforces.
  const canCreate = true
  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="p-6 max-w-4xl">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">CC rules</h1>
          <p className="mt-1 text-sm text-slate-700">
            {rules.length} rules, {enabledCount} enabled. Cc fan-out runs at
            send-time per rule context.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/admin/cc-rules/new"
            className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            New rule
          </Link>
        ) : null}
      </header>

      {rules.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
          No rules yet.
        </p>
      ) : (
        <ul className="rounded-md border border-slate-200 bg-white">
          {rules.map((rule) => (
            <li key={rule.id} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-stretch">
                <div className="flex-1">
                  <CcRuleToggleRow rule={rule} />
                </div>
                <Link
                  href={`/admin/cc-rules/${rule.id}`}
                  className="flex items-center px-4 text-xs font-medium text-[var(--brand-navy)] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
