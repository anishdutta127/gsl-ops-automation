/*
 * Step 3 Welcome Note default builder (mirrors the prototype's
 * buildDefaultWelcomeNote): an editable default note, per-school,
 * summarising the programme + student count + contact. Ops edits then
 * sends; tracking lives in welcome_notes. Recorded-status only - there is
 * no email-send infra yet.
 */

import type { MOU, School } from '@/lib/types'

export function buildDefaultWelcomeNote(mou: MOU, school: School | null): string {
  const schoolName = school?.name ?? mou.schoolName
  const contact = school?.contactPerson?.trim()
  const greeting = contact ? `Dear ${contact},` : `Dear ${schoolName} team,`
  const students = mou.studentsActual ?? mou.studentsMou ?? 0
  const products = (mou.products ?? [])
    .map((p) => p.skuName)
    .filter((v, i, a) => a.indexOf(v) === i)
  const productLine = products.length
    ? `Your programme kits (${products.join(', ')}) are being prepared for dispatch.`
    : 'Your programme kits will be assigned and dispatched shortly.'

  return [
    greeting,
    '',
    `Welcome to the GetSetLearn ${mou.programme} programme. We are delighted to partner with ${schoolName} for the ${mou.academicYear} academic year.`,
    '',
    `We have onboarded ${students} students under this programme. ${productLine}`,
    '',
    'Our operations team will be in touch with the rollout schedule and training plan. Please reach out to us for anything you need.',
    '',
    'Warm regards,',
    'Team GetSetLearn',
  ].join('\n')
}
