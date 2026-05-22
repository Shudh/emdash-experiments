#!/usr/bin/env bash

set -euo pipefail

DB_NAME="handovernow_cms"
WRANGLER_CONFIG="wrangler.jsonc"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "ERROR: pnpm was not found in PATH."
	exit 1
fi

if [ ! -f "$WRANGLER_CONFIG" ]; then
	echo "ERROR: $WRANGLER_CONFIG not found in $PROJECT_DIR."
	exit 1
fi

echo "This will delete and recreate the remote D1 database:"
echo "  $DB_NAME"
echo ""
echo "Press Ctrl+C now if this is not intended."
sleep 5

echo "Deleting database '$DB_NAME'..."
pnpm exec wrangler d1 delete "$DB_NAME" --skip-confirmation || true

echo "Creating new database '$DB_NAME'..."
OUTPUT="$(pnpm exec wrangler d1 create "$DB_NAME" 2>&1)"
echo "$OUTPUT"

NEW_ID="$(echo "$OUTPUT" | grep -o '"database_id": "[^"]*"' | head -1 | cut -d'"' -f4)"

if [ -z "$NEW_ID" ]; then
	echo "ERROR: failed to extract new database_id from wrangler output."
	exit 1
fi

echo "New database_id: $NEW_ID"

if grep -q '"database_id":' "$WRANGLER_CONFIG"; then
	perl -0pi -e "s/\"database_id\"\\s*:\\s*\"[^\"]*\"/\"database_id\": \"$NEW_ID\"/" "$WRANGLER_CONFIG"
else
	perl -0pi -e "s/(\"database_name\"\\s*:\\s*\"handovernow_cms\"\\s*)/$1,\n\t\t\t\"database_id\": \"$NEW_ID\"/" "$WRANGLER_CONFIG"
fi

echo ""
echo "Updated $WRANGLER_CONFIG with database_id:"
echo "  $NEW_ID"
echo ""
echo "Next steps:"
echo "  1. pnpm deploy"
echo "  2. Visit https://cms.handovernow.com/_emdash/admin"