/*
 * scripts/generate-dispatch-template.mjs
 *
 * Generates public/ops-templates/dispatch-template.docx with the
 * docxtemplater {TOKEN} placeholders declared in
 * src/lib/dispatch/templates.ts.
 *
 * W4-D.5 redesign: single template renders three shapes via
 * conditional sections.
 *
 *   (i)   Flat-only           hasFlatItems=true,  hasPerGradeItems=false
 *   (ii)  Per-grade-only      hasFlatItems=false, hasPerGradeItems=true
 *   (iii) Mixed (flat + per-grade)  both true; both sections render
 *
 * Conditional sections use docxtemplater's {#flag}...{/flag} block
 * markers placed on standalone paragraphs. Inside each section:
 *   - a section header paragraph
 *   - a kit-items table whose data row loops via
 *     {#flatItems}...{/flatItems} (or {#perGradeRows}...{/perGradeRows})
 *
 * Run: `node scripts/generate-dispatch-template.mjs`
 *
 * Iterate by editing this file and re-running. The .docx is committed
 * to source control alongside this script so the binary state and the
 * generator are always in sync.
 *
 * Delimiter: docxtemplater default (single curly braces). Loop and
 * section syntax: {#X}...{/X}.
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

// Conditional flat-items section: opens with {#hasFlatItems}, closes
// with {/hasFlatItems}. Inside: section header + kit-items table whose
// data row loops via {#flatItems}...{/flatItems}.
const flatItemsTable = new Table({
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
        cell(para([text('SKU', { bold: true })]), { width: 75, shaded: true }),
        cell(para([text('Quantity', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 25, shaded: true }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{#flatItems}{skuName}')])),
        cell(para([text('{quantity}{/flatItems}')], { alignment: AlignmentType.RIGHT })),
      ],
    }),
  ],
})

const flatSection = [
  para([text('{#hasFlatItems}')]),
  para([text('Flat-quantity items', { bold: true, size: 22 })]),
  flatItemsTable,
  para([text('')]),
  para([text('{/hasFlatItems}')]),
]

const perGradeItemsTable = new Table({
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
        cell(para([text('SKU', { bold: true })]), { width: 60, shaded: true }),
        cell(para([text('Grade', { bold: true })], { alignment: AlignmentType.CENTER }), { width: 15, shaded: true }),
        cell(para([text('Quantity', { bold: true })], { alignment: AlignmentType.RIGHT }), { width: 25, shaded: true }),
      ],
    }),
    new TableRow({
      children: [
        cell(para([text('{#perGradeRows}{skuName}')])),
        cell(para([text('{grade}')], { alignment: AlignmentType.CENTER })),
        cell(para([text('{quantity}{/perGradeRows}')], { alignment: AlignmentType.RIGHT })),
      ],
    }),
  ],
})

const perGradeSection = [
  para([text('{#hasPerGradeItems}')]),
  para([text('Per-grade allocations', { bold: true, size: 22 })]),
  perGradeItemsTable,
  para([text('')]),
  para([text('{/hasPerGradeItems}')]),
]

const totalsBlock = [
  para([
    text('Total kits: ', { bold: true }),
    text('{TOTAL_QUANTITY}', { bold: true }),
  ]),
  para([text('')]),
]

const footer = [
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
      'Note: intermediate states (Dispatched, In Transit) are deferred to Phase 1.1 when courier integration lands. Acknowledgement of receipt is captured via the delivery-ack flow.',
      { size: 16, color: '64748B' },
    ),
  ]),
]

const doc = new Document({
  creator: 'GSL Ops Automation',
  title: 'Dispatch Note Template',
  description: 'docxtemplater template for dispatch generation. Tokens use {TOKEN} delimiters; conditional sections use {#flag}...{/flag} for flat / per-grade rendering.',
  sections: [
    {
      properties: {},
      children: [
        ...header,
        metaTable,
        ...shipTo,
        ...flatSection,
        ...perGradeSection,
        ...totalsBlock,
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
