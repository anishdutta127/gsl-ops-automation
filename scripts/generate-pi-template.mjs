/*
 * scripts/generate-pi-template.mjs
 *
 * Generates public/ops-templates/pi-template.docx with the
 * docxtemplater {TOKEN} placeholders declared in
 * src/lib/pi/templates.ts.
 *
 * Run: `node scripts/generate-pi-template.mjs`
 *
 * Layout follows standard Indian B2B GST proforma invoice
 * conventions: header (bill-from), invoice metadata, bill-to,
 * line-items table, totals (subtotal + GST + total), payment
 * terms + bank account details, signature block.
 *
 * Iterate by editing this file and re-running. The .docx is
 * committed to source control alongside this script so the
 * binary state and the generator are always in sync.
 *
 * Delimiter: docxtemplater default (single curly braces). Loop
 * syntax: {#LINE_ITEMS}...{/LINE_ITEMS}.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx'

const cell = (children, opts = {}) =>
  new TableCell({
    children: Array.isArray(children) ? children : [children],
    width: opts.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    shading: opts.shaded ? { fill: 'E2E8F0' } : undefined,
  })

const text = (str, opts = {}) =>
  new TextRun({
    text: str,
    bold: opts.bold,
    size: opts.size,
    color: opts.color,
  })

const para = (children, opts = {}) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.alignment,
    spacing: opts.spacing,
    heading: opts.heading,
  })

const header = [
  para([text('{GSL_LEGAL_ENTITY}', { bold: true, size: 32 })]),
  para([text('GSTIN: {GSL_GSTIN}', { size: 20 })]),
  para([text('{GSL_ADDRESS}', { size: 20 })]),
  para([text('')]),
  para([text('PROFORMA INVOICE', { bold: true, size: 28 })], {
    alignment: AlignmentType.CENTER,
  }),
  para([text('')]),
]

const metaTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  },
  rows: [
    new TableRow({
      children: [
        cell(para([text('PI Number', { bold: true })]), { width: 33 }),
        cell(para([text('PI Date', { bold: true })]), { width: 33 }),
        cell(para([text('Instalment', { bold: true })]), { width: 34 }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{PI_NUMBER}')])),
        cell(para([text('{PI_DATE}')])),
        cell(para([text('{INSTALLMENT_LABEL}')])),
      ],
    }),
  ],
})

const billTo = [
  para([text('')]),
  para([text('Bill To:', { bold: true, size: 22 })]),
  para([text('{SCHOOL_NAME}', { bold: true })]),
  para([text('GSTIN: {SCHOOL_GSTIN}')]),
  para([text('{SCHOOL_ADDRESS}')]),
  para([text('')]),
  para([
    text('Programme: ', { bold: true }),
    text('{PROGRAMME} {PROGRAMME_SUB_TYPE}'),
  ]),
  para([text('')]),
]

const lineItemsTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 6, color: '475569' },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: '475569' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        cell(para([text('Description', { bold: true })]), { width: 50, shaded: true }),
        cell(para([text('Students', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 15, shaded: true }),
        cell(para([text('Rate', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 17, shaded: true }),
        cell(para([text('Amount', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 18, shaded: true }),
      ],
    }),
    // docxtemplater loop row: {#LINE_ITEMS} opens the loop, {/LINE_ITEMS}
    // closes it. The four cells repeat per line item.
    new TableRow({
      children: [
        cell(para([text('{#LINE_ITEMS}{description}')])),
        cell(para([text('{students}{/LINE_ITEMS}')], { alignment: AlignmentType.RIGHT })),
        cell(para([text('{rate}')], { alignment: AlignmentType.RIGHT })),
        cell(para([text('{amount}')], { alignment: AlignmentType.RIGHT })),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('Subtotal', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 82 }),
        cell(para([text('{SUBTOTAL}', { bold: true })], { alignment: AlignmentType.RIGHT })),
        cell(para([text('')])),
        cell(para([text('')])),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('GST (IGST 18%)', { bold: true })], { alignment: AlignmentType.RIGHT })),
        cell(para([text('{GST_AMOUNT}', { bold: true })], { alignment: AlignmentType.RIGHT })),
        cell(para([text('')])),
        cell(para([text('')])),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('Total', { bold: true, size: 24 })], { alignment: AlignmentType.RIGHT }), { shaded: true }),
        cell(para([text('{TOTAL}', { bold: true, size: 24 })], { alignment: AlignmentType.RIGHT }), { shaded: true }),
        cell(para([text('')])),
        cell(para([text('')])),
      ],
    }),
  ],
})

const footer = [
  para([text('')]),
  para([text('Payment Terms', { bold: true, size: 22 })]),
  para([text('{PAYMENT_TERMS}')]),
  para([text('')]),
  para([text('Bank Account Details', { bold: true, size: 22 })]),
  para([text('{ACCOUNT_DETAILS}')]),
  para([text('')]),
  para([text('')]),
  para([text('Authorised Signatory', { bold: true })]),
  para([text(`For ${'{GSL_LEGAL_ENTITY}'}`)]),
  para([text('')]),
  para([
    text(
      'Note (Phase 1): GST is applied as IGST 18%. Intra-state CGST + SGST split lands in Phase 1.1.',
      { size: 16, color: '64748B' },
    ),
  ]),
]

const doc = new Document({
  creator: 'GSL Ops Automation',
  title: 'Proforma Invoice Template',
  description: 'docxtemplater template for PI generation. Tokens use {TOKEN} delimiters.',
  sections: [
    {
      properties: {},
      children: [
        ...header,
        metaTable,
        ...billTo,
        lineItemsTable,
        ...footer,
      ],
    },
  ],
})

const outDir = path.join(process.cwd(), 'public', 'ops-templates')
const outPath = path.join(outDir, 'pi-template.docx')

await mkdir(outDir, { recursive: true })
const buffer = await Packer.toBuffer(doc)
await writeFile(outPath, buffer)
console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`)
