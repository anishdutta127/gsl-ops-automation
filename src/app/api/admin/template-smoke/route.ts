/*
 * GET /api/admin/template-smoke (Phase 6E Finding 3, diagnostic only).
 *
 * Returns per-template `present|missing|error` so we can confirm
 * outputFileTracingIncludes actually landed the .docx assets in the
 * deployed serverless bundle. Production check: hit this route after
 * the next.config.mjs sweep deploys and read the JSON.
 *
 * Admin-only. Returns 200 with a JSON map either way; a `missing`
 * entry means the include is wrong for that route. Removed in a
 * follow-up commit once verification confirms the YP-v2.1.docx toast
 * root cause.
 */

import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth/session'

const TEMPLATES_TO_PROBE = [
  'public/mou-templates/STEAM-v2.1.docx',
  'public/mou-templates/YP-v2.1.docx',
  'public/mou-templates/HBPE-v2.1.docx',
  'public/ops-templates/pi-template.docx',
  'public/ops-templates/dispatch-template.docx',
  'public/ops-templates/handover-template.docx',
  'public/ops-templates/delivery-ack-template.docx',
]

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'Admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const root = process.cwd()
  const results: Record<string, { state: string; sizeBytes?: number; error?: string }> = {}

  for (const rel of TEMPLATES_TO_PROBE) {
    const full = path.join(root, rel)
    try {
      const bytes = await readFile(full)
      results[rel] = { state: 'present', sizeBytes: bytes.byteLength }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        results[rel] = { state: 'missing', error: `ENOENT at ${full}` }
      } else {
        results[rel] = {
          state: 'error',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
  }

  return NextResponse.json({
    cwd: root,
    probedAt: new Date().toISOString(),
    results,
  })
}
