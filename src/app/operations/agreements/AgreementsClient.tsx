'use client'

/*
 * Agreements list client. Filter by type, surface renewal warnings
 * above the table. Mirrors gsl-mou-system/src/app/agreements/
 * AgreementsView.tsx column shape verbatim.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Agreement, AgreementType } from '@/lib/types'
import { formatDate } from '@/lib/format'

type Filter = 'All' | AgreementType

function daysToExpiry(endDate: string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate).getTime()
  return Math.round((end - Date.now()) / 86400000)
}

function expiryLabel(days: number | null): string {
  if (days === null) return 'No end date'
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  if (days === 0) return 'Expires today'
  return `Expires in ${days}d`
}

function expiryTone(
  days: number | null,
): 'danger' | 'warning' | 'neutral' | 'success' {
  if (days === null) return 'neutral'
  if (days < 0) return 'danger'
  if (days <= 30) return 'danger'
  if (days <= 90) return 'warning'
  return 'success'
}

export function AgreementsClient({ agreements }: { agreements: Agreement[] }) {
  const [filter, setFilter] = useState<Filter>('All')

  const filtered = useMemo(() => {
    return agreements
      .filter((a) => (filter === 'All' ? true : a.type === filter))
      .slice()
      .sort((a, b) => {
        const da = daysToExpiry(a.endDate) ?? 99999
        const db = daysToExpiry(b.endDate) ?? 99999
        return da - db
      })
  }, [agreements, filter])

  const stats = useMemo(() => {
    const expiring60 = agreements.filter((a) => {
      const d = daysToExpiry(a.endDate)
      return d !== null && d >= 0 && d <= 60
    })
    const expired = agreements.filter((a) => {
      const d = daysToExpiry(a.endDate)
      return d !== null && d < 0
    })
    return {
      total: agreements.length,
      expiring60: expiring60.length,
      expired: expired.length,
    }
  }, [agreements])

  return (
    <>
      {stats.expiring60 > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            {stats.expiring60} agreement{stats.expiring60 === 1 ? '' : 's'} expir
            {stats.expiring60 === 1 ? 'es' : 'e'} in the next 60 days
          </p>
          <p className="mt-0.5 text-xs">
            Sort below shows the most urgent first.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4 text-sm text-muted-foreground">
          <span>
            <strong className="tabular-nums text-foreground">{stats.total}</strong> total
          </span>
          <span className={stats.expiring60 > 0 ? 'text-amber-700' : ''}>
            <strong className="tabular-nums">{stats.expiring60}</strong> expiring in 60 days
          </span>
          <span className={stats.expired > 0 ? 'text-red-700' : ''}>
            <strong className="tabular-nums">{stats.expired}</strong> expired
          </span>
        </div>
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(['All', 'Vendor', 'NDA'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                'min-h-8 rounded px-2.5 py-1 text-xs ' +
                (filter === f
                  ? 'bg-brand-navy text-white'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Party</th>
              <th className="px-3 py-2 font-medium">Nature</th>
              <th className="px-3 py-2 font-medium">Key terms</th>
              <th className="px-3 py-2 font-medium">Start</th>
              <th className="px-3 py-2 font-medium">End</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.map((a) => {
              const days = daysToExpiry(a.endDate)
              const tone = expiryTone(days)
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        'inline-flex items-center rounded-full px-2 py-0.5 font-medium ' +
                        (a.type === 'NDA'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-brand-teal/20 text-brand-navy')
                      }
                    >
                      {a.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    <span className="block">{a.partyName}</span>
                    {a.vendorLocation ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {a.vendorLocation}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {a.natureOfAgreement}
                    {a.product ? (
                      <span className="block text-[11px] text-muted-foreground">
                        Product: {a.product}
                      </span>
                    ) : null}
                    {a.department ? (
                      <span className="block text-[11px] text-muted-foreground">
                        Dept: {a.department}
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-xs text-muted-foreground">
                    {a.keyTerms ? (
                      <span title={a.keyTerms} className="block truncate">
                        {a.keyTerms.length > 80
                          ? a.keyTerms.slice(0, 79) + '...'
                          : a.keyTerms}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">/</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDate(a.startDate)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {a.endDate ? formatDate(a.endDate) : '/'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span
                      className={
                        'inline-flex items-center rounded-full px-2 py-0.5 font-medium ' +
                        (tone === 'danger'
                          ? 'bg-red-100 text-red-700'
                          : tone === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : tone === 'success'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600')
                      }
                    >
                      {expiryLabel(days)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/operations/agreements/${a.id}`}
                      className="inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
