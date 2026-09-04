#!/bin/sh
# Fetch a new frame now. Paints only if the screensaver is already up.
ROOT=/mnt/us/aindle
PIDFILE=$ROOT/loop.pid
KICK=$ROOT/kick

if [ -f "$PIDFILE" ]; then
  pid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    : > "$KICK"
    echo "[aindle] refresh kicked"
    exit 0
  fi
fi

PAGE=$(tr -d ' \n\r' < "$ROOT/page" 2>/dev/null)
echo "[aindle] wallpaper not running, starting"
sh "$ROOT/start.sh" "${PAGE:-local}"
