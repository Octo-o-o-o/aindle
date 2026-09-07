#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PATTERN='wangyixiao@|personai\.cc|107\.173\.168\.222|:52941|192\.168\.31\.132|/Users/wangyixiao|wangyixiao\.password|sub2api-user-wangyixiao|friends-direct'
SCAN_OUT="$(mktemp -t aindle-release-scan.XXXXXX)"
trap 'rm -f "$SCAN_OUT"' EXIT

scan() {
  local label="$1"
  shift
  if [[ "$#" -eq 0 ]]; then
    return 0
  fi
  if grep -RInE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
    --exclude='*.map' --exclude='package-lock.json' --exclude='check-release.sh' --exclude='check-site.mjs' \
    -e "$PATTERN" "$@" >"$SCAN_OUT" 2>/dev/null; then
    echo "release scan FAIL ($label): personal / secret markers still present"
    cat "$SCAN_OUT"
    exit 1
  fi
}

if [[ -d .git ]] && git rev-parse --verify HEAD >/dev/null 2>&1; then
  if git grep -nE "$PATTERN" -- ':!package-lock.json' ':!*.map' ':!scripts/check-release.sh' ':!scripts/check-site.mjs'; then
    echo "release scan FAIL (git grep): personal / secret markers still present"
    exit 1
  fi
else
  scan "source tree" README.md LICENSE \
    package.json src config/registry.example.yaml docs demo packages scripts
fi

if [[ -f config/registry.yaml ]]; then
  if git check-ignore -q config/registry.yaml 2>/dev/null || [[ ! -d .git ]]; then
    echo "ok: config/registry.yaml is not for git"
  else
    echo "release scan FAIL: config/registry.yaml is tracked"
    exit 1
  fi
fi

echo "release scan: ok"
