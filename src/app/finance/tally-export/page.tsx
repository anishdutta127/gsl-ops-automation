/*
 * /finance/tally-export (Gate 2 Step 6).
 *
 * Tally Prime 6.2 voucher XML export. Operator selects a fiscal year
 * + entity (MH / UP / both) and clicks "Generate export"; the form
 * POSTs to /api/finance/tally-export which streams the XML payload
 * as an attachment.
 *
 * Empty FY (no PIs issued) returns an XML file with the ENVELOPE
 * header but no VOUCHER messages : the empty FY case is NOT an
 * error per Step 6 V5 edge case.
 *
 * Honest toast: "Export started. The file will download shortly.
 * Tally import: open Tally Prime 6.2 -> Gateway -> Voucher import."
 *
 * Permission gate: canAccessFinance.
 */

import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canAccessFinance } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import { TallyExportForm } from './TallyExportForm'

const ERROR_COPY: Record<string, string> = {
  permission: 'Tally export is restricted to Finance + Admin + Leadership.',
  'missing-fiscal-year': 'Pick a fiscal year before generating the export.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function TallyExportPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Ffinance%2Ftally-export')
  if (!canAccessFinance(user)) redirect('/?notice=finance-access-required')

  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const errorMessage = errorKey ? ERROR_COPY[errorKey] ?? `Failed: ${errorKey}` : null

  // Default to the current fiscal year. India FY runs April-March;
  // anything Jan-Mar still belongs to the previous April's FY.
  const now = new Date()
  const startYY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const endYY = startYY + 1
  const defaultFy = `${String(startYY).slice(-2)}-${String(endYY).slice(-2)}`

  return (
    <>
      <TopNav currentPath="/finance" />
      <main id="main-content">
        <PageHeader
          title="Tally export"
          subtitle="Generate Tally Prime 6.2 voucher XML for a fiscal year + entity selection."
          breadcrumb={[
            { label: 'Dashboard', href: '/' },
            { label: 'Finance', href: '/finance' },
            { label: 'Tally export' },
          ]}
        />
        <div className="mx-auto max-w-screen-md space-y-4 px-4 py-6">
          {errorMessage ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-signal-alert bg-signal-alert/10 p-3 text-sm text-signal-alert"
            >
              <Info aria-hidden className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>
          ) : null}

          <section className="rounded-md border border-border bg-card p-4 sm:p-6">
            <TallyExportForm defaultFiscalYear={defaultFy} />
          </section>

          <section className="rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
            <h2 className="mb-1 font-heading text-sm font-semibold text-brand-navy">
              How the import works
            </h2>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Pick the fiscal year + entity above and click Generate export.</li>
              <li>Save the XML file Tally downloads.</li>
              <li>Open Tally Prime 6.2 -&gt; Gateway -&gt; Voucher import.</li>
              <li>Browse to the saved XML file; Tally will read the vouchers and stage them for import.</li>
            </ol>
            <p className="mt-3">
              Empty fiscal years (no PIs issued yet) return an XML envelope with no vouchers : valid file, zero rows. This is expected for new FYs.
            </p>
          </section>
        </div>
      </main>
    </>
  )
}
