#!/bin/sh
# Aindle Oasis 1 lock-screen monitor.
# Paints only while the screensaver is up. Unlock keeps stock Kindle (books / Home).
# Battery: e-ink keeps the last frame. Wi-Fi stays up while locked so the next
# pull can succeed after powerd suspend. Unlock does not hold the radio.
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

HUB="${HUB:-http://192.168.1.2:8790}"
TOKEN="${TOKEN:-}"
PAGE="${PAGE:-local}"
# Locked refresh. Idle 10 min, busy 5 min. Override in hub.env.
LOCK_SEC="${LOCK_SEC:-600}"
LOCK_BUSY_SEC="${LOCK_BUSY_SEC:-300}"
# Kindle only honors lipc rtcWakeup while in readyToSuspend. Keep waking
# at least this often so the loop is not frozen past the paint deadline.
LOCK_HEARTBEAT_SEC="${LOCK_HEARTBEAT_SEC:-90}"
# Hold Wi-Fi while locked. Set 0 to turn the radio off between frames.
LOCK_HOLD_WIFI="${LOCK_HOLD_WIFI:-1}"
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
rm -f "$STOP"
clear_saver_flags
echo "[aindle] start $(date) pid=$$ hub=$HUB page=$PAGE mode=screensaver lock=${LOCK_SEC}s busy=${LOCK_BUSY_SEC}s hb=${LOCK_HEARTBEAT_SEC}s wifi_hold=${LOCK_HOLD_WIFI}" | tee -a "$LOG"

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
  rm -f "$PIDFILE" "$IMG.tmp" "$KICK" "$LOCKING" "$UNLOCKING" "$WAKING"
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

radio_off() {
  in_screensaver || return 0
  [ "${LOCK_HOLD_WIFI:-1}" = 1 ] && return 0
  lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1 || true
}

# powerd freezes userspace after screensaver → readyToSuspend. deferSuspend
# only helps while this process still runs. The alarm that actually wakes
# Oasis is lipc rtcWakeup, and powerd only accepts it in readyToSuspend.
keep_awake() {
  lipc-set-prop com.lab126.powerd deferSuspend "${LOCK_HEARTBEAT_SEC:-90}" >/dev/null 2>&1 || true
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
  if [ -w /sys/class/rtc/rtc0/wakealarm ]; then
    echo 0 > /sys/class/rtc/rtc0/wakealarm 2>/dev/null || true
  fi
}

# sysfs is a fallback. On modern Kindle firmware it is often ignored;
# readyToSuspend must also call lipc rtcWakeup.
schedule_wake_sysfs() {
  sec=$1
  [ -e /sys/class/rtc/rtc0/wakealarm ] || return 1
  echo 0 > /sys/class/rtc/rtc0/wakealarm 2>/dev/null || true
  now=$(now_s)
  if [ "$now" -gt 0 ] && echo $((now + sec)) > /sys/class/rtc/rtc0/wakealarm 2>/dev/null; then
    return 0
  fi
  echo "+$sec" > /sys/class/rtc/rtc0/wakealarm 2>/dev/null
}

schedule_wake() {
  left=$1
  hb=${LOCK_HEARTBEAT_SEC:-90}
  sec=$(rtc_delay "$left" "$hb" 15)
  keep_awake
  # lipc is the supported API; it only sticks during readyToSuspend.
  lipc-set-prop com.lab126.powerd rtcWakeup "$sec" >/dev/null 2>&1 || true
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
  while [ $n -lt 90 ]; do
    keep_awake
    st=$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)
    echo "$st" | grep -qi CONNECTED && return 0
    radio_on
    if [ $((n % 15)) -eq 14 ]; then
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
ready_watch() {
  while [ ! -f "$STOP" ]; do
    if lipc-wait-event com.lab126.powerd readyToSuspend >/dev/null 2>&1; then
      left=$(deadline_left "$(now_s)" "$(paint_deadline)")
      [ "$left" -gt 0 ] || left=${LOCK_HEARTBEAT_SEC:-90}
      schedule_wake "$left"
      echo "[aindle] readyToSuspend rtc=${left}s $(date)" >> "$LOG"
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
      keep_awake
      if in_screensaver; then
        mark_locked
        radio_on
        paint_cache || true
        left=$(deadline_left "$(now_s)" "$(paint_deadline)")
        if [ "$left" -le 0 ]; then
          : > "$KICK"
        else
          schedule_wake "$left"
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
  paint_cache || true
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

poll_saver() {
  if lipc_screensaver; then
    if [ ! -f "$ROOT/locked.flag" ]; then
      mark_locked
      : > "$LOCKING"
      return 0
    fi
  elif [ -f "$ROOT/locked.flag" ]; then
    mark_unlocked
    : > "$UNLOCKING"
    return 0
  fi
  return 1
}

# Sleep in chunks so lock / unlock / page / KUAL refresh can break in.
# Use wall clock, not a sleep counter: after suspend, monotonic sleep
# may not have consumed the interval even though RTC already fired.
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
  if in_screensaver; then
    set_paint_deadline "$want"
    schedule_wake "$want"
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
    if in_screensaver; then
      schedule_wake "$left"
    fi
    step=$chunk
    [ "$left" -lt "$step" ] && step=$left
    [ "$step" -lt 1 ] && return 0
    sleep "$step"
    poll_saver && return 0
  done
}

fetch_and_paint() {
  in_screensaver || return 0
  keep_awake
  radio_on
  if ! wait_wifi; then
    echo "[aindle] $(date) wifi miss page=$PAGE" >> "$LOG"
    failures=$((failures + 1))
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
      radio_off
      return 0
    fi
    tries=$((tries + 1))
    rm -f "$IMG.tmp"
    sleep 2
  done
  failures=$((failures + 1))
  echo "[aindle] $(date) fetch fail #$failures page=$PAGE" >> "$LOG"
  return 1
}

while [ ! -f "$STOP" ]; do
  PAGE=$(tr -d ' \n\r' < "$PAGEFILE" 2>/dev/null)
  case "$PAGE" in
    now|relay) ;;
    *) PAGE=local ;;
  esac

  if [ -f "$UNLOCKING" ]; then
    rm -f "$UNLOCKING" "$LOCKING" "$WAKING"
    # Pillow can emit outOfScreenSaver while still in the saver.
    # Believe lipc after a beat; a fake unlock used to clear the RTC
    # and leave the wallpaper stuck on the first frame.
    sleep 1
    if in_screensaver; then
      mark_locked
      echo "[aindle] ignore unlock, still saver $(date)" >> "$LOG"
      continue
    fi
    mark_unlocked
    clear_wake
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

  if in_screensaver; then
    if fetch_and_paint; then
      idle_wait "$(next_lock_interval)" 5
    elif [ "$failures" -le 1 ]; then
      idle_wait 60 5
    else
      idle_wait "$(next_lock_interval)" 5
    fi
    continue
  fi

  # Unlocked: do not pull frames or hold Wi-Fi. Wait for the next lock.
  idle_wait 3600 5
done

echo "[aindle] stop $(date)" | tee -a "$LOG"
