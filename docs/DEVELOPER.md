# DEVELOPER

First-run guide for GSL Ops Automation. Target: clone to running dev server in 6 commands, ~15 minutes; first useful PR scope ready in another 30 minutes (~45 minutes total).

This doc is the *how to contribute* reference. For *what does the system do* read `ops-data/GSL_Ops_Handoff.md`. For *what does it look like* read `DESIGN.md`. For routing rules across all docs, read `CLAUDE.md`.

---

## Six-command first run

You need: Node 20+, Git, and 1Password access to the "GSL Ops" vault. That last item is the gating prerequisite; the rest is a fresh-laptop install.

```bash
# 1. Clone
git clone https://github.com/anishdutta127/gsl-ops-automation.git
cd gsl-ops-automation

# 2. Install
npm install

# 3. Seed local environment variables
cp .env.local.example .env.local
# Open .env.local and replace the placeholders with values from the
# 1Password "GSL Ops" vault. Each comment in the file points to the
# vault search string. Five secrets total:
#   GSL_QUEUE_GITHUB_TOKEN
#   GSL_JWT_SECRET
#   GSL_SNAPSHOT_SIGNING_KEY
#   OPS_DATA_PATH (per-machine local path)
#   NEXT_PUBLIC_APP_URL (http://localhost:3000 for dev)

# 4. Seed fixture data
npm run seed:dev
# Copies src/data/_fixtures/*.json into src/data/, hashes the dev
# password GSL#123 to bcrypt for the 9 test users at write time.
# Idempotent: re-running produces no users.json diff.

# 5. Run the test suite
npm test
# Expect: 160 passed, 26 todo (4 it.todo() scaffolds awaiting
# Week 2 lib subjects). ~7 seconds.

# 6. Start the dev server
npm run dev
# localhost:3000. Should redirect / to /dashboard, which the
# middleware will redirect to /login because no session cookie
# is set yet.
```

Optional but recommended:

```bash
# Smoke verification (boots dev, asserts route responses)
npm run smoke:test

# Documentation linter (em-dash zero, British English, AI-slop WARN)
npm run docs-lint
```

---

## Test users

All 9 fixture users authenticate with `GSL#123` (development password only; never used in production). Real user records are created at launch via the seed-and-credentials flow per `docs/RUNBOOK.md` section 1.2.

| User id | Role | Notes |
|---|---|---|
| `anish.d` | Admin | Wildcard permissions; the maintainer account |
| `ameet.z` | Leadership | P2 override + L3 fallback for OPS / SALES / ACADEMICS |
| `pratik.d` | SalesHead | Drift-approval queue ownership |
| `vishwanath.g` | SalesRep | Scoped MOU view (own assignments only) |
| `misba.m` | OpsEmployee + testingOverride: ['OpsHead'] | Base role stays OpsEmployee for audit accuracy; flag grants OpsHead permissions during testing |
| `pradeep.r` | OpsHead | CcRule toggle, audit-route Ops-lane visibility |
| `shubhangi.g` | Finance | PI generation, payment reconciliation |
| `pranav.b` | Finance | Symmetric to Shubhangi (single role, two users sharing workload) |
| `shashank.s` | TrainerHead | Academics-lane escalation visibility |

The `testingOverride` flag pattern is documented in `src/lib/auth/permissions.ts`. Every audit-log entry on Misba's actions records `user: 'misba.m'` (her base id), so post-launch you can grep for what she did under elevated permissions.

### Password recovery (testers)

If a tester forgets or breaks their password:

1. Edit `src/data/_fixtures/users.json`: replace the user's `passwordHash` field with the placeholder marker `"REPLACE_WITH_BCRYPT_HASH"`.
2. Run `npm run seed:dev`. The seed-dev pipeline detects the placeholder and writes a fresh bcrypt hash of `GSL#123` into `src/data/users.json`.
3. Tester logs in at `/login` with `GSL#123` and is back in.

There is no `/forgot-password` route in Phase 1. Phase 1.1 may add one if testers ask.

---

## Time-to-first-PR target

The sequence is:

