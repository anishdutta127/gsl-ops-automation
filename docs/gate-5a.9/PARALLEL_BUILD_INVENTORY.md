# PARALLEL_BUILD_INVENTORY.md
Gate 5A.9 Phase A - Step 4

## Scope

Every feature in gsl-ops-automation that is **intentionally disabled** behind a parallel-build flag, env var, or cutover gate. The premise: code exists, the route renders, the UI shows a lock banner, and a single env-var flip can unlock the surface at Gate 5 cutover.

This is the input for Phase B (Activate parallel features).

---

## TL;DR

There is **one** lock in the codebase: `PI_PARALLEL_BUILD_LOCK`. It gates **two** PI generation routes (per-MOU PI + VEX PI). One env-var flip (`PI_PARALLEL_BUILD_LOCK=false`) unlocks both atomically. All other Ops features are either live, deferred via BACKLOG (no env lock), or unbuilt.

---

## 1. PI generation (per-MOU instalment)

| Field | Value |
|---|---|
| **What it does** | Generates a Proforma Invoice .docx for a given instalment. Mints the next PI number from the per-entity counter in `src/data/pi_counter_map.json`, writes the PI metadata to the Payment record (piNumber, piGeneratedAt), advances `pi_counter_map.json`, downloads the docx. |
| **Lock check** | `isPiParallelBuildLocked()` in `src/lib/pi/parallelBuildLock.ts` |
| **Default** | Locked (`true` when env var is unset, empty, or any value other than `'false'`). Fails CLOSED so an accidental redeploy never collides on the counter. |
| **Unlock env var** | `PI_PARALLEL_BUILD_LOCK=false` (Vercel project setting) |
| **UI surface (locked)** | `/mous/[mouId]/pi` page renders an amber banner: "Locked during parallel-build window" + `parallelBuildLockMessage()` copy |
| **API surface (locked)** | `POST /api/pi/generate` returns 503 with `{ error: 'parallel-build-locked', message: parallelBuildLockMessage() }` |
| **What the lock protects** | gsl-mou-system still owns PI counter advancement during the parallel-build window. Pranav continues to issue PIs from gsl-mou-system. If Ops generates a PI while the MOU system also generates one, both would call the same counter and the second would collide with a duplicate number. |
| **What's required to safely unlock** | 1) Pranav signals he has stopped issuing PIs from gsl-mou-system. 2) Snapshot the counter from gsl-mou-system into `pi_counter_map.json` (already done at Gate 2; `scripts/cutover-snapshot.mjs` is the helper). 3) Verify `pi_counter_map.json` matches the next-expected PI number per GSTIN entity. 4) Flip `PI_PARALLEL_BUILD_LOCK=false` in Vercel. 5) Redeploy. 6) Generate a test PI for a non-critical MOU and confirm the docx renders correctly. |
| **Complexity to unlock** | **S** (small). Single env-var flip + one verification PI. The implementation is complete and tested. |
| **Tests** | `src/app/api/pi/generate/route.test.ts` verifies the 503 response when locked, the 200+docx when unlocked. `src/app/mous/[mouId]/pi/page.test.tsx` verifies banner visibility. |

---

## 2. VEX PI creation

| Field | Value |
|---|---|
| **What it does** | Creates a Vex Robotics PI (separate VEX line of business). Different SKU set, different counter sequence within the same per-entity counter map. Renders a PI .docx with VEX-specific line items. |
| **Lock check** | Same `isPiParallelBuildLocked()` |
| **Default** | Locked (shared default) |
| **Unlock env var** | Same `PI_PARALLEL_BUILD_LOCK=false` |
| **UI surface (locked)** | `/operations/vex/pi/new` page renders an amber banner with the brief-verbatim copy, form hidden |
| **API surface (locked)** | `POST /api/operations/vex/pi/create` returns 503 with the same `{ error: 'parallel-build-locked', message }` envelope |
| **What the lock protects** | Same as #1. VEX PI counter is part of the same `pi_counter_map.json` per-entity map; collision risk applies equally. |
| **What's required to safely unlock** | Same flip unlocks both routes atomically. No additional verification beyond the per-MOU flow. |
| **Complexity to unlock** | **S** (small). Shares the same env-var flip as #1; testing requires one extra render-and-verify cycle for the VEX template. |
| **Tests** | `src/app/api/operations/vex/pi/create/route.test.ts` verifies the 503 path. |

---

## Lock implementation details

**Centralised at:** `src/lib/pi/parallelBuildLock.ts` (35 lines).

