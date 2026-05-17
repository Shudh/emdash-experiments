#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

USERS_JSON=".local/rental-sandbox/users.json"
TEST_DB=".local/rental-sandbox/test.db"
RENTAL_BRIDGE="demos/playground/src/pages/api/rental/[...path].ts"

RUN_TESTS=0
if [[ "${1:-}" == "--run-tests" ]]; then
  RUN_TESTS=1
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: scripts/verify-alm-frontend.sh [--run-tests]"
  exit 2
fi

echo "Branch: $(git branch --show-current)"
echo "Latest commit: $(git log -1 --oneline)"
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo

echo "users.json exists: $([[ -f "$USERS_JSON" ]] && echo yes || echo no) ($USERS_JSON)"
if [[ -f "$USERS_JSON" ]]; then
  node -e 'const fs=require("fs"); const path=process.argv[1]; const users=JSON.parse(fs.readFileSync(path,"utf8")); for (const key of ["owner","tenant"]) { const entry=users[key]; const user=entry?.user ?? entry; const registered=entry?.status === "registered" || entry?.registered === true || Boolean(user?.id); console.log(`${key}: ${entry?.email ?? user?.email ?? "missing"} registered=${registered} id=${user?.id ?? "missing"}`); }' "$USERS_JSON"
fi
echo "test.db exists: $([[ -f "$TEST_DB" ]] && echo yes || echo no) ($TEST_DB)"
echo "permanent /api/rental bridge exists: $([[ -f "$RENTAL_BRIDGE" ]] && echo yes || echo no) ($RENTAL_BRIDGE)"
echo

echo "Frontend files using /api/rental:"
rg -l '/api/rental' demos/playground/src e2e/fixture/src/pages e2e/tests || true
echo

echo "Bad helper route URLs outside node_modules:"
rg '/_emdash/api/setup/dev-(login-as|logout-local)' -g '!node_modules' -g '!playwright-report' -g '!test-results' . || true
echo

echo "Tracked files that should not be tracked for ALM local runs:"
git ls-files | rg '(\.pid$|\.zip$|\.db$|^playwright-report/|^test-results/)' || true
echo

cat <<'COMMANDS'
Exact test commands:
pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain
pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-existing-users.spec.ts --project=chromium --headed
pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-ui-smoke.spec.ts --project=chromium --headed
pnpm --filter emdash typecheck
node scripts/verify-alm-prod-schema.mjs --db .local/rental-sandbox/test.db
COMMANDS

if [[ "$RUN_TESTS" == "1" ]]; then
  pnpm exec tsc -p demos/playground/tsconfig.test.json --noEmit
  packages/blocks/node_modules/.bin/vitest run demos/playground/tests/domain
  pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-existing-users.spec.ts --project=chromium --headed
  pnpm exec playwright test -c playwright.rental-local.config.ts e2e/tests/rental-local-ui-smoke.spec.ts --project=chromium --headed
  pnpm --filter emdash typecheck
  node scripts/verify-alm-prod-schema.mjs --db .local/rental-sandbox/test.db
fi
