/*
 * POST /api/admin/products/[id]/edit (Phase 1.4): rename / retire / reactivate
 * a registry product. action = 'rename' | 'retire' | 'reactivate'.
 * Admin-gated (canManageUsers). Each change appends an auditLog entry.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { productRepo } from '@/lib/db/repos/product'
import type { Product, AuditEntry } from '@/lib/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { id: idRaw } = await ctx.params
  const id = decodeURIComponent(idRaw)
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const back = (params: Record<string, string>) => {
    const url = new URL('/admin/products', request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageUsers(user)) return back({ error: 'permission' })

  const form = await request.formData()
  const action = String(form.get('action') ?? '').trim()

  const current = await productRepo.findById(id)
  if (!current) return back({ error: 'not-found' })

  const ts = new Date().toISOString()
  let next: Product
  let okKey: string

  if (action === 'rename') {
    const name = String(form.get('name') ?? '').trim()
    if (!name) return back({ error: 'missing-name' })
    if (name !== current.name) {
      const all = await productRepo.findAll()
      if (all.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
        return back({ error: 'duplicate-name' })
      }
    }
    const audit: AuditEntry = {
      timestamp: ts, user: user.id, action: 'product-renamed',
      before: { name: current.name }, after: { name },
      notes: `Renamed "${current.name}" to "${name}".`,
    }
    next = { ...current, name, auditLog: [...current.auditLog, audit] }
    okKey = 'renamed'
  } else if (action === 'retire' || action === 'reactivate') {
    const active = action === 'reactivate'
    const audit: AuditEntry = {
      timestamp: ts, user: user.id,
      action: active ? 'product-reactivated' : 'product-retired',
      before: { active: current.active }, after: { active },
      notes: active ? `Reactivated "${current.name}".` : `Retired "${current.name}".`,
    }
    next = { ...current, active, auditLog: [...current.auditLog, audit] }
    okKey = active ? 'reactivated' : 'retired'
  } else {
    return back({ error: 'invalid-action' })
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'product',
      operation: 'update',
      payload: next as unknown as Record<string, unknown>,
    })
  } catch (err) {
    return back({ error: 'save-failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
  }

  revalidatePath('/admin/products')
  return back({ ok: okKey })
}
