/*
 * GET /finance/payments/bulk/template (Gate 5A.6 Step 3).
 *
 * Serves the CSV template Finance downloads to populate bulk payment
 * rows. Columns kept minimal so Misba and Pranav can copy from the
 * bank statement without column reshuffling.
 */

import { NextResponse } from 'next/server'

const CSV = [
  'bank_ref,amount,date,bank_name,school_hint,notes',
  'UTR-HDFC001,412262.50,2026-05-01,HDFC Bank,Don Bosco Bandel,Q1 instalment',
  'UTR-AXIS002,250000,01/05/2026,Axis Bank,Greenfield Academy,Cheque 123456',
].join('\n')

export async function GET() {
  return new NextResponse(CSV, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="payment-bulk-template.csv"',
    },
  })
}
