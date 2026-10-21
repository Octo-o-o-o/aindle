#!/bin/sh
# Cycle or set the lock-screen page. Paints only while the screensaver is up.
#   sh /mnt/us/aindle/page.sh next
#   sh /mnt/us/aindle/page.sh prev
#   sh /mnt/us/aindle/page.sh local|now|relay

ROOT=/mnt/us/aindle
PAGEFILE=$ROOT/page
KICK=$ROOT/kick
cur=$(tr -d ' \n\r' < "$PAGEFILE" 2>/dev/null)
if [ -f "$ROOT/hub.env" ]; then . "$ROOT/hub.env"; fi
if [ "${OCTOOOO_MODE:-0}" = 1 ]; then
  case "$cur" in *[!0-9]*|'') cur=0 ;; esac
  pages=$(sed -n 's/.*"pages":[ ]*\([0-9][0-9]*\).*/\1/p' "$ROOT/meta.json" 2>/dev/null)
  case "$pages" in *[!0-9]*|'') pages=1 ;; esac
  [ "$pages" -ge 1 ] && [ "$pages" -le 10000 ] || pages=1
  case "${1:-next}" in prev) next=$(( (cur + pages - 1) % pages )) ;; *) next=$(( (cur + 1) % pages )) ;; esac
  printf '%s\n' "$next" > "$PAGEFILE"
  : > "$KICK"
  echo "[aindle] Octoooo page $cur -> $next"
  exit 0
fi
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
