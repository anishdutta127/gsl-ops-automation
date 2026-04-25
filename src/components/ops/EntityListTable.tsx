/*
 * EntityListTable.
 *
 * Generic typed table for /mous, /schools, /escalations list pages.
 * Each row is a Link wrapping the row content (entire row clickable
 * for navigation). No client-side sort or pagination in Phase 1
 * (deferred to Phase 1.1 per pre-C scoping).
 *
 * Touch target: row min height 56px desktop / 64px mobile to clear
 * the 44px WCAG floor.
 *
 * Empty state is composed by the caller via the `empty` prop so
 * callers control the icon + copy + optional CTA.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface ColumnDef<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
  widthClass?: string
}

interface EntityListTableProps<T> {
  rows: T[]
  columns: ColumnDef<T>[]
  rowHref?: (row: T) => string
  rowKey: (row: T) => string
  caption?: string
  empty?: ReactNode
}

export function EntityListTable<T>({
  rows,
  columns,
  rowHref,
  rowKey,
  caption,
  empty,
}: EntityListTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-muted/30">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={
                  'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground ' +
                  (c.align === 'right' ? 'text-right' : 'text-left') +
                  (c.widthClass ? ' ' + c.widthClass : '')
                }
              >
                {c.header}
              </th>
            ))}
            {rowHref ? <th scope="col" className="w-8 px-3 py-2"><span className="sr-only">Open</span></th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const href = rowHref ? rowHref(row) : undefined
            const key = rowKey(row)
            const cells = (
              <>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={
                      'px-3 py-3 text-sm text-foreground ' +
                      (c.align === 'right' ? 'text-right' : 'text-left')
                    }
                  >
                    {c.render(row)}
                  </td>
                ))}
                {rowHref ? (
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    <ChevronRight aria-hidden className="inline size-4" />
                  </td>
                ) : null}
              </>
            )
            if (href) {
              return (
                <tr key={key} className="hover:bg-muted/40 focus-within:bg-muted/40">
                  <th scope="row" className="sr-only">{key}</th>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        'px-3 py-3 text-sm text-foreground ' +
                        (c.align === 'right' ? 'text-right' : 'text-left')
                      }
                    >
                      <Link
                        href={href}
                        className="block min-h-11 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        {c.render(row)}
                      </Link>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right text-muted-foreground">
                    <Link
                      href={href}
                      aria-label={`Open ${key}`}
                      className="inline-flex min-h-11 items-center focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </td>
                </tr>
              )
            }
            return (
              <tr key={key} className="hover:bg-muted/40">
                {cells}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
