/*
 * PI counter monotonicity helper (Phase C5a-2 / Q-G observability).
 *
 * Parses PI numbers from each `pi-sent` Communication record and
 * verifies the sequence is strictly increasing in queue-time order.
 * The PI number convention is `<prefix>/<fiscalYear>/<seq>` (e.g.,
 * `GSL/OPS/26-27/0001`). The helper extracts the trailing seq integer
 * and walks the queuedAt-sorted communications confirming each seq
 * is greater than the previous.
 *
 * Gaps (e.g., 0001 -> 0005) are NOT failures; only duplicate or
 * non-increasing sequences trip the monotonicity flag. Records whose
 * subject/body cannot be parsed for a PI number are skipped (they
 * may have been auto-generated without a number; reviewers see the
 * skip-count in the result).
 */

import type { Communication } from '@/lib/types'

export interface MonotonicityResult {
  ok: boolean
  issuedCount: number          // number of pi-sent comms with a parseable seq
  skippedCount: number         // pi-sent comms whose seq could not be parsed
  highestSeq: number | null    // max parsed seq, null if none
  firstViolation: {
    previousSeq: number
    currentSeq: number
    communicationId: string
  } | null
}

const PI_NUMBER_PATTERN = /\/(\d{4,})\b/

function extractSeq(communication: Communication): number | null {
  const candidates: string[] = []
  if (communication.subject) candidates.push(communication.subject)
  if (communication.bodyEmail) candidates.push(communication.bodyEmail)
  if (communication.bodyWhatsApp) candidates.push(communication.bodyWhatsApp)
  for (const text of candidates) {
    const match = PI_NUMBER_PATTERN.exec(text)
    if (match && match[1]) {
      const n = Number(match[1])
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

export function checkMonotonicity(
  communications: Communication[],
): MonotonicityResult {
  const piComms = communications
    .filter((c) => c.type === 'pi-sent')
    .slice()
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))

  let issuedCount = 0
  let skippedCount = 0
  let highestSeq: number | null = null
  let firstViolation: MonotonicityResult['firstViolation'] = null
  let previousSeq: number | null = null

  for (const comm of piComms) {
    const seq = extractSeq(comm)
    if (seq === null) {
      skippedCount += 1
      continue
    }
    issuedCount += 1
    if (highestSeq === null || seq > highestSeq) highestSeq = seq
    if (previousSeq !== null && seq <= previousSeq && firstViolation === null) {
      firstViolation = {
        previousSeq,
        currentSeq: seq,
        communicationId: comm.id,
      }
    }
    previousSeq = seq
  }

  return {
    ok: firstViolation === null,
    issuedCount,
    skippedCount,
    highestSeq,
    firstViolation,
  }
}
