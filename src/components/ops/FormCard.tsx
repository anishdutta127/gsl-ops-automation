/*
 * FormCard (Phase C5b).
 *
 * Vertical-stack form wrapper for the new admin entity surfaces. Each
 * field renders by `type` with shared label + hint + error chrome.
 * Posts as a standard form to `action`; the API route handles
 * redirects + error params per the codebase's form-POST convention.
 *
 * Field types:
 *  - text / email / tel: single-line input
 *  - textarea: multi-line input
 *  - select: single value from `options`
 *  - checkbox-group: zero-or-more from `options` (sent as repeated form values)
 *  - comma-list: free-form array; the page parses on the API side
 *
 * The 2-column grid layout used by /schools/[id]/edit (C3) is NOT
 * supported here; that page stays inline. FormCard is for the simpler
 * admin-create surfaces.
 */

import { Fragment } from 'react'
import Link from 'next/link'

export type FormCardFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'textarea'
  | 'select'
  | 'checkbox-group'
  | 'comma-list'

export interface FormCardOption {
  value: string
  label: string
}

export interface FormCardField {
  name: string
  label: string
  type: FormCardFieldType
  required?: boolean
  hint?: string
  defaultValue?: string | string[]
  options?: FormCardOption[]    // select + checkbox-group
  pattern?: string              // text inputs
  placeholder?: string
  rows?: number                 // textarea
  inputMode?: 'numeric' | 'tel' | 'email'
}

export interface FormCardProps {
  action: string
  fields: FormCardField[]
  submitLabel: string
  cancelHref?: string
  errorMessage?: string | null
}

const INPUT_CLASS =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]'

export function FormCard({
  action,
  fields,
  submitLabel,
  cancelHref,
  errorMessage,
}: FormCardProps) {
  return (
    <>
      {errorMessage ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}
      <form method="POST" action={action} className="space-y-5">
        {fields.map((field) => (
          <Fragment key={field.name}>
            <FormCardFieldRow field={field} />
          </Fragment>
        ))}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-[var(--brand-navy)] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)] min-h-[44px]"
          >
            {submitLabel}
          </button>
          {cancelHref ? (
            <Link
              href={cancelHref}
              className="text-sm text-slate-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
            >
              Cancel
            </Link>
          ) : null}
        </div>
      </form>
    </>
  )
}

function FormCardFieldRow({ field }: { field: FormCardField }) {
  const inputId = `fc-${field.name}`
  const descId = field.hint ? `${inputId}-hint` : undefined

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--brand-navy)]">
        {field.label}
        {field.required ? <span aria-hidden className="ml-0.5 text-slate-500">*</span> : null}
      </label>
      {field.hint ? (
        <p id={descId} className="mt-0.5 text-xs text-slate-600">
          {field.hint}
        </p>
      ) : null}
      <div className="mt-1.5">{renderInput(field, inputId, descId)}</div>
    </div>
  )
}

function renderInput(field: FormCardField, inputId: string, descId: string | undefined) {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          id={inputId}
          name={field.name}
          required={field.required}
          rows={field.rows ?? 3}
          defaultValue={asString(field.defaultValue)}
          aria-describedby={descId}
          className={INPUT_CLASS}
        />
      )

    case 'select':
      return (
        <select
          id={inputId}
          name={field.name}
          required={field.required}
          defaultValue={asString(field.defaultValue) || ''}
          aria-describedby={descId}
          className={INPUT_CLASS}
        >
          {!field.defaultValue ? (
            <option value="" disabled>
              Choose {field.label.toLowerCase()}
            </option>
          ) : null}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )

    case 'checkbox-group': {
      const defaults = new Set(asArray(field.defaultValue))
      return (
        <fieldset id={inputId} aria-describedby={descId} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={field.name}
                value={o.value}
                defaultChecked={defaults.has(o.value)}
                className="size-4 rounded border-slate-300 text-[var(--brand-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-navy)]"
              />
              <span className="text-slate-800">{o.label}</span>
            </label>
          ))}
        </fieldset>
      )
    }

    case 'comma-list':
      return (
        <input
          id={inputId}
          name={field.name}
          type="text"
          required={field.required}
          placeholder={field.placeholder}
          defaultValue={asArray(field.defaultValue).join(', ')}
          aria-describedby={descId}
          className={INPUT_CLASS}
        />
      )

    case 'email':
    case 'tel':
    case 'date':
    case 'text':
    default:
      return (
        <input
          id={inputId}
          name={field.name}
          type={field.type}
          required={field.required}
          pattern={field.pattern}
          placeholder={field.placeholder}
          inputMode={field.inputMode}
          defaultValue={asString(field.defaultValue)}
          aria-describedby={descId}
          className={INPUT_CLASS}
        />
      )
  }
}

function asString(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value
  return ''
}

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value
  return []
}
