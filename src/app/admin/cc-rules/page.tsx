/*
 * /admin/cc-rules (Phase C5a-2; toggle persistence wired).
 *
 * Server Component. Lists every CcRule with a per-row toggle.
 * Toggle persistence routes through CcRuleToggleRow (a Client wrapper
 * that POSTs to /api/cc-rules/[ruleId]/toggle). The page itself reads
 * cc_rules.json for the current state.
 *
 * W4-I.5 P4C2: TopNav + PageHeader + breadcrumb.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { CcRule } from '@/lib/types'
import ccRulesJson from '@/data/cc_rules.json'
import { getCurrentUser } from '@/lib/auth/session'
import { CcRuleToggleRow } from '@/components/ops/CcRuleToggleRow'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { opsButtonClass } from '@/components/ops/OpsButton'

const rules = ccRulesJson as unknown as CcRule[]

export default async function CcRulesListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Fcc-rules')

  const canCreate = true
  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <>
      <TopNav currentPath="/admin" />
      <main id="main-content">
        <PageHeader
          title="CC rules"
          subtitle={`${rules.length} rules, ${enabledCount} enabled. Cc fan-out runs at send-time per rule context.`}
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Admin', href: '/admin' },
            { label: 'CC rules' },
          ]}
          actions={canCreate ? (
            <Link
              href="/admin/cc-rules/new"
              className={opsButtonClass({ variant: 'primary', size: 'md' })}
            >
              New rule
            </Link>
          ) : null}
        />
        <div className="mx-auto max-w-screen-md px-4 py-6">
          {rules.length === 0 ? (
            <p className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No rules yet.
            </p>
          ) : (
            <ul className="rounded-md border border-border bg-card">
              {rules.map((rule) => (
                <li key={rule.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-stretch">
                    <div className="flex-1">
                      <CcRuleToggleRow rule={rule} />
                    </div>
                    <Link
                      href={`/admin/cc-rules/${rule.id}`}
                      className="flex min-h-11 items-center px-4 text-xs font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  )
}
