/*
 * Sales rep creation (Phase C5b).
 *
 * Adds a new SalesPerson record to sales_team.json. Permission gate
 * 'sales-rep:create' (Admin via wildcard, OpsHead via explicit grant).
 *
 * ID convention: 'sp-<token>' all-lowercase per pre-seeded fixtures
 * (sp-vikram, sp-vishwanath). The reviewer types the id directly;
 * auto-generation is deferred since Phase 1 has no deterministic
 * encoding spec for ambiguous names.
 *
 * Programmes are validated against the Programme enum. Territories
 * are free-form strings (cities + regions vary by hire).
 */

import type { Programme, SalesPerson, User } from '@/lib/types'
import salesTeamJson from '@/data/sales_team.json'
import usersJson from '@/data/users.json'
import { enqueueUpdate } from '@/lib/pendingUpdates'
import { canPerform } from '@/lib/auth/permissions'

const VALID_PROGRAMMES: ReadonlyArray<Programme> = [
  'STEAM',
  'Young Pioneers',
  'Harvard HBPE',
  'TinkRworks',
  'VEX',
]

const ID_PATTERN = /^sp-[a-z0-9-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface CreateSalesPersonArgs {
  id: string
  name: string
  email: string
  phone: string | null
  territories: string[]
  programmes: Programme[]
  joinedDate: string
  createdBy: string
}

export type CreateSalesPersonFailureReason =
  | 'permission'
  | 'unknown-user'
  | 'duplicate-id'
  | 'invalid-id-format'
  | 'invalid-email'
  | 'missing-name'
  | 'invalid-territories'
  | 'invalid-programmes'
  | 'invalid-joined-date'

export type CreateSalesPersonResult =
  | { ok: true; salesPerson: SalesPerson }
  | { ok: false; reason: CreateSalesPersonFailureReason }

export interface CreateSalesPersonDeps {
  salesTeam: SalesPerson[]
  users: User[]
  enqueue: typeof enqueueUpdate
  now: () => Date
}

const defaultDeps: CreateSalesPersonDeps = {
  salesTeam: salesTeamJson as unknown as SalesPerson[],
  users: usersJson as unknown as User[],
  enqueue: enqueueUpdate,
  now: () => new Date(),
}

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

export async function createSalesPerson(
  args: CreateSalesPersonArgs,
  deps: CreateSalesPersonDeps = defaultDeps,
): Promise<CreateSalesPersonResult> {
  const user = deps.users.find((u) => u.id === args.createdBy)
  if (!user) return { ok: false, reason: 'unknown-user' }
  if (!canPerform(user, 'sales-rep:create')) {
    return { ok: false, reason: 'permission' }
  }

  if (!ID_PATTERN.test(args.id)) {
    return { ok: false, reason: 'invalid-id-format' }
  }
  if (deps.salesTeam.some((s) => s.id === args.id)) {
    return { ok: false, reason: 'duplicate-id' }
  }

  if (typeof args.name !== 'string' || args.name.trim() === '') {
    return { ok: false, reason: 'missing-name' }
  }
  if (typeof args.email !== 'string' || !EMAIL_PATTERN.test(args.email)) {
    return { ok: false, reason: 'invalid-email' }
  }

  if (
    !Array.isArray(args.territories) ||
    args.territories.length === 0 ||
    args.territories.some((t) => typeof t !== 'string' || t.trim() === '')
  ) {
    return { ok: false, reason: 'invalid-territories' }
  }

  if (
    !Array.isArray(args.programmes) ||
    args.programmes.length === 0 ||
    args.programmes.some((p) => !VALID_PROGRAMMES.includes(p))
  ) {
    return { ok: false, reason: 'invalid-programmes' }
  }

  if (typeof args.joinedDate !== 'string' || !isIsoDateOnly(args.joinedDate)) {
    return { ok: false, reason: 'invalid-joined-date' }
  }

  const salesPerson: SalesPerson = {
    id: args.id,
    name: args.name.trim(),
    email: args.email.trim(),
    phone: args.phone ?? null,
    territories: args.territories.map((t) => t.trim()),
    programmes: args.programmes,
    active: true,
    joinedDate: args.joinedDate,
  }

  await deps.enqueue({
    queuedBy: args.createdBy,
    entity: 'salesTeam',
    operation: 'create',
    payload: salesPerson as unknown as Record<string, unknown>,
  })

  return { ok: true, salesPerson }
}
