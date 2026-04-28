/*
 * generateHandoverWorksheet unit tests (W4-H.2).
 *
 * Builds an in-memory .docx fixture mirroring handover-template.docx
 * shape and asserts: detail-row flattening (flat / per-grade / mixed),
 * SR continuity across mixed shapes, TOTAL_QUANTITY accuracy, header
 * placeholders, template-missing path.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import {
  generateHandoverWorksheet,
  type DetailRow,
  type GenerateHandoverDeps,
} from './generateHandoverWorksheet'
import { HandoverTemplateMissingError } from './handoverTemplates'
import type { Dispatch, MOU, School } from '@/lib/types'

const FIXED_TS = '2026-04-29T10:00:00.000Z'

function buildFixtureDocx(): Uint8Array {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>HANDOVER {SCHOOL_NAME} | branch={BRANCH} | trainers={TRAINER_NAMES}</w:t></w:r></w:p>
<w:p><w:r><w:t>D={DISPATCH_NUMBER} dated {DISPATCH_DATE} MOU={MOU_ID} P={PROGRAMME}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#detailRows}ROW {sr}|{date}|{time}|{grades}|{projects}|{totalKits}|TR={trainerName}/{trainerSign}|PN={personName}/{designation}/{personSignature};{/detailRows}</w:t></w:r></w:p>
<w:p><w:r><w:t>TOTAL: {TOTAL_QUANTITY}</w:t></w:r></w:p>
</w:body>
</w:document>`)
  return zip.generate({ type: 'uint8array' })
}

let fixtureBytes: Uint8Array

beforeAll(() => {
  fixtureBytes = buildFixtureDocx()
})

function makeDeps(): GenerateHandoverDeps {
  return {
    loadTemplate: async () => fixtureBytes,
  }
}

function dispatch(overrides: Partial<Pick<Dispatch, 'id' | 'lineItems' | 'poRaisedAt'>> = {}) {
  return {
    id: 'DSP-MOU-X-i1',
    poRaisedAt: '2026-04-26T10:00:00.000Z',
    lineItems: [{ kind: 'flat' as const, skuName: 'STEAM kit set', quantity: 200 }],
    ...overrides,
  }
}

function mou(overrides: Partial<Pick<MOU, 'id' | 'programme' | 'programmeSubType'>> = {}) {
  return {
    id: 'MOU-X',
    programme: 'STEAM' as const,
    programmeSubType: null,
    ...overrides,
  }
}

function school(overrides: Partial<Pick<School, 'name' | 'legalEntity'>> = {}) {
  return {
    name: 'Test School',
    legalEntity: null,
    ...overrides,
  }
}

function readDocText(bytes: Uint8Array): string {
  const zip = new PizZip(bytes as unknown as Buffer)
  const xml = zip.files['word/document.xml']?.asText() ?? ''
  // Strip XML tags, collapse whitespace.
  return xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

describe('generateHandoverWorksheet', () => {
  it('flat shape: 1 line item -> 1 row; SR=1; TOTAL_QUANTITY matches', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch(),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rowCount).toBe(1)
    expect(result.totalQuantity).toBe(200)
    const text = readDocText(result.docxBytes)
    expect(text).toContain('HANDOVER Test School')
    expect(text).toContain('D=DSP-MOU-X-i1')
    expect(text).toContain('MOU=MOU-X')
    expect(text).toContain('P=STEAM')
    expect(text).toContain('ROW 1|26-Apr-2026||All grades|STEAM kit set|200|')
    expect(text).toContain('TOTAL: 200')
  })

  it('per-grade shape: 3 grade allocations -> 3 rows with continuous SR', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch({
          lineItems: [
            {
              kind: 'per-grade',
              skuName: 'Cretile Grade-band kit',
              gradeAllocations: [
                { grade: 5, quantity: 30 },
                { grade: 6, quantity: 25 },
                { grade: 7, quantity: 20 },
              ],
            },
          ],
        }),
        mou: mou({ programme: 'TinkRworks', programmeSubType: 'Cretile' }),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rowCount).toBe(3)
    expect(result.totalQuantity).toBe(75)
    const text = readDocText(result.docxBytes)
    expect(text).toContain('ROW 1|26-Apr-2026||Grade 5|Cretile Grade-band kit|30|')
    expect(text).toContain('ROW 2|26-Apr-2026||Grade 6|Cretile Grade-band kit|25|')
    expect(text).toContain('ROW 3|26-Apr-2026||Grade 7|Cretile Grade-band kit|20|')
    expect(text).toContain('P=TinkRworks / Cretile')
  })

  it('mixed shape: 1 flat + 2-grade per-grade -> 3 rows, SR continuous 1..3', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch({
          lineItems: [
            { kind: 'flat', skuName: 'Tinkrpython', quantity: 12 },
            {
              kind: 'per-grade',
              skuName: 'Cretile Grade-band kit',
              gradeAllocations: [
                { grade: 8, quantity: 5 },
                { grade: 9, quantity: 7 },
              ],
            },
          ],
        }),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rowCount).toBe(3)
    expect(result.totalQuantity).toBe(24)
    const text = readDocText(result.docxBytes)
    expect(text).toMatch(/ROW 1\|26-Apr-2026\|\|All grades\|Tinkrpython\|12\|/)
    expect(text).toMatch(/ROW 2\|26-Apr-2026\|\|Grade 8\|Cretile Grade-band kit\|5\|/)
    expect(text).toMatch(/ROW 3\|26-Apr-2026\|\|Grade 9\|Cretile Grade-band kit\|7\|/)
  })

  it('header placeholders: branch derived from legalEntity when distinct', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch(),
        mou: mou(),
        school: school({ name: 'BD Memorial', legalEntity: 'BD Memorial Bansdroni' }),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = readDocText(result.docxBytes)
    expect(text).toContain('branch=BD Memorial Bansdroni')
  })

  it('header placeholders: branch blank when legalEntity matches name', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch(),
        mou: mou(),
        school: school({ name: 'Sample', legalEntity: 'Sample' }),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = readDocText(result.docxBytes)
    expect(text).toContain('branch= |')
  })

  it('TRAINER_NAMES is blank in Phase 1 (D-038 Phase 1.1 trigger)', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch(),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = readDocText(result.docxBytes)
    expect(text).toContain('trainers=')
    expect(text).not.toMatch(/trainers=\S/)
  })

  it('uses dispatch.poRaisedAt when present (not fallback to now())', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch({ poRaisedAt: '2026-03-15T08:00:00.000Z' }),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = readDocText(result.docxBytes)
    expect(text).toContain('15-Mar-2026')
    expect(text).not.toContain('29-Apr-2026')
  })

  it('falls back to now() when poRaisedAt is null', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch({ poRaisedAt: null }),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      makeDeps(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const text = readDocText(result.docxBytes)
    expect(text).toContain('29-Apr-2026')
  })

  it('returns ok:false reason=template-missing when loader throws HandoverTemplateMissingError', async () => {
    const result = await generateHandoverWorksheet(
      {
        dispatch: dispatch(),
        mou: mou(),
        school: school(),
        now: () => new Date(FIXED_TS),
      },
      {
        loadTemplate: async () => {
          throw new HandoverTemplateMissingError('handover-v1', 'public/ops-templates/handover-template.docx')
        },
      },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('template-missing')
    expect(result.templateError.message).toContain('handover-template.docx')
  })

  it('shape of the DetailRow type stays stable for downstream callers', () => {
    const row: DetailRow = {
      sr: '1', date: '26-Apr-2026', time: '', grades: 'All grades',
      projects: 'X', totalKits: '10',
      trainerName: '', trainerSign: '',
      personName: '', designation: '', personSignature: '',
    }
    expect(Object.keys(row)).toHaveLength(11)
  })
})
