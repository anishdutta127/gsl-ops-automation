/*
 * POST /api/mou/generate-docx (Gate 5A Step 3).
 *
 * Wizard "Generate .docx" button target. Mirrors the save-draft body
 * shape so the wizard can hand the same payload it already builds for
 * a draft save. Saves the draft first via saveDraftMou (the same path
 * the wizard's Save Draft button uses), then renders the .docx by
 * reading the per-programme template from public/mou-templates/ and
 * running docxtemplater against the wizard's variables map.
 *
 * Returns the .docx binary with Content-Disposition attachment so the
 * browser downloads the file. The saveDraftMou call writes an audit
 * entry on the MOU; no separate "generated" audit is appended because
 * the data is identical to what the save just wrote.
 *
 * Robotics programme MOUs use the STEAM-v3 template (see registry
 * comment in src/lib/mouSystem/templates.ts: "STEAM / Robotics MOU").
 * No separate Robotics .docx exists today; flagged in commit message.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditMOU } from '@/lib/access'
import { saveDraftMou, type NewSchoolInlinePayload } from '@/lib/mouSystem/entityWriters'
import { getTemplate } from '@/lib/mouSystem/templates'
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
  newSchool?: NewSchoolInlinePayload | null
  variables?: Record<string, string>
  annexureHtml?: string | null
  trainerModel?: TrainerModel | null
  salesChannel?: SalesChannel | null
  salesPersonId?: string | null
  schoolCrmId?: string | null
  paymentSchedules?: YearPaymentSchedule[] | null
  yearlyPricing?: YearlyPricingRow[] | null
  billingBlock?: MouBillingBlock | null
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

  const template = getTemplate(body.templateId)
  if (!template) {
    return NextResponse.json({ error: 'unknown-template' }, { status: 400 })
  }

  // Persist the draft first so the MOU + audit trail exist before the
  // .docx is built. Reuses the save-draft writer to keep the on-disk
  // representation identical to a normal Save Draft round-trip.
  let savedMouId: string
  try {
    const saveResult = await saveDraftMou({
      identityName: user.name,
      draftMouId: body.draftMouId ?? null,
      templateId: body.templateId,
      templateVersion: body.templateId,
      programme: body.programme,
      schoolId: body.schoolId ?? null,
      schoolName: body.schoolName ?? '',
      newSchool: body.newSchool ?? null,
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
    savedMouId = saveResult.mou.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save-failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Read template + render. Empty optional fields are passed through
  // to docxtemplater which substitutes them as empty strings; no
  // additional defensive handling is needed.
  let docxBytes: Uint8Array
  try {
    const templateBytes = await readFile(path.join(process.cwd(), template.file))
    const zip = new PizZip(templateBytes)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })
    doc.render(body.variables ?? {})
    const out = doc.getZip().generate({ type: 'uint8array' })
    docxBytes = out as unknown as Uint8Array
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return NextResponse.json(
        {
          error: 'template-missing',
          message: `Template file not found at ${template.file}. Drop the .docx and redeploy.`,
        },
        { status: 500 },
      )
    }
    const msg = err instanceof Error ? err.message : 'docx-render-failed'
    return NextResponse.json({ error: 'docx-render-failed', message: msg }, { status: 500 })
  }

  const filename = `${savedMouId}.docx`
  const responseBody = new Uint8Array(docxBytes).buffer
  return new Response(responseBody, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
      // Custom header so the client can surface the saved id without
      // parsing the binary body.
      'x-mou-id': savedMouId,
    },
  })
}
