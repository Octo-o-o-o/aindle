#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
npm test
node --import tsx --test packages/hub/test/*.test.ts
node --import tsx --test packages/agent/test/*.test.ts
node scripts/build-demo.mjs --check
npm run site:build
npm run site:check
sh kindle/oasis1/test-wait.sh

echo "check: ok"
