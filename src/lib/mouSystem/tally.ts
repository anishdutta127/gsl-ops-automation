/*
 * Tally XML voucher generator.
 *
 * Produces a voucher XML file compatible with Tally Prime 6.2 Import.
 * Shubhangi imports this into Tally via Gateway > Import Data > Vouchers.
 *
 * Tally Prime 6.2 schema: https://help.tallysolutions.com/tally-prime/import-data/
 * Confirmed by Pranav (Phase 3 Step 3).
 *
 * ERP 9 schema differences are small (voucher type identifiers); this
 * module targets Prime by default.
 */

import { company } from './company'
import type { PiInvoice } from './pi'

function esc(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildTallyXml(pi: PiInvoice, options: { tallyVersion?: 'prime' | 'erp9' } = {}): string {
  const version = options.tallyVersion ?? 'prime'
  const date = pi.issueDate.replace(/-/g, '') // Tally wants YYYYMMDD
  const voucherType = 'Sales'
  const companyName = company.name

  const lines = pi.lineItems
    .map(
      (li) => `
        <ALLINVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${esc(li.description)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <RATE>${li.ratePerUnit.toFixed(2)}/Qty</RATE>
          <AMOUNT>${li.amount.toFixed(2)}</AMOUNT>
          <ACTUALQTY>${li.quantity} Qty</ACTUALQTY>
          <BILLEDQTY>${li.quantity} Qty</BILLEDQTY>
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${esc(`${pi.installment.mouId} Sales`)}</LEDGERNAME>
            <GSTCLASS/>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <LEDGERFROMITEM>No</LEDGERFROMITEM>
            <REMOVEZEROENTRIES>No</REMOVEZEROENTRIES>
            <ISPARTYLEDGER>No</ISPARTYLEDGER>
            <AMOUNT>${li.amount.toFixed(2)}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </ALLINVENTORYENTRIES.LIST>`,
    )
    .join('\n')

  const taxEntries: string[] = []
  if (pi.cgst > 0) taxEntries.push(ledgerEntry('CGST @ 9%', pi.cgst))
  if (pi.sgst > 0) taxEntries.push(ledgerEntry('SGST @ 9%', pi.sgst))
  if (pi.igst > 0) taxEntries.push(ledgerEntry('IGST @ 18%', pi.igst))

  const ledgers = taxEntries.join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${date}</DATE>
            <NARRATION>Proforma ${esc(pi.piNumber)} for ${esc(pi.installment.mouId)} ${esc(pi.installment.label)}</NARRATION>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
            <REFERENCE>${esc(pi.piNumber)}</REFERENCE>
            <PARTYLEDGERNAME>${esc(pi.school.name)}</PARTYLEDGERNAME>
            <PARTYNAME>${esc(pi.school.name)}</PARTYNAME>
            <BASICBASEPARTYNAME>${esc(pi.school.name)}</BASICBASEPARTYNAME>
            <VOUCHERNUMBER>${esc(pi.piNumber)}</VOUCHERNUMBER>
            <ISINVOICE>Yes</ISINVOICE>
            <CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
            <PARTYGSTIN>${esc(pi.school.gstNumber ?? '')}</PARTYGSTIN>
            <COMPANYGSTIN>${esc(pi.company.gstin)}</COMPANYGSTIN>
            <!-- Tally ${version === 'prime' ? 'Prime 6.2' : 'ERP 9'} import -->
            ${lines}
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(pi.school.name)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${pi.total.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${ledgers}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`
}

function ledgerEntry(name: string, amount: number): string {
  return `            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${esc(name)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>`
}
