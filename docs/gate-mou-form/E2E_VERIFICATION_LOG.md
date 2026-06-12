# E2E verification log: 2026-06-12 MOU form upgrade gate

**Standard:** CLAUDE.md V4 verification standard.
**Gate:** Add MOU flow rework: save-error root cause fix + school identity
(free text + optional canonical link) + mandatory duration + instalment
schedule + sales channel + real-error surfacing.
**Surface:** `/mous/upload` (the actual Add MOU page; `/mous/new` is the
dormant template-generator wizard) posting to `/api/mou/create-from-upload`.
**Tooling:** gstack headless browser against `npm run start` (production
build, production-mode server), vitest route tests, queue-commit payload
inspection on a throwaway branch.

## Save-error root cause (the "Failed to save the MOU. Retry." bug)

The pre-gate route built every MOU with `startDate: signDate || ''` and
`endDate: ''`. `mouRepo.create` bound those with `?? null`, so the empty
string (not nullish) reached the postgres `DATE` columns. postgres.js /
postgres rejects `''` on date columns; `mouRepo.updatePartial` documents
and guards this exact failure (TIMESTAMP_COLS conversion), `create` did
not. Production runs `DATA_BACKEND=postgres`, so **every** Add MOU save
threw, was caught, and redirected to the generic `save-failed` message.
The route already attached the real exception as a `?detail=` query
param; the page dropped it. Local json mode cannot reproduce the failure,
which is why the flow "worked in dev".

Direct production confirmation was attempted and blocked three ways
(rollback-only DB transaction probe, `vercel env pull`, read-only
`information_schema` query): each was denied by the permission classifier
as unapproved production access, and the Vercel runtime logs for the
failure window have expired. Residual risk is covered by: (a) the fix
lands at both layers (route now always sends real ISO dates; repo
`bindDate()` coerces `''` to null in `create`/`update` for all callers),
and (b) the client now surfaces the server's real error message verbatim,
so any *other* production-only cause becomes immediately visible to the
tester on the next attempt instead of hiding behind a generic line.

A second latent bug found and fixed while reproducing: `fyTag()` captured
the century digits, so upload-created MOUs would mint `MOU-STEAM-2027-001`
instead of joining the `MOU-STEAM-2627-NNN` cohort (and would restart
numbering at 001 under the wrong prefix). Never observed in production
because every save died at the DB layer first.

## Route-level tests (vitest, mocked repos)

`src/app/api/mou/create-from-upload/route.test.ts`: 14/14 green.

- 401 unauthenticated; 403 for department-scoped non-Finance user under
  production lockdown (`TESTING_OPEN_ACCESS=false`).
- Per-field server-side validation mirror: missing school name / address,
  missing + misordered duration dates, empty or incomplete instalment
  rows, non-canonical sales channel. Each returns its own error key and
  a human message.
- Success path asserts: real ISO `startDate`/`endDate` (never `''`),
  `salesChannel`, derived `contractValue` (350 x 1800 = 6,30,000),
  `opsReviewStatus='Pending for review'`, audit `after` snapshot carrying
  schoolAddress / startDate / endDate / salesChannel / installmentCount,
  one Payment row per instalment with forward-pointer audit notes, new
  School row carrying the address + `[INCOMPLETE_SCHOOL_DETAILS]` marker.
- School resolution: operator link via `existingSchoolId`; auto-link on
  exact normalised-name match (no duplicate school created, audited);
  inline-create otherwise.
- Write failure surfaces the underlying exception message in the JSON
  body (`save-failed` + real text).
- Id minting joins the existing `MOU-STEAM-2627-NNN` sequence.

Full suite: 23 failures across 11 files, **all pre-existing on HEAD**
(verified by stashing this gate's changes and re-running the same files:
identical 8/8 failure count on the three overlapping files; the failing
areas are PI generate, VEX ids, archive page, lifecycleReplay, schema-w4g,
and three legacy `__e2e` walks, none touched by this gate).

## Browser walk (production build, `npm run start`, json backend)

User: anish.d@getsetlearn.info (Admin, department null). Login via
`/login` with the dev password.

| Step | Assertion | Result |
|---|---|---|
| 1 | `/mous/upload` renders all new fields (link select, name, address, programme, sales channel, academic year, sign date, duration pair, students, sale price, instalment rows, PDF) with no console errors | PASS (screenshot `mou-upload-initial.png`) |
| 2 | Empty submit: per-field inline errors with icons + summary banner; nothing posted | PASS (screenshot `mou-validation-errors.png`) |
| 3 | Realistic fill (Sunrise International Academy, 14 MG Road Indore, STEAM, 2026-27, 15-Jun-2026 to 31-Mar-2027, 350 students, Rs 1,800, 2 instalments of Rs 3,15,000): contract value derives live as `Rs 6,30,000 (350 students x Rs 1,800)`, schedule line shows `Rs 6,30,000 of Rs 6,30,000 contract value` | PASS (screenshot `mou-filled.png`) |
| 4 | Submit with no queue token configured: error banner shows the REAL server message: "Could not save the MOU (500): Failed to save the MOU. GSL_QUEUE_GITHUB_TOKEN is not set. Writes cannot persist without it. ..." (the retired generic line never appears) | PASS |
| 5 | Submit with the queue pointed at a throwaway branch (`GSL_QUEUE_BRANCH=e2e-mou-form-scratch`, token from `gh auth token`): save COMPLETES, redirect lands on `/mous/MOU-STEAM-2627-085?created=1` | PASS |
| 6 | Committed queue payload on the scratch branch: school create (`SCH-SUNRISE_INTERNATIONAL_`, address + INCOMPLETE marker in notes), mou create (startDate `2026-06-15`, endDate `2027-03-31`, salesChannel, full audit `after` snapshot), payment creates `-i1`/`-i2` with due dates + Rs 3,15,000 each | PASS (payload pasted below) |

Audit `after` snapshot as committed:

```json
{
  "id": "MOU-STEAM-2627-085",
  "status": "Active",
  "opsReviewStatus": "Pending for review",
  "schoolId": "SCH-SUNRISE_INTERNATIONAL_",
  "schoolName": "Sunrise International Academy",
  "schoolAddress": "14 MG Road, Indore, Madhya Pradesh 452001",
  "startDate": "2026-06-15",
  "endDate": "2027-03-31",
  "studentsMou": 350,
  "spWithTax": 1800,
  "contractValue": 630000,
  "salesChannel": "School Programs (Course)",
  "installmentCount": 2,
  "signedMouPdfPath": null
}
```

The scratch branch was deleted after inspection; no test data reached
`main`, the production queue, or the production database.

## Known json-mode behaviour (not a regression)

After a successful json-mode save, the redirect to `/mous/<id>` renders
404 until the 5-minute cron drains the queue into `mous.json` (the new
record exists only in `pending_updates.json`). This is the pre-existing
eventual-consistency property of the json backend. Production runs
`DATA_BACKEND=postgres`, where the insert is synchronous and the detail
page renders immediately.

## Residual risk

- The postgres write path (transaction wrapping school + MOU + payments)
  is exercised by unit tests with mocked repos, not against a live
  postgres: no non-production database exists and production access was
  denied this session. First production save should be watched once; if
  it fails, the real cause now renders in the error banner verbatim.
- `/mous/<id>` detail render of an upload-created MOU was not walked
  (json-mode 404 above); the page is unchanged for these fields except
  the added "Sales channel" summary row, and its existing tests pass.
