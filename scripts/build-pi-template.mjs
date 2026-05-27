// Build the PI template .docx matching the Laxmipat Singhania reference PDF.
// Run: node scripts/build-pi-template.mjs
// Output: public/ops-templates/pi-template.docx
import PizZip from 'pizzip'
import { writeFileSync } from 'fs'

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>

<!-- HEADER: Company block -->
<w:p><w:pPr><w:jc w:val="left"/><w:pStyle w:val="Heading1"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>{GSL_LEGAL_ENTITY}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{GSL_ADDRESS}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>GSTIN: {GSL_GSTIN} · PAN: {COMPANY_PAN}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{COMPANY_EMAIL}</w:t></w:r></w:p>

<!-- TITLE -->
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>PROFORMA INVOICE</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>No: {PI_NUMBER}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Date: {PI_DATE}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>FY: {FISCAL_YEAR}</w:t></w:r></w:p>

<!-- BILLED TO -->
<w:p><w:r><w:rPr><w:caps/><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t>BILLED TO</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>{SCHOOL_NAME}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{SCHOOL_CITY_STATE}</w:t></w:r></w:p>

<!-- REFERENCE -->
<w:p><w:r><w:rPr><w:caps/><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t>REFERENCE</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>MOU: {MOU_ID}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Instalment: {INSTALMENT_OF_TOTAL}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Due: {INSTALMENT_DUE_DATE}</w:t></w:r></w:p>

<!-- LINE ITEMS TABLE -->
<w:tbl>
<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="CCCCCC"/>
<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/>
<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/>
</w:tblBorders></w:tblPr>
<w:tr>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Description</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>HSN</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Qty</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Rate</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>Amount</w:t></w:r></w:p></w:tc>
</w:tr>
{#LINE_ITEMS}
<w:tr>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{description}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{hsn}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{students}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{rate}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>{amount}</w:t></w:r></w:p></w:tc>
</w:tr>
{/LINE_ITEMS}
</w:tbl>

<!-- TOTALS -->
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Sub total</w:t></w:r>
<w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">    {SUBTOTAL}</w:t></w:r></w:p>

<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Add: GST</w:t></w:r>
<w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">    {GST_AMOUNT}</w:t></w:r></w:p>

<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Total</w:t></w:r>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">    {TOTAL}</w:t></w:r></w:p>

<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Balance due Previous Instalments / (Excess Received)</w:t></w:r>
<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">    {BALANCE_DUE_PREVIOUS_INSTALMENTS}</w:t></w:r></w:p>

<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Net Payment Due</w:t></w:r>
<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">    {NET_PAYMENT_DUE}</w:t></w:r></w:p>

<!-- AMOUNT IN WORDS -->
<w:p><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>{AMOUNT_IN_WORDS}</w:t></w:r></w:p>

<!-- TERMS -->
<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/></w:pBdr></w:pPr>
<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>Terms: {PAYMENT_TERMS}</w:t></w:r>
<w:r><w:br/></w:r>
<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{PROFORMA_DISCLAIMER}</w:t></w:r></w:p>

<!-- ALL PIs TABLE -->
<w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>All PIs for {MOU_ID}</w:t></w:r></w:p>
<w:tbl>
<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="CCCCCC"/>
<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/>
<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/>
</w:tblBorders></w:tblPr>
<w:tr>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>PI No</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Instalment</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Original</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Paid</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Due</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Due date</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>Status</w:t></w:r></w:p></w:tc>
</w:tr>
{#INSTALMENT_SUMMARY}
<w:tr>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{seq}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{label}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{amount}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{amount}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>Rs 0</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{dueDate}</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>{status}</w:t></w:r></w:p></w:tc>
</w:tr>
{/INSTALMENT_SUMMARY}
</w:tbl>

<!-- FOOTER -->
<w:p><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t>For queries, write to {COMPANY_EMAIL}</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="right"/></w:pPr>
<w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>Authorised signatory, {GSL_LEGAL_ENTITY}</w:t></w:r></w:p>

</w:body>
</w:document>`

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
zip.file('word/document.xml', documentXml)

const out = zip.generate({ type: 'nodebuffer' })
writeFileSync('public/ops-templates/pi-template.docx', out)
console.log('Written public/ops-templates/pi-template.docx (' + out.length + ' bytes)')
