/*
 * Render a PI .docx from real fixture data to verify the Phase 5
 * INSTALMENT_SUMMARY template edit produces clean output.
 *
 * Picks a real MOU that has at least one paid instalment so the
 * "Paid (date)" + "This invoice" + "Due" statuses all appear in the
 * summary table.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

const mousJson = JSON.parse(await readFile('src/data/mous.json', 'utf8'))
const paymentsJson = JSON.parse(await readFile('src/data/payments.json', 'utf8'))
const schoolsJson = JSON.parse(await readFile('src/data/schools.json', 'utf8'))
const companyJson = JSON.parse(await readFile('config/company.json', 'utf8'))

// Find an MOU with a paid instalment.
const mou = mousJson.find((m) => {
  const ps = paymentsJson.filter((p) => p.mouId === m.id)
  return ps.length >= 2 && ps.some((p) => p.receivedAmount && p.receivedAmount > 0)
})
if (!mou) {
  console.error('No MOU with a paid instalment found.')
  process.exit(1)
}
const school = schoolsJson.find((s) => s.id === mou.schoolId)
const instalments = paymentsJson
  .filter((p) => p.mouId === mou.id)
  .sort((a, b) => a.instalmentSeq - b.instalmentSeq)
const currentInstalment = instalments.find((p) => !p.receivedAmount) ?? instalments[0]

console.log(`Using MOU ${mou.id} (${mou.schoolName})`)
console.log(`Instalments: ${instalments.length}, current=${currentInstalment.instalmentLabel}`)

// Build INSTALMENT_SUMMARY exactly as buildPlaceholderBag does.
function formatRs(n) {
  if (typeof n !== 'number') return ''
  return `Rs ${Math.round(n).toLocaleString('en-IN')}`
}
function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-')
}

const INSTALMENT_SUMMARY = instalments.map((p) => {
  const isCurrent = p.id === currentInstalment.id
  const isPaid = p.receivedAmount !== null && p.receivedAmount > 0
  const status = isPaid
    ? `Paid${p.receivedDate ? ` (${formatDate(p.receivedDate)})` : ''}`
    : isCurrent
      ? 'This invoice'
      : 'Due'
  const amount = isPaid ? p.receivedAmount : p.expectedAmount
  return {
    seq: String(p.instalmentSeq),
    label: p.instalmentLabel,
    dueDate: p.dueDateIso ? formatDate(p.dueDateIso) : (p.dueDateRaw ?? '-'),
    status,
    amount: formatRs(amount),
    breakdown: '',
  }
})

const studentsForBilling = mou.studentsActual ?? mou.studentsMou
const contractTotal = instalments.reduce(
  (s, p) => s + ((p.receivedAmount && p.receivedAmount > 0) ? p.receivedAmount : p.expectedAmount),
  0,
)
const totalReceived = instalments.reduce((s, p) => s + (p.receivedAmount ?? 0), 0)
const bag = {
  PI_NUMBER: currentInstalment.piNumber ?? 'GSL/OPS/26-27/TEST',
  PI_DATE: formatDate(new Date().toISOString()),
  SCHOOL_NAME: school?.legalEntity ?? school?.name ?? mou.schoolName,
  SCHOOL_GSTIN: school?.gstNumber ?? 'To be added',
  SCHOOL_ADDRESS: [school?.name ?? '', `${school?.city ?? ''}, ${school?.state ?? ''}`, school?.pinCode ?? '']
    .filter(Boolean).join('\n'),
  GSL_LEGAL_ENTITY: companyJson.legalEntity,
  GSL_GSTIN: companyJson.entities?.MH?.gstin ?? companyJson.gstin ?? '',
  GSL_ADDRESS: (companyJson.entities?.MH?.address ?? companyJson.address ?? []).join('\n'),
  PROGRAMME: mou.programme,
  PROGRAMME_SUB_TYPE: mou.programmeSubType ?? '',
  LINE_ITEMS: [{
    description: `${mou.programme} - Instalment ${currentInstalment.instalmentLabel}`,
    students: String(studentsForBilling),
    rate: formatRs(mou.spWithoutTax),
    amount: formatRs(studentsForBilling * mou.spWithoutTax),
  }],
  SUBTOTAL: formatRs(studentsForBilling * mou.spWithoutTax),
  GST_AMOUNT: formatRs(studentsForBilling * mou.spWithoutTax * 0.18),
  TOTAL: formatRs(studentsForBilling * mou.spWithoutTax * 1.18),
  INSTALLMENT_LABEL: `Instalment ${currentInstalment.instalmentLabel}`,
  PAYMENT_TERMS: companyJson.paymentTerms,
  ACCOUNT_DETAILS: (companyJson.accountDetails ?? []).join('\n'),
  INSTALMENT_SUMMARY,
  CONTRACT_TOTAL_AT_CURRENT_COUNT: formatRs(contractTotal),
  TOTAL_RECEIVED_TO_DATE: formatRs(totalReceived),
  CURRENT_STUDENT_COUNT: String(studentsForBilling),
}

const templateBytes = await readFile('public/ops-templates/pi-template.docx')
const zip = new PizZip(templateBytes)
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
doc.render(bag)
const out = doc.getZip().generate({ type: 'uint8array' })
const outPath = path.join('tmp', 'pi-render-test.docx')
await writeFile(outPath, out)
console.log(`Rendered ${outPath} (${out.byteLength} bytes)`)
console.log('Open in Word to inspect.')
