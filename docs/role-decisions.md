# Role decisions

This document records the rationale behind non-default role assignments on the test roster. New decisions append here as they happen; existing entries are NOT silently re-litigated.

---

## 2026-04-27: Trusted core team granted Admin (Pradeep, Misba, Swati, Shashank)

**Decision:** Five of the ten testers are granted the `Admin` role rather than their nominal functional role per Anish's directive on 2026-04-27. Specifically:

- `anish.d`: Admin (originally Admin)
- `pradeep.r`: OpsHead -> Admin
- `misba.m`: OpsEmployee with OpsHead testingOverride -> Admin
- `swati.p`: Admin from creation (added 2026-04-27)
- `shashank.s`: TrainerHead -> Admin

The remaining five testers preserve role-scoping verification: `ameet.z` (Leadership), `pratik.d` (SalesHead), `vishwanath.g` (SalesRep), `shubhangi.g` (Finance), `pranav.b` (Finance).

**Trade-off accepted:** The role-based separation of duties the system was originally designed around is largely collapsed for the trusted core team. Specifically:

- `cc-rule:create` is no longer Admin-only-for-30-days for the core team. They can create CC rules from day one. The 30-day flip semantic still applies to any FUTURE OpsHead user who is not on the core team.
- Audit-route visibility scoping (OpsHead sees OPS-lane only; TrainerHead sees ACADEMICS-lane only) does not constrain the core team. They see all lanes via the Admin wildcard.
- The `testingOverride` pattern previously used to grant Misba scoped OpsHead permissions while keeping audit-log attribution at her base `OpsEmployee` role is no longer in use on the test roster. The code path remains in `src/lib/auth/permissions.ts` for any future user that needs scoped temporary elevation.

**Why this matches operational reality:** The core team needs to drive every flow end-to-end during the 10-tester pilot: schools, sales reps, school groups, cc rules, MOU import review, dispatch, feedback, delivery acks, audit log review, training-quality escalations. Splitting their permissions across multiple non-Admin roles would create awkward "ask Anish for a one-line PR to flip Y on" moments that interrupt the pilot. Full Admin matches the work they actually do.

**Why the remaining 5 stay non-Admin:** Ameet (Leadership), Pratik (SalesHead), Vishwanath (SalesRep), Shubhangi (Finance), Pranav (Finance) preserve role-scoping verification; the pilot still needs evidence that an Admin redirect, an audit-route lane filter, and a SalesRep's own-MOU scope all behave correctly under realistic use.

**Future review:** A follow-up role-design conversation may revisit the separation-of-duties question once the pilot ends and we know which permissions the core team actually exercised vs which they would have happily lived without. For Phase 1 this is the operational answer.

**References:**
- `docs/PHASE-F-VERIFICATION.md` §2.5 / §2.6 / §2.7 / §2.10: per-tester walkthroughs reflect Admin capabilities for the four core-team promotions.
- `docs/DEVELOPER.md` §"Test users": roster table.
- `docs/RUNBOOK.md` §10: partial obsolescence note on the cc-rule:create 30-day flip.
- `src/data/users.json` and `src/data/_fixtures/users.json`: source of truth.

---

## 2026-04-27: mou:edit-cohort-status Admin-only (W4-A.5)

W4-A added a per-MOU `cohortStatus: active | archived` flag and two surfaces (`/mous/archive` Reactivate + `/admin/mou-status` per-row + bulk). The `mou:edit-cohort-status` Action gates writes through both. **Admin-only via the Admin wildcard; OpsHead is intentionally not granted.**

**Why Admin-only:** cohort decisions are leadership-level (which academic year counts as the operationally-current pursuit). OpsHead can manage day-to-day operations on the active cohort without needing to flip MOUs in or out of the cohort itself; the AY rollover that produces the "92 archive candidates" pattern is a once-per-AY event that benefits from a deliberate Admin touch.

**Phase 2 trigger:** if pilot operators report friction on this gate (e.g., Misba routinely needs to reactivate a wrongly-archived MOU and Anish is unavailable), revisit by adding `mou:edit-cohort-status` to the OpsHead grant set in `src/lib/auth/permissions.ts`. The 1-line change matches the cc-rule:create flip pattern.

