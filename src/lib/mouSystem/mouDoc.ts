/*
 * Phase 3 MOU body generator.
 *
 * Produces a .docx Buffer with the GSL + AMG logo header on every page,
 * the simplified Phase 3 main body (Effective Date, School Name,
 * Duration), the 13-field Standard Billing Section, the multi-year
 * Payment Schedule tables, and a free-text Annexure block. Built with
 * the `docx` library so we can embed an image at run time without
 * needing a docxtemplater image module.
 *
 * Pranav simplified the body in his Phase 3 feedback: every commercial
 * detail moves to Annexure A. The body itself is short and stable, so
 * generating it from scratch (rather than templating an existing .docx)
 * is the cleanest path.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import {
  company,
  getEntity,
  getEntityForProgramme,
  type EntityKey,
} from './company'
import type {
  MouBillingBlock,
  Programme,
  YearPaymentSchedule,
} from './types'

const LOGO_PATH = path.join(process.cwd(), 'public', 'branding', 'gsl_amg_logo.png')

export interface MouDocInputs {
  mouId: string
  programme: Programme
  templateDisplayName: string
  effectiveDate: string                        // YYYY-MM-DD
  schoolName: string
  startDate: string
  endDate: string
  numberOfYears: number
  durationLabel: string                        // "1st April 2026 to 31st March 2028"
  salesChannel: string
  trainerModelLabel: string                    // "Train the Trainer (TTT)"
  paymentSchedules: YearPaymentSchedule[]
  billingBlock: MouBillingBlock
  annexureLines: string[]                      // raw text lines, one paragraph each
  entityKey?: EntityKey
}

function formatDateLong(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getDate()).padStart(2, '0')
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function p(text: string, opts: { bold?: boolean; size?: number; spacing?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: opts.spacing ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 22,
      }),
    ],
  })
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26 })],
  })
}

function subheading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24 })],
  })
}

function cellText(
  text: string,
  opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold ?? false, size: opts.size ?? 20 })],
      }),
    ],
  })
}

function billingTable(b: MouBillingBlock): Table {
  const rows: [string, string][] = [
    ['Billing Name (for invoice)', b.billingName],
    ['Billing Address with Pin Code', b.billingAddress],
    ['City & State (billing)', b.billingCityState],
    ['School Name (Ship To)', b.shipToName],
    ['School Address with Pin Code (Ship To)', b.shipToAddress],
    ['City & State (ship to)', b.shipToCityState],
    ['School Email Id', b.schoolEmail],
    ['Contact Person Name', b.contactPersonName],
    ['Designation', b.designation],
    ['Mobile No', b.mobileNo],
    ['Email Id', b.contactEmail],
    ['School Contact No', b.schoolContactNo],
    ['PAN No', b.pan],
    ['GST No', b.gst],
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            cellText(label, { bold: true }),
            cellText(value || ':'),
          ],
        }),
    ),
  })
}

function scheduleTable(year: YearPaymentSchedule): Table {
  const totalPct = year.instalments.reduce((s, x) => s + x.pctDue, 0)
  const headerRow = new TableRow({
    children: [
      cellText('Month', { bold: true }),
      cellText('% Due', { bold: true, align: AlignmentType.RIGHT }),
    ],
  })
  const rows = year.instalments.map(
    (i) =>
      new TableRow({
        children: [
          cellText(i.month),
          cellText(`${i.pctDue}%`, { align: AlignmentType.RIGHT }),
        ],
      }),
  )
  const totalRow = new TableRow({
    children: [
      cellText('Total', { bold: true }),
      cellText(`${totalPct}%`, { bold: true, align: AlignmentType.RIGHT }),
    ],
  })
  return new Table({
    width: { size: 80, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows, totalRow],
  })
}

async function readLogoBytes(): Promise<Buffer | null> {
  try {
    return await fs.readFile(LOGO_PATH)
  } catch {
    return null
  }
}

/**
 * Render the MOU as a .docx Buffer. Always returns even when the logo
 * file is missing; in that case the header carries text only.
 */
export async function renderMouDoc(inputs: MouDocInputs): Promise<Buffer> {
  const logo = await readLogoBytes()
  const entityKey = inputs.entityKey ?? getEntityForProgramme(inputs.programme)
  const entity = getEntity(entityKey)

  const headerChildren: Paragraph[] = []
  if (logo) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: logo,
            transformation: { width: 360, height: 80 },
            type: 'png',
          }),
        ],
      }),
    )
  }
  headerChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${company.name} · GSTIN ${entity.gstin}`,
          size: 18,
          color: '073393',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: entity.address, size: 16, color: '6F7480' }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: '' })] }),
  )

  const header = new Header({ children: headerChildren })

  const bodyChildren: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'Memorandum of Understanding', bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `${inputs.templateDisplayName} · ${inputs.mouId}`, size: 20, color: '6F7480' }),
      ],
    }),
    p(`Effective Date: ${formatDateLong(inputs.effectiveDate)}`, { bold: true }),
    p(`School Name: ${inputs.schoolName}`, { bold: true }),
    p(`Duration: ${inputs.durationLabel} (${inputs.numberOfYears} ${inputs.numberOfYears === 1 ? 'year' : 'years'})`),
    p(`Sales Channel: ${inputs.salesChannel}`),
    p(`Trainer Model: ${inputs.trainerModelLabel}`),
  ]

  bodyChildren.push(heading('Payment Schedule'))
  for (const yr of inputs.paymentSchedules) {
    bodyChildren.push(subheading(`Year ${yr.year}`))
    bodyChildren.push(scheduleTable(yr))
    bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  }

  bodyChildren.push(heading('Standard Billing Section'))
  bodyChildren.push(billingTable(inputs.billingBlock))

  bodyChildren.push(heading('Annexure A : Commercial Terms'))
  if (inputs.annexureLines.length === 0) {
    bodyChildren.push(p('(Annexure to be filled in by sales / accounts team.)'))
  } else {
    for (const line of inputs.annexureLines) {
      bodyChildren.push(p(line))
    }
  }

  const doc = new Document({
    creator: company.name,
    title: `MOU ${inputs.mouId}`,
    description: `Generated MOU draft for ${inputs.schoolName}`,
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        headers: { default: header },
        children: bodyChildren,
      },
    ],
  })

  const blob = await Packer.toBuffer(doc)
  return blob
}

export function buildDurationLabel(start: string, end: string): string {
  if (!start || !end) return ''
  return `${formatDateLong(start)} to ${formatDateLong(end)}`
}

export function computeNumberOfYears(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  const diffMs = e.getTime() - s.getTime()
  if (diffMs <= 0) return 0
  const years = diffMs / (365.25 * 86400000)
  return Math.max(1, Math.ceil(years))
}
