#!/usr/bin/env bash
set -euo pipefail

cd ~/PycharmProjects/emdash-experiments

SANDBOX_DIR="$PWD/.local/workflow-rental-sandbox"
SOURCE_DB_PATH="$PWD/.local/rental-sandbox/test.db"
DB_PATH="$SANDBOX_DIR/test.db"
MOCK_MARKETPLACE_JS="$SANDBOX_DIR/mock-marketplace.mjs"
MOCK_MARKETPLACE_PID="$SANDBOX_DIR/mock-marketplace.pid"

mkdir -p "$SANDBOX_DIR"

if [ ! -f "$SOURCE_DB_PATH" ]; then
  echo "Source rental DB is missing: $SOURCE_DB_PATH"
  echo "Run bash scripts/run-rental-local-sandbox.sh once to create the approved ALM sandbox DB."
  exit 1
fi

node scripts/ensure-workflow-rental-local-db.mjs "$DB_PATH" "$SOURCE_DB_PATH"

if ss -ltnp | grep -q ':4450'; then
  echo "Port 4450 is already in use. Stop the existing workflow rental server first."
  ss -ltnp | grep ':4450' || true
  exit 1
fi

if ss -ltnp | grep -q ':4451'; then
  echo "Port 4451 is already in use. Stop the existing workflow mock marketplace first."
  ss -ltnp | grep ':4451' || true
  exit 1
fi

if [ ! -e packages/core/dist/cli/index.mjs ]; then
  pnpm run build
fi

if [ ! -e packages/plugins/color/dist/index.mjs ]; then
  pnpm run --filter emdash-e2e-fixture... build
fi

cat > "$MOCK_MARKETPLACE_JS" <<'NODE'
import http from "node:http";

const server = http.createServer((request, response) => {
response.setHeader("Content-Type", "application/json");
response.end(JSON.stringify({ ok: true, path: request.url, items: [] }));
});

server.listen(4451, "127.0.0.1", () => {
console.log("Workflow mock marketplace ready at http://127.0.0.1:4451");
});
NODE

node "$MOCK_MARKETPLACE_JS" &
echo "$!" > "$MOCK_MARKETPLACE_PID"

cleanup() {
  if [ -f "$MOCK_MARKETPLACE_PID" ]; then
    kill "$(cat "$MOCK_MARKETPLACE_PID")" >/dev/null 2>&1 || true
    rm -f "$MOCK_MARKETPLACE_PID"
  fi
}
trap cleanup EXIT

echo "Workflow rental sandbox: http://localhost:4450/wf"
echo "Workflow rental DB: .local/workflow-rental-sandbox/test.db"
echo "Source auth DB copied from: .local/rental-sandbox/test.db"
echo "Owner: owner_manual_created_1@example.com"
echo "Tenant: tenant_manual_created_1@example.com"

EMDASH_TEST_DB="file:$DB_PATH" \
EMDASH_MARKETPLACE_URL="http://127.0.0.1:4451" \
ALM_ADMIN_SAFETY="${ALM_ADMIN_SAFETY:-1}" \
ALM_SUPERADMIN_EMAILS="${ALM_SUPERADMIN_EMAILS:-dev@emdash.local}" \
DEBUG="${DEBUG:-1}" \
pnpm --dir e2e/fixture exec astro dev --port 4450
