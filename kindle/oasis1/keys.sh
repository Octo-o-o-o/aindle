#!/bin/sh
# Best-effort Oasis 1 page-turn watcher.
# Looks for PAGEUP / PAGEDOWN (104 / 109) on /dev/input/event*.
# Safe to leave running; unknown devices are ignored.

ROOT=/mnt/us/aindle
PAGE_SH=$ROOT/page.sh
LOG=$ROOT/keys.log
if [ -f "$ROOT/common.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/common.sh"
else
  in_screensaver() { return 1; }
fi

# 16-byte input_event on 32-bit Kindle kernels:
# timeval(8) + type(2) + code(2) + value(4)
# type 1 = EV_KEY, value 1 = press
# Portable: hexdump one event at a time.
watch_hex() {
  dev=$1
  [ -r "$dev" ] || return 1
  while [ -r "$dev" ]; do
    line=$(dd if="$dev" bs=16 count=1 2>/dev/null | hexdump -v -e '16/1 "%02x"')
    [ ${#line} -eq 32 ] || continue
    type=$(printf '%s' "$line" | cut -c17-20)
    code=$(printf '%s' "$line" | cut -c21-24)
    value=$(printf '%s' "$line" | cut -c25-32)
    # little-endian type/code: 0100 = EV_KEY
    [ "$type" = "0100" ] || continue
    [ "$value" = "01000000" ] || continue
    case "$code" in
      6d00|6D00|6800)
        # Page keys stay with the book while unlocked.
        in_screensaver || continue
        if [ "$code" = "6800" ]; then
          sh "$PAGE_SH" prev
        else
          sh "$PAGE_SH" next
        fi
        ;;
    esac
  done
}

echo "[aindle-keys] start $(date)" >> "$LOG"
for dev in /dev/input/event0 /dev/input/event1 /dev/input/event2 /dev/input/event3; do
  if [ -r "$dev" ]; then
    watch_hex "$dev" &
  fi
done
wait
