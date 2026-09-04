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
check "$(deadline_left 1000 1600)" 600 "remaining to deadline"
check "$(deadline_left 1600 1600)" 0 "exactly due"
check "$(deadline_left 1700 1600)" 0 "past deadline stays zero"

if [ "$fail" -ne 0 ]; then
  echo "test-wait: $fail failed"
  exit 1
fi
echo "test-wait: ok"
