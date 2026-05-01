import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommunicationsHistoryPanel } from './CommunicationsHistoryPanel'
import type { MOU } from '@/lib/types'

function mou(auditLog: MOU['auditLog']): MOU {
  return {
    id: 'MOU-X', schoolId: 'SCH-X', schoolName: 'Sample',
    programme: 'STEAM', programmeSubType: null, schoolScope: 'SINGLE',
    schoolGroupId: null, status: 'Active', cohortStatus: 'active',
    academicYear: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
    studentsMou: 100, studentsActual: null, studentsVariance: null,
    studentsVariancePct: null, spWithoutTax: 0, spWithTax: 0,
    contractValue: 0, received: 0, tds: 0, balance: 0, receivedPct: 0,
    paymentSchedule: '', trainerModel: 'GSL-T', salesPersonId: null,
    templateVersion: null, generatedAt: null, notes: null,
    delayNotes: null, daysToExpiry: null, auditLog,
  }
}

describe('CommunicationsHistoryPanel (W4-I.5 P3C5)', () => {
  it('renders nothing when no communication-sent entries exist', () => {
    const html = renderToStaticMarkup(
      <CommunicationsHistoryPanel mou={mou([])} />,
    )
    expect(html).toBe('')
  })

  it('lists communication-sent entries newest-first', () => {
    const html = renderToStaticMarkup(
      <CommunicationsHistoryPanel
        mou={mou([
          {
            timestamp: '2026-04-25T10:00:00Z', user: 'misba.m',
            action: 'communication-sent',
            after: {
              templateId: 'TPL-WELCOME', templateName: 'Welcome Note',
              useCase: 'welcome', recipient: 'spoc@school.test',
              subject: 'Welcome to STEAM', filledVariables: ['schoolName'],
            },
          },
          {
            timestamp: '2026-05-01T10:00:00Z', user: 'anish.d',
            action: 'communication-sent',
            after: {
              templateId: 'TPL-FOLLOW-UP', templateName: 'Follow-up',
              useCase: 'follow-up', recipient: 'spoc@school.test',
              subject: 'Following up', filledVariables: [],
            },
          },
        ])}
      />,
    )
    expect(html).toContain('data-testid="communications-history-panel"')
    expect(html).toContain('Communications')
    expect(html).toContain('2 sent')
    // Newest first: Follow-up (May 1) renders before Welcome Note (Apr 25)
    const followIdx = html.indexOf('Follow-up')
    const welcomeIdx = html.indexOf('Welcome Note')
    expect(followIdx).toBeGreaterThan(-1)
    expect(welcomeIdx).toBeGreaterThan(-1)
    expect(followIdx).toBeLessThan(welcomeIdx)
  })

  it('ignores non-communication audit entries', () => {
    const html = renderToStaticMarkup(
      <CommunicationsHistoryPanel
        mou={mou([
          { timestamp: '2026-04-25T10:00:00Z', user: 'u', action: 'create' },
          { timestamp: '2026-04-26T10:00:00Z', user: 'u', action: 'pi-issued' },
        ])}
      />,
    )
    expect(html).toBe('')
  })

  it('handles missing after metadata gracefully', () => {
    const html = renderToStaticMarkup(
      <CommunicationsHistoryPanel
        mou={mou([
          {
            timestamp: '2026-05-01T10:00:00Z', user: 'u',
            action: 'communication-sent',
            // No `after` payload at all
          },
        ])}
      />,
    )
    expect(html).toContain('(unknown template)')
    expect(html).toContain('1 sent')
  })
})
