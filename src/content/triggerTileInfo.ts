/*
 * Trigger-tile info popover content (W4-B.2).
 *
 * Each tile gets three short paragraphs answering: what does the tile
 * mean, what does it count, what does the action it leads to look like.
 * Plain-language British English; verbs match button copy where the
 * tile points at a per-stage form.
 */

export interface TriggerTileInfo {
  /** What the tile is trying to surface in 1-2 sentences. */
  meaning: string
  /** The exact rule the count uses. */
  counts: string
  /** Where the tile leads + what to do there. */
  action: string
}

/**
 * Keyed by the tile's label string (the same string the TriggerTile
 * component renders in its header). Lookup at render time stays simple.
 */
export const TRIGGER_TILE_INFO: Record<string, TriggerTileInfo> = {
  'P2 overrides (7d)': {
    meaning: 'Counts dispatches authorised before the second instalment payment cleared. Each is an exception that should clear within the operating week; sustained increases mean the P2 gate is being treated as discretionary.',
    counts: 'Dispatches with overrideEvent.overriddenAt within the last 7 days, regardless of whether the override has been acknowledged.',
    action: 'Click into /admin/audit and filter by action=p2-override to see who authorised which dispatch and why.',
  },
  'Sales drift queue': {
    meaning: 'Active MOUs whose actuals confirmation produced a > 10% variance from the MOU baseline. SalesHead reviews + approves these.',
    counts: 'MOUs with |studentsVariancePct| greater than 0.10. Active cohort only; archived MOUs are excluded.',
    action: 'Drift review surface lands later. For Phase 1 the count is informational; SalesHead can find these MOUs by filtering /mous on programme + sales rep.',
  },
  'CC scope deltas (7d)': {
    meaning: 'Communications where the CC list the system computed differs from the CC list the operator actually sent to. Phase 1.1 will surface the diff per-message; for now this tile is informational.',
    counts: 'Currently always 0; the post-send audit pass that populates this lands in Phase 1.1.',
    action: 'No action in Phase 1. Once populated, click into /admin/audit and filter by action=cc-rule-toggle-on or -off for the underlying rule changes.',
  },
  'Captured commitments': {
    meaning: 'Active MOUs whose notes field captures a school-side commitment (e.g., "school will share signed MOU by Friday"). The number is a proxy for how much qualitative context is on file.',
    counts: 'MOUs with non-empty notes string. Active cohort only.',
    action: 'No write surface. Operators add commitments via the notes field on /mous/[id] (and after W4-B.3, the Status notes textarea also counts toward operator-visible context).',
  },
  'Schools needing action': {
    meaning: 'Schools whose linked MOUs have an open exception (overdue stage, missing GSTIN, drift > 10%, P2 override unack). Useful as a leadership-glance read of "where is friction this week".',
    counts: 'Distinct schools with at least one MOU that surfaces in the exception feed above. Active cohort only.',
    action: 'The exception feed (above this trigger grid) lists the same items with deeper context; click any row to jump into the MOU.',
  },
  'PI blocks': {
    meaning: 'Active MOUs whose linked school has no GSTIN on file. Pre-W4-A.6 these blocked PI generation; post-W4-A.6 the PI document renders "To be added" and Finance backfills before GST filing.',
    counts: 'Active MOUs with school.gstNumber === null. School joined via mou.schoolId.',
    action: 'Visit /schools and filter by GSTIN=Missing. Edit each school to capture the GSTIN; new PIs render the real value automatically.',
  },
  'Reconciliation health': {
    meaning: 'How tight payments-received are matching the PI counter advance. Drift here means PIs were issued without follow-through on payment recording.',
    counts: 'Currently informational; the live computation lands when payment-record telemetry is wired into a periodic reconcile pass.',
    action: 'No action in Phase 1. The W4-B.5 payment-receipt form contributes to the underlying data; this tile starts to move once it has 7 days of usage.',
  },
  'CC toggle-offs (7d)': {
    meaning: 'Cc rules that were turned off in the last week. Sustained toggle-offs mean the rule library is drifting from operational reality and someone (Anish or Misba) needs to tighten the defaults.',
    counts: 'CcRule entries whose disabledAt timestamp falls in the last 7 days.',
    action: 'Click into /admin/cc-rules and review the recently-disabled rules. Decide whether to re-enable, adjust the rule, or leave it off.',
  },
  'Email bounce (7d)': {
    meaning: 'Outbound emails that bounced. Each bounce is a SPOC contact-record that needs correcting; a sustained > 5% rate means our address book is stale.',
    counts: 'Communications with status=bounced where queuedAt falls in the last 7 days.',
    action: 'Visit /admin/audit, filter by entity=Communication and look for the bounce details. Update the school\'s SPOC email on /schools/[id]/edit and re-send.',
  },
  'Assignment queue': {
    meaning: 'Active MOUs without a sales rep assigned. Each is unsupervised; the SalesHead should triage assignment.',
    counts: 'Active MOUs with salesPersonId === null.',
    action: 'Visit /admin/sales-team to see the team roster. Re-assign on the MOU detail page (the metadata grid lists the current rep; an Edit affordance is on the W4 polish backlog).',
  },
}
