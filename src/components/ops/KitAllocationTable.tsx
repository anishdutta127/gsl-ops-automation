/*
 * KitAllocationTable (W4-I.4 MM3).
 *
 * Renders Misba's ticketing-derived kit allocation row for a single
 * MOU. Columns: School Name | Address | SPOC Name | Contact Number |
 * Grade 1..10 | Rechargeable Batteries.
 *
 * Source-of-truth resolution:
 *   - School name + address: from the School record.
 *   - SPOC name + phone: prefer IntakeRecord's SPOC fields (school
 *     confirmed at intake); fall back to School.contactPerson + .phone
 *     when no intake exists yet.
 *   - Per-grade counts + batteries: only present when intake has been
 *     backfilled with gradeBreakdown / rechargeableBatteries via
 *     /mous/[id]/intake/edit. Empty grades render as a dash.
 *
 * The component is intentionally small + presentational; the dispatch
 * page composes it alongside an edit-link + CSV download button.
 */

import type { IntakeRecord, School } from '@/lib/types'

const GRADES = Array.from({ length: 10 }, (_, i) => i + 1)

export interface KitAllocationTableProps {
  school: School | null
  schoolName: string
  intake: IntakeRecord | null
}

function formatAddress(school: School | null): string {
  if (!school) return ''
  const parts = [school.city, school.state]
  if (school.pinCode) parts.push(school.pinCode)
  return parts.filter((p) => p && p !== '').join(', ')
}

function spocNameFor(school: School | null, intake: IntakeRecord | null): string {
  if (intake?.schoolPointOfContactName) return intake.schoolPointOfContactName
  return school?.contactPerson ?? ''
}

function spocPhoneFor(school: School | null, intake: IntakeRecord | null): string {
  if (intake?.schoolPointOfContactPhone) return intake.schoolPointOfContactPhone
  return school?.phone ?? ''
}

function gradeCountFor(intake: IntakeRecord | null, grade: number): string {
  const row = intake?.gradeBreakdown?.find((g) => g.grade === grade)
  return row ? String(row.students) : '-'
}

function batteriesFor(intake: IntakeRecord | null): string {
  if (intake?.rechargeableBatteries === null || intake?.rechargeableBatteries === undefined) {
    return '-'
  }
  return String(intake.rechargeableBatteries)
}

export function KitAllocationTable({ school, schoolName, intake }: KitAllocationTableProps) {
  const address = formatAddress(school)
  const spocName = spocNameFor(school, intake)
  const spocPhone = spocPhoneFor(school, intake)

  return (
    <div className="overflow-x-auto" data-testid="kit-allocation-table">
      <table className="w-full min-w-[1000px] border-collapse text-xs">
        <caption className="sr-only">Kit allocation for {schoolName}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-brand-navy">
            <th scope="col" className="px-2 py-2 font-semibold">School Name</th>
            <th scope="col" className="px-2 py-2 font-semibold">Address</th>
            <th scope="col" className="px-2 py-2 font-semibold">SPOC Name</th>
            <th scope="col" className="px-2 py-2 font-semibold">Contact Number</th>
            {GRADES.map((g) => (
              <th key={g} scope="col" className="px-2 py-2 text-right font-semibold">G{g}</th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-semibold">Batteries</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border align-top">
            <td className="px-2 py-2 font-medium">{school?.name ?? schoolName}</td>
            <td className="px-2 py-2 text-muted-foreground">{address || <span className="text-muted-foreground">-</span>}</td>
            <td className="px-2 py-2">{spocName || <span className="text-muted-foreground">-</span>}</td>
            <td className="px-2 py-2 font-mono">{spocPhone || <span className="text-muted-foreground">-</span>}</td>
            {GRADES.map((g) => (
              <td key={g} className="px-2 py-2 text-right tabular-nums" data-testid={`kit-grade-${g}`}>
                {gradeCountFor(intake, g)}
              </td>
            ))}
            <td className="px-2 py-2 text-right tabular-nums" data-testid="kit-batteries">
              {batteriesFor(intake)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
