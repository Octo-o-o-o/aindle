#!/bin/sh
# Cycle or set the lock-screen page. Paints only while the screensaver is up.
#   sh /mnt/us/aindle/page.sh next
#   sh /mnt/us/aindle/page.sh prev
#   sh /mnt/us/aindle/page.sh local|now|relay

ROOT=/mnt/us/aindle
PAGEFILE=$ROOT/page
KICK=$ROOT/kick
cur=$(tr -d ' \n\r' < "$PAGEFILE" 2>/dev/null)
case "$cur" in
  now|relay) ;;
  *) cur=local ;;
esac

cmd=${1:-next}
case "$cmd" in
  local|now|relay) next=$cmd ;;
  prev)
    case "$cur" in
      local) next=relay ;;
      now) next=local ;;
      *) next=now ;;
    esac
    ;;
  *)
    case "$cur" in
      local) next=now ;;
      now) next=relay ;;
      *) next=local ;;
    esac
    ;;
esac

printf '%s\n' "$next" > "$PAGEFILE"
: > "$KICK"
echo "[aindle] page $cur -> $next"
