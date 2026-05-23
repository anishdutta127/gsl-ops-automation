# Phase 7 Part 5.B - Neon free-tier + serverless audit

**Status:** All four free-tier risk areas investigated. Mitigations applied where needed. No cutover blockers.

## 1. Connection pooler + concurrency cap

### Current state

`DATABASE_URL` already uses the pgbouncer pooler endpoint:
```
ep-dark-water-aovsi9st-pooler.c-2.ap-southeast-1.aws.neon.tech
```

### Risk

Without pooler-aware client config, postgres.js opens a default pool of 10 connections per process. Vercel serverless functions spin up multiple instances under burst load; each consumes a connection slot. Neon free tier allows ~10 direct connections per branch but ~10,000 multiplexed connections through the pooler.

If postgres.js ignores the pooler semantics (uses prepared statements; holds idle connections) we get intermittent failures under load that look like "worked in testing, broke under real use".

### Mitigation applied (src/lib/db/client.ts)

```typescript
postgres(url, {
  max: 1,             // One connection per function invocation
  idle_timeout: 30,   // Close idle connections after 30s
  connect_timeout: 30, // Tolerate Neon cold-start (3-10s)
  prepare: false,     // Required for pgbouncer transaction mode
  onnotice: () => {},
})
```

- `max: 1` keeps Vercel instances polite to the pool (1 connection per request).
- `idle_timeout: 30` prevents stale instances from squatting pool slots.
- `connect_timeout: 30` survives Neon cold-start; default 30s was actually already the postgres.js default, but pinned explicitly.
- **`prepare: false` is the critical fix.** Neon pooler runs in transaction mode by default, which doesn't preserve prepared-statement state across pooled clients. Without `prepare: false`, postgres.js will intermittently throw `prepared statement "..." does not exist` under concurrent load (works in testing because no concurrency).

### Verified

Harness re-run with new config: 18/18 PASS. Concurrency tests (10 parallel writes against the pool) all green. No prepared-statement errors observed.

## 2. Cold-start latency (Neon auto-suspend)

### Risk

Neon free tier auto-suspends compute after ~5 minutes idle. First request post-suspend triggers compute spin-up. If the wake takes longer than the Vercel function timeout (10s default), the user gets an error.

### Measurement

Cold-start (after ~5 min idle, fresh postgres.js client + first SELECT):
```
Cold connect+query roundtrip: 1408 ms
```

Warm 20-parallel SELECTs through the same pooled connection: 166ms total (~8ms each).

### Verdict

**1.4s cold-start is well within Vercel's default 10s function timeout.** No mitigation needed beyond the `connect_timeout: 30` we already set. Users will feel a slight delay on the very first request of the day (or after a quiet weekend), but the response succeeds.

If the cold-start grows over time (Neon has been raising suspend thresholds and improving wake speed; 2026 measurements should stay under 2s), we can:
- Pre-warm via a scheduled GitHub Actions ping every 4 minutes during business hours (already infrastructure for the queue cron - reuse).
- Show a "Connecting..." loading state on the first SSR page render if it takes > 500ms.

Neither is needed for the demo or initial pilot. Documented as a fallback.

## 3. Storage budget (0.5 GB cap)

### Current state

```
Current DB size: 12 MB (2.4% of 0.5 GB cap)
```

### Per-table sizes (top 10):

```
payments              448 kB
mous                  384 kB
escalations           176 kB
vex_orders            152 kB
dispatches            144 kB
schools               144 kB
notifications         136 kB
users                 136 kB
school_spocs          128 kB
mou_import_review     120 kB
```

### Audit growth projection

Average audit_log entry: **262 bytes**. Average current audit per MOU: 2.6 entries (legacy seed data).