1. ~15 minutes from `git clone` to `npm test` green and a running dev server.
2. ~15 minutes to read `CLAUDE.md`, `DESIGN.md`, and the routing tree at the bottom of CLAUDE.md.
3. ~15 minutes to find the entity / route / component the PR touches and read its sibling tests.

If you take longer than 60 minutes from clone to opened editor, that's a documentation gap. File an issue or ping Anish; the gap gets fixed in this doc.

---

## Test suite onboarding

The test suite uses Vitest. Configuration is in `vitest.config.ts`; the harness mirrors `gsl-mou-system`'s shape so cross-repo familiarity carries.

### Running tests

```bash
npm test                       # Full suite, run-once. ~5-10 seconds.
npm run test:watch             # Watch mode for focused work.
```

### Test layout

Tests live colocated with their subject:

- `src/lib/<module>.test.ts` for lib unit tests
- `src/components/ops/<Component>.test.tsx` for Ops-specific component tests
- `src/components/ui/` is shadcn primitives (vendored); no first-party tests there
- `src/app/<route>/page.test.tsx` for page-level wiring tests (e.g., `/admin/audit/page.test.tsx`)

### Conventions

- **No raw hex codes in component test fixtures.** Use the assertion `expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)` to enforce token-discipline. Exception: `StatusBlock.test.tsx` (email template) is the documented hex-allowed file because email clients do not support CSS variables.
- **Ops-specific components carry an icon-presence assertion** alongside the no-hex assertion. Lane pills use color + icon + text triple-redundancy per WCAG 2.1 AA "color is never the only signal."
- **Q-G test scaffolds use `it.todo()`** with given/when/then comments inside. Vitest reports `it.todo()` as informational; CI does not block on these. When a Week-2 lib subject lands, replace the `it.todo()` with real assertions per the comments.
- **`renderToStaticMarkup` for Server Components.** No `@testing-library/react` install needed for Phase 1. Server Components are async functions that return JSX; await them and pass the result to `renderToStaticMarkup`.

---

## Fixture-seed pattern

The 14 fixture files at `src/data/_fixtures/*.json` are anonymized fictional data. `npm run seed:dev` copies them into `src/data/*.json` and hashes the dev password.

Real production data lives in the queue (Contents API commits from the deployed environment); never on dev machines except via the explicit `npm run seed:dev` flow.

`seed:dev` refuses to run if `NODE_ENV === 'production'` or `GSL_QUEUE_GITHUB_TOKEN` is set; both are safety gates.

If you change a fixture (add a tester, add a school), edit `src/data/_fixtures/<file>.json`, then re-run `npm run seed:dev`. The script's skip-if-already-hashed pass preserves existing user passwordHash bytes so re-runs do not produce noise diffs in `src/data/users.json`.

---

## Cross-references

| Question | First document |
|---|---|
| What does the system do? | `ops-data/GSL_Ops_Handoff.md` |
| What does it look like? | `DESIGN.md` (canonical), then `plans/anish-ops-design-review-2026-04-24.md` (rationale) |
| What entity / endpoint? | `plans/anish-ops-eng-review-2026-04-24.md` |
| How do I run / launch / recover? | `docs/RUNBOOK.md` |
| Project conventions + behavioural rules | `CLAUDE.md` |
| Routing tree across all docs | `CLAUDE.md` §"Routing tree" |
| Why does X have a weird shape? | grep `plans/` for the relevant Q-x or Tension-x |

For *anything* under `plans/`, read it as a decision archive. The code is the implementation guide; `plans/` answers "why" not "how".

---

## Filing a PR

1. Branch: `git checkout -b <type>/<short-summary>` (`feat/`, `fix/`, `docs/`, `chore/`, `test/`, `refactor/`, `style/`).
2. Make your change. Add tests. Pre-commit hooks run `docs-lint` automatically.
3. Run `npm test`, `npx tsc --noEmit`, and `npm run smoke:test` locally.
4. Commit with a conventional-commits subject under 72 chars. The body explains the *why*; the diff explains the *what*.
5. Push and open the PR.
6. CI runs `docs-lint` and `npm test` on every PR. Red CI blocks merge.

For DESIGN.md updates: if your PR establishes a new visual rule, update DESIGN.md in the same commit. The PR template's checkbox prompts the reviewer to verify.
