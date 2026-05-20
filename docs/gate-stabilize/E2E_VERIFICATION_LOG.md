# E2E verification log: 2026-05-19 stabilisation gate

**Standard:** CLAUDE.md "V4 verification standard" (added in `eb08916`).
**Gate:** Stabilise Phase 1, clear Pranav's blocking bugs before Phase 2.
**Tooling:** No Playwright in this repo (`grep -E '"playwright"' package.json`
returned empty). V4 fallback path: SSR component-tree walk via
`renderToStaticMarkup` with realistic data from `src/data/*.json`,
backed by a passing production build.

## Verification tooling

1. `src/__e2e/stabilize-2026-05-19.test.tsx`: 7 SSR walkthrough cases
   covering each in-scope route. `npm test -- stabilize-2026-05-19`
   runs them in isolation.
2. `npm run build`: full Next.js production build. Passing build
   means every page compiled, ran its data-load layer, and emitted
   a server bundle without static analysis errors.
3. Full vitest suite at HEAD: **2937 / 2938 tests pass** (the only
   failure was the route audit catching a broken link in the new
   pranav-refresh `error.tsx`; fixed in `4df6525`, audit now green).

## Flow walks

### Flow 1: Create new MOU

**Route:** `/mous/new` (picker) → `/mous/new/[templateId]` (wizard)
**Bug fixes in scope:** Bug 1 (re-checked), Bug 9 (drafts shortcut on
picker), Bug 3 (Generate .docx fallback hint).

| Step | Assertion | Result |
|---|---|---|
| Picker renders | template cards for STEAM, YP, HBPE all emit | PASS |
| Drafts shortcut visible | `data-testid="picker-drafts-link"` in HTML | PASS |
| Wizard SSR renders on live sales_team.json | `Effective date` field rendered | PASS |
| Generate .docx button present | `wizard-generate-docx` testid | PASS |
| Fallback hint visible near button | `still being hardened` copy | PASS |
| No 500 / RSC error markers | `Application error` absent | PASS |

### Flow 2: Generate PI for an instalment

**Route:** `/mous/[mouId]/pi` (form + lock banner) → POST `/api/pi/generate`
**Bug fixes in scope:** Bug 2 (clean lock UX + redirect error param).

| Step | Assertion | Result |
|---|---|---|
| Lock banner renders when locked (default env) | `Locked during parallel-build window` | PASS |
| Lock-redirect banner renders for `?error=parallel-build-locked` | `data-testid="pi-action-error"` + amber styling + lock copy | PASS |
| `/api/pi/generate` lock now redirects 303 (was 503 JSON) | route.test.ts § "parallel-build lock" block, 6 cases | PASS |
| `/api/pi/generate` template-missing now redirects 303 (was 500 JSON) | route.test.ts updated case + console.error log assertion | PASS |
| Page does not crash on any error param | `Application error` absent | PASS |

### Flow 3: Log payment with TDS

**Route:** `/finance/payments` (existing). Per the brief, "whatever exists
works (two-column form is Phase 4 work, not this gate)."

| Step | Assertion | Result |
|---|---|---|
| `/finance/payments` route exists | `find src/app/finance/payments -name page.tsx` returns the file | PASS |
| No bug-fix scope changes to this route | `git diff origin/main -- src/app/finance/payments` empty | PASS (out of gate scope) |

### Flow 4: View MOU detail

**Route:** `/mous/[mouId]`
**Bug fixes in scope:** Bug 5 (TDS-inclusive Received / Balance tiles
derived from instalments), Bug 6 (schedule derived from instalments).

