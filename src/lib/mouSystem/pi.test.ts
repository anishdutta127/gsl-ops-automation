import { describe, it, expect } from 'vitest'
import { amountInWordsInr, composePi, isPiAllowedForStatus, PI_BLOCKED_STATUSES } from './pi'
import type { MOU, Payment, School } from './types'

describe('amountInWordsInr', () => {
  it('renders Indian-lakh/crore strings', () => {
    expect(amountInWordsInr(0)).toBe('Rupees Zero Only')
    expect(amountInWordsInr(150000)).toBe('Rupees One Lakh Fifty Thousand Only')
    expect(amountInWordsInr(10700000)).toBe('Rupees One Crore Seven Lakh Only')
    expect(amountInWordsInr(2360)).toBe('Rupees Two Thousand Three Hundred Sixty Only')
  })
  it('handles paise', () => {
    expect(amountInWordsInr(100.5)).toBe('Rupees One Hundred and Fifty Paise Only')
  })
})

function makeMou(overrides: Partial<MOU> = {}): MOU {
  return {
    id: 'MOU-STEAM-2627-001',
    schoolId: 'SCH-A',
    schoolName: 'Acme School',
    programme: 'STEAM',
    status: 'Active',
    academicYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    studentsMou: 100,
    studentsActual: null,
    studentsVariance: null,
    studentsVariancePct: null,
    spWithoutTax: 2700,
    spWithTax: 3186,
    contractValue: 318600,
    received: 0,
    tds: 0,
    balance: 318600,
    receivedPct: 0,
    paymentSchedule: '25-25-25-25 quarterly',
    trainerModel: null,
    salesRep: null,
    notes: null,
    daysToExpiry: 300,
    salesPersonId: null,
    templateVersion: null,
    generatedAt: null,
    draftVariables: null,
    auditLog: [],
    ...overrides,
  }
}

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'MOU-STEAM-2627-001-i1',
    mouId: 'MOU-STEAM-2627-001',
    schoolName: 'Acme School',
    programme: 'STEAM',
    instalmentLabel: '1 of 4',
    instalmentSeq: 1,
    totalInstalments: 4,
    description: 'Instalment I',
    dueDateRaw: '2026-06-30',
    dueDateIso: '2026-06-30',
    expectedAmount: 79650,
    receivedAmount: 0,
    receivedDate: null,
    paymentMode: null,
    bankReference: null,
    piNumber: null,
    taxInvoiceNumber: null,
    status: 'Pending',
    notes: null,
    piSentDate: null,
    piSentTo: null,
    piGeneratedAt: null,
    studentCountActual: null,
    partialPayments: null,
    auditLog: null,
    ...overrides,
  }
}

function makeSchool(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-A',
    name: 'Acme School',
    legalEntity: 'Acme Trust',
    city: 'Mumbai',
    state: 'Maharashtra',
    pinCode: '400001',
    contactPerson: null,
    email: 'accounts@acme.edu',
    phone: null,
    billingName: null,
    pan: 'AAACA1234B',
    gstNumber: '27AAACA1234B1Z5',
    activeMous: 1,
    totalLifetimeValue: 318600,
    notes: null,
    ...overrides,
  }
}

describe('composePi', () => {
  // Phase 3 Step 3: STEAM routes to the UP GST entity. CGST+SGST applies
  // when the school's state matches the entity's state (Uttar Pradesh).
  it('splits GST into CGST + SGST for in-state school (STEAM, UP school)', () => {
    const pi = composePi({
      piNumber: 'MTPL/UP/2627/0001',
      issueDate: '2026-05-15',
      installment: makePayment(),
      mou: makeMou(),
      school: makeSchool({ state: 'Uttar Pradesh', city: 'Noida' }),
      gstPct: 0.18,
    })
    expect(pi.cgst).toBeGreaterThan(0)
    expect(pi.sgst).toBeGreaterThan(0)
    expect(pi.igst).toBe(0)
    expect(pi.total).toBe(79650)
    expect(pi.fiscalYear).toBe('26-27')
    expect(pi.company.gstin).toBe('09AAOCM1035E1ZL')
  })

  it('uses IGST for inter-state school (STEAM, Maharashtra school)', () => {
    const pi = composePi({
      piNumber: 'MTPL/UP/2627/0001',
      issueDate: '2026-05-15',
      installment: makePayment(),
      mou: makeMou(),
      school: makeSchool({ state: 'Maharashtra', city: 'Mumbai' }),
      gstPct: 0.18,
    })
    expect(pi.cgst).toBe(0)
    expect(pi.sgst).toBe(0)
    expect(pi.igst).toBeGreaterThan(0)
  })

  it('falls back gracefully when school is missing', () => {
    const pi = composePi({
      piNumber: 'MTPL/UP/2627/0001',
      issueDate: '2026-05-15',
      installment: makePayment(),
      mou: makeMou(),
      school: undefined,
      gstPct: 0.18,
    })
    expect(pi.school.name).toBe('Acme School')
    expect(pi.school.gstNumber).toBeNull()
  })

  it('Young Pioneers MOU routes to MH GSTIN', () => {
    const pi = composePi({
      piNumber: 'MTPL/MH/2627/0001',
      issueDate: '2026-05-15',
      installment: makePayment({ programme: 'Young Pioneers' }),
      mou: makeMou({ programme: 'Young Pioneers' }),
      school: makeSchool({ state: 'Maharashtra', city: 'Mumbai' }),
      gstPct: 0.18,
    })
    expect(pi.company.gstin).toBe('27AAOCM1035E1ZN')
    expect(pi.cgst).toBeGreaterThan(0)
    expect(pi.sgst).toBeGreaterThan(0)
    expect(pi.igst).toBe(0)
  })

  it('emits HSN 999294 on every line item', () => {
    const pi = composePi({
      piNumber: 'MTPL/UP/2627/0001',
      issueDate: '2026-05-15',
      installment: makePayment(),
      mou: makeMou(),
      school: makeSchool({ state: 'Uttar Pradesh' }),
      gstPct: 0.18,
    })
    for (const li of pi.lineItems) {
      expect(li.hsn).toBe('999294')
    }
  })
})

describe('isPiAllowedForStatus (Phase 3a P1 fix)', () => {
  it('blocks every pipeline status', () => {
    for (const s of PI_BLOCKED_STATUSES) {
      expect(isPiAllowedForStatus(s)).toBe(false)
    }
  })

  it('allows Signed / Active / Completed / Renewed / Expired', () => {
    for (const s of ['Signed', 'Active', 'Completed', 'Renewed', 'Expired']) {
      expect(isPiAllowedForStatus(s)).toBe(true)
    }
  })

  it('blocks Draft specifically', () => {
    expect(isPiAllowedForStatus('Draft')).toBe(false)
  })

  it('blocks Awaiting Signature specifically', () => {
    expect(isPiAllowedForStatus('Awaiting Signature')).toBe(false)
  })
})
