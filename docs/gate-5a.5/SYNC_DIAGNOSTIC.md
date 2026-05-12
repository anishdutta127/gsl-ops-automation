# Sync cron diagnostic (Gate 5A.5 walkthrough Fix 2)

## Question

Is `sync-queue-cron.yml` healthy, and why does `/admin/queue-status` keep flagging "Sync stalled" even when nothing appears wrong?

## Findings

### Cron configuration

`.github/workflows/sync-queue-cron.yml` is set to `*/5 * * * *` (every 5 minutes). The workflow:

- POSTs to `https://gsl-ops-automation.vercel.app/api/admin/sync-queue` with bearer auth via `CRON_SECRET`
- Logs `Summary: ok=true drained=N remaining=M duration=Tms` per run
- Concurrency group `sync-queue-cron` with `cancel-in-progress: false` (queued runs do not stomp each other)
- 5-min job timeout

Configuration is correct.

### Observed delivery (from `src/data/sync_health.json`)

Sample of recent `github-actions`-triggered entries:

```
2026-05-11 00:06  → 2026-05-11 04:20  (4h 14m gap)
2026-05-11 04:20  → 2026-05-11 06:49  (2h 29m gap)
2026-05-11 06:49  → 2026-05-11 07:57  (1h 08m gap)
2026-05-11 07:57  → 2026-05-11 11:27  (3h 30m gap)
2026-05-11 14:02  → 2026-05-11 16:39  (2h 37m gap)
2026-05-12 04:56  → 2026-05-12 07:42  (2h 46m gap)
2026-05-12 07:42  → 2026-05-12 10:15  (2h 33m gap)
2026-05-12 10:15  → 2026-05-12 12:20  (2h 05m gap)
2026-05-12 12:20  → 2026-05-12 15:15  (2h 55m gap)
```

Earlier (2026-05-10) shows hourly gaps; recent days show 2-3 hour gaps as the norm with occasional 4-hour gaps.

### Per-run health

Every `github-actions` entry in `sync_health.json` is `ok: true` with `drained=N remaining=0`. When the workflow does run, it succeeds. No anomalies, no transient errors, no 401s, no timeout traces.

## Diagnosis

**Cron config is healthy. GitHub Actions free-tier scheduler is throttling delivery.**

This is a documented platform behaviour: scheduled workflows on public repos run "as resources are available", and high-load periods on shared runners can delay scheduled runs by hours. GitHub does not guarantee `*/5` actually fires every 5 minutes; it is a best-effort hint to the scheduler. See [GitHub Docs · Schedule events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule).

The platform itself is not broken. The cron config is what we asked for. The freshness indicator's previous 15-minute stall threshold was just over-aggressive given real GitHub Actions behaviour.

## Resolution

**No code change to the workflow.** Two changes elsewhere:

1. `STALL_THRESHOLD_MINUTES` raised from 15 to 180 (3 hours) in `src/lib/sync/freshnessState.ts`. Matches observed normal-case GitHub Actions delivery; flags genuine multi-hour outages without crying wolf on routine variance. Threshold lives in code so future ops can tune from a single constant.

2. Colour-coded freshness pill removed from the top nav (walkthrough Fix 1). The "Sync now" button stays as a user-facing safety net. The bucket classification still drives `/admin/queue-status` for Admin debugging, just with the more honest 3-hour threshold.

## Follow-up triggers (not actioned now)

- If `/admin/queue-status` "stalled" fires frequently even at 3-hour threshold, the next step is investigating whether to migrate the cron off GitHub Actions free tier. Options: Vercel Pro tier (allows `*/5`), an external scheduler like Upstash QStash, or a tiny always-on VPS running a curl loop.
- If users start asking for a green "everything is fine" signal in the top nav, surface the latest-drain timestamp as a tooltip on hover rather than a coloured pill. Avoid bringing back the red signal.

## References

- `.github/workflows/sync-queue-cron.yml`: workflow definition
- `src/lib/sync/freshnessState.ts`: `STALL_THRESHOLD_MINUTES` constant
- `src/data/sync_health.json`: rolling 50-entry sync log this diagnostic read from
- `src/app/api/admin/sync-queue/route.ts`: server endpoint the cron POSTs to
