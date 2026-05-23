/*
 * Tally Prime 6.2 voucher export (Gate 2 Step 6).
 *
 * For a given fiscal year + entity selection, returns a single Tally
 * XML payload containing one VOUCHER per PI in that FY. Uses the
 * migrated `mouSystem/tally.ts buildTallyXml` per-PI and wraps the
 * generated VOUCHERS in a single ENVELOPE wrapper so Tally accepts a
 * batch import.
 *
 * Per STEP6_QUESTIONS Q8: every Payment with piNumber !== null in the
 * selected FY is included, regardless of piNumber format. Format is
 * preserved verbatim from the Payment record. Empty FY returns a
 * valid envelope with no voucher messages (NOT an error).
 *
 * FY filter uses Indian fiscal year (April-March) based on
 * Payment.piGeneratedAt. Entity filter maps Payment -> MOU.programme
 * -> EntityKey via `getEntityForProgramme`.
 */

import type { MOU, Payment, School } from '@/lib/types'
import type {
  MOU as MouSystemMOU,
  Payment as MouSystemPayment,
  School as MouSystemSchool,
} from '@/lib/mouSystem/types'
import { buildTallyXml } from '@/lib/mouSystem/tally'
import { composePi } from '@/lib/mouSystem/pi'
import {
  company,
  getEntityForProgramme,
  type EntityKey,
} from '@/lib/mouSystem/company'
import { mouRepo } from '@/lib/db/repos/mou'
import { paymentRepo } from '@/lib/db/repos/payment'
import { schoolRepo } from '@/lib/db/repos/school'

export type EntitySelection = 'MH' | 'UP' | 'both'

export interface RunTallyExportArgs {
  /** Fiscal year shorthand: '26-27', '25-26', etc. */
  fiscalYear: string
  /** Which GST entity to include. */
  entity: EntitySelection
}

export interface RunTallyExportResult {
  /** XML payload. May contain zero or more VOUCHER messages. */
  xml: string
  /** Suggested filename (without directory). */
  filename: string
  /** Count of PI vouchers included. */
  voucherCount: number
}

export interface RunTallyExportDeps {
  payments: Payment[]
  mous: MOU[]
  schools: School[]
}

async function defaultDeps(): Promise<RunTallyExportDeps> {
  return {
  payments: await paymentRepo.findAll() as Payment[],
  mous: await mouRepo.findAll() as MOU[],
  schools: await schoolRepo.findAll() as School[],
}
}

/**
 * Returns FY shorthand for an ISO datetime: '2026-04-15' -> '26-27'.
 * Indian FY runs April-March; a date in Jan-Mar belongs to the FY
 * starting the previous April.
 */
function fiscalYearForIso(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const y = d.getFullYear()
  const startYY = d.getMonth() >= 3 ? y : y - 1
  const endYY = startYY + 1
  return `${String(startYY).slice(-2)}-${String(endYY).slice(-2)}`
}

export async function runTallyExport(
  args: RunTallyExportArgs,
  depsOverride?: RunTallyExportDeps,
): Promise<RunTallyExportResult> {
  const deps = depsOverride ?? (await defaultDeps())
  const mouById = new Map(deps.mous.map((m) => [m.id, m]))
  const schoolById = new Map(deps.schools.map((s) => [s.id, s]))

  const matched: { payment: Payment; mou: MOU; entityKey: EntityKey }[] = []
  for (const p of deps.payments) {
    if (p.piNumber === null) continue
    if (p.piGeneratedAt === null) continue
    if (fiscalYearForIso(p.piGeneratedAt) !== args.fiscalYear) continue
    const mou = mouById.get(p.mouId)
    if (!mou) continue
    const entityKey = getEntityForProgramme(mou.programme)
    if (args.entity !== 'both' && entityKey !== args.entity) continue
    matched.push({ payment: p, mou, entityKey })
  }

  // Sort by piGeneratedAt asc so the Tally import sees vouchers in
  // issue order.
  matched.sort((a, b) =>
    (a.payment.piGeneratedAt ?? '').localeCompare(b.payment.piGeneratedAt ?? ''),
  )

  const vouchers: string[] = []
  for (const { payment, mou, entityKey } of matched) {
    const school = schoolById.get(mou.schoolId)
    // The mouSystem composePi expects mouSystem-flavoured types
    // (legacy AuditAction enum + slightly different School shape).
    // composePi reads only commercial fields (piNumber, dates,
    // amounts, schoolName/address) and does not write back so the
    // cast at the boundary is safe.
    const pi = composePi({
      piNumber: payment.piNumber!,
      issueDate: (payment.piGeneratedAt ?? new Date().toISOString()).slice(0, 10),
      installment: payment as unknown as MouSystemPayment,
      mou: mou as unknown as MouSystemMOU,
      school: school as unknown as MouSystemSchool | undefined,
      gstPct: 0.18,
      entityKey,
    })
    const single = buildTallyXml(pi, { tallyVersion: 'prime' })
    // Pull the inner VOUCHER block out of each per-PI envelope so we
    // can wrap them in one outer envelope. The per-PI builder emits a
    // full ENVELOPE; we only need the TALLYMESSAGE > VOUCHER fragment
    // when batching.
    const inner = extractVoucher(single)
    if (inner !== null) vouchers.push(inner)
  }

  const xml = buildEnvelope(vouchers)
  const filename = `tally-export-${args.entity}-${args.fiscalYear}.xml`

  return { xml, filename, voucherCount: vouchers.length }
}

function extractVoucher(singlePiXml: string): string | null {
  const match = singlePiXml.match(
    /<TALLYMESSAGE>[\s\S]*?<\/TALLYMESSAGE>/,
  )
  return match ? match[0] : null
}

function buildEnvelope(voucherFragments: string[]): string {
  const inner = voucherFragments.join('\n        ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(company.name)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ${inner}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
