/*
 * W4-H.1 author handover-template.docx.
 *
 * One-shot generator. Run via `node scripts/w4h-author-handover-template.mjs`.
 * Produces a real .docx with docxtemplater {TOKEN} + {#loop}...{/loop}
 * placeholders matching the spec in src/lib/dispatch/handoverTemplates.ts.
 *
 * Layout mirrors ops-data/Regular_Kits_Handover_template.xlsx:
 *   Title row
 *   Header fields: SCHOOL NAME / BRANCH / TRAINERS ALLOCATED / MOU + DISPATCH meta
 *   Band labels: HANDED OVER BY TRAINER | HANDED OVER TO SCHOOL ... | COMMENTS IF ANY
 *   Detail table: 11 columns × 1 data row template (looped via {#detailRows})
 *   Footer: TOTAL_QUANTITY summary
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUT = path.resolve(__dirname, '..', 'public', 'ops-templates', 'handover-template.docx')

function p(text, opts = {}) {
  const align = opts.align ? `<w:pPr><w:jc w:val="${opts.align}"/></w:pPr>` : ''
  const bold = opts.bold ? '<w:rPr><w:b/></w:rPr>' : ''
  const sz = opts.sz ? `<w:rPr><w:sz w:val="${opts.sz}"/></w:rPr>` : ''
  const rPr = opts.bold && opts.sz ? `<w:rPr><w:b/><w:sz w:val="${opts.sz}"/></w:rPr>` : (bold || sz)
  return `<w:p>${align}<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function tcText(text, opts = {}) {
  const width = opts.width ? `<w:tcW w:w="${opts.width}" w:type="dxa"/>` : ''
  const shading = opts.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading}"/>` : ''
  const gridSpan = opts.gridSpan ? `<w:gridSpan w:val="${opts.gridSpan}"/>` : ''
  const tcPr = `<w:tcPr>${width}${gridSpan}${shading}</w:tcPr>`
  return `<w:tc>${tcPr}${p(text, opts)}</w:tc>`
}

function row(cells, opts = {}) {
  const trPr = opts.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
  return `<w:tr>${trPr}${cells.join('')}</w:tr>`
}

const tableProps = `
<w:tblPr>
  <w:tblW w:w="5000" w:type="pct"/>
  <w:tblBorders>
    <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
  </w:tblBorders>
  <w:tblLayout w:type="fixed"/>
</w:tblPr>
`

// 11 columns. Total grid width 14400 (landscape); per-column widths roughly:
//   SR(550) DATE(1200) TIME(800) GRADES(1100) PROJECTS(2400) TOTAL(900)
//   TR_NAME(1200) TR_SIGN(1200) PERSON_NAME(1400) DESIGNATION(1300) PERSON_SIGN(1350)
const COLS = [550, 1200, 800, 1100, 2400, 900, 1200, 1200, 1400, 1300, 1350]
const gridCols = COLS.map((w) => `<w:gridCol w:w="${w}"/>`).join('')
const tblGrid = `<w:tblGrid>${gridCols}</w:tblGrid>`

// Band-label row: 3 spans (cols 1-8, 9, 10-11). Approximate; matches the
// xlsx visual zoning (HANDED OVER BY TRAINER / HANDED OVER TO SCHOOL
// RESPONSIBLE PERSON / COMMENTS IF ANY).
const bandRow = row([
  tcText('HANDED OVER BY TRAINER', { bold: true, gridSpan: 8, align: 'center', shading: 'D9D9D9' }),
  tcText('HANDED OVER TO SCHOOL RESPONSIBLE PERSON', { bold: true, gridSpan: 2, align: 'center', shading: 'D9D9D9' }),
  tcText('COMMENTS IF ANY', { bold: true, gridSpan: 1, align: 'center', shading: 'D9D9D9' }),
])

const headerRow = row(
  [
    tcText('SR.', { bold: true, width: 550, align: 'center', shading: 'F2F2F2' }),
    tcText('DATE', { bold: true, width: 1200, align: 'center', shading: 'F2F2F2' }),
    tcText('TIME', { bold: true, width: 800, align: 'center', shading: 'F2F2F2' }),
    tcText('GRADES', { bold: true, width: 1100, align: 'center', shading: 'F2F2F2' }),
    tcText('NAME OF PROJECTS WITH No. OF KITS', { bold: true, width: 2400, align: 'center', shading: 'F2F2F2', sz: 18 }),
    tcText('TOTAL No. OF KITS', { bold: true, width: 900, align: 'center', shading: 'F2F2F2', sz: 18 }),
    tcText('TRAINER NAME', { bold: true, width: 1200, align: 'center', shading: 'F2F2F2' }),
    tcText('TRAINER SIGN', { bold: true, width: 1200, align: 'center', shading: 'F2F2F2' }),
    tcText('PERSON NAME', { bold: true, width: 1400, align: 'center', shading: 'F2F2F2' }),
    tcText('DESIGNATION', { bold: true, width: 1300, align: 'center', shading: 'F2F2F2' }),
    tcText('PERSON SIGNATURE', { bold: true, width: 1350, align: 'center', shading: 'F2F2F2', sz: 18 }),
  ],
  { header: true },
)

// One looped data row. docxtemplater paragraphLoop:true handles the
// {#detailRows}...{/detailRows} expansion when the loop tags are placed
// in their own paragraphs immediately before / after the row. In the
// docx we wrap the row content with a paragraph carrying the open tag
// before the row's first cell and the close tag after the row's last
// cell. The cleaner approach: place {#detailRows} and {/detailRows}
// inside dedicated cells of separate rows that the engine collapses,
// OR rely on the supported pattern of placing the loop tags in the
// first cell's paragraph (open) and last cell's paragraph (close).
//
// We use the supported pattern: {#detailRows} at the START of the SR
// cell text, {/detailRows} at the END of the PERSON SIGNATURE cell
// text. paragraphLoop:true makes docxtemplater duplicate the entire
// row per loop iteration.
const dataRow = row([
  tcText('{#detailRows}{sr}', { width: 550, align: 'center' }),
  tcText('{date}', { width: 1200, align: 'center' }),
  tcText('{time}', { width: 800, align: 'center' }),
  tcText('{grades}', { width: 1100, align: 'center' }),
  tcText('{projects}', { width: 2400 }),
  tcText('{totalKits}', { width: 900, align: 'center' }),
  tcText('{trainerName}', { width: 1200 }),
  tcText('{trainerSign}', { width: 1200 }),
  tcText('{personName}', { width: 1400 }),
  tcText('{designation}', { width: 1300 }),
  tcText('{personSignature}{/detailRows}', { width: 1350 }),
])

const tableXml = `<w:tbl>${tableProps}${tblGrid}${bandRow}${headerRow}${dataRow}</w:tbl>`

const sectionLandscape = `
<w:sectPr>
  <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
  <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/>
  <w:cols w:space="708"/>
  <w:docGrid w:linePitch="360"/>
</w:sectPr>
`

const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${p('KITS HANDOVER WORKSHEET', { align: 'center', bold: true, sz: 32 })}
${p('', {})}
${p('SCHOOL NAME: {SCHOOL_NAME}', { bold: true })}
${p('BRANCH: {BRANCH}', { bold: true })}
${p('TRAINERS ALLOCATED - NAMES: {TRAINER_NAMES}', { bold: true })}
${p('Dispatch {DISPATCH_NUMBER} dated {DISPATCH_DATE} | MOU {MOU_ID} | Programme: {PROGRAMME}', { sz: 20 })}
${p('', {})}
${tableXml}
${p('', {})}
${p('Total quantity across all rows: {TOTAL_QUANTITY}', { bold: true })}
${p('', {})}
${p('This worksheet is the school-facing handover record. Both signatures (TRAINER SIGN + PERSON SIGNATURE) are required for the handover to be considered complete.', { sz: 18 })}
${sectionLandscape}
</w:body>
</w:document>`

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

const zip = new PizZip()
zip.file('[Content_Types].xml', contentTypes)
zip.file('_rels/.rels', rels)
zip.file('word/_rels/document.xml.rels', docRels)
zip.file('word/document.xml', document)

const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, out)
console.log(`Wrote ${OUT} (${out.length} bytes)`)