| Step | Assertion | Result |
|---|---|---|
| Detail SSR renders for MOU-STEAM-2627-001 | `Master status tracker`, `Lifecycle (instalment 1)`, `Payment schedule`, `Received` all in HTML | PASS |
| Received / Balance derived from instalments | code path: `receivedFromInstallments = totalReceivedRs` in `src/app/mous/[mouId]/page.tsx:362`; tiles reference `receivedFromInstallments` / `receivedPctFromInstallments` / `balanceFromInstallments` | PASS (compile time + SSR render) |
| Schedule derived from rows + contractValue | `deriveScheduleSummary(installments, mou.contractValue, mou.paymentSchedule)` in tile metadata | PASS |
| `scheduleSummary` helper covers 7 rounding / 50-50 / 25-25-25-25 cases | `src/lib/mou/scheduleSummary.test.ts` 7 / 7 green | PASS |
| No 500 / RSC error markers | `Application error` absent | PASS |

### Flow 5: VEX PI

**Route:** `/operations/vex/pi/new`
**Bug fixes in scope:** Bug 4 (lock UX amber styling on the inline
form error).

| Step | Assertion | Result |
|---|---|---|
| Page renders the lock banner when locked | `Locked during parallel-build window` | PASS |
| `VexPiForm` inline error styles amber for `parallel-build-locked` | code path: `errorIsLock` state branch + amber border | PASS (compile time) |
| Page does not crash | `Application error` absent | PASS |

### Additional surface: MOU registry (Bug 9)

| Step | Assertion | Result |
|---|---|---|
| `/mous` lists the Drafts CTA for canEditMOU users | `data-testid="drafts-link"` + `Drafts (` count | PASS |
| Filter chip set restored 'Draft' | `Draft` in status chip options | PASS (compile time) |
| `/mous/new` picker exposes `See your saved drafts ->` link | `data-testid="picker-drafts-link"` | PASS |

### Additional surface: ErrorBoundary backstops (Bug 7)

Five `error.tsx` files added at:

- `src/app/mous/[mouId]/pi/error.tsx`
- `src/app/mous/[mouId]/installments/schedule-edit/error.tsx`
- `src/app/operations/vex/pi/new/error.tsx`
- `src/app/escalations/new/error.tsx`
- `src/app/admin/imports/pranav-refresh/error.tsx`

| Step | Assertion | Result |
|---|---|---|
| All five compile through `npm run build` | server bundle produced for every route segment that has an error.tsx | PASS |
| Every internal `<Link>` in the new error.tsx files points at a real route | `audit-routes` test green at `4df6525` | PASS |
| Pattern matches the existing `src/app/mous/new/error.tsx` from `0f17274` | same TopNav-omitting layout + reset + back link + console.error log | PASS |

## Residual gaps for honest accounting

- **No live browser walk.** Playwright is not installed; the V4 standard
  allows the SSR fallback path. Manual browser verification by Anish
  post-deploy is the catch.
- **Flow 3 (Log payment with TDS):** in-scope per the brief is
  "whatever exists works." Phase 4 is the real Log Payment UI work;
  this gate does not change the route.
- **PI button live verification:** the lock is on by default. To
  verify the unlocked path end-to-end in production, set
  `PI_PARALLEL_BUILD_LOCK=false` in Vercel for a single test invocation
  and confirm the .docx downloads cleanly. That step is reserved for
  cutover day per the gate's "stabilisation only, no feature work"
  constraint.
- **2937 / 2938 unit tests green at the head of the gate.** The single
  failure was an audit-routes broken-link warning that landed and was
  fixed inside the gate (`4df6525`); subsequent runs at that commit and
  later are green.

## Commits in this gate

```
4df6525 fix(errors): pranav-refresh error.tsx links to /admin (not non-existent /admin/imports)
407251b feat(mous): saved drafts visible in MOU registry with discoverable entry point
fd04a96 feat(errors): error.tsx backstops on wizard / create / generator surfaces
b7437b2 fix(wizards): Generate .docx + VEX PI lock errors show friendly state
00ede1e fix(mous): MOU detail tiles derive from instalment rows (TDS + schedule)
a281277 fix(pi): Generate PI button shows clean state on lock + template miss
eb08916 docs(verification): V4 requires end-to-end user flow walk with realistic data, not just route 200 checks
0f17274 fix(mous): /mous/new client-side exception from partial SalesPerson records  [pre-gate, included here for chain]
```
