/*
 * POST /api/admin/chain-reconciliation/consolidate (Gate 5A Step 4).
 *
 * Consumes form-encoded body: memberSchoolIds (comma-separated),
 * chainName, region. Creates a SchoolGroup in school_groups.json + sets
 * schoolGroupId on each member School. Admin-only via canPerform
 * ('admin:manage-users').
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { canManageUsers } from '@/lib/access'
import { atomicUpdateJson } from '@/lib/githubQueue'
import type { School, SchoolGroup } from '@/lib/types'
import { buildConsolidation } from '@/lib/admin/chainReconciliation'

const SCHOOLS_PATH = 'src/data/schools.json'
const GROUPS_PATH = 'src/data/school_groups.json'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', '/admin/chain-mou-reconciliation')
    return NextResponse.redirect(url, { status: 303 })
  }
  if (!canManageUsers(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const form = await request.formData()
  const memberSchoolIdsRaw = String(form.get('memberSchoolIds') ?? '').trim()
  const chainName = String(form.get('chainName') ?? '').trim()
  const region = String(form.get('region') ?? '').trim()

  if (!memberSchoolIdsRaw || !chainName || !region) {
    const url = new URL('/admin/chain-mou-reconciliation', request.url)
    url.searchParams.set('error', 'missing-fields')
    return NextResponse.redirect(url, { status: 303 })
  }

  const memberSchoolIds = memberSchoolIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)

  let groupName: string
  try {
    // Read schools, build the consolidation, then write both files.
    let members: School[] = []
    await atomicUpdateJson<School[]>(
      SCHOOLS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        members = list.filter((s) => memberSchoolIds.includes(s.id))
        if (members.length === 0) return { next: list, commitMessage: 'chore(chain-reconciliation): no members; no-op.' }
        const result = buildConsolidation({
          members,
          input: { memberSchoolIds, chainName, region, createdBy: user.id },
          now: new Date(),
        })
        const updatedById = new Map(result.updatedSchools.map((s) => [s.id, s]))
        return {
          next: list.map((s) => updatedById.get(s.id) ?? s),
          commitMessage: `chore(chain-reconciliation): link ${memberSchoolIds.length} school(s) to ${chainName}.`,
        }
      },
      { defaultValue: [] as School[] },
    )

    if (members.length === 0) {
      const url = new URL('/admin/chain-mou-reconciliation', request.url)
      url.searchParams.set('error', 'no-members-found')
      return NextResponse.redirect(url, { status: 303 })
    }

    // Build the group record from the same inputs (deterministic id).
    const consolidation = buildConsolidation({
      members,
      input: { memberSchoolIds, chainName, region, createdBy: user.id },
      now: new Date(),
    })
    groupName = consolidation.group.name
    await atomicUpdateJson<SchoolGroup[]>(
      GROUPS_PATH,
      (current) => {
        const list = Array.isArray(current) ? current : []
        // Idempotency: if a group with this id already exists, skip
        // appending so a duplicate submit does not create duplicates.
        if (list.some((g) => g.id === consolidation.group.id)) {
          return { next: list, commitMessage: 'chore(chain-reconciliation): group exists; no-op.' }
        }
        return {
          next: [...list, consolidation.group],
          commitMessage: `chore(chain-reconciliation): create SchoolGroup ${consolidation.group.id}.`,
        }
      },
      { defaultValue: [] as SchoolGroup[] },
    )
  } catch (e) {
    const url = new URL('/admin/chain-mou-reconciliation', request.url)
    url.searchParams.set('error', e instanceof Error ? e.message : 'consolidate-failed')
    return NextResponse.redirect(url, { status: 303 })
  }

  const url = new URL('/admin/chain-mou-reconciliation', request.url)
  url.searchParams.set('flash', `Chain "${groupName}" consolidated. Reflects in five minutes.`)
  return NextResponse.redirect(url, { status: 303 })
}
