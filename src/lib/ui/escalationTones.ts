/*
 * escalationTones (W4-I.5 P4C5).
 *
 * Status + severity -> StatusChip tone + display label, factored
 * out of /escalations/[id] so the list page can reuse the same
 * vocabulary. Both the detail and list use these on every row, so
 * keeping the mapping in one place stops the two surfaces drifting.
 */

import type { Escalation } from '@/lib/types'
import type { StatusChipTone } from '@/components/ops/StatusChip'

export const ESCALATION_SEVERITY_TONE: Record<
  Escalation['severity'],
  { tone: StatusChipTone; label: string }
> = {
  high: { tone: 'alert', label: 'High' },
  medium: { tone: 'attention', label: 'Medium' },
  low: { tone: 'neutral', label: 'Low' },
}

// W4-I.4 MM5: Misba ticketing-system status vocabulary.
export const ESCALATION_STATUS_TONE: Record<
  Escalation['status'],
  { tone: StatusChipTone; label: string }
> = {
  Open: { tone: 'alert', label: 'Open' },
  WIP: { tone: 'attention', label: 'WIP' },
  Closed: { tone: 'ok', label: 'Closed' },
  'Transfer to Other Department': { tone: 'attention', label: 'Transfer to Other Department' },
  Dispatched: { tone: 'attention', label: 'Dispatched' },
  'In Transit': { tone: 'attention', label: 'In Transit' },
}
