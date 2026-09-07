#!/bin/sh
# Host-side checks for lock-screen wait math. No lipc required.
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
. "$ROOT/common.sh"

fail=0
check() {
  got=$1
  want=$2
  msg=$3
  if [ "$got" != "$want" ]; then
    echo "FAIL $msg: got $got want $want"
    fail=$((fail + 1))
  fi
}

check "$(rtc_delay 600 90 15)" 90 "cap long wait to heartbeat"
check "$(rtc_delay 30 90 15)" 30 "keep mid wait"
check "$(rtc_delay 5 90 15)" 15 "floor short wait"
check "$(rtc_delay 0 90 15)" 15 "floor zero"
check "$(rtc_delay 900 600 15)" 600 "cap long wait to paint interval"
check "$(rtc_delay 120 600 15)" 120 "keep mid wait under 600"
check "$(rtc_delay 3 '' 15)" 15 "invalid max falls back then floors"
check "$(deadline_left 1000 1600)" 600 "remaining to deadline"
check "$(deadline_left 1600 1600)" 0 "exactly due"
check "$(deadline_left 1700 1600)" 0 "past deadline stays zero"

tmp="${TMPDIR:-/tmp}/aindle-radio-prev-$$"
rm -f "$tmp"
radio_prev_write "$tmp" x
check "$(radio_prev_read "$tmp")" 1 "unknown radio snapshot becomes 1"
radio_prev_write "$tmp" 0
check "$(radio_prev_read "$tmp")" 1 "second snapshot does not overwrite"
radio_prev_clear "$tmp"
radio_prev_write "$tmp" 0
check "$(radio_prev_read "$tmp")" 0 "zero radio snapshot sticks"
radio_prev_clear "$tmp"
if radio_prev_read "$tmp" >/dev/null 2>&1; then
  echo "FAIL radio_prev_read missing file"
  fail=$((fail + 1))
fi
rm -f "$tmp"

# find_wakealarm must not crash when /sys/class/rtc is missing (host).
if find_wakealarm >/dev/null 2>&1; then
  alarm=$(find_wakealarm)
  echo "$alarm" | grep -q '/sys/class/rtc/rtc[0-9]/wakealarm' || {
    echo "FAIL find_wakealarm path: $alarm"
    fail=$((fail + 1))
  }
fi

if [ "$fail" -ne 0 ]; then
  echo "test-wait: $fail failed"
  exit 1
fi
echo "test-wait: ok"
