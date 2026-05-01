'use server'

/*
 * /admin/templates server actions (W4-I.5 P3C3).
 *
 * Two actions: createTemplateAction (form target on /new) and
 * editTemplateAction (form target on /[id]/edit). Both gate on
 * 'template:edit' via the underlying lib; redirects on success.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { canPerform } from '@/lib/auth/permissions'
import { createTemplate } from '@/lib/templates/createTemplate'
import {
  editTemplate,
  type EditTemplatePatch,
} from '@/lib/templates/editTemplate'
import type { TemplateRecipient, TemplateUseCase } from '@/lib/types'

const VALID_USE_CASES: ReadonlyArray<TemplateUseCase> = [
  'welcome', 'thank-you', 'follow-up', 'payment-reminder',
  'dispatch-confirmation', 'feedback-request', 'custom',
]
const VALID_RECIPIENTS: ReadonlyArray<TemplateRecipient> = [
  'spoc', 'sales-owner', 'school-email', 'custom',
]

function parseCcRules(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function parseVariables(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Ftemplates%2Fnew')
  if (!canPerform(user, 'template:edit')) {
    redirect('/admin/templates?error=permission')
  }

  const name = String(formData.get('name') ?? '').trim()
  const useCaseRaw = String(formData.get('useCase') ?? '').trim()
  const subject = String(formData.get('subject') ?? '')
  const bodyMarkdown = String(formData.get('bodyMarkdown') ?? '')
  const recipientRaw = String(formData.get('defaultRecipient') ?? '').trim()
  const ccRaw = String(formData.get('defaultCcRules') ?? '')
  const variablesRaw = String(formData.get('variables') ?? '')
  const active = formData.get('active') !== null

  if (!VALID_USE_CASES.includes(useCaseRaw as TemplateUseCase)) {
    redirect('/admin/templates/new?error=invalid-use-case')
  }
  if (!VALID_RECIPIENTS.includes(recipientRaw as TemplateRecipient)) {
    redirect('/admin/templates/new?error=invalid-recipient')
  }

  const result = await createTemplate({
    name,
    useCase: useCaseRaw as TemplateUseCase,
    subject,
    bodyMarkdown,
    defaultRecipient: recipientRaw as TemplateRecipient,
    defaultCcRules: parseCcRules(ccRaw),
    variables: parseVariables(variablesRaw),
    active,
    createdBy: user.id,
  })
  if (!result.ok) {
    redirect(`/admin/templates/new?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/admin/templates?created=${encodeURIComponent(result.template.id)}`)
}

export async function editTemplateAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fadmin%2Ftemplates')
  const id = String(formData.get('id') ?? '').trim()
  if (id === '') redirect('/admin/templates?error=missing-id')

  const patch: EditTemplatePatch = {}
  if (formData.has('name')) patch.name = String(formData.get('name') ?? '')
  if (formData.has('subject')) patch.subject = String(formData.get('subject') ?? '')
  if (formData.has('bodyMarkdown')) patch.bodyMarkdown = String(formData.get('bodyMarkdown') ?? '')
  if (formData.has('defaultRecipient')) {
    const v = String(formData.get('defaultRecipient') ?? '')
    if (!VALID_RECIPIENTS.includes(v as TemplateRecipient)) {
      redirect(`/admin/templates/${encodeURIComponent(id)}/edit?error=invalid-recipient`)
    }
    patch.defaultRecipient = v as TemplateRecipient
  }
  if (formData.has('defaultCcRules')) {
    patch.defaultCcRules = parseCcRules(String(formData.get('defaultCcRules') ?? ''))
  }
  if (formData.has('variables')) {
    patch.variables = parseVariables(String(formData.get('variables') ?? ''))
  }
  // Checkboxes are absent when unchecked; treat absence as active=false
  // when the form rendered the input (it always does on the edit page).
  patch.active = formData.get('active') !== null

  const result = await editTemplate({ id, patch, editedBy: user.id })
  if (!result.ok) {
    redirect(`/admin/templates/${encodeURIComponent(id)}/edit?error=${encodeURIComponent(result.reason)}`)
  }
  redirect(`/admin/templates?edited=${encodeURIComponent(id)}`)
}
