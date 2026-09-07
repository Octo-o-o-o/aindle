#!/bin/sh
# Install Hub + Agent as user LaunchAgents. Survives Cursor quit and reboot
# (after this macOS user logs in).
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UID_N="$(id -u)"
SRC="$ROOT/scripts/macos"
DEST="$HOME/Library/LaunchAgents"
LOGDIR="$HOME/Library/Logs/aindle"
NODE_BIN="${AINDLE_NODE:-$(command -v node || true)}"

if [ -z "$NODE_BIN" ]; then
  echo "node not found; set AINDLE_NODE to an absolute Node.js path" >&2
  exit 1
fi

escape_sed() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
ROOT_SED=$(escape_sed "$ROOT")
HOME_SED=$(escape_sed "$HOME")
NODE_SED=$(escape_sed "$NODE_BIN")
NODE_DIR_SED=$(escape_sed "$NODE_DIR")

mkdir -p "$DEST" "$LOGDIR"
for name in com.aindle.hub com.aindle.agent; do
  sed \
    -e "s|__AINDLE_ROOT__|$ROOT_SED|g" \
    -e "s|__AINDLE_HOME__|$HOME_SED|g" \
    -e "s|__AINDLE_NODE__|$NODE_SED|g" \
    -e "s|__AINDLE_NODE_DIR__|$NODE_DIR_SED|g" \
    "$SRC/$name.plist" > "$DEST/$name.plist"
done

# Cursor-owned copies must die or launchd cannot bind :8787.
for pat in 'packages/hub/src/cli.ts' 'packages/agent/src/cli.ts'; do
  pids="$(pgrep -f "$pat" || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
done
sleep 1

for label in com.aindle.hub com.aindle.agent; do
  launchctl bootout "gui/$UID_N/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_N" "$DEST/$label.plist"
  launchctl enable "gui/$UID_N/$label" 2>/dev/null || true
  launchctl kickstart -k "gui/$UID_N/$label"
done

echo "installed LaunchAgents:"
echo "  $DEST/com.aindle.hub.plist"
echo "  $DEST/com.aindle.agent.plist"
echo "logs: $LOGDIR"
