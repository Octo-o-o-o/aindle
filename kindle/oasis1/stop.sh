#!/bin/sh
ROOT=/mnt/us/aindle
: > "$ROOT/loop.stop"
rm -f "$ROOT/kick" "$ROOT/just_woke" "$ROOT/just_locked" "$ROOT/just_unlocked" \
  "$ROOT/locked.flag" "$ROOT/unlocked.flag" "$ROOT/next_paint_at" "$ROOT/fetching" \
  "$ROOT/saver_miss"
if [ -f "$ROOT/loop.pid" ]; then
  pid=$(cat "$ROOT/loop.pid" 2>/dev/null)
  if [ -n "$pid" ]; then
    # children: wake watcher / keys
    kill -TERM -"$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$ROOT/loop.pid"
fi
if [ -f "$ROOT/common.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/common.sh"
  if [ -f "$ROOT/hub.env" ]; then
    # shellcheck disable=SC1090
    . "$ROOT/hub.env"
  fi
  LOG=$ROOT/loop.log
  restore_radio
fi
# Do not fbink-clear here: that would flash-wipe a book if we are unlocked.
echo "[aindle] stop requested"
