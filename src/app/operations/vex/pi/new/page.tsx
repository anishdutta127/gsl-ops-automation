/*
 * /operations/vex/pi/new (Gate 2 Step 7 Surface 2).
 *
 * New VEX PI form. Mirror of gsl-mou-system/src/app/vex/pi/new/page.tsx
 * + VexPiForm.tsx with Ops's TopNav + parallel-build lock UX.
 *
 * Permission: canEditFinanceData (Finance + Admin-with-null-dept).
 * Sales / Ops / Leadership cannot reach this page.
 *
 * Parallel-build lock: when isPiParallelBuildLocked() returns true,
 * the form is hidden and an amber banner with the brief-verbatim
 * copy renders in its place. Default ON; production unlock via
 * PI_PARALLEL_BUILD_LOCK=false. Same UX as /mous/[mouId]/pi.
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Info } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth/session'
import { canEditFinanceData } from '@/lib/access'
import { TopNav } from '@/components/ops/TopNav'
import { PageHeader } from '@/components/ops/PageHeader'
import {
  isPiParallelBuildLocked,
  parallelBuildLockMessage,
} from '@/lib/pi/parallelBuildLock'
import { vexProductRepo } from '@/lib/db/repos/vexProduct'
import { company } from '@/lib/mouSystem/company'
import { VexPiForm } from './VexPiForm'

export default async function NewVexPiPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Foperations%2Fvex%2Fpi%2Fnew')
  if (!canEditFinanceData(user)) {
    redirect('/operations/vex?notice=vex-pi-finance-only')
  }

  const parallelBuildLocked = isPiParallelBuildLocked()
  const vexProducts = await vexProductRepo.findAll()
  const activeProducts = vexProducts.filter((p) => p.active)

  return (
    <>
      <TopNav currentPath="/operations" />
      <main id="main-content">
        <PageHeader
          title="New VEX PI"
          subtitle="Pick a GST entity, fill the school billing details, list products and quantities. The system mints the next PI number for that GSTIN and saves the PI in Generated state."
          breadcrumb={[
            { label: 'Operations', href: '/operations' },
            { label: 'VEX', href: '/operations/vex' },
            { label: 'New PI' },
          ]}
        />
        <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          <div>
            <Link
              href="/operations/vex"
              className="text-sm text-muted-foreground hover:text-brand-navy"
            >
              Back to VEX orders
            </Link>
          </div>

          {parallelBuildLocked ? (
            <div
              role="status"
              data-testid="vex-pi-parallel-build-banner"
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <Info aria-hidden className="size-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">
                  Locked during parallel-build window
                </p>
                <p className="mt-1">{parallelBuildLockMessage()}</p>
              </div>
            </div>
          ) : (
            <VexPiForm
              products={activeProducts}
              defaultEntityKey={company.vexDefaultEntity}
              userName={user.name}
            />
          )}
        </div>
      </main>
    </>
  )
}
