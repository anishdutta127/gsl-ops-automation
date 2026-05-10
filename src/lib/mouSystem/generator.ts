/*
 * Deterministic MOU generator.
 *
 * Reads a .docx template from public/mou-templates/, substitutes
 * {{PLACEHOLDER}} tokens via docxtemplater, and returns the resulting
 * buffer. Throws the specific error classes below so the API route / UI
 * can render actionable messages.
 *
 * Node-only: uses fs.readFile. Import from API route handlers, not from
 * middleware or client components.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { TEMPLATES, type TemplateSpec } from './templates'

export class UnknownTemplateError extends Error {
  constructor(public readonly templateId: string) {
    super(
      `Unknown template id "${templateId}". Known: ${Object.keys(TEMPLATES).join(', ') || '(none)'}`,
    )
    this.name = 'UnknownTemplateError'
  }
}

export class TemplateMissingError extends Error {
  constructor(
    public readonly templateId: string,
    public readonly expectedPath: string,
  ) {
    super(
      `${templateId}.docx not yet deployed. ` +
        `Drop file at ${expectedPath}, tag placeholders, and try again. ` +
        `Contact Anish if you don't know how.`,
    )
    this.name = 'TemplateMissingError'
  }
}

export class TemplateSubstitutionError extends Error {
  constructor(
    public readonly templateId: string,
    public readonly originalError: Error,
  ) {
    super(`Substitution failed for ${templateId}: ${originalError.message}`)
    this.name = 'TemplateSubstitutionError'
    this.cause = originalError
  }
}

function resolveTemplate(templateId: string): TemplateSpec {
  const spec = TEMPLATES[templateId]
  if (!spec) throw new UnknownTemplateError(templateId)
  return spec
}

async function readTemplateFile(spec: TemplateSpec): Promise<Buffer> {
  const abs = path.join(process.cwd(), spec.file)
  try {
    return await fs.readFile(abs)
  } catch {
    throw new TemplateMissingError(spec.id, spec.file)
  }
}

/**
 * Render a template to a .docx Buffer.
 *
 * `values` must contain every required placeholder. docxtemplater is set
 * to `errorLogging: false` and null/undefined values become empty strings
 * (so the generator does not crash when a non-required field is skipped).
 */
export async function fillTemplate(
  templateId: string,
  values: Record<string, string>,
): Promise<Buffer> {
  const spec = resolveTemplate(templateId)
  const tplBuffer = await readTemplateFile(spec)

  try {
    const zip = new PizZip(tplBuffer)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
      // Templates are tagged with {{TOKEN}}, not docxtemplater's default
      // single-brace {TOKEN}. Switch delimiters to match.
      delimiters: { start: '{{', end: '}}' },
    })
    // Always clear the {{ANNEXURE_START}} / {{ANNEXURE_END}} markers (they
    // are boundary anchors for the editor, not user-facing data). Merge
    // caller-provided values on top.
    doc.render({
      ANNEXURE_START: '',
      ANNEXURE_END: '',
      ...values,
    })
    const out = doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
    return out
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    throw new TemplateSubstitutionError(spec.id, err)
  }
}
