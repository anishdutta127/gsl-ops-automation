/*
 * Fy2627ImportMeta type + loader (Gate 4.7 Step 1).
 *
 * Typed read of src/data/_imports/fy2627/_meta.json so the admin
 * surface gets type-safety on the import result without importing
 * the JSON via the build-time module system (the import dir is
 * intentionally NOT a registered alias; data lives outside the
 * canonical `src/data/*.json` namespace).
 */

import fs from 'node:fs'
import path from 'node:path'

export interface Fy2627Count {
  inserted: number
  updated: number
  unchanged: number
}

export interface Fy2627ErrorRow {
  stage: string
  row: number
  school?: string
  message: string
}

export interface Fy2627WarningRow {
  stage: string
  row: number
  school?: string
  message: string
}

export interface Fy2627SalesRep {
  id: string
  name: string
}

export interface Fy2627SchoolEntry {
  id: string
  name: string
  source?: string
}

export interface Fy2627Gap {
  stage: string
  row?: number
  school?: string
  dcNumber?: string
  message?: string
}

export interface Fy2627ImportMeta {
  runStartedAt: string
  runFinishedAt?: string
  dryRun: boolean
  strict: boolean
  sources: Record<string, unknown>
  counts: {
    mous: Fy2627Count
    schools: Fy2627Count
    salesTeam: Fy2627Count
    payments: Fy2627Count
    kitDispatches: Fy2627Count
    inventoryItems: Fy2627Count
  }
  skipped: unknown[]
  errors: Fy2627ErrorRow[]
  warnings: Fy2627WarningRow[]
  chainMouCandidates: unknown[]
  crossValidationGaps: Fy2627Gap[]
  autoCreatedSalesReps: Fy2627SalesRep[]
  autoCreatedSchools: Fy2627SchoolEntry[]
}

export function loadFy2627Meta(cwd: string = process.cwd()): Fy2627ImportMeta | null {
  const p = path.join(cwd, 'src/data/_imports/fy2627/_meta.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Fy2627ImportMeta
  } catch {
    return null
  }
}
