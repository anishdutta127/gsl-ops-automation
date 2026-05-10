# Step 5 — Pending questions for main CC

Questions surfaced during the 7-route MOU UI build. Each item lists where
to find the call-site, the alternatives considered, what was decided, and
the confidence level. None are blockers — but these are the places where
gsl-mou-system did not give an unambiguous answer and main CC may want
to land a different decision before V1-V7.

## Q1: Type tangle — Ops MOU type lacks draft fields
- Route: `src/lib/types.ts:430` (Ops MOU interface) vs `src/lib/mouSystem/types.ts:117` (mouSystem MOU)
- Question: gsl-mou-system's `MOU` type carries `draftVariables`, `paymentSchedules`, `yearlyPricing`, `billingBlock`, `salesChannel`, `schoolCrmId`, `effectiveDate`, `numberOfYears`, `signedMouPdfPath` — Ops's `MOU` type does not. The brief asks the new drafting + annexure routes to consume `src/data/mous.json` (Ops's primary store), so saved drafts must round-trip through both shapes.
- Alternatives considered:
  - **A) Extend Ops's MOU interface with optional fields** matching the mouSystem extras. Existing 143 records get `undefined` for these fields; type system tolerates it because the fields are optional. (Chosen.)
  - **B) Cast at the read/write boundary** with `as unknown as MouSystemMou`. Avoids type-system additions but pushes cost into every call-site. Rejected: more places to remember to cast, easier to accidentally drop fields on a re-write.
  - **C) Park drafts in a separate file** like `src/data/mou_drafts.json`. Clean separation but means the /mous list and detail must JOIN two files, and the brief is explicit about consuming `mous.json` for the new routes.
- Decided: A. Single optional-field extension in `src/lib/types.ts`. Backwards-compatible; the existing Ops list/detail page does not read the new fields and therefore is unaffected.
- Confidence: high

## Q2: Autosave cadence — gsl-mou-system has no documented autosave
- Route: `src/app/mous/new/page.tsx`, `src/app/mous/[mouId]/draft/page.tsx`
- Question: The brief says "preserve gsl-mou-system's autosave cadence; do not invent." But `GeneratorWizard.tsx` only persists state when the user clicks "Save draft" — there is no autosave timer. The annexure free-text field also doesn't autosave. There IS an autosave-style flow in Ops (`StatusNotesSection`'s 600ms-on-blur), but that's an Ops invention, not inherited.
- Alternatives considered:
  - **A) Save-on-click only** (faithful to gsl-mou-system). Pranav's muscle memory is "click Save draft when ready", not "type and forget".
  - **B) On-blur autosave** with a status indicator. More forgiving but invents UX.
  - **C) Periodic autosave every 30s** for typed-in fields. Invents UX and can race with manual saves.
- Decided: A — explicit Save draft button matches gsl-mou-system. Sessionstorage backup on every keystroke + recovery prompt on mount preserves the "didn't lose work on accidental tab close" promise without inventing a new autosave cadence the user has to learn.
- Confidence: medium — please confirm before V1.

## Q3: PI counter — should re-wired Ops PI page advance the per-entity counter, or the legacy single counter?
- Route: `src/app/mous/[mouId]/pi/page.tsx`, `src/app/api/pi/generate/route.ts`
- Question: The brief asks the body of /mous/[mouId]/pi to call `mouSystem/pi.ts composePi` + `piCounterAtomic.issuePiNumberAtomic(entityKey)`. The existing `lib/pi/generatePi.ts` calls the SINGLE-counter `issuePiNumberAtomic` from `lib/githubQueue.ts` and writes a Payment record + audit. Re-wiring requires either editing the existing `generatePi.ts` to swap counters OR creating a new generator and routing the form to it.
- Alternatives considered:
  - **A) Edit `lib/pi/generatePi.ts` in place** to switch counter source. Lowest churn; the form action stays `/api/pi/generate`; no new route handler. (Chosen.)
  - **B) Add a separate `lib/pi/generatePiV2.ts` + `/api/pi/generate-v2` route. Both flows in parallel until cutover. Heavier; the v1 path becomes orphaned the moment v2 ships.
  - **C) Leave the body alone and only change the page intro copy. Defers the actual rewire.
- Decided: A. The route handler keeps streaming the .docx; the counter source flips to per-entity (mouSystem `piCounterAtomic`); the rendered DOCX now uses the per-entity GSTIN address derived from `getEntityForProgramme(mou.programme)` so the PI carries the correct MAF Technologies entity.
- Confidence: medium — main CC may want to keep both flows alive during the parallel-build window. If so, swap to B.

