/*
 * POST /api/mou/save-draft (Step 5).
 *
 * JSON endpoint for the GeneratorWizard's "Save draft" button. Mirrors
 * gsl-mou-system's /api/generator/save-draft body shape so the wizard
 * can be ported as-is. Persists to src/data/mous.json via the queue
 * writer in src/lib/mouSystem/entityWriters.ts (atomicUpdateJson).
 *
 * Permission: canEditMOU (Sales + Admin). Non-Sales callers receive
 * 403; the UI hides the surface ahead of submission via the page-
 * level gate.
 *
 * The Robotics ROBO branch fix in `nextDraftSequence` is preserved by
 * importing from the shared mouSystem entityWriters; we do not
 * re-introduce the bug here.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { saveDraftMou } from '@/lib/mouSystem/entityWriters'
import type {
  GradewiseDistributionRow,
  MouBillingBlock,
  ProductSelection,
  Programme,
  SalesChannel,
  TrainerModel,
  YearPaymentSchedule,
  YearlyPricingRow,
} from '@/lib/mouSystem/types'

interface Body {
  draftMouId?: string | null
  templateId?: string
  programme?: Programme
  schoolId?: string | null
  schoolName?: string
  variables?: Record<string, string>
  annexureHtml?: string | null
  trainerModel?: TrainerModel | null
  salesChannel?: SalesChannel | null
  salesPersonId?: string | null
  schoolCrmId?: string | null
  paymentSchedules?: YearPaymentSchedule[] | null
  yearlyPricing?: YearlyPricingRow[] | null
  billingBlock?: MouBillingBlock | null
  // Gate 3 Step 1: kits-dispatch enhancements (optional at draft time).
  productSelection?: ProductSelection | null
  gradewiseDistribution?: GradewiseDistributionRow[] | null
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!canEditMOU(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid-body' }, { status: 400 })
  }

  if (!body.templateId) {
    return NextResponse.json({ error: 'missing-template' }, { status: 400 })
  }
  if (!body.programme) {
    return NextResponse.json({ error: 'missing-programme' }, { status: 400 })
  }

  try {
    const result = await saveDraftMou({
      identityName: user.name,
      draftMouId: body.draftMouId ?? null,
      templateId: body.templateId,
      templateVersion: body.templateId,
      programme: body.programme,
      schoolId: body.schoolId ?? null,
      schoolName: body.schoolName ?? '',
      variables: body.variables ?? {},
      annexureHtml: body.annexureHtml ?? null,
      trainerModel: body.trainerModel ?? null,
      salesChannel: body.salesChannel ?? null,
      salesPersonId: body.salesPersonId ?? null,
      schoolCrmId: body.schoolCrmId ?? null,
      paymentSchedules: body.paymentSchedules ?? null,
      yearlyPricing: body.yearlyPricing ?? null,
      billingBlock: body.billingBlock ?? null,
      productSelection: body.productSelection ?? null,
      gradewiseDistribution: body.gradewiseDistribution ?? null,
    })
    return NextResponse.json({ draft: { id: result.mou.id }, commitSha: result.commitSha })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save-failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
