/*
 * CommunicationsHistoryPanel (W4-I.5 P3C5).
 *
 * Renders on the MOU detail page. Filters the MOU's auditLog for
 * 'communication-sent' entries and displays them chronologically
 * (newest first) with template name, recipient, subject, and time.
 *
 * Anish greenlit shipping this as a dedicated tab/section on the MOU
 * detail per the recon report. The implementation keeps it as a
 * section (not a tab strip) because the audit log already lives on
 * the same page; a sub-tab would split related context across
 * navigation. The section is silent when no communications exist yet.
 */

import type { AuditEntry, MOU } from '@/lib/types'
import { formatDate } from '@/lib/format'

export interface CommunicationsHistoryPanelProps {
  mou: MOU
}

interface CommunicationEntry {
  timestamp: string
  user: string
  templateName: string
  useCase: string
  recipient: string
  subject: string
  filledVariables: string[]
}

function extractCommEntries(auditLog: AuditEntry[]): CommunicationEntry[] {
  const out: CommunicationEntry[] = []
  for (const entry of auditLog) {
    if (entry.action !== 'communication-sent') continue
    const after = (entry.after ?? {}) as Record<string, unknown>
    out.push({
      timestamp: entry.timestamp,
      user: entry.user,
      templateName: typeof after.templateName === 'string' ? after.templateName : '(unknown template)',
      useCase: typeof after.useCase === 'string' ? after.useCase : 'custom',
      recipient: typeof after.recipient === 'string' ? after.recipient : '',
      subject: typeof after.subject === 'string' ? after.subject : '',
      filledVariables: Array.isArray(after.filledVariables)
        ? after.filledVariables.filter((v): v is string => typeof v === 'string')
        : [],
    })
  }
  // Newest first.
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0))
}

export function CommunicationsHistoryPanel({ mou }: CommunicationsHistoryPanelProps) {
  const entries = extractCommEntries(mou.auditLog)
  if (entries.length === 0) return null
  return (
    <section
      aria-labelledby="communications-heading"
      data-testid="communications-history-panel"
      className="rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h3
          id="communications-heading"
          className="font-heading text-base font-semibold text-brand-navy"
        >
          Communications
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {entries.length} sent
        </span>
      </header>
      <ul className="divide-y divide-border">
        {entries.map((e, i) => (
          <li
            key={`${e.timestamp}-${i}`}
            data-testid={`communications-row-${i}`}
            className="flex flex-col gap-1 py-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-brand-navy">{e.templateName}</span>
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {e.useCase}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(e.timestamp)} <span aria-hidden>&middot;</span> {e.user}
              </span>
            </div>
            {e.subject ? (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Subject:</span> {e.subject}
              </p>
            ) : null}
            {e.recipient ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">To:</span> <span className="break-all">{e.recipient}</span>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
