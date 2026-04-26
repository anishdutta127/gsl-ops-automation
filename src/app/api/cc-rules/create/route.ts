/*
 * POST /api/cc-rules/create
 *
 * Form target for /admin/cc-rules/new. Reads CcRule fields from the
 * form body, parses scopeValue (comma-separated input becomes string[]
 * with len > 1; single token stays string), and calls createCcRule.
 *
 * Permission gate is enforced inside createCcRule (Admin-only for the
 * 30-day window). On success: 303 redirect to /admin/cc-rules. On
 * failure: 303 redirect back to /admin/cc-rules/new with error param.
 */

import { NextResponse } from 'next/server'
import {
  createCcRule,
  type CreateCcRuleArgs,
} from '@/lib/ccRules/createCcRule'
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

export async function POST(request: Request) {
  const form = await request.formData()
  const id = String(form.get('id') ?? '').trim()
  const sheet = String(form.get('sheet') ?? '') as CcRule['sheet']
  const scope = String(form.get('scope') ?? '') as CcRuleScope
  const scopeValueRaw = String(form.get('scopeValue') ?? '')
  const contextsRaw = form.getAll('contexts').map(String) as CcRuleContext[]
  const ccUserIdsRaw = String(form.get('ccUserIds') ?? '')
  const sourceRuleText = String(form.get('sourceRuleText') ?? '').trim()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/cc-rules/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/cc-rules/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const args: CreateCcRuleArgs = {
    id,
    sheet,
    scope,
    scopeValue: parseScopeValue(scopeValueRaw),
    contexts: contextsRaw,
    ccUserIds: parseList(ccUserIdsRaw),
    sourceRuleText,
    createdBy: session.sub,
  }

  const result = await createCcRule(args)
  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/cc-rules', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
