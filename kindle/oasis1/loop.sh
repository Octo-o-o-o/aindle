#!/bin/sh
# Aindle Oasis 1 lock-screen monitor.
# Paints only while the screensaver is up. Unlock keeps stock Kindle (books / Home).
# Sleep protocol (Online Screensaver / KindleCron / KOReader):
#   readyToSuspend → lipc -i rtcWakeup, then Wi-Fi off
#   wakeupFromSuspend / goingToScreenSaver → Wi-Fi on → fetch → Wi-Fi off
#   confirmed outOfScreenSaver → restore wirelessEnable from before this lock
#   abortSuspend only while a fetch is in progress
# Do not use deferSuspend: in readyToSuspend it can bounce powerd back to active.
# Start via start.sh so KUAL can exit. Stop: sh /mnt/us/aindle/stop.sh

ROOT=/mnt/us/aindle
IMG=$ROOT/dash.png
META=$ROOT/meta.json
STOP=$ROOT/loop.stop
PIDFILE=$ROOT/loop.pid
PAGEFILE=$ROOT/page
KICK=$ROOT/kick
LOCKING=$ROOT/just_locked
UNLOCKING=$ROOT/just_unlocked
WAKING=$ROOT/just_woke
NEXTPAINT=$ROOT/next_paint_at
FETCHING=$ROOT/fetching
LOG=$ROOT/loop.log
ENVFILE=$ROOT/hub.env

# shellcheck disable=SC1091
. "$ROOT/common.sh"

trap '' HUP
mkdir -p "$ROOT"
if [ -f "$ENVFILE" ]; then
  # shellcheck disable=SC1090
  . "$ENVFILE"
fi

HUB="${HUB:-http://192.168.1.2:8787}"
TOKEN="${TOKEN:-}"
PAGE="${PAGE:-local}"
# Locked refresh. Idle 10 min, busy 5 min. Override in hub.env.
LOCK_SEC="${LOCK_SEC:-600}"
LOCK_BUSY_SEC="${LOCK_BUSY_SEC:-300}"
# Cap rtcWakeup at the paint interval. powerd only accepts it in readyToSuspend.
LOCK_HEARTBEAT_SEC="${LOCK_HEARTBEAT_SEC:-600}"
# After a frame, leave the radio up until readyToSuspend. Suspend always
# turns it off so the next wake can bring Wi-Fi up cleanly. Set 1 only if
# you want the radio on during the ~1 min screensaver-awake window.
LOCK_HOLD_WIFI="${LOCK_HOLD_WIFI:-0}"
LOCK_WIFI_WAIT_SEC="${LOCK_WIFI_WAIT_SEC:-30}"
# Unlock puts wirelessEnable back to the value from before this lock.
# 0 = leave the radio as the lock path left it (often airplane).
UNLOCK_RESTORE_RADIO="${UNLOCK_RESTORE_RADIO:-1}"
arg=${1:-start}
case "$arg" in
  local|now|relay) PAGE=$arg ;;
  start|*) ;;
esac
case "$PAGE" in
  now|relay) ;;
  *) PAGE=local ;;
esac
printf '%s\n' "$PAGE" > "$PAGEFILE"