| Scenario | Growth over 1 year | % of 0.5 GB cap |
|---|---|---|
| Pilot: 5 audit entries/day per MOU, 200 active MOUs | ~91 MB | 18% |
| Heavy ops: 20 entries/day per MOU, 500 MOUs | ~913 MB | **183% (OVER cap)** |
| Realistic FY26-27 (current scale, ~84 active MOUs, ~10 entries/MOU/day) | ~80 MB | 16% |

### Verdict

**Pilot + realistic year-1 production stays well under the 0.5 GB cap (16-18% utilisation after 12 months).** Storage is not a cutover blocker.

**Heavy ops scenario at 2x cap is a real risk if the platform grows substantially.** Mitigation options (none required at cutover; document for the future):

1. **Audit log truncation policy.** Keep the last N=100 entries per row inline; archive older entries to a separate `audit_archive` table (append-only, partitioned by year). Estimated reduction: 90%+ on the live tables.
2. **Move audit_log to a separate top-level table.** Per-entity FK from mous/payments/etc.; saves repeated JSONB overhead in the row.
3. **Upgrade to Neon Launch ($19/month) when storage approaches 80%.** 10 GB cap; same compute pricing; one-line connection string change.

Recommended approach when storage hits 50%: implement option 1 (audit truncation) as a scheduled cleanup. Defer to post-cutover Part 7 unless growth is faster than projected.

## 4. Compute hours (Neon free tier soft cap)

### Current state

Neon free tier allows 191 compute hours per month per project. Compute clock runs when a query is active; auto-suspends after 5 min idle.

### Estimate

The internal tool is used during business hours by ~5 users:
- Active session minutes per day: ~6h × 5 users × 5 workdays = 150h/week peak
- BUT the compute only runs during actual queries, not during browsing. Each interaction is ~50-200ms of compute. Even at 1000 interactions/day across 5 users = ~100 seconds/day compute = ~50 minutes/month.

The 191-hour cap is for total compute clock-time on the branch. Even with very heavy use, we'd consume <10 hours/month. **No risk of hitting the cap.**

If compute hits 80% utilization, the same Neon Launch upgrade ($19/month) gives 300 hours plus higher limits.

## 5. Vercel concurrency

### Current state

Vercel free plan allows ~12 concurrent function instances per region. With `max: 1` on postgres.js, that's ~12 simultaneous postgres connections through the pool. Neon's pooler handles ~10,000 multiplexed; our 12 is 0.12%.

### Verdict

**Vercel + Neon free-tier combination handles our concurrency comfortably.** No cutover blocker.

## Summary

| Free-tier risk | Status | Mitigation |
|---|---|---|
| 1. Connection pool exhaustion | **MITIGATED** | postgres.js config (`max: 1`, `prepare: false`, `idle_timeout: 30`, `connect_timeout: 30`) in `src/lib/db/client.ts` |
| 2. Cold-start (~1.4s measured) | **ACCEPTABLE** | Well under Vercel 10s timeout. Optional pre-warm if it degrades. |
| 3. Storage (0.5 GB) | **ACCEPTABLE for year 1** | Audit truncation policy queued for Part 7 if growth tracks heavy scenario. |
| 4. Compute hours (191/month) | **ACCEPTABLE** | <10 hours expected use; well under cap. |
| 5. Vercel concurrency | **ACCEPTABLE** | 12 concurrent functions × 1 connection each = trivial vs 10,000-multiplex pool. |

## Cutover-readiness gate (so far)

- Bridge dispatcher covers all known unmigrated entity writes
- All 11 P1 money routes prove writes land in postgres (16/16 harness PASS pre-P1.2, 18/18 with P1.2)
- P1.2 atomic refactor of the 2 last JSONB-RMW routes in P1 set (agreements/edit, vex/dispatch/transition); concurrency tests green
- postgres.js config tuned for Neon serverless + pgbouncer transaction mode
- Storage + compute + concurrency limits modeled; no production-impact risks

**Next priority:** P2 - the 32 remaining A_RMW_JSONB routes. Atomic refactor + concurrency test each, as per P1's template.
