#!/bin/sh
# KUAL must return immediately. The lock-screen loop runs in the background.
# Does not paint over Home or a book. Next screensaver shows the monitor.

ROOT=/mnt/us/aindle
PAGE=${1:-local}
case "$PAGE" in
  now|relay) ;;
  *) PAGE=local ;;
esac

mkdir -p "$ROOT"
if [ -f "$ROOT/common.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/common.sh"
else
  in_screensaver() { return 1; }
fi
printf '%s\n' "$PAGE" > "$ROOT/page"
rm -f "$ROOT/loop.stop"

FBINK=""
for p in /mnt/us/libkh/bin/fbink /usr/bin/fbink; do
  if [ -x "$p" ]; then
    FBINK=$p
    break
  fi
done

paint_if_locked() {
  [ -n "$FBINK" ] || return 1
  [ -s "$ROOT/dash.png" ] || return 1
  in_screensaver || return 0
  "$FBINK" -f -c >/dev/null 2>&1 || true
  in_screensaver || return 0
  "$FBINK" -g file="$ROOT/dash.png",w=-1,halign=center,valign=center -W GC16 >/dev/null 2>&1 || \
    "$FBINK" -g file="$ROOT/dash.png" -W GC16 >/dev/null 2>&1 || true
}

if [ -f "$ROOT/loop.pid" ]; then
  old=$(cat "$ROOT/loop.pid" 2>/dev/null)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    : > "$ROOT/kick"
    paint_if_locked || true
    echo "[aindle] kick running pid=$old page=$PAGE"
    exit 0
  fi
fi

paint_if_locked || true

if command -v nohup >/dev/null 2>&1; then
  nohup sh "$ROOT/loop.sh" "$PAGE" >> "$ROOT/loop.log" 2>&1 &
else
  sh "$ROOT/loop.sh" "$PAGE" >> "$ROOT/loop.log" 2>&1 </dev/null &
fi
echo "[aindle] spawned $! page=$PAGE mode=screensaver"
exit 0
