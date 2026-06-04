/*
 * Step 3 repos: welcome_notes + recce_reports.
 *
 * New Step 3 entities (Welcome Note tracking + Recce reports). Production
 * is postgres, so these are postgres-direct CRUD. In json mode (local dev)
 * reads return [] and writes are no-ops - there is no JSON seed for these
 * net-new tables, and the dashboards degrade gracefully (welcome-pending
 * counts everything, recce list empty).
 */

import type { AuditEntry, RecceReport, WelcomeNote } from '@/lib/types'
import { currentBackend } from '../backend'
import { getSql } from '../client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function isPg(): boolean { return currentBackend() === 'postgres' }
function iso(v: unknown): string | null {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' ? v : null
}

function rowToWelcome(r: Row): WelcomeNote {
  return {
    mouId: r.mou_id,
    schoolId: r.school_id ?? null,
    noteText: r.note_text ?? '',
    status: r.status === 'sent' ? 'sent' : 'pending',
    sentAt: iso(r.sent_at),
    sentBy: r.sent_by ?? null,
    updatedAt: iso(r.updated_at),
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  }
}

export const welcomeNoteRepo = {
  async findAll(): Promise<WelcomeNote[]> {
    if (!isPg()) return []
    const rows = await getSql()<Row[]>`SELECT * FROM welcome_notes`
    return rows.map(rowToWelcome)
  },
  async findByMouId(mouId: string): Promise<WelcomeNote | null> {
    if (!isPg()) return null
    const rows = await getSql()<Row[]>`SELECT * FROM welcome_notes WHERE mou_id = ${mouId}`
    return rows[0] ? rowToWelcome(rows[0]) : null
  },
  /** Insert or update the draft note for an MOU (does not change status). */
  async saveDraft(args: { mouId: string; schoolId: string | null; noteText: string; audit: AuditEntry }): Promise<void> {
    if (!isPg()) return
    const sql = getSql()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO welcome_notes (mou_id, school_id, note_text, status, updated_at, audit_log)
      VALUES (${args.mouId}, ${args.schoolId}, ${args.noteText}, 'pending', ${now}, ${sql.json([args.audit] as never)}::jsonb)
      ON CONFLICT (mou_id) DO UPDATE SET
        note_text = EXCLUDED.note_text,
        school_id = EXCLUDED.school_id,
        updated_at = EXCLUDED.updated_at,
        audit_log = welcome_notes.audit_log || ${sql.json([args.audit] as never)}::jsonb
    `
  },
  /** Mark the note sent (creating the row if Ops sends without editing first). */
  async markSent(args: { mouId: string; schoolId: string | null; noteText: string; sentBy: string; audit: AuditEntry }): Promise<void> {
    if (!isPg()) return
    const sql = getSql()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO welcome_notes (mou_id, school_id, note_text, status, sent_at, sent_by, updated_at, audit_log)
      VALUES (${args.mouId}, ${args.schoolId}, ${args.noteText}, 'sent', ${now}, ${args.sentBy}, ${now}, ${sql.json([args.audit] as never)}::jsonb)
      ON CONFLICT (mou_id) DO UPDATE SET
        status = 'sent', sent_at = ${now}, sent_by = ${args.sentBy},
        note_text = EXCLUDED.note_text, updated_at = ${now},
        audit_log = welcome_notes.audit_log || ${sql.json([args.audit] as never)}::jsonb
    `
  },
}

function rowToRecce(r: Row): RecceReport {
  return {
    id: r.id,
    schoolId: r.school_id,
    mouId: r.mou_id ?? null,
    requirements: r.requirements ?? '',
    status: r.status === 'draft' ? 'draft' : 'recorded',
    createdBy: r.created_by ?? null,
    createdAt: iso(r.created_at),
    auditLog: Array.isArray(r.audit_log) ? r.audit_log : [],
  }
}

export const recceReportRepo = {
  async findAll(): Promise<RecceReport[]> {
    if (!isPg()) return []
    const rows = await getSql()<Row[]>`SELECT * FROM recce_reports ORDER BY created_at DESC NULLS LAST, id`
    return rows.map(rowToRecce)
  },
  async findBySchoolId(schoolId: string): Promise<RecceReport[]> {
    if (!isPg()) return []
    const rows = await getSql()<Row[]>`SELECT * FROM recce_reports WHERE school_id = ${schoolId} ORDER BY created_at DESC NULLS LAST`
    return rows.map(rowToRecce)
  },
  async create(r: RecceReport): Promise<void> {
    if (!isPg()) return
    const sql = getSql()
    await sql`
      INSERT INTO recce_reports (id, school_id, mou_id, requirements, status, created_by, created_at, audit_log)
      VALUES (${r.id}, ${r.schoolId}, ${r.mouId}, ${r.requirements}, ${r.status}, ${r.createdBy}, ${r.createdAt}, ${sql.json((r.auditLog ?? []) as never)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  },
}