find_fbink() {
  for p in /mnt/us/libkh/bin/fbink /usr/bin/fbink /mnt/us/extensions/MRInstaller/bin/fbink; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

FBINK=$(find_fbink || true)
if [ -z "$FBINK" ]; then
  echo "[aindle] fbink not found" | tee -a "$LOG"
  exit 2
fi

if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$OLD" ] && [ "$OLD" != "$$" ] && kill -0 "$OLD" 2>/dev/null; then
    : > "$KICK"
    exit 0
  fi
fi

if [ -x /mnt/us/extensions/kindle-monitor/bin/stop.sh ]; then
  sh /mnt/us/extensions/kindle-monitor/bin/stop.sh >/dev/null 2>&1 || true
fi

echo $$ > "$PIDFILE"
rm -f "$STOP" "$FETCHING"
clear_saver_flags
echo "[aindle] start $(date) pid=$$ hub=$HUB page=$PAGE mode=screensaver lock=${LOCK_SEC}s busy=${LOCK_BUSY_SEC}s hb=${LOCK_HEARTBEAT_SEC}s wifi_hold=${LOCK_HOLD_WIFI} wifi_wait=${LOCK_WIFI_WAIT_SEC} restore=${UNLOCK_RESTORE_RADIO}" | tee -a "$LOG"

LOCK_PID=""
UNLOCK_PID=""
READY_PID=""
WAKE_PID=""
KEYS_PID=""
cleanup() {
  [ -n "$LOCK_PID" ] && kill "$LOCK_PID" 2>/dev/null
  [ -n "$UNLOCK_PID" ] && kill "$UNLOCK_PID" 2>/dev/null
  [ -n "$READY_PID" ] && kill "$READY_PID" 2>/dev/null
  [ -n "$WAKE_PID" ] && kill "$WAKE_PID" 2>/dev/null
  [ -n "$KEYS_PID" ] && kill "$KEYS_PID" 2>/dev/null
  restore_radio
  rm -f "$PIDFILE" "$IMG.tmp" "$KICK" "$LOCKING" "$UNLOCKING" "$WAKING" "$FETCHING" "$ROOT/saver_miss"
}
trap cleanup EXIT INT TERM
trap '' HUP

paint() {
  src=$1
  full=$2
  [ -s "$src" ] || return 1
  in_screensaver || return 0
  if [ "$full" = 1 ]; then
    "$FBINK" -f -c >/dev/null 2>&1 || true
  fi
  in_screensaver || return 0
  if ! "$FBINK" -g file="$src",w=-1,halign=center,valign=center -W GC16 >/dev/null 2>&1; then
    "$FBINK" -g file="$src" -W GC16 >/dev/null 2>&1 || true
  fi
  if ! in_screensaver; then
    echo "[aindle] paint raced unlock $(date)" >> "$LOG"
  fi
}

paint_cache() {
  if [ -s "$IMG" ]; then
    paint "$IMG" 1
    return 0
  fi
  return 1
}

radio_on() {
  lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1 || true
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1 || true
}

# After a successful/failed frame. HOLD_WIFI keeps the radio up until suspend.
radio_off() {
  still_locked || return 0
  [ "${LOCK_HOLD_WIFI:-0}" = 1 ] && return 0
  lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1 || true
}

# Always drop the radio before powerd freezes it. A "held" radio across
# suspend comes back as wirelessEnable=1 with no association.
radio_off_for_suspend() {
  still_locked || [ -f "$NEXTPAINT" ] || return 0
  [ -f "$FETCHING" ] && return 0
  lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1 || true
}

now_s() {
  date +%s 2>/dev/null || echo 0
}

paint_deadline() {
  if [ -r "$NEXTPAINT" ]; then
    tr -d ' \n\r' < "$NEXTPAINT"
    return
  fi
  echo 0
}

set_paint_deadline() {
  sec=$1
  now=$(now_s)
  if [ "$now" -gt 0 ] && [ -n "$sec" ]; then
    echo $((now + sec)) > "$NEXTPAINT"
  fi
}

clear_wake() {
  rm -f "$NEXTPAINT"
  clear_wakealarms
}

# sysfs is a fallback. powerd often overwrites it at suspend; lipc rtcWakeup
# during readyToSuspend is the write that actually sticks.
schedule_wake_sysfs() {
  sec=$1
  alarm=$(find_wakealarm) || return 1
  echo 0 > "$alarm" 2>/dev/null || true
  now=$(now_s)
  if [ "$now" -gt 0 ] && echo $((now + sec)) > "$alarm" 2>/dev/null; then
    return 0
  fi
  echo "+$sec" > "$alarm" 2>/dev/null
}

# Only call from readyToSuspend. Window-outside writes fail and are logged.
arm_rtc() {
  left=$1
  hb=${LOCK_HEARTBEAT_SEC:-600}
  sec=$(rtc_delay "$left" "$hb" 15)
  if lipc_set_int com.lab126.powerd rtcWakeup "$sec"; then
    echo "[aindle] rtcWakeup ${sec}s left=${left}s $(date)" >> "$LOG"
  else
    echo "[aindle] rtcWakeup FAIL sec=${sec} left=${left}s $(date)" >> "$LOG"
  fi
  schedule_wake_sysfs "$sec" || true
}

http_get() {
  url=$1
  dest=$2
  timeout=${3:-15}
  if command -v wget >/dev/null 2>&1; then
    wget -q -T "$timeout" -t 2 -O "$dest" "$url" >/dev/null 2>&1 && [ -s "$dest" ] && return 0
    rm -f "$dest"
    wget -q -O "$dest" "$url" >/dev/null 2>&1 &
    wpid=$!
    n=0
    while [ $n -lt "$timeout" ] && kill -0 "$wpid" 2>/dev/null; do
      sleep 1
      n=$((n + 1))
    done
    if kill -0 "$wpid" 2>/dev/null; then
      kill "$wpid" 2>/dev/null
      rm -f "$dest"
      return 1
    fi
    wait "$wpid" 2>/dev/null
    [ -s "$dest" ]
    return $?
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --connect-timeout 8 --max-time "$timeout" "$url" -o "$dest"
    return $?
  fi
  echo "[aindle] no wget/curl" >> "$LOG"
  return 1
}

kindle_batt() {
  for key in battLevel batteryLevel; do
    v=$(lipc-get-prop com.lab126.powerd "$key" 2>/dev/null | tr -d ' \n\r')
    echo "$v" | grep -qE '^[0-9]{1,3}$' || continue
    [ "$v" -ge 0 ] && [ "$v" -le 100 ] || continue
    echo "$v"
    return 0
  done
  if [ -r /sys/class/power_supply/battery/capacity ]; then
    v=$(tr -d ' \n\r' < /sys/class/power_supply/battery/capacity)
    echo "$v" | grep -qE '^[0-9]{1,3}$' || return 1
    [ "$v" -ge 0 ] && [ "$v" -le 100 ] || return 1
    echo "$v"
    return 0
  fi
  return 1
}

dash_url() {
  page=$1
  url="$HUB/dash.png?page=$page&t=$(now_s)"
  batt=$(kindle_batt || true)
  if [ -n "$batt" ]; then
    url="$url&batt=$batt"
  fi
  if [ -n "$TOKEN" ]; then
    url="$url&token=$TOKEN"
  fi
  printf '%s' "$url"
}

meta_url() {
  page=$1
  url="$HUB/eink-meta.json?page=$page"
  if [ -n "$TOKEN" ]; then
    url="$url&token=$TOKEN"
  fi
  printf '%s' "$url"
}

wait_wifi() {
  n=0
  max=${LOCK_WIFI_WAIT_SEC:-30}
  toggled=0
  while [ $n -lt "$max" ]; do
    st=$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)
    echo "$st" | grep -qi CONNECTED && return 0
    en=$(lipc-get-prop com.lab126.cmd wirelessEnable 2>/dev/null | tr -d ' \n\r')
    # Held-across-suspend radio: flag stays 1, association is dead.
    if [ "$en" = 1 ] && [ "$toggled" = 0 ] && [ "$n" -ge 5 ]; then
      echo "[aindle] wifi zombie toggle $(date)" >> "$LOG"
      lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1 || true
      sleep 1
      n=$((n + 1))
      toggled=1
    fi
    radio_on
    if [ $((n % 10)) -eq 9 ]; then
      wpa_cli -i wlan0 reassociate >/dev/null 2>&1 || true
    fi
    sleep 1
    n=$((n + 1))
  done
  return 1
}

