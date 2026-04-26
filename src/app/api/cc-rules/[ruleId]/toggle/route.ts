/*
 * POST /api/cc-rules/[ruleId]/toggle
 *
 * Form target for the inline toggle on /admin/cc-rules. Reads
 * `enabled` (string 'true' / 'false') and optional `reason` (required
 * when disabling) and calls toggleCcRule.
 *
 * On success: 303 back to /admin/cc-rules. On failure: 303 back with
 * error param. The cc-rule:toggle gate is enforced inside the lib.
 */

import { NextResponse } from 'next/server'
import { toggleCcRule } from '@/lib/ccRules/toggleCcRule'
import { getCurrentSession } from '@/lib/auth/session'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  const { ruleId } = await params
  const form = await request.formData()
  const enabledRaw = String(form.get('enabled') ?? '')
  const reason = String(form.get('reason') ?? '').trim() || undefined

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/cc-rules')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reasonCode: string) => {
    const url = new URL('/admin/cc-rules', request.url)
    url.searchParams.set('error', reasonCode)
    url.searchParams.set('ruleId', ruleId)
    return NextResponse.redirect(url, { status: 303 })
  }

  if (enabledRaw !== 'true' && enabledRaw !== 'false') {
    return errorTo('invalid-enabled')
  }
  const enabled = enabledRaw === 'true'

  const result = await toggleCcRule({
    ruleId,
    enabled,
    toggledBy: session.sub,
    reason,
  })

  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/cc-rules', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
