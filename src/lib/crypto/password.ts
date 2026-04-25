/*
 * bcrypt password hashing for staff users.
 *
 * Cost factor: 12 (2026 industry standard for interactive apps).
 * bcryptjs is a pure-JS implementation so it works in the Node runtime
 * without native dependencies (matters for Vercel deployment + Windows
 * dev boxes).
 *
 * Forked verbatim from gsl-hr-system commit a4a5b18.
 */

import bcrypt from 'bcryptjs'

const COST = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}