next_lock_interval() {
  if [ -f "$META" ] && grep -q '"busy":1' "$META"; then
    echo "$LOCK_BUSY_SEC"
    return
  fi
  echo "$LOCK_SEC"
}

lock_watch() {
  while [ ! -f "$STOP" ]; do
    if lipc-wait-event com.lab126.powerd goingToScreenSaver >/dev/null 2>&1; then
      mark_locked
      remember_radio
      : > "$LOCKING"
      : > "$KICK"
    else
      sleep 5
    fi
  done
}

unlock_watch() {
  while [ ! -f "$STOP" ]; do
    if lipc-wait-event com.lab126.powerd outOfScreenSaver >/dev/null 2>&1; then
      : > "$UNLOCKING"
      : > "$KICK"
    else
      sleep 5
    fi
  done
}

# powerd only accepts rtcWakeup here. Re-arm on every readyToSuspend tick.
# Do not require isScreenSaver=1: Oasis often clears that bit before sleep.
ready_watch() {
  while [ ! -f "$STOP" ]; do
    if lipc-wait-event com.lab126.powerd readyToSuspend >/dev/null 2>&1; then
      if [ -f "$FETCHING" ]; then
        if lipc_set_int com.lab126.powerd abortSuspend 1; then
          echo "[aindle] readyToSuspend abortSuspend (fetching) $(date)" >> "$LOG"
        fi
        continue
      fi
      if [ ! -f "$NEXTPAINT" ] && [ ! -f "$ROOT/locked.flag" ]; then
        continue
      fi
      left=$(deadline_left "$(now_s)" "$(paint_deadline)")
      [ "$left" -gt 0 ] || left=15
      arm_rtc "$left"
      radio_off_for_suspend
    else
      sleep 5
    fi
  done
}

