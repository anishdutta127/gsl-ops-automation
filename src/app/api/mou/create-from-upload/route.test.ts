/*
 * MOU form upgrade gate: POST /api/mou/create-from-upload.
 *
 * Covers the server-side validation mirror (the client checks are a
 * convenience, this boundary is the contract), the three school
 * resolution modes (linked / name-matched / inline-create), the date
 * integrity fix (startDate / endDate land as real ISO dates, never the
 * '' that postgres DATE columns reject - the pre-gate save-failed root
 * cause), Payment row materialisation from the instalment schedule,
 * the audit `after` snapshot carrying the new fields, and the real-
 * error-message contract for fetch callers.
 *
 * Repos are mocked; json backend path (DATA_BACKEND unset) is the one
 * under test, with the write calls asserted.
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getCurrentUserMock = vi.fn()
const mouFindAllMock = vi.fn()
const mouCreateMock = vi.fn()
const schoolFindAllMock = vi.fn()
const schoolCreateMock = vi.fn()
const paymentCreateMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}))
vi.mock('@/lib/db/repos/mou', () => ({
  mouRepo: {
    findAll: (...a: unknown[]) => mouFindAllMock(...a),
    create: (...a: unknown[]) => mouCreateMock(...a),
  },
}))
vi.mock('@/lib/db/repos/school', () => ({
  schoolRepo: {
    findAll: (...a: unknown[]) => schoolFindAllMock(...a),
    create: (...a: unknown[]) => schoolCreateMock(...a),
  },
}))
vi.mock('@/lib/db/repos/payment', () => ({
  paymentRepo: {
    create: (...a: unknown[]) => paymentCreateMock(...a),
  },
}))

import { POST } from './route'
import type { MOU, Payment, School, User } from '@/lib/types'

const ORIGINAL_TESTING = process.env.TESTING_OPEN_ACCESS
const ORIGINAL_BACKEND = process.env.DATA_BACKEND

function financeAdmin(): User {
  return {
    id: 'anish.d',
    name: 'Anish Dutta',
    email: 'anish.d@getsetlearn.info',
    role: 'Admin',
    department: null,
    testingOverride: false,
    active: true,
    passwordHash: 'X',
    createdAt: '2026-04-01T00:00:00Z',
    auditLog: [],
  } as unknown as User
}

function school(overrides: Partial<School> = {}): School {
  return {
    id: 'SCH-DELHI_PUBLIC_SCH',
    name: 'Delhi Public School',
    legalEntity: null,
    city: 'Delhi',
    state: 'Delhi',
    region: 'North',
    pinCode: null,
    contactPerson: null,
    email: null,
    phone: null,
    billingName: null,
    pan: null,
    gstNumber: null,
    notes: null,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    auditLog: [],
    ...overrides,
  }
}

interface FieldOverrides {
  [k: string]: string | undefined
}

function buildForm(overrides: FieldOverrides = {}): FormData {
  const fields: Record<string, string> = {
    schoolName: 'Sunrise International Academy',
    schoolAddress: '14 MG Road, Indore, Madhya Pradesh 452001',
    existingSchoolId: '',
    programme: 'STEAM',
    academicYear: '2026-27',
    students: '350',
    pricePerStudent: '1800',
    startDate: '2026-06-15',
    endDate: '2027-03-31',
    salesChannel: 'School Programs (Course)',
    signDate: '2026-06-10',
    installments: JSON.stringify([
      { dueDateIso: '2026-07-15', amountRs: 315000 },
      { dueDateIso: '2026-11-15', amountRs: 315000 },
    ]),
    ...overrides,
  }
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.set(k, v)
  }
  return fd
}

function buildRequest(fd: FormData): Request {
  return new Request('http://localhost/api/mou/create-from-upload', {
    method: 'POST',
    headers: { accept: 'application/json' },
    body: fd,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.TESTING_OPEN_ACCESS = 'false'
  delete process.env.DATA_BACKEND
  getCurrentUserMock.mockResolvedValue(financeAdmin())
  mouFindAllMock.mockResolvedValue([] as MOU[])
  mouCreateMock.mockResolvedValue(undefined)
  schoolFindAllMock.mockResolvedValue([school()])
  schoolCreateMock.mockResolvedValue(undefined)
  paymentCreateMock.mockResolvedValue(undefined)
})

afterEach(() => {
  if (ORIGINAL_TESTING === undefined) delete process.env.TESTING_OPEN_ACCESS
  else process.env.TESTING_OPEN_ACCESS = ORIGINAL_TESTING
  if (ORIGINAL_BACKEND === undefined) delete process.env.DATA_BACKEND
  else process.env.DATA_BACKEND = ORIGINAL_BACKEND
})

describe('POST /api/mou/create-from-upload', () => {
  it('401 JSON when unauthenticated', async () => {
    getCurrentUserMock.mockResolvedValue(null)
    const res = await POST(buildRequest(buildForm()))
    expect(res.status).toBe(401)
    expect(mouCreateMock).not.toHaveBeenCalled()
  })

  it('403 for a department-scoped non-Finance user in production lockdown', async () => {
    getCurrentUserMock.mockResolvedValue({
      ...financeAdmin(),
      department: 'ops',
    })
    const res = await POST(buildRequest(buildForm()))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('permission')
  })

  it('400 with a specific message when school name is missing (unlinked)', async () => {
    const res = await POST(buildRequest(buildForm({ schoolName: '' })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing-school-name')
    expect(body.message).toMatch(/school name/i)
  })

  it('400 when school address is missing for a new school', async () => {
    const res = await POST(buildRequest(buildForm({ schoolAddress: '' })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing-school-address')
  })

  it('400 when the end date precedes the start date', async () => {
    const res = await POST(
      buildRequest(buildForm({ startDate: '2027-03-31', endDate: '2026-06-15' })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('date-order')
  })

  it('400 when start or end date is missing', async () => {
    const res = await POST(buildRequest(buildForm({ startDate: '' })))
    expect((await res.json()).error).toBe('missing-start-date')
    const res2 = await POST(buildRequest(buildForm({ endDate: '' })))
    expect((await res2.json()).error).toBe('missing-end-date')
  })

  it('400 when the instalment schedule is empty or incomplete', async () => {
    const res = await POST(buildRequest(buildForm({ installments: '[]' })))
    expect((await res.json()).error).toBe('invalid-installments')
    const res2 = await POST(
      buildRequest(
        buildForm({
          installments: JSON.stringify([{ dueDateIso: '', amountRs: 100 }]),
        }),
      ),
    )
    expect((await res2.json()).error).toBe('invalid-installments')
  })

  it('400 when the sales channel is not in the canonical list', async () => {
    const res = await POST(buildRequest(buildForm({ salesChannel: 'Door to door' })))
    expect((await res.json()).error).toBe('invalid-sales-channel')
  })

  it('creates MOU + school + payments with real dates and the full audit snapshot (inline-create)', async () => {
    const res = await POST(buildRequest(buildForm()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.id).toBe('MOU-STEAM-2627-001')
    expect(body.redirect).toBe('/mous/MOU-STEAM-2627-001?created=1')

    // New school created with the address captured and INCOMPLETE marker.
    expect(schoolCreateMock).toHaveBeenCalledTimes(1)
    const newSchool = schoolCreateMock.mock.calls[0]![0] as School
    expect(newSchool.id).toMatch(/^SCH-SUNRISE_INTERNATION/)
    expect(newSchool.name).toBe('Sunrise International Academy')
    expect(newSchool.notes).toContain('[INCOMPLETE_SCHOOL_DETAILS]')
    expect(newSchool.notes).toContain('14 MG Road, Indore')
    expect(newSchool.auditLog[0]!.notes).toContain('Auto-created from Add MOU MOU-STEAM-2627-001')

    // MOU dates are real ISO strings, never '' (the pre-gate postgres
    // DATE rejection root cause).
    expect(mouCreateMock).toHaveBeenCalledTimes(1)
    const mou = mouCreateMock.mock.calls[0]![0] as MOU
    expect(mou.startDate).toBe('2026-06-15')
    expect(mou.endDate).toBe('2027-03-31')
    expect(mou.effectiveDate).toBe('2026-06-10')
    expect(mou.salesChannel).toBe('School Programs (Course)')
    expect(mou.contractValue).toBe(630000)
    expect(mou.schoolId).toBe(newSchool.id)
    expect(mou.opsReviewStatus).toBe('Pending for review')

    // Audit `after` snapshot carries the new fields per the convention.
    const after = mou.auditLog[0]!.after as Record<string, unknown>
    expect(after.schoolAddress).toBe('14 MG Road, Indore, Madhya Pradesh 452001')
    expect(after.startDate).toBe('2026-06-15')
    expect(after.endDate).toBe('2027-03-31')
    expect(after.salesChannel).toBe('School Programs (Course)')
    expect(after.installmentCount).toBe(2)

    // One Payment row per instalment, forward-pointer audit note.
    expect(paymentCreateMock).toHaveBeenCalledTimes(2)
    const p1 = paymentCreateMock.mock.calls[0]![0] as Payment
    expect(p1.id).toBe('MOU-STEAM-2627-001-i1')
    expect(p1.expectedAmount).toBe(315000)
    expect(p1.dueDateIso).toBe('2026-07-15')
    expect(p1.status).toBe('Pending')
    expect(p1.auditLog?.[0]?.notes).toContain('Auto-created from Add MOU')
  })

  it('auto-links by normalised name match instead of duplicating the school', async () => {
    const res = await POST(
      buildRequest(buildForm({ schoolName: 'delhi public school', schoolAddress: 'anywhere' })),
    )
    expect(res.status).toBe(200)
    expect(schoolCreateMock).not.toHaveBeenCalled()
    const mou = mouCreateMock.mock.calls[0]![0] as MOU
    expect(mou.schoolId).toBe('SCH-DELHI_PUBLIC_SCH')
    expect(mou.schoolName).toBe('Delhi Public School')
    expect(mou.auditLog[0]!.notes).toContain('auto-linked by name match')
  })

  it('links the canonical school when existingSchoolId is supplied (address optional)', async () => {
    const res = await POST(
      buildRequest(
        buildForm({ existingSchoolId: 'SCH-DELHI_PUBLIC_SCH', schoolAddress: '' }),
      ),
    )
    expect(res.status).toBe(200)
    expect(schoolCreateMock).not.toHaveBeenCalled()
    const mou = mouCreateMock.mock.calls[0]![0] as MOU
    expect(mou.schoolId).toBe('SCH-DELHI_PUBLIC_SCH')
  })

  it('404-style failure when the linked school id does not exist', async () => {
    const res = await POST(
      buildRequest(buildForm({ existingSchoolId: 'SCH-DOES_NOT_EXIST' })),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('school-not-found')
  })

  it('surfaces the real exception message when the write fails', async () => {
    mouCreateMock.mockRejectedValue(
      new Error('invalid input syntax for type date: ""'),
    )
    const res = await POST(buildRequest(buildForm()))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('save-failed')
    expect(body.message).toContain('invalid input syntax for type date')
  })

  it('mints sequential ids per programme + FY', async () => {
    mouFindAllMock.mockResolvedValue([
      { id: 'MOU-STEAM-2627-014' },
      { id: 'MOU-YP-2627-002' },
    ] as MOU[])
    const res = await POST(buildRequest(buildForm()))
    expect((await res.json()).id).toBe('MOU-STEAM-2627-015')
  })
})
