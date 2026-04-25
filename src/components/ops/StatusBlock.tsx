/*
 * StatusBlock (DESIGN.md "Surface 3 / Status-block email template").
 *
 * Email-template SECTION rendered inside the email body, between
 * the main message and the signature. NOT a browser-app component.
 * Carried by every outbound Communication of type:
 *   welcome-note, three-ping-cadence-{t-30, t-14, t-7}, pi-sent,
 *   dispatch-raised, delivery-acknowledgement-reminder.
 *
 * Inline-CSS-with-hex is intentional and required for email-client
 * compatibility: CSS custom properties (var(--*)) and Tailwind
 * classes do not work in email clients (Outlook in particular).
 * This file is therefore the documented exception to DESIGN.md's
 * "no hex in components" rule, in line with DESIGN.md Surface 3
 * which itself prescribes hex values for Open Sans + signal-ok /
 * attention / neutral inline icons.
 *
 * Unicode iconography (no images, for universal email-client
 * support without "show images" gates):
 *   completed -> '✓' filled checkmark, signal-ok green
 *   current   -> '•' filled dot, signal-attention amber
 *   future    -> '○' outline circle, signal-neutral slate
 */

import type { LifecycleStage, StageStatus } from '@/lib/portal/lifecycleProgress'
import { formatDate } from '@/lib/format'

interface StatusBlockProps {
  stages: LifecycleStage[]
}

const ICON_MAP: Record<StageStatus, { char: string; colour: string }> = {
  completed: { char: '✓', colour: '#22C55E' }, // signal-ok
  current: { char: '•', colour: '#F59E0B' },    // signal-attention
  future: { char: '○', colour: '#64748B' },     // signal-neutral
}

const FONT_STACK = "'Open Sans', Arial, sans-serif"
const NAVY = '#073393'
const SLATE_BORDER = '#E2E8F0'
const STAGE_TEXT = '#1E293B'

export function StatusBlock({ stages }: StatusBlockProps) {
  return (
    <div
      style={{
        marginTop: '16px',
        marginBottom: '16px',
        borderTop: `1px solid ${SLATE_BORDER}`,
        borderBottom: `1px solid ${SLATE_BORDER}`,
        paddingTop: '12px',
        paddingBottom: '12px',
        maxWidth: '600px',
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontSize: '14px',
          fontWeight: 600,
          color: NAVY,
          marginBottom: '8px',
        }}
      >
        {'📍'} Where your MOU is today
      </div>
      {stages.map((stage) => (
        <StageRow key={stage.key} stage={stage} />
      ))}
    </div>
  )
}

function StageRow({ stage }: { stage: LifecycleStage }) {
  const icon = ICON_MAP[stage.status]
  const dateText = renderDateText(stage)
  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        fontSize: '13px',
        color: STAGE_TEXT,
        lineHeight: '20px',
        margin: '2px 0',
      }}
    >
      <span style={{ color: icon.colour, marginRight: '8px' }} aria-hidden>
        {icon.char}
      </span>
      <span>{stage.label}</span>
      {dateText ? (
        <span style={{ fontWeight: 500 }}> {dateText}</span>
      ) : null}
      {stage.detail && stage.status === 'completed' ? (
        <span style={{ fontWeight: 500 }}> ({stage.detail})</span>
      ) : null}
    </div>
  )
}

function renderDateText(stage: LifecycleStage): string | null {
  const formatted = stage.date ? formatDate(stage.date) : null
  if (stage.status === 'completed' && formatted) return `on ${formatted}`
  if (stage.status === 'current' && formatted) return `due by ${formatted}`
  if (stage.status === 'future' && !formatted) return '(TBD)'
  if (stage.status === 'future' && formatted) return `(${formatted})`
  return null
}
