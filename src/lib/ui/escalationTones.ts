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
// Swati-feedback batch: display labels relabel without touching the
// stored enum (Open / WIP / Closed / Transfer to Other Department /
// Dispatched / In Transit). Filter chips, status chips, dashboard tile,
// and detail page all read these labels.
export const ESCALATION_STATUS_TONE: Record<
  Escalation['status'],
  { tone: StatusChipTone; label: string }
> = {
  Open: { tone: 'alert', label: 'Awaiting Action' },
  WIP: { tone: 'attention', label: 'Being Resolved' },
  Closed: { tone: 'ok', label: 'Closed' },
  'Transfer to Other Department': { tone: 'attention', label: 'Waiting on Someone Else' },
  Dispatched: { tone: 'attention', label: 'Dispatched' },
  'In Transit': { tone: 'attention', label: 'In Transit' },
}
