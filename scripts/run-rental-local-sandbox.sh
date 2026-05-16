#!/usr/bin/env bash
set -euo pipefail

cd ~/PycharmProjects/emdash-experiments

SANDBOX_DIR="$PWD/.local/rental-sandbox"
DB_PATH="$SANDBOX_DIR/test.db"
MOCK_MARKETPLACE_JS="$SANDBOX_DIR/mock-marketplace.mjs"
MOCK_MARKETPLACE_PID="$SANDBOX_DIR/mock-marketplace.pid"

mkdir -p "$SANDBOX_DIR"

if ss -ltnp | grep -q ':4444'; then
  echo "Port 4444 is already in use. Stop the existing server first."
  ss -ltnp | grep ':4444' || true
  exit 1
fi

if ss -ltnp | grep -q ':4445'; then
  echo "Port 4445 is already in use. Stop the existing mock marketplace first."
  ss -ltnp | grep ':4445' || true
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

server.listen(4445, "127.0.0.1", () => {
console.log("Mock marketplace ready at http://127.0.0.1:4445");
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

echo "Persistent DB: $DB_PATH"
echo "Open: http://localhost:4444"

EMDASH_TEST_DB="file:$DB_PATH" \
EMDASH_MARKETPLACE_URL="http://127.0.0.1:4445" \
DEBUG="${DEBUG:-1}" \
pnpm --dir e2e/fixture exec astro dev --port 4444
