#!/usr/bin/env bash
set -euo pipefail

required_major=22

if command -v node >/dev/null 2>&1; then
	current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
else
	current_major=0
fi

if [ "$current_major" -lt "$required_major" ]; then
	if [ -s "$HOME/.nvm/nvm.sh" ]; then
		# shellcheck disable=SC1090
		. "$HOME/.nvm/nvm.sh"
		if ! nvm use 22 >/dev/null 2>&1; then
			nvm install 22
			nvm use 22
		fi
		current_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
	fi
fi

if [ "$current_major" -lt "$required_major" ]; then
	echo "Node >=22 is required, but found: $(node -v 2>/dev/null || echo missing)" >&2
	exit 1
fi

if ! npm install -g npm@latest; then
	echo "Warning: npm upgrade failed; continuing with existing npm $(npm -v 2>/dev/null || echo missing)." >&2
fi
corepack enable
corepack prepare pnpm@10.28.0 --activate

node -v
npm -v
corepack --version
pnpm -v
