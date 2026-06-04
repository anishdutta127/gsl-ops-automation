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
import { deriveProductSelection } from '@/lib/products/portfolio'
import type {
  AuditEntry,
  GradewiseDistributionRow,
  MouProduct,
  ProductSelection,
} from '@/lib/mouSystem/types'

const PRODUCT_VALUES: ProductSelection[] = ['TinkRworks', 'Cretile', 'Both']

interface Body {
  productSelection?: unknown
  gradewiseDistribution?: unknown
  // Step 1 product-portfolio rework: structured products[]. When present,
  // it is authoritative and productSelection is derived from it.
  products?: unknown
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

function parseProducts(v: unknown): MouProduct[] | null | 'invalid' {
  if (v === null || v === undefined) return null
  if (!Array.isArray(v)) return 'invalid'
  const out: MouProduct[] = []
  for (const item of v) {
    if (item == null || typeof item !== 'object') return 'invalid'
    const o = item as Record<string, unknown>
    const product = typeof o.product === 'string' ? o.product.trim() : ''
    const skuName = typeof o.skuName === 'string' ? o.skuName.trim() : ''
    if (product === '' || skuName === '') return 'invalid'
    const gradeSpecific = o.gradeSpecific === true
    if (gradeSpecific) {
      if (!Array.isArray(o.perGradeQuantity)) return 'invalid'
      const rows: { grade: number; quantity: number }[] = []
      for (const row of o.perGradeQuantity) {
        if (row == null || typeof row !== 'object') return 'invalid'
        const g = Number((row as { grade?: unknown }).grade)
        const q = Number((row as { quantity?: unknown }).quantity)
        if (!Number.isFinite(g) || g < 1 || g > 12) return 'invalid'
        if (!Number.isFinite(q) || q < 0) return 'invalid'
        rows.push({ grade: g, quantity: q })
      }
      out.push({ product, skuName, gradeSpecific: true, perGradeQuantity: rows })
    } else {
      const grades = Array.isArray(o.grades)
        ? o.grades.map(Number).filter((n) => Number.isFinite(n) && n >= 1 && n <= 12)
        : []
      const q = Number(o.quantity)
      out.push({
        product,
        skuName,
        gradeSpecific: false,
        grades,
        quantity: Number.isFinite(q) && q >= 0 ? q : 0,
      })
    }
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

  const explicitProductSelection = parseProductSelection(body.productSelection)
  if (explicitProductSelection === 'invalid') {
    return NextResponse.json({ error: 'invalid-product' }, { status: 400 })
  }
  const gradewiseDistribution = parseGradewise(body.gradewiseDistribution)
  if (gradewiseDistribution === 'invalid') {
    return NextResponse.json({ error: 'invalid-gradewise' }, { status: 400 })
  }
  const products = parseProducts(body.products)
  if (products === 'invalid') {
    return NextResponse.json({ error: 'invalid-products' }, { status: 400 })
  }

  // When a structured portfolio is supplied it is authoritative: derive
  // the legacy brand enum from it so productSelection (read by every Part-A
  // reader) stays in lockstep. Otherwise honour the explicit brand enum.
  const productSelection = products
    ? deriveProductSelection(products) ?? explicitProductSelection
    : explicitProductSelection

  const now = new Date().toISOString()
  const audit: AuditEntry = {
    timestamp: now,
    user: user.name,
    action: 'update',
    before: {
      productSelection: mou.productSelection ?? null,
      gradewiseDistribution: mou.gradewiseDistribution ?? null,
      products: mou.products ?? null,
    },
    after: {
      productSelection,
      gradewiseDistribution,
      products,
    },
    notes: 'kits-details edit',
  }

  // ATOMIC PATTERN (Part 5.B Blocker 1 fix): updateWithAudit hides the
  // postgres-vs-json branch. Postgres: partial-update on the scalar/
  // JSONB fields we're editing + atomic JSONB || concat on audit_log,
  // so two parallel callers no longer race. Json: still the legacy
  // single-enqueue spread pattern (unchanged behaviour for existing
  // production).
  try {
    await mouRepo.updateWithAudit(
      mou.id,
      {
        productSelection: productSelection ?? null,
        gradewiseDistribution: gradewiseDistribution ?? null,
        products: products ?? null,
      },
      audit,
      { queuedBy: user.id },
    )
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
