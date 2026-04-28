/*
 * W4-H.2 generateHandoverWorksheet.
 *
 * Pure render function. Takes Dispatch + MOU + School + a `now` clock,
 * synthesises the detailRows[] from the discriminated lineItems union,
 * and renders the school-facing handover worksheet .docx.
 *
 * Discriminated-union flattening (matches the W4-D.5 pattern):
 *   - kind='flat'      -> 1 row with the SKU + quantity, GRADES = 'All grades'
 *   - kind='per-grade' -> N rows (one per gradeAllocation), GRADES = 'Grade {n}'
 * SR counter is continuous 1..N across the flattened sequence so mixed
 * dispatches read naturally on the printed page.
 *
 * Phase 1 fields shipped blank (the trainer fills by hand on-site):
 *   - time             (hand-written when the handover happens)
 *   - trainerName      (D-038 Phase 1.1 trainer-roster lib)
 *   - trainerSign      (paper signature)
 *   - personName       (school SPOC fills in)
 *   - designation      (school SPOC fills in)
 *   - personSignature  (paper signature)
 *
 * Failure modes:
 *   - template-missing  the handover-template.docx file does not exist
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import type {
  Dispatch,
  DispatchLineItem,
  MOU,
  School,
} from '@/lib/types'
import { formatDate } from '@/lib/format'
import {
  HANDOVER_TEMPLATE,
  HandoverTemplateMissingError,
} from './handoverTemplates'

export interface GenerateHandoverArgs {
  dispatch: Pick<Dispatch, 'id' | 'lineItems' | 'poRaisedAt'>
  mou: Pick<MOU, 'id' | 'programme' | 'programmeSubType'>
  school: Pick<School, 'name' | 'legalEntity'>
  now: () => Date
}

export interface GenerateHandoverDeps {
  loadTemplate: (templatePath: string) => Promise<Uint8Array>
}

const defaultLoadTemplate = async (templatePath: string): Promise<Uint8Array> => {
  const fullPath = path.join(process.cwd(), templatePath)
  try {
    return await readFile(fullPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new HandoverTemplateMissingError(HANDOVER_TEMPLATE.id, HANDOVER_TEMPLATE.file)
    }
    throw err
  }
}

const defaultDeps: GenerateHandoverDeps = {
  loadTemplate: defaultLoadTemplate,
}

export type GenerateHandoverResult =
  | { ok: true; docxBytes: Uint8Array; totalQuantity: number; rowCount: number }
  | { ok: false; reason: 'template-missing'; templateError: HandoverTemplateMissingError }

export interface DetailRow {
  sr: string
  date: string
  time: string
  grades: string
  projects: string
  totalKits: string
  trainerName: string
  trainerSign: string
  personName: string
  designation: string
  personSignature: string
}

function flattenLineItems(
  lineItems: DispatchLineItem[],
  dateStr: string,
): { rows: DetailRow[]; totalQuantity: number } {
  const rows: DetailRow[] = []
  let total = 0
  let sr = 0
  for (const li of lineItems) {
    if (li.kind === 'flat') {
      sr += 1
      rows.push({
        sr: String(sr),
        date: dateStr,
        time: '',
        grades: 'All grades',
        projects: li.skuName,
        totalKits: String(li.quantity),
        trainerName: '',
        trainerSign: '',
        personName: '',
        designation: '',
        personSignature: '',
      })
      total += li.quantity
    } else {
      for (const a of li.gradeAllocations) {
        sr += 1
        rows.push({
          sr: String(sr),
          date: dateStr,
          time: '',
          grades: `Grade ${a.grade}`,
          projects: li.skuName,
          totalKits: String(a.quantity),
          trainerName: '',
          trainerSign: '',
          personName: '',
          designation: '',
          personSignature: '',
        })
        total += a.quantity
      }
    }
  }
  return { rows, totalQuantity: total }
}

function branchOf(school: Pick<School, 'name' | 'legalEntity'>): string {
  if (!school.legalEntity) return ''
  if (school.legalEntity === school.name) return ''
  return school.legalEntity
}

export async function generateHandoverWorksheet(
  args: GenerateHandoverArgs,
  deps: GenerateHandoverDeps = defaultDeps,
): Promise<GenerateHandoverResult> {
  const ts = args.now().toISOString()
  // Prefer Dispatch.poRaisedAt for the printed date (matches the moment
  // the dispatch was actually raised); fall back to `now` if absent.
  const dateForRow = args.dispatch.poRaisedAt
    ? formatDate(args.dispatch.poRaisedAt)
    : formatDate(ts)

  const { rows, totalQuantity } = flattenLineItems(args.dispatch.lineItems, dateForRow)

  const subtype = args.mou.programmeSubType ? ` / ${args.mou.programmeSubType}` : ''
  const bag: Record<string, unknown> = {
    SCHOOL_NAME: args.school.name,
    BRANCH: branchOf(args.school),
    TRAINER_NAMES: '',
    DISPATCH_NUMBER: args.dispatch.id,
    DISPATCH_DATE: dateForRow,
    MOU_ID: args.mou.id,
    PROGRAMME: `${args.mou.programme}${subtype}`,
    detailRows: rows,
    TOTAL_QUANTITY: String(totalQuantity),
  }

  let templateBytes: Uint8Array
  try {
    templateBytes = await deps.loadTemplate(HANDOVER_TEMPLATE.file)
  } catch (err) {
    if (err instanceof HandoverTemplateMissingError) {
      return { ok: false, reason: 'template-missing', templateError: err }
    }
    throw err
  }

  const zip = new PizZip(templateBytes)
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
  doc.render(bag)
  const out = doc.getZip().generate({ type: 'uint8array' })
  return {
    ok: true,
    docxBytes: out as unknown as Uint8Array,
    totalQuantity,
    rowCount: rows.length,
  }
}
