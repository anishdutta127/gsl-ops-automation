'use client'

/*
 * Tally export form (Gate 2 Step 6).
 *
 * Client component so we can show the honest toast after the submit
 * kicks off the download. The form posts to /api/finance/tally-export
 * which streams the XML as an attachment; we let the native form
 * action run (browser handles the download) and show a toast for the
 * "open Tally Prime 6.2 -> Gateway -> Voucher import" prompt.
 *
 * Honest toast (verbatim from the brief, do not edit):
 *   "Export started. The file will download shortly. Tally import:
 *    open Tally Prime 6.2 -> Gateway -> Voucher import."
 */

import { useState } from 'react'
import { Download } from 'lucide-react'
import { opsButtonClass } from '@/components/ops/OpsButton'

interface Props {
  defaultFiscalYear: string
}

const FY_OPTIONS = ['26-27', '25-26', '24-25', '23-24'] as const

export function TallyExportForm({ defaultFiscalYear }: Props) {
  const [toast, setToast] = useState<string | null>(null)

  function onSubmit() {
    setToast(
      'Export started. The file will download shortly. Tally import: open Tally Prime 6.2 -> Gateway -> Voucher import.',
    )
    // Toast stays visible long enough to be read; the form action
    // proceeds normally so the browser handles the .xml download.
    setTimeout(() => setToast(null), 10000)
  }

  const fyOptions = FY_OPTIONS.includes(defaultFiscalYear as (typeof FY_OPTIONS)[number])
    ? FY_OPTIONS
    : [defaultFiscalYear, ...FY_OPTIONS]

  return (
    <>
      {toast ? (
        <p
          role="status"
          data-testid="tally-export-toast"
          className="mb-4 rounded-md border border-signal-ok/40 bg-signal-ok/10 px-3 py-2 text-sm text-signal-ok"
        >
          {toast}
        </p>
      ) : null}

      <form
        method="POST"
        action="/api/finance/tally-export"
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-brand-navy">Fiscal year</span>
            <select
              name="fiscalYear"
              defaultValue={defaultFiscalYear}
              className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              aria-label="Fiscal year"
            >
              {fyOptions.map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Indian FY: April to March. Current FY is the default.
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-brand-navy">Entity</span>
            <select
              name="entity"
              defaultValue="both"
              className="mt-1 block w-full min-h-11 rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              aria-label="GST entity"
            >
              <option value="both">Both (MH + UP)</option>
              <option value="MH">MH (Maharashtra)</option>
              <option value="UP">UP (Uttar Pradesh)</option>
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Routing follows programme -&gt; entity per config/company.json.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <button
            type="submit"
            data-testid="tally-export-submit"
            className={opsButtonClass({ variant: 'primary', size: 'md' })}
          >
            <Download aria-hidden className="size-4" />
            Generate export
          </button>
        </div>
      </form>
    </>
  )
}
