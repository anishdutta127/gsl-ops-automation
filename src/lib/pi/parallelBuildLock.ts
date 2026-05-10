/*
 * Gate 2 parallel-build PI generation lock.
 *
 * The Step 5 PI re-wire flips Ops's PI generator to consume the
 * per-entity counter at `src/data/pi_counter_map.json`. That file is
 * also the cutover-ready snapshot of mou-system's counter. Until Gate
 * 5 cutover, any PI generation from Ops would advance that counter
 * and the next legitimate PI issued from gsl-mou-system would
 * collide.
 *
 * This module centralises the lock check + lock copy so the API route
 * and the /mous/[id]/pi page agree on the state. Default: locked.
 * Cutover-day flip: set `PI_PARALLEL_BUILD_LOCK=false` in Vercel env
 * (or unset and re-deploy) and the route + UI go live.
 */

const LOCK_COPY =
  'PI generation is locked during the parallel-build window. Pranav continues issuing PIs from gsl-mou-system. This route activates at Gate 5 cutover.'

/**
 * Returns true when PI generation is gated by the parallel-build
 * lock. Default true: a missing or empty env var fails CLOSED so an
 * accidental redeploy never collides on the counter. Production
 * unlock is `PI_PARALLEL_BUILD_LOCK=false`.
 */
export function isPiParallelBuildLocked(): boolean {
  const raw = process.env.PI_PARALLEL_BUILD_LOCK
  if (raw === undefined || raw === '') return true
  return raw.toLowerCase() !== 'false'
}

export function parallelBuildLockMessage(): string {
  return LOCK_COPY
}
