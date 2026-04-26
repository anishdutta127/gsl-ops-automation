/*
 * POST /api/admin/sales-team/create
 *
 * Form target for /admin/sales-team/new. Parses comma-separated
 * territories + repeated `programmes` checkbox values and calls
 * createSalesPerson. Permission gate inside the lib.
 *
 * Success: 303 to /admin/sales-team. Failure: 303 back with error.
 */

import { NextResponse } from 'next/server'
import {
  createSalesPerson,
  type CreateSalesPersonArgs,
} from '@/lib/salesTeam/createSalesPerson'
import type { Programme } from '@/lib/types'
import { getCurrentSession } from '@/lib/auth/session'

function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export async function POST(request: Request) {
  const form = await request.formData()
  const id = String(form.get('id') ?? '').trim()
  const name = String(form.get('name') ?? '').trim()
  const email = String(form.get('email') ?? '').trim()
  const phoneRaw = String(form.get('phone') ?? '').trim()
  const phone = phoneRaw === '' ? null : phoneRaw
  const territories = parseList(String(form.get('territories') ?? ''))
  const programmes = form.getAll('programmes').map(String) as Programme[]
  const joinedDate = String(form.get('joinedDate') ?? '').trim()

  const session = await getCurrentSession()
  if (!session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/sales-team/new')
    return NextResponse.redirect(url, { status: 303 })
  }

  const errorTo = (reason: string) => {
    const url = new URL('/admin/sales-team/new', request.url)
    url.searchParams.set('error', reason)
    return NextResponse.redirect(url, { status: 303 })
  }

  const args: CreateSalesPersonArgs = {
    id, name, email, phone, territories, programmes, joinedDate,
    createdBy: session.sub,
  }

  const result = await createSalesPerson(args)
  if (!result.ok) return errorTo(result.reason)

  const url = new URL('/admin/sales-team', request.url)
  return NextResponse.redirect(url, { status: 303 })
}
