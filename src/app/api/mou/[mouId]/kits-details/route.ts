/*
 * POST /api/mou/[mouId]/kits-details (Gate 3 Step 1).
 *
 * Updates productSelection + gradewiseDistribution on a MOU record.
 * Late-stage edit surface for Sales when the data was not ready at
 * MOU draft time. Permission: canEditMOU (Sales + Admin).
 *
 * Audit lands on the MOU as `update` with before/after capturing
 * both fields.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { mouRepo } from '@/lib/db/repos/mou'
import type { MOU } from '@/lib/types'
import type {
  AuditEntry,
  GradewiseDistributionRow,
  ProductSelection,
} from '@/lib/mouSystem/types'

const PRODUCT_VALUES: ProductSelection[] = ['TinkRworks', 'Cretile', 'Both']

interface Body {
  productSelection?: unknown
  gradewiseDistribution?: unknown
}

function parseProductSelection(v: unknown): ProductSelection | null | 'invalid' {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && (PRODUCT_VALUES as string[]).includes(v)) {
    return v as ProductSelection
  }
  return 'invalid'
}

function parseGradewise(
  v: unknown,
): GradewiseDistributionRow[] | null | 'invalid' {
  if (v === null || v === undefined) return null
  if (!Array.isArray(v)) return 'invalid'
  const out: GradewiseDistributionRow[] = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') return 'invalid'
    const o = item as { grade?: unknown; students?: unknown; kitType?: unknown }
    const grade = Number(o.grade)
    const students = Number(o.students)
    const kt = o.kitType
    if (!Number.isFinite(grade) || grade < 1 || grade > 12) return 'invalid'
    if (!Number.isFinite(students) || students < 0) return 'invalid'
    const kitType: GradewiseDistributionRow['kitType'] =
      kt === 'Reusable' || kt === 'Consumable' ? kt : null
    out.push({ grade, students, kitType })
  }
  return out.length > 0 ? out : null
}

interface RouteContext {
  params: Promise<{ mouId: string }>
}

export async function POST(request: Request, ctx: RouteContext) {
  const { mouId } = await ctx.params
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditMOU(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const mou = await mouRepo.findById(mouId)
  if (!mou) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  }

  const productSelection = parseProductSelection(body.productSelection)
  if (productSelection === 'invalid') {
    return NextResponse.json({ error: 'invalid-product' }, { status: 400 })
  }
  const gradewiseDistribution = parseGradewise(body.gradewiseDistribution)
  if (gradewiseDistribution === 'invalid') {
    return NextResponse.json({ error: 'invalid-gradewise' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'update',
    before: {
      productSelection: mou.productSelection ?? null,
      gradewiseDistribution: mou.gradewiseDistribution ?? null,
    },
    after: {
      productSelection,
      gradewiseDistribution,
    },
    notes: 'kits-details edit',
  }

  // Spread the existing MOU so the queue payload carries top-level `id`
  // (the drain handler looks up by payload.id) and so the drainer's
  // replace-by-id semantics do not obliterate the other MOU fields.
  // Matches the working sibling pattern used by /api/mou/[mouId]/edit
  // and every other MOU-update producer in the codebase.
  const updated: MOU = {
    ...mou,
    productSelection: productSelection ?? null,
    gradewiseDistribution: gradewiseDistribution ?? null,
    auditLog: [...(mou.auditLog ?? []), audit],
  }

  try {
    await mouRepo.update(updated, { queuedBy: user.id })
  } catch (e) {
    return NextResponse.json(
      {
        error: 'queue-failure',
        message:
          e instanceof Error ? e.message : 'Failed to queue the update. Retry.',
      },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
