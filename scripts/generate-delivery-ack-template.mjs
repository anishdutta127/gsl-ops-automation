/*
 * scripts/generate-delivery-ack-template.mjs
 *
 * Generates public/ops-templates/delivery-ack-template.docx with the
 * docxtemplater {TOKEN} placeholders declared in
 * src/lib/deliveryAck/templates.ts.
 *
 * Run: `node scripts/generate-delivery-ack-template.mjs`
 *
 * Layout follows the Regular_Kits_Handover_template.xlsx column
 * structure that Misba and Pradeep use today:
 *   - Title: KITS HANDOVER WORKSHEET
 *   - Header fields: SCHOOL NAME, BRANCH, TRAINERS ALLOCATED
 *   - Items table: SR / DATE / TIME / GRADES / NAME OF PROJECTS WITH
 *     No. OF KITS / TOTAL No. OF KITS
 *   - Signature block: HANDED OVER BY TRAINER (Trainer Name + Sign)
 *     and HANDED OVER TO SCHOOL RESPONSIBLE PERSON (Person Name +
 *     Designation + Signature)
 *   - Comments / footer
 *
 * Iterate by editing this file and re-running. The .docx is committed
 * to source control alongside this script.
 *
 * Delimiter: docxtemplater default (single curly braces). Loop syntax:
 * {#KIT_ITEMS}...{/KIT_ITEMS}.
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
  para([text('KITS HANDOVER WORKSHEET', { bold: true, size: 28 })], {
    alignment: AlignmentType.CENTER,
  }),
  para([text('')]),
  para([text('{GSL_LEGAL_ENTITY}', { bold: true, size: 22 })]),
  para([text('GSTIN: {GSL_GSTIN}', { size: 18 })]),
  para([text('{GSL_ADDRESS}', { size: 18 })]),
  para([text('')]),
]

const headerTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  },
  rows: [
    new TableRow({
      children: [
        cell(para([text('SCHOOL NAME:', { bold: true })]), { width: 25, shaded: true }),
        cell(para([text('{SCHOOL_NAME}')]), { width: 25 }),
        cell(para([text('BRANCH:', { bold: true })]), { width: 20, shaded: true }),
        cell(para([text('{BRANCH}')]), { width: 30 }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('TRAINER MODEL:', { bold: true })]), { shaded: true }),
        cell(para([text('{TRAINER_MODE}')])),
        cell(para([text('PROGRAMME:', { bold: true })]), { shaded: true }),
        cell(para([text('{PROGRAMME} {PROGRAMME_SUB_TYPE}')])),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('DISPATCH NO.:', { bold: true })]), { shaded: true }),
        cell(para([text('{DISPATCH_NUMBER}')])),
        cell(para([text('INSTALMENT:', { bold: true })]), { shaded: true }),
        cell(para([text('{INSTALLMENT_LABEL}')])),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('DATE:', { bold: true })]), { shaded: true }),
        cell(para([text('{ACK_DATE}')])),
        cell(para([text('TRAINERS ALLOCATED:', { bold: true })]), { shaded: true }),
        cell(para([text('________________________________')])),
      ],
    }),
  ],
})

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
        cell(para([text('SR.', { bold: true })]), { width: 8, shaded: true }),
        cell(para([text('GRADES', { bold: true })]), { width: 22, shaded: true }),
        cell(para([text('NAME OF PROJECTS WITH No. OF KITS', { bold: true })]), { width: 50, shaded: true }),
        cell(para([text('TOTAL No. OF KITS', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 20, shaded: true }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{#KIT_ITEMS}{sr}')])),
        cell(para([text('{grades}')])),
        cell(para([text('{projects}')])),
        cell(para([text('{totalKits}{/KIT_ITEMS}')], { alignment: AlignmentType.RIGHT })),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('Total', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 80, shaded: true }),
        cell(para([text('')], { alignment: AlignmentType.RIGHT })),
        cell(para([text('')])),
        cell(para([text('{TOTAL_KITS}', { bold: true })], { alignment: AlignmentType.RIGHT }), { shaded: true }),
      ],
    }),
  ],
})

const signatureTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        cell(para([text('HANDED OVER BY TRAINER', { bold: true })], { alignment: AlignmentType.CENTER }), { width: 50, shaded: true }),
        cell(para([text('HANDED OVER TO SCHOOL RESPONSIBLE PERSON', { bold: true })], { alignment: AlignmentType.CENTER }), { width: 50, shaded: true }),
      ],
    }),
    new TableRow({
      children: [
        cell([
          para([text('Trainer Name: _______________________')]),
          para([text('')]),
          para([text('Trainer Sign: _______________________')]),
          para([text('')]),
        ]),
        cell([
          para([text('Person Name: _______________________')]),
          para([text('')]),
          para([text('Designation: _______________________')]),
          para([text('')]),
          para([text('Person Signature: ____________________')]),
        ]),
      ],
    }),
  ],
})

const footer = [
  para([text('')]),
  para([text('COMMENTS:', { bold: true })]),
  para([text('___________________________________________________________________________')]),
  para([text('___________________________________________________________________________')]),
  para([text('')]),
  para([
    text(
      'Operator: print this form, take it to the school, get it stamped + signed by the responsible person, scan or photograph it, upload to GSL Drive (or equivalent), then paste the resulting URL into the Record signed form field on the delivery-ack page.',
      { size: 16, color: '64748B' },
    ),
  ]),
]

const doc = new Document({
  creator: 'GSL Ops Automation',
  title: 'Delivery Acknowledgement Template',
  description: 'docxtemplater template for delivery acknowledgement (kit handover worksheet). Tokens use {TOKEN} delimiters.',
  sections: [
    {
      properties: {},
      children: [
        ...header,
        headerTable,
        para([text('')]),
        kitItemsTable,
        para([text('')]),
        signatureTable,
        ...footer,
      ],
    },
  ],
})

const outDir = path.join(process.cwd(), 'public', 'ops-templates')
const outPath = path.join(outDir, 'delivery-ack-template.docx')
await mkdir(outDir, { recursive: true })
const buffer = await Packer.toBuffer(doc)
await writeFile(outPath, buffer)
console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`)