# RTC / cover-open wake: restore the last frame (pillow may have redrawn
# the book cover) and kick the main loop if a new PNG is due.
wake_watch() {
  while [ ! -f "$STOP" ]; do
    if lipc-wait-event com.lab126.powerd wakeupFromSuspend >/dev/null 2>&1; then
      : > "$WAKING"
      sleep 2
      if still_locked || [ -f "$NEXTPAINT" ]; then
        mark_locked
        radio_on
        paint_cache || true
        left=$(deadline_left "$(now_s)" "$(paint_deadline)")
        if [ "$left" -le 0 ]; then
          : > "$KICK"
        fi
      fi
      echo "[aindle] wakeupFromSuspend $(date)" >> "$LOG"
    else
      sleep 5
    fi
  done
}

lock_watch &
LOCK_PID=$!
unlock_watch &
UNLOCK_PID=$!
ready_watch &
READY_PID=$!
wake_watch &
WAKE_PID=$!
if [ -x "$ROOT/keys.sh" ]; then
  sh "$ROOT/keys.sh" >> "$LOG" 2>&1 &
  KEYS_PID=$!
fi

i=0
failures=0
FULL_EVERY=3
last_page=$PAGE

# Unlocked start must not cover Home / the book, and must not spin the radio.
if in_screensaver; then
  mark_locked
  remember_radio
  paint_cache || true
else
  restore_radio
fi

need_stop() {
  [ -f "$STOP" ]
}

need_wake() {
  [ -f "$KICK" ] || [ -f "$LOCKING" ] || [ -f "$UNLOCKING" ]
}

page_changed() {
  nowpage=$(tr -d ' \n\r' < "$PAGEFILE" 2>/dev/null)
  [ -n "$nowpage" ] && [ "$nowpage" != "$PAGE" ]
}

# isScreenSaver can flicker 0 during suspend. Need a few misses in a row.
poll_saver() {
  if lipc_screensaver; then
    rm -f "$ROOT/saver_miss"
    if [ ! -f "$ROOT/locked.flag" ]; then
      mark_locked
      remember_radio
      : > "$LOCKING"
      return 0
    fi
  elif [ -f "$ROOT/locked.flag" ]; then
    if powerd_asleep; then
      rm -f "$ROOT/saver_miss"
      return 1
    fi
    n=0
    if [ -r "$ROOT/saver_miss" ]; then
      n=$(tr -d ' \n\r' < "$ROOT/saver_miss")
    fi
    case "$n" in ''|*[!0-9]*) n=0 ;; esac
    n=$((n + 1))
    echo "$n" > "$ROOT/saver_miss"
    if [ "$n" -ge 3 ]; then
      rm -f "$ROOT/saver_miss"
      mark_unlocked
      : > "$UNLOCKING"
      return 0
    fi
  fi
  return 1
}

# Sleep in chunks so lock / unlock / page / KUAL refresh can break in.
# Use wall clock, not a sleep counter: after suspend, monotonic sleep
# may not have consumed the interval even though RTC already fired.
# Do not arm rtcWakeup here — it only sticks in readyToSuspend.
idle_wait() {
  want=$1
  chunk=$2
  [ -n "$chunk" ] || chunk=5
  rm -f "$KICK" "$WAKING"
  start=$(now_s)
  if [ "$start" -gt 0 ]; then
    deadline=$((start + want))
  else
    deadline=0
  fi
  if still_locked; then
    set_paint_deadline "$want"
  else
    clear_wake
  fi
  while :; do
    need_stop && return 1
    need_wake && return 0
    page_changed && return 0
    now=$(now_s)
    if [ "$deadline" -gt 0 ] && [ "$now" -ge "$deadline" ]; then
      return 0
    fi
    left=$want
    if [ "$deadline" -gt 0 ] && [ "$now" -gt 0 ]; then
      left=$((deadline - now))
    fi
    [ "$left" -lt 1 ] && return 0
    step=$chunk
    [ "$left" -lt "$step" ] && step=$left
    [ "$step" -lt 1 ] && return 0
    sleep "$step"
    poll_saver && return 0
  done
}

