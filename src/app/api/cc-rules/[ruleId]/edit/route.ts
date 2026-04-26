/*
 * POST /api/cc-rules/[ruleId]/edit
 *
 * Form target for /admin/cc-rules/[ruleId]. Builds a patch from the
 * present form fields (omitting any field not submitted), parses
 * scopeValue + ccUserIds + contexts, and calls editCcRule.
 *
 * Permission gate inside editCcRule (Admin + OpsHead). On success: 303
 * back to detail page. On failure: 303 back to detail with error param.
 */

import { NextResponse } from 'next/server'
import { editCcRule, type EditCcRuleArgs } from '@/lib/ccRules/editCcRule'
import { getCurrentSession } from '@/lib/auth/session'
import type { CcRule, CcRuleContext, CcRuleScope } from '@/lib/types'

function parseScopeValue(raw: string): string | string[] {
  const trimmed = raw.trim()
  if (!trimmed.includes(',')) return trimmed
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return parts.length === 1 ? parts[0]! : parts
}

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params
  const form = await request.formData()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', `/admin/cc-rules/${ruleId}`)
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL(`/admin/cc-rules/${ruleId}`, request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const patch: EditCcRuleArgs['patch'] = {}
  const sheet = form.get('sheet')
  if (typeof sheet === 'string' && sheet.length > 0) {
    patch.sheet = sheet as CcRule['sheet']
  }
  const scope = form.get('scope')
  if (typeof scope === 'string' && scope.length > 0) {
    patch.scope = scope as CcRuleScope
  }
  const scopeValue = form.get('scopeValue')
  if (typeof scopeValue === 'string' && scopeValue.length > 0) {
    patch.scopeValue = parseScopeValue(scopeValue)
  }
  const contexts = form.getAll('contexts').map(String) as CcRuleContext[]
  if (contexts.length > 0) patch.contexts = contexts
  const ccUserIds = form.get('ccUserIds')
  if (typeof ccUserIds === 'string' && ccUserIds.length > 0) {
    patch.ccUserIds = parseList(ccUserIds)
  }
  const sourceRuleText = form.get('sourceRuleText')
  if (typeof sourceRuleText === 'string' && sourceRuleText.trim().length > 0) {
    patch.sourceRuleText = sourceRuleText.trim()
  }

  const result = await editCcRule({
    ruleId,
    editedBy: session.sub,
    patch,
  })
  if (!result.ok) return errorTo(result.reason)

  const url = new URL(`/admin/cc-rules/${ruleId}`, request.url)
  return NextResponse.redirect(url, { status: 303 })
}
