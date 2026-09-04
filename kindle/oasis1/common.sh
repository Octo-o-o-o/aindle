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

# Kindle readyToSuspend lasts ~10s and the alarm can fire early.
# Never ask powerd for a wake shorter than 15s; never farther than heartbeat.
rtc_delay() {
  left=${1:-0}
  hb=${2:-90}
  min=${3:-15}
  case "$left" in ''|*[!0-9-]* ) left=0 ;; esac
  case "$hb" in ''|*[!0-9]* ) hb=90 ;; esac
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
