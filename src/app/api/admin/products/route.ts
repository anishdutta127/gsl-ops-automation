/*
 * POST /api/admin/products (Phase 1.4): create a registry product.
 * Admin-gated (canManageUsers). Audited. 303 back to /admin/products.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { productRepo } from '@/lib/db/repos/product'
import type { Product } from '@/lib/types'

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const back = (params: Record<string, string>) => {
    const url = new URL('/admin/products', request.url)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageUsers(user)) return back({ error: 'permission' })

  const form = await request.formData()
  const name = String(form.get('name') ?? '').trim()
  if (!name) return back({ error: 'missing-name' })
  const id = slugify(name)
  if (!id) return back({ error: 'missing-name' })

  const existing = await productRepo.findAll()
  if (existing.some((p) => p.id === id || p.name.toLowerCase() === name.toLowerCase())) {
    return back({ error: 'duplicate-name' })
  }
  const nextSort = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0) + 1
  const ts = new Date().toISOString()

  const product: Product = {
    id,
    name,
    active: true,
    sortOrder: nextSort,
    legacyProgrammes: [],
    createdAt: ts,
    createdBy: user.id,
    auditLog: [
      {
        timestamp: ts,
        user: user.id,
        action: 'create',
        before: {},
        after: { id, name, active: true },
        notes: `Product "${name}" added to the registry.`,
      },
    ],
  }

  try {
    await enqueueUpdate({
      queuedBy: user.id,
      entity: 'product',
      operation: 'create',
      payload: product as unknown as Record<string, unknown>,
    })
  } catch (err) {
    return back({ error: 'save-failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 200) })
  }

  revalidatePath('/admin/products')
  return back({ ok: 'created' })
}
