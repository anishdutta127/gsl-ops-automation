/*
 * Chain MOU reconciliation lib (Gate 5A Step 4).
 *
 * Pure compute helpers backing the /admin/chain-mou-reconciliation
 * surface. Reads chain candidates from two sources:
 *   1. src/data/_snapshots/mou-system/_meta.json chainCandidates[]
 *      (12 entries flagged in Gate 2 snapshot)
 *   2. Hard-coded Techno India Group trio from the Gate 4.5 FY26-27
 *      import (3 STEAM branches; not in snapshot)
 *
 * Dismissals persist to src/data/chain_dismissals.json (an array of
 * schoolIds). Dismissed candidates filter out of the view.
 *
 * Consolidation creates a new SchoolGroup row in school_groups.json
 * and updates each member School with schoolGroupId. Both writes go
 * through the existing atomicUpdateJson pattern.
 *
 * Permission: Admin only (page-level gate via canManageUsers; the
 * API route checks the same gate as defence-in-depth).
 */

import type { School, SchoolGroup } from '@/lib/types'

export interface ChainCandidate {
  schoolId: string
  name: string
  /** Source tag for display: 'snapshot' (Gate 2) or 'fy26-27-import' (Gate 4.5). */
  source: 'snapshot' | 'fy26-27-import'
}

/**
 * Hard-coded Techno India Group trio from Gate 4.5 FY26-27 import.
 * The snapshot _meta.json already lists them under chainCandidates,
 * but the import notes (BACKLOG Item 12) call them out as the chain
 * pattern most worth surfacing for Anish review, so the page can
 * group them under a "Techno India Group" auto-suggestion separately.
 */
export const TECHNO_INDIA_CHAIN_IDS: ReadonlyArray<string> = [
  'SCH-TECHNO_INDIA_GROUP_P',
  'SCH-TECHNO_INDIA_GROUP_P_2',
  'SCH-TECHNO_INDIA_GROUP_P_3',
]

export function buildChainCandidates(args: {
  snapshotCandidates: Array<{ schoolId: string; name: string }>
  dismissedIds: string[]
}): ChainCandidate[] {
  const dismissed = new Set(args.dismissedIds)
  const rows: ChainCandidate[] = []
  for (const c of args.snapshotCandidates) {
    if (dismissed.has(c.schoolId)) continue
    rows.push({
      schoolId: c.schoolId,
      name: c.name,
      source: TECHNO_INDIA_CHAIN_IDS.includes(c.schoolId)
        ? 'fy26-27-import'
        : 'snapshot',
    })
  }
  return rows
}

/**
 * Suggest a chain name from member school names by extracting the
 * common prefix. Example: ['Sri R. N. Singh Memorial High School',
 * 'Sri R. N. Singh Memorial High School (For Class 8)'] -> 'Sri R. N.
 * Singh Memorial High School'. Falls back to the first member name
 * when no common prefix exists.
 */
export function suggestChainName(memberNames: string[]): string {
  if (memberNames.length === 0) return ''
  if (memberNames.length === 1) return memberNames[0]!
  const sorted = [...memberNames].sort()
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  let i = 0
  while (i < first.length && i < last.length && first[i] === last[i]) i++
  const prefix = first.slice(0, i).trim().replace(/[-,(]+$/, '').trim()
  return prefix.length >= 8 ? prefix : (memberNames[0] ?? '')
}

export interface ConsolidateArgs {
  memberSchoolIds: string[]
  chainName: string
  region: string
  notes?: string | null
  createdBy: string
}

export interface ConsolidateResult {
  group: SchoolGroup
  updatedSchools: School[]
}

/**
 * Pure: given the inputs, returns the new SchoolGroup record plus the
 * updated School records. The route handler performs the actual
 * atomicUpdateJson calls; this lib stays IO-free for testability.
 *
 * The generated SchoolGroup id is `SG-` plus the chain name slug
 * uppercased; collisions with existing groups must be checked at the
 * caller layer.
 */
export function buildConsolidation(args: {
  members: School[]
  input: ConsolidateArgs
  now: Date
}): ConsolidateResult {
  const { members, input, now } = args
  const slug = input.chainName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  const groupId = `SG-${slug || 'CHAIN'}`
  const ts = now.toISOString()

  const group: SchoolGroup = {
    id: groupId,
    name: input.chainName,
    region: input.region,
    createdAt: ts,
    createdBy: input.createdBy,
    memberSchoolIds: input.memberSchoolIds.slice(),
    groupMouId: null,
    notes: input.notes ?? null,
    auditLog: [
      {
        timestamp: ts,
        user: input.createdBy,
        action: 'create',
        notes: `Consolidated from chain MOU reconciliation. ${members.length} members.`,
      },
    ],
  } as SchoolGroup

  const updatedSchools: School[] = members.map((s) => ({
    ...s,
    auditLog: [
      ...(s.auditLog ?? []),
      {
        timestamp: ts,
        user: input.createdBy,
        action: 'update' as const,
        before: { schoolGroupId: null },
        after: { schoolGroupId: groupId },
        notes: `Linked to chain group ${groupId} (${input.chainName}).`,
      },
    ],
  }))

  return { group, updatedSchools }
}
