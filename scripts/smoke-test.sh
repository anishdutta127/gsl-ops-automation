#!/usr/bin/env bash
#
# scripts/smoke-test.sh
#
# End-to-end smoke verification for the dev environment per step 10
# Item 7 + Week 1 Item 16. Runs the first-run flow and asserts that
# the dev server boots and responds correctly on the routes Phase 1
# users will hit on Day 1.
#
# What this DOES verify:
#   1. Fixtures seed cleanly: npm run seed:dev returns 0.
#   2. Test suite green: npm test returns 0 (160 passing + 26 todo).
#   3. Dev server boots and listens on :3000.
#   4. /login (PUBLIC) responds 200.
#   5. /dashboard (staff-JWT-gated) responds 307 redirect to /login
#      with no cookie present. Proves middleware is wired.
#   6. /portal/status/<token> (PUBLIC per Update 2) responds 200
#      even with an unknown token (the page renders the link-
#      expired UI; HMAC verification is page-level, not middleware-
#      level).
#   7. /feedback/<token> (PUBLIC per D7) responds 200 (same shape
#      as portal/status).
#
# What this does NOT verify (Week 2 scope):
#   - Login flow (anish.d / GSL#123 -> /api/login -> Dashboard).
#     /api/login is a 501 stub today; the smoke test cannot exercise
#     the full "log in -> see dashboard" path until the real auth
#     route lands.
#   - Real-data dashboard rendering. /dashboard renders the route
#     placeholder until the dashboard tile work lands.
#   - SMTP sending, queue commits to GitHub, sync runner cron.
#
# Exit codes:
#   0 = all checks passed
#   non-zero = at least one check failed; STDERR carries the
#     diagnostic and the dev-server process is killed.
#
# Manual run: bash scripts/smoke-test.sh
# CI: not wired today; intended for local pre-merge verification.

set -u

PORT=3000
BASE_URL="http://localhost:${PORT}"
DEV_PID=""

cleanup() {
  if [[ -n "$DEV_PID" ]]; then
    kill "$DEV_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$DEV_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

step() {
  printf '\n=== %s ===\n' "$1"
}

fail() {
  printf '\nsmoke-test: FAIL  %s\n' "$1" >&2
  exit 1
}

curl_status() {
  curl -s -o /dev/null -w "%{http_code}" -L --max-redirs 0 "$1"
}

curl_body() {
  curl -sf -L --max-redirs 0 "$1"
}

# ----------------------------------------------------------------------------
# 1. seed:dev
# ----------------------------------------------------------------------------

step "1/5  npm run seed:dev"
npm run seed:dev > /tmp/smoke-seed.log 2>&1 || {
  cat /tmp/smoke-seed.log >&2
  fail "seed:dev returned non-zero"
}
echo "seed:dev OK ($(grep -c 'record' /tmp/smoke-seed.log) record lines)"

# ----------------------------------------------------------------------------
# 2. npm test
# ----------------------------------------------------------------------------

step "2/5  npm test"
npm test > /tmp/smoke-test.log 2>&1 || {
  tail -40 /tmp/smoke-test.log >&2
  fail "npm test returned non-zero"
}
PASS_COUNT=$(grep -oE '[0-9]+ passed' /tmp/smoke-test.log | head -1 || echo "0 passed")
echo "tests OK ($PASS_COUNT)"

# ----------------------------------------------------------------------------
# 3. Start dev server
# ----------------------------------------------------------------------------

step "3/5  npm run dev (background)"
npm run dev > /tmp/smoke-dev.log 2>&1 &
DEV_PID=$!

# Wait up to 60 seconds for the server to respond on /login
echo "waiting for server ready on ${BASE_URL}/login..."
READY=0
for i in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 2 "${BASE_URL}/login"; then
    READY=1
    echo "server ready after ${i}s"
    break
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  tail -40 /tmp/smoke-dev.log >&2
  fail "dev server did not respond on ${BASE_URL}/login within 60s"
fi

# ----------------------------------------------------------------------------
# 4. Route smoke checks
# ----------------------------------------------------------------------------

step "4/5  route checks"

LOGIN_STATUS=$(curl_status "${BASE_URL}/login")
[[ "$LOGIN_STATUS" == "200" ]] || fail "/login returned $LOGIN_STATUS, expected 200"
echo "  /login                                  200 OK"

LOGIN_BODY=$(curl_body "${BASE_URL}/login")
echo "$LOGIN_BODY" | grep -q "Sign in" || fail "/login HTML missing the 'Sign in' button label"
echo "$LOGIN_BODY" | grep -q 'name="email"' || fail "/login HTML missing the email input"
echo "$LOGIN_BODY" | grep -q 'name="password"' || fail "/login HTML missing the password input"
echo "  /login body has email + password fields + Sign in button"

DASH_STATUS=$(curl_status "${BASE_URL}/dashboard")
[[ "$DASH_STATUS" == "307" || "$DASH_STATUS" == "302" ]] \
  || fail "/dashboard returned $DASH_STATUS without a cookie, expected 302 or 307 redirect (middleware-enforced auth)"
echo "  /dashboard (no cookie)                  $DASH_STATUS redirect OK (middleware works)"

PORTAL_STATUS=$(curl_status "${BASE_URL}/portal/status/dummy-token")
[[ "$PORTAL_STATUS" == "200" ]] \
  || fail "/portal/status/dummy-token returned $PORTAL_STATUS, expected 200 (PUBLIC per Update 2)"
echo "  /portal/status/dummy-token (PUBLIC)     200 OK"

FEEDBACK_STATUS=$(curl_status "${BASE_URL}/feedback/dummy-token")
[[ "$FEEDBACK_STATUS" == "200" ]] \
  || fail "/feedback/dummy-token returned $FEEDBACK_STATUS, expected 200 (PUBLIC per D7)"
echo "  /feedback/dummy-token (PUBLIC)          200 OK"

API_HEALTH_STATUS=$(curl_status "${BASE_URL}/api/health")
# Phase 1 stub returns 501; we accept 200 (real impl) or 501 (stub)
case "$API_HEALTH_STATUS" in
  200|501) echo "  /api/health                             $API_HEALTH_STATUS OK (200 real or 501 Phase 1 stub)" ;;
  *) fail "/api/health returned $API_HEALTH_STATUS, expected 200 or 501" ;;
esac

# ----------------------------------------------------------------------------
# 5. Done
# ----------------------------------------------------------------------------

step "5/5  smoke-test PASS"
echo "All checks green. Dev environment is ready."
echo ""
echo "Week 2 deferred (NOT verified by this smoke run):"
echo "  - SMTP send / queue Contents API write / sync runner cron"
exit 0
