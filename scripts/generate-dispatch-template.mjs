/*
 * scripts/generate-dispatch-template.mjs
 *
 * Generates public/ops-templates/dispatch-template.docx with the
 * docxtemplater {TOKEN} placeholders declared in
 * src/lib/dispatch/templates.ts.
 *
 * Run: `node scripts/generate-dispatch-template.mjs`
 *
 * Layout follows standard Indian dispatch / consignment note
 * conventions: header (consignor / GSL), dispatch metadata, ship-to
 * (consignee / school), kit items table with docxtemplater loop,
 * notes block (pulls in P2 override reason when applicable),
 * authorisation block.
 *
 * Iterate by editing this file and re-running. The .docx is
 * committed to source control alongside this script so the binary
 * state and the generator are always in sync.
 *
 * Delimiter: docxtemplater default (single curly braces). Loop
 * syntax: {#KIT_ITEMS}...{/KIT_ITEMS}.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  AlignmentType,
  Document,
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
  })

const header = [
  para([text('{GSL_LEGAL_ENTITY}', { bold: true, size: 32 })]),
  para([text('GSTIN: {GSL_GSTIN}', { size: 20 })]),
  para([text('{GSL_ADDRESS}', { size: 20 })]),
  para([text('')]),
  para([text('DISPATCH NOTE', { bold: true, size: 28 })], {
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
        cell(para([text('Dispatch No.', { bold: true })]), { width: 25 }),
        cell(para([text('Date', { bold: true })]), { width: 25 }),
        cell(para([text('MOU Reference', { bold: true })]), { width: 25 }),
        cell(para([text('Instalment', { bold: true })]), { width: 25 }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{DISPATCH_NUMBER}')])),
        cell(para([text('{DISPATCH_DATE}')])),
        cell(para([text('{MOU_ID}')])),
        cell(para([text('{INSTALLMENT_LABEL}')])),
      ],
    }),
  ],
})

const shipTo = [
  para([text('')]),
  para([text('Ship To (Consignee):', { bold: true, size: 22 })]),
  para([text('{SCHOOL_NAME}', { bold: true })]),
  para([text('{SCHOOL_ADDRESS}')]),
  para([text('')]),
  para([
    text('Programme: ', { bold: true }),
    text('{PROGRAMME} {PROGRAMME_SUB_TYPE}'),
  ]),
  para([text('')]),
]

const kitItemsTable = new Table({
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
        cell(para([text('Description', { bold: true })]), { width: 60, shaded: true }),
        cell(para([text('Quantity', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 15, shaded: true }),
        cell(para([text('Grade Bands', { bold: true })]), { width: 25, shaded: true }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{#KIT_ITEMS}{description}')])),
        cell(para([text('{quantity}{/KIT_ITEMS}')], { alignment: AlignmentType.RIGHT })),
        cell(para([text('{grades}')])),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('Total Kits', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 60, shaded: true }),
        cell(para([text('{TOTAL_KITS}', { bold: true })], { alignment: AlignmentType.RIGHT }), { shaded: true }),
        cell(para([text('')]), { shaded: true }),
      ],
    }),
  ],
})

const footer = [
  para([text('')]),
  para([text('Notes', { bold: true, size: 22 })]),
  para([text('{NOTES}')]),
  para([text('')]),
  para([text('')]),
  para([text('Authorised By', { bold: true })]),
  para([text('{AUTHORISED_BY}')]),
  para([text(`For ${'{GSL_LEGAL_ENTITY}'}`)]),
  para([text('')]),
  para([text('')]),
  para([text('Received By (school representative): _______________________________')]),
  para([text('Date: _______________   Signature: _______________')]),
  para([text('')]),
  para([
    text(
      'Note (Phase 1): Intermediate states (Dispatched, In Transit) are deferred to Phase 1.1 when courier integration lands. Acknowledgement of receipt is captured via the delivery-ack flow.',
      { size: 16, color: '64748B' },
    ),
  ]),
]

const doc = new Document({
  creator: 'GSL Ops Automation',
  title: 'Dispatch Note Template',
  description: 'docxtemplater template for dispatch generation. Tokens use {TOKEN} delimiters.',
  sections: [
    {
      properties: {},
      children: [
        ...header,
        metaTable,
        ...shipTo,
        kitItemsTable,
        ...footer,
      ],
    },
  ],
})

const outDir = path.join(process.cwd(), 'public', 'ops-templates')
const outPath = path.join(outDir, 'dispatch-template.docx')
await mkdir(outDir, { recursive: true })
const buffer = await Packer.toBuffer(doc)
await writeFile(outPath, buffer)
console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`)
