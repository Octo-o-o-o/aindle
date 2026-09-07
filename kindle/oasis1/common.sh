# Shared helpers. ROOT must be set by the caller.
# Flags: locked.flag / unlocked.flag cover the lag window only.
# Live isScreenSaver 0/1 always wins — a spurious outOfScreenSaver must not
# freeze the lock-screen loop as "unlocked".

lipc_saver_bit() {
  v=$(lipc-get-prop com.lab126.powerd isScreenSaver 2>/dev/null | tr -d ' \n\r')
  case "$v" in
    1) echo 1 ;;
    0) echo 0 ;;
    *) echo x ;;
  esac
}

lipc_screensaver() {
  bit=$(lipc_saver_bit)
  [ "$bit" = 1 ] && return 0
  [ "$bit" = 0 ] && return 1
  st=$(lipc-get-prop com.lab126.powerd status 2>/dev/null)
  echo "$st" | grep -qiE 'screen[[:space:]]*saver|screensaver'
}

in_screensaver() {
  bit=$(lipc_saver_bit)
  [ "$bit" = 1 ] && return 0
  [ "$bit" = 0 ] && return 1
  [ -f "$ROOT/unlocked.flag" ] && return 1
  [ -f "$ROOT/locked.flag" ] && return 0
  st=$(lipc-get-prop com.lab126.powerd status 2>/dev/null)
  echo "$st" | grep -qiE 'screen[[:space:]]*saver|screensaver'
}

# Oasis can drop isScreenSaver to 0 on the way into suspend. Treat
# ready-to-sleep as still locked so we do not clear the RTC.
powerd_asleep() {
  st=$(lipc-get-prop com.lab126.powerd status 2>/dev/null)
  echo "$st" | grep -qiE 'ready to suspend|going to suspend|sleeping|screen[[:space:]]*saver|screensaver'
}

still_locked() {
  in_screensaver && return 0
  [ -f "$ROOT/locked.flag" ] && return 0
  powerd_asleep && return 0
  return 1
}

mark_locked() {
  rm -f "$ROOT/unlocked.flag"
  : > "$ROOT/locked.flag"
}

mark_unlocked() {
  rm -f "$ROOT/locked.flag"
  : > "$ROOT/unlocked.flag"
}

clear_saver_flags() {
  rm -f "$ROOT/locked.flag" "$ROOT/unlocked.flag"
}

# powerd rtcWakeup / abortSuspend / deferSuspend are Int. Without -i the
# write is often a silent no-op.
lipc_set_int() {
  lipc-set-prop -i "$1" "$2" "$3" >/dev/null 2>&1
}

# Oasis / PW3 class boards may expose rtc1 instead of rtc0.
find_wakealarm() {
  for n in 0 1 2 3; do
    p="/sys/class/rtc/rtc$n/wakealarm"
    if [ -w "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

clear_wakealarms() {
  for n in 0 1 2 3; do
    p="/sys/class/rtc/rtc$n/wakealarm"
    if [ -w "$p" ]; then
      echo 0 > "$p" 2>/dev/null || true
    fi
  done
}

# Kindle readyToSuspend lasts ~10s and the alarm can fire early.
# Never ask powerd for a wake shorter than 15s; never farther than max.
rtc_delay() {
  left=${1:-0}
  hb=${2:-600}
  min=${3:-15}
  case "$left" in ''|*[!0-9-]* ) left=0 ;; esac
  case "$hb" in ''|*[!0-9]* ) hb=600 ;; esac
  case "$min" in ''|*[!0-9]* ) min=15 ;; esac
  [ "$left" -lt "$min" ] && left=$min
  [ "$left" -gt "$hb" ] && left=$hb
  echo "$left"
}

deadline_left() {
  now=${1:-0}
  deadline=${2:-0}
  case "$now" in ''|*[!0-9]* ) echo 0; return ;; esac
  case "$deadline" in ''|*[!0-9]* ) echo 0; return ;; esac
  left=$((deadline - now))
  [ "$left" -lt 0 ] && left=0
  echo "$left"
}

# Snapshot wirelessEnable before the loop toggles the radio. 1 = on, 0 =
# airplane / wireless off. Unknown reads count as 1 (user usually wants net).
# remember only once per lock session so a later radio_off does not overwrite.
radio_prev_file() {
  echo "${RADIO_PREV:-$ROOT/radio.prev}"
}

radio_prev_write() {
  dest=$1
  val=$2
  [ -f "$dest" ] && return 0
  case "$val" in
    0|1) echo "$val" > "$dest" ;;
    *) echo 1 > "$dest" ;;
  esac
}

radio_prev_read() {
  dest=$1
  [ -f "$dest" ] || return 1
  tr -d ' \n\r' < "$dest"
}

radio_prev_clear() {
  dest=$1
  rm -f "$dest"
}

radio_read() {
  v=$(lipc-get-prop com.lab126.cmd wirelessEnable 2>/dev/null | tr -d ' \n\r')
  case "$v" in
    1) echo 1 ;;
    0) echo 0 ;;
    *) echo x ;;
  esac
}

radio_apply() {
  case "$1" in
    1)
      lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1 || true
      lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1 || true
      ;;
    0)
      lipc-set-prop com.lab126.cmd wirelessEnable 0 >/dev/null 2>&1 || true
      ;;
  esac
}

remember_radio() {
  [ "${UNLOCK_RESTORE_RADIO:-1}" = 0 ] && return 0
  radio_prev_write "$(radio_prev_file)" "$(radio_read)"
}

# Apply the saved switch. keep=1 leaves the file (false unlock / still checking).
restore_radio() {
  keep=${1:-0}
  [ "${UNLOCK_RESTORE_RADIO:-1}" = 0 ] && return 0
  dest=$(radio_prev_file)
  prev=$(radio_prev_read "$dest") || return 0
  radio_apply "$prev"
  if [ "$keep" != 1 ]; then
    radio_prev_clear "$dest"
  fi
  if [ -n "${LOG:-}" ]; then
    echo "[aindle] restore radio was=${prev} keep=${keep} $(date)" >> "$LOG"
  fi
}
