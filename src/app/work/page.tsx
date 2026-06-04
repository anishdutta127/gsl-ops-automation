/*
 * /work - Step 3 role-router. Sends each user to their daily priority
 * board by department: finance -> /work/finance, ops -> /work/ops,
 * everyone else (cross-functional Admin / Leadership, null department)
 * -> /work/admin oversight. New roles (Program/Sales) can be added later
 * as a new branch here without touching the existing boards.
 */

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getDepartment } from '@/lib/access'

export default async function WorkIndexPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=%2Fwork')
  const dept = getDepartment(user)
  if (dept === 'finance') redirect('/work/finance')
  if (dept === 'ops') redirect('/work/ops')
  redirect('/work/admin')
}