```ts
export function isPiParallelBuildLocked(): boolean {
 const raw = process.env.PI_PARALLEL_BUILD_LOCK
 if (raw === undefined || raw === '') return true
 return raw.toLowerCase() !== 'false'
}
```

**Fail-closed default:** the function returns `true` for any unset, empty, or non-`'false'` value. This is deliberate per Gate 2 design (CLAUDE.md "Karpathy coding principles" #2 - minimum code, safe default). The cost of an unintended PI collision is high (duplicate PI numbers, potentially issued to the same school, requiring a void + reissue cycle).

**Pages that consume the lock and show a banner:**
- `src/app/mous/[mouId]/pi/page.tsx` - per-MOU PI generator
- `src/app/operations/vex/pi/new/page.tsx` - new VEX PI
- `src/app/finance/pi/pending/page.tsx` - pending PIs list (shows lock banner globally, disables per-row "Generate PI" CTA)
- `src/app/finance/pi/[paymentId]/page.tsx` - PI detail page (read-only download stays unaffected; "Reissue" CTA disables under lock)

**APIs that consume the lock:**
- `src/app/api/pi/generate/route.ts` - POST returns 503 envelope
- `src/app/api/operations/vex/pi/create/route.ts` - POST returns same 503 envelope

**Counter snapshot tooling:** `scripts/cutover-snapshot.mjs` reads gsl-mou-system's counter and produces a fresh `pi_counter_map.json` snapshot. Run on cutover day after Pranav confirms he has stopped issuing.

---

## Cutover sequence (Phase B unlock playbook)

1. **T-24h:** Pranav notified of cutover window. Confirms last gsl-mou-system PI number per GSTIN entity.
2. **T-2h:** `scripts/cutover-snapshot.mjs` run; `pi_counter_map.json` updated. Commit + push.
3. **T-1h:** Pranav stops issuing PIs from gsl-mou-system. Confirms via screenshot or message.
4. **T-0:** Vercel env var `PI_PARALLEL_BUILD_LOCK=false` set. Redeploy triggered manually (`npx vercel --prod`).
5. **T+10m:** Verify deployment. Generate a test PI for a non-critical low-value MOU (e.g., a deactivated school). Confirm PI number is the expected next-in-sequence.
6. **T+15m:** Confirm with Pranav that his next legitimate PI uses the Ops route, not gsl-mou-system.
7. **T+1h:** Sync health check + audit log review.

**Rollback:** if any issue, re-set `PI_PARALLEL_BUILD_LOCK=true` in Vercel and redeploy. The two routes return to 503; Pranav resumes issuing from gsl-mou-system. Any PI issued during the broken window must be voided via `POST /api/finance/pi/[paymentId]/void` and re-issued from gsl-mou-system.

---

## Other lock-adjacent surfaces (not env-gated)

These are deferrals or design decisions, not env-flag locks. They will not unlock at Gate 5 cutover.

| Surface | What | Why it looks like a lock | Actual status |
|---|---|---|---|
| MOU docx Generate button | `src/components/mou-system/GeneratorWizard.tsx` | Wizard renders an inline note "Generate Docx coming soon" instead of producing the file | Deferred (BACKLOG.md § ".docx Generate flow port"). Phase 1.1 work. Not env-gated. |
| PI render-only download | `src/lib/pi/generatePi.ts` | A single-path implementation that bundles render + counter advance | Deferred (BACKLOG.md § "PI generator render-only split"). Would let Finance download a previously-issued PI without counter advancement. Phase 1.1 candidate. |
| Dispatch-workflow Kanban | `/operations/kanban/page.tsx` (not yet created) | The MOU lifecycle Kanban exists at `/kanban` but a dispatch-status Kanban does not | Deferred (BACKLOG.md § "Dispatch-workflow Kanban view"). Phase 1.1 candidate. Not env-gated. |

---

## Summary

| Feature | Lock | Default | Unlock | Complexity | Tests |
|---|---|---|---|---|---|
| Per-MOU PI generation | `PI_PARALLEL_BUILD_LOCK` | Locked | env var `false` | S | Pass (503/200 covered) |
| VEX PI creation | `PI_PARALLEL_BUILD_LOCK` (shared) | Locked | Same env var | S | Pass (503 covered) |

**One env var. Two routes. One atomic cutover.** No other parallel-build locks exist in the codebase.

**Phase B input:** the cutover is operational, not engineering. The blocker is coordination with Pranav (stop time) + snapshot freshness, not code.

---

**Document generated:** 2026-05-18
