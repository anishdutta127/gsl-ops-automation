/*
 * mouStatusTone (W4-I.5 P4C5).
 *
 * Maps MOU.status -> StatusChipTone so the detail page, list page,
 * and any future surface stay in sync on the colour vocabulary.
 *
 *   Active            -> ok          (signal-ok green)
 *   Pending Signature -> attention   (signal-attention amber)
 *   Completed         -> teal        (brand teal; positive terminal state)
 *   Expired           -> alert       (signal-alert red)
 *   Renewed           -> navy        (brand navy; informational)
 *   Draft / fallback  -> neutral     (signal-neutral grey)
 */

import type { MOU } from '@/lib/types'
import type { StatusChipTone } from '@/components/ops/StatusChip'

export function mouStatusTone(status: MOU['status']): StatusChipTone {
  switch (status) {
    case 'Active':
      return 'ok'
    case 'Pending Signature':
      return 'attention'
    case 'Completed':
      return 'teal'
    case 'Expired':
      return 'alert'
    case 'Renewed':
      return 'navy'
    case 'Draft':
    default:
      return 'neutral'
  }
}
