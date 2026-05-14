# Apply log, Pranav 2026-05-13 refresh

Refresh tag: `pranav-refresh-2026-05-13`
Applied by: `usr-anish` (Anish Dutta)
Source file: `import-data/2026-05-pranav-refresh/pranav-refresh-2026-05-13.xlsx`
Decisions: `docs/gate-5a.8/decisions.json` (all 18 CONFLICTs resolved as **apply-refresh** per the Step 6 directive; Pranav's values authoritative).

## Counts

| Result | Count |
|---|---:|
| Created (new MOU + School + Payments) | 33 |
| Updated (audit log shows at least one field change) | 25 |
| Unchanged (classified UPDATE/CONFLICT but no live-state delta) | 23 |
| Skipped | 0 |
| Failed (row-level error) | 0 |
| **Total refresh rows** | **81** |

## Contract value impact

Sum of `contractValue` across the 33 created MOUs: **Rs 1,89,51,380** (Rs 1.89 crore).

Updated MOUs were field-fills (`studentsMou`, `studentsActual`, `received` mostly) and conflict overwrites on a handful of contract values; the net contract-value delta on the updated set is documented per-entity in `src/data/mous.json` via the `auditLog[].before` / `auditLog[].after` pairs with `notes: source: pranav-refresh-2026-05-13`.

## MOUs created (33)

Sample (first 5; full list in `src/data/mous.json` where `notes` contains `pranav-refresh-2026-05-13`):

| MOU id | School | Contract (Rs) |
|---|---|---:|
| MOU-STEAM-2627-052 | Vijaya English Primary School | 3,75,000 |
| MOU-STEAM-2627-053 | Frank Public School | 2,16,000 |
| MOU-STEAM-2627-054 | Christ King Public School | 6,00,000 |
| MOU-STEAM-2627-055 | Agragami Vidya Kendar | 8,00,000 |
| MOU-STEAM-2627-056 | Sri Ramavidyalay | 8,00,000 |

The remaining 28 created MOUs span MOU-STEAM-2627-057 through MOU-STEAM-2627-084.

## MOUs updated (25)

Pre-existing FY 26-27 MOUs that received at least one field change with `source: pranav-refresh-2026-05-13`. Conflict resolutions on this set used `apply-refresh` per decisions.json: any field where the refresh disagreed with live was overwritten with the refresh value. The `auditLog` on each MOU records `before` and `after` for every changed field.

Notable conflict: `MOU-STEAM-2627-001` (Mutahhary Public School Baroo) — `studentsActual` overwritten from 400 to 0. Flagged for Pranav follow-up in `docs/gate-5a.8/2026-05-13-APPLY-LOG.md` §"Decision 1, CONFLICT handling".

## Side effects

| Side effect | Count |
|---|---:|
| Payment rows touched (created or updated, with audit) | 199 |
| Schools touched (created or city/state filled, with audit) | 26 |
| Sales reps touched (auto-created from refresh) | 3 |

## Idempotency

Re-running `node scripts/apply-pranav-refresh.mjs --auto --commit` against current state produces **81 unchanged, 0 created, 0 updated, 0 failed, 0 errored**. The cached `docs/gate-5a.8/apply-result.json` reflects this idempotent result.

Run captured: 2026-05-14T11:14 IST. Verified that the on-disk JSON is bit-identical (only CRLF/LF line-ending churn from the Windows write).

## Row-level failures

None. All 81 rows completed without throwing.

## Audit log paths

Operators verifying what was applied should grep `notes` for the refresh tag:

```
grep -l "pranav-refresh-2026-05-13" src/data/mous.json src/data/payments.json src/data/schools.json
```

Each affected entity has a per-field `auditLog[]` entry with `{timestamp, user: "usr-anish", action: "create"|"update", before?, after, notes: "source: pranav-refresh-2026-05-13"}`. Surfaced on `/admin/audit` with the source attribution filter.

## Cross-references

- Detailed decision narrative: `docs/gate-5a.8/2026-05-13-APPLY-LOG.md`
- Decision payload (authoritative): `docs/gate-5a.8/decisions.json`
- Structured outcome log: `docs/gate-5a.8/apply-result.json`
- Root cause for the production Apply 500: `docs/hotfix-pranav-apply/ROOT_CAUSE.md`