end_fetch() {
  rm -f "$FETCHING"
  radio_off
}

fetch_and_paint() {
  if ! in_screensaver && [ ! -f "$ROOT/locked.flag" ]; then
    return 0
  fi
  : > "$FETCHING"
  radio_on
  if ! wait_wifi; then
    echo "[aindle] $(date) wifi miss page=$PAGE" >> "$LOG"
    failures=$((failures + 1))
    end_fetch
    return 1
  fi
  tries=0
  while [ "$tries" -lt 2 ]; do
    if http_get "$(dash_url "$PAGE")" "$IMG.tmp" 18 && [ -s "$IMG.tmp" ]; then
      mv "$IMG.tmp" "$IMG"
      http_get "$(meta_url "$PAGE")" "$META" 8 || true
      failures=0
      full=0
      if [ "$PAGE" != "$last_page" ] || [ $((i % FULL_EVERY)) -eq 0 ]; then
        full=1
      fi
      paint "$IMG" "$full"
      last_page=$PAGE
      i=$((i + 1))
      echo "[aindle] $(date) painted page=$PAGE i=$i" >> "$LOG"
      end_fetch
      return 0
    fi
    tries=$((tries + 1))
    rm -f "$IMG.tmp"
    sleep 2
  done
  failures=$((failures + 1))
  echo "[aindle] $(date) fetch fail #$failures page=$PAGE" >> "$LOG"
  end_fetch
  return 1
}

while [ ! -f "$STOP" ]; do
  PAGE=$(tr -d ' \n\r' < "$PAGEFILE" 2>/dev/null)
  case "$PAGE" in
    now|relay) ;;
    *) PAGE=local ;;
  esac

  if [ -f "$UNLOCKING" ]; then
    rm -f "$UNLOCKING" "$LOCKING" "$WAKING" "$FETCHING"
    # Pillow / suspend can emit outOfScreenSaver while the cover is still
    # closed. Wait a few seconds; if saver or readyToSuspend comes back,
    # keep the RTC. A 1s check was too short on Oasis.
    n=0
    kept=0
    restored=0
    while [ "$n" -lt 5 ]; do
      sleep 1
      if in_screensaver || powerd_asleep; then
        mark_locked
        echo "[aindle] ignore unlock, still saver/sleep $(date)" >> "$LOG"
        kept=1
        break
      fi
      if [ "$restored" = 0 ]; then
        restore_radio 1
        restored=1
      fi
      n=$((n + 1))
    done
    if [ "$kept" = 1 ]; then
      continue
    fi
    mark_unlocked
    clear_wake
    restore_radio
    rm -f "$ROOT/saver_miss"
    echo "[aindle] unlocked $(date)" >> "$LOG"
    idle_wait 3600 5
    continue
  fi

  if [ -f "$LOCKING" ]; then
    rm -f "$LOCKING"
    mark_locked
    echo "[aindle] locking $(date)" >> "$LOG"
    # Let blanket finish the stock cover, then show the last frame with no radio.
    sleep 4
    if in_screensaver; then
      paint_cache || true
      i=0
      fetch_and_paint || true
    fi
    if in_screensaver; then
      idle_wait "$(next_lock_interval)" 5
    fi
    continue
  fi

  if in_screensaver || [ -f "$ROOT/locked.flag" ]; then
    if fetch_and_paint; then
      idle_wait "$(next_lock_interval)" 5
    elif [ "$failures" -le 1 ]; then
      idle_wait 60 5
    else
      idle_wait "$(next_lock_interval)" 5
    fi
    continue
  fi

  # Unlocked: do not pull frames. Radio already restored to the pre-lock switch.
  idle_wait 3600 5
done

echo "[aindle] stop $(date)" | tee -a "$LOG"