## Q4: Should /mous/[id]/installments edit affordances be inline, or open a sheet?
- Route: `src/app/mous/[mouId]/installments/page.tsx`
- Question: gsl-mou-system's `InstallmentsPanel` opens an inline collapsible row beneath the actions cell — same row, same width. Each instalment can have one open editor at a time.
- Alternatives considered:
  - **A) Inline collapse** matching gsl-mou-system exactly. (Chosen.)
  - B) Right-side sheet / dialog. Cleaner on mobile but invents UX.
- Decided: A. Pranav's muscle memory says inline.
- Confidence: high

## Q5: Save Draft writer — do we need a new route, or can we reuse mouSystem's `/api/generator/save-draft`?
- Route: `src/app/api/mou/save-draft/route.ts` (new) vs gsl-mou-system's `/api/generator/save-draft`
- Question: gsl-mou-system's `saveDraftMou` writes to `MOUS_PATH = 'src/data/mous.json'` directly through the GitHub Contents API. Importing the function into Ops works (the path is the same in Ops's repo). The question is whether to add a new Ops API route that the wizard POSTs to, or to literally reuse the gsl-mou-system function.
- Alternatives considered:
  - **A) New Ops route `/api/mou/save-draft`** that calls `mouSystem/entityWriters.saveDraftMou`. Keeps the Ops API surface coherent; Pranav's button POSTs to an Ops URL, not a mou-system one. (Chosen.)
  - B) Reuse the mou-system endpoint URL pattern. Means depending on the gsl-mou-system process for writes during the parallel-build window.
- Decided: A. New `/api/mou/save-draft` route in Ops; thin wrapper calls `saveDraftMou` from `src/lib/mouSystem/entityWriters.ts`. Routes through Ops's session cookie (not gsl-mou-system's identity store).
- Confidence: high

## Q6: Annexure editor — recovery from sessionStorage — what's the prompt copy?
- Route: `src/app/mous/[mouId]/draft/page.tsx`
- Question: gsl-mou-system has no draft-recovery feature (the brief asks us to add it). What copy does Pranav see?
- Alternatives considered:
  - A) Modal blocking "We saved a draft of this annexure 12 minutes ago. Restore?" — Restore / Discard.
  - **B) Inline banner above the editor** with two buttons. Less disruptive, lets Pranav scan the page first. (Chosen.)
- Decided: B. Inline banner: "We saved an unsent draft of this annexure {relative-time}. [Restore] [Discard]". Banner dismisses on either action. SessionStorage key is `mou-draft-{mouId}`; values are flushed on successful save and on Discard.
- Confidence: medium

## Q8: PI success toast vs binary download response
- Route: `src/app/mous/[mouId]/pi/page.tsx`, `src/app/api/pi/generate/route.ts`
- Question: The brief says the PI flow should toast "PI generated. Counter advanced; download starting." The current Ops `/api/pi/generate` route streams the .docx with `Content-Disposition: attachment` (200 response, not a redirect), so the page is replaced by a binary stream that the browser saves. There is no back-navigation moment in which to render a toast.
- Alternatives considered:
  - **A) Leave the binary-download response untouched.** Pranav's muscle memory is "click Generate, file downloads"; adding a toast would invent UX. (Chosen.)
  - B) Switch the API to return JSON `{ piNumber, downloadUrl }` then redirect back with `?notice=pi-generated`. More work, two requests instead of one, breaks the current observed flow.
  - C) Keep the binary response but render a "click again to see the success message" link. Confusing.
- Decided: A. The spec toast is documented but not rendered; the toast string lives in `NOTICE_COPY` for future use if the API shape changes. No regression to existing UX.
- Confidence: medium — main CC may want B if toaster confirmation is a regression-test target.

## Q7: Recalc preview card — should it appear when MOU is Draft, or only when Active?
- Route: `src/app/mous/[mouId]/page.tsx` (extend)
- Question: gsl-mou-system's `RecalcSummary` renders when `mouPayments.length > 0 && mou.spWithTax > 0`. For a Draft MOU there are no payments yet, so it won't render — but the question is whether we should pre-render a forecast for a draft.
- Alternatives considered:
  - **A) Same gate as gsl-mou-system** (require mouPayments.length > 0). Drafts show no recalc; Pranav already expects this. (Chosen.)
  - B) Pre-compute from `paymentSchedules` even when no Payment rows exist. Cleaner forecast but invents UX.
- Decided: A.
- Confidence: high
