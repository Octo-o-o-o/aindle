#!/bin/sh
# Run on the Mac that hosts this repo. Copies Oasis 1 scripts to a mounted
# Kindle volume, or SSHes over USBNetwork if that interface is up.
set -eu
ROOT="$(cd "$(dirname "$0")" && pwd)"
KINDLE_VOL="${KINDLE_VOL:-}"
SSH_HOST="${KINDLE_SSH:-}"

if [ -z "$KINDLE_VOL" ]; then
  for v in /Volumes/Kindle /Volumes/Internal\ Storage /Volumes/KOA; do
    if [ -d "$v" ]; then
      KINDLE_VOL=$v
      break
    fi
  done
fi

if [ -z "$SSH_HOST" ]; then
  for h in 192.168.15.244 192.168.2.2; do
    if ping -c 1 -W 300 "$h" >/dev/null 2>&1; then
      SSH_HOST=$h
      break
    fi
  done
fi

copy_local() {
  dest=$1
  mkdir -p "$dest/aindle" "$dest/extensions/aindle" "$dest/documents"
  cp "$ROOT/common.sh" "$ROOT/loop.sh" "$ROOT/start.sh" "$ROOT/stop.sh" "$ROOT/page.sh" \
    "$ROOT/keys.sh" "$ROOT/refresh.sh" "$ROOT/operate.sh" "$ROOT/resume.sh" \
    "$ROOT/operate.html" "$ROOT/brand-icon.png" "$dest/aindle/"
  if [ ! -f "$dest/aindle/hub.env" ]; then
    cp "$ROOT/hub.env.example" "$dest/aindle/hub.env"
  fi
  # documents HTML is self-contained (data URI icon); no sibling PNG required.
  cp "$ROOT/operate.html" "$dest/documents/Aindle操作.html"
  cp "$ROOT/kual/config.xml" "$ROOT/kual/menu.json" "$dest/extensions/aindle/"
  rm -f "$dest/aindle/loop.pid" "$dest/aindle/kick" "$dest/aindle/just_woke" \
    "$dest/aindle/just_locked" "$dest/aindle/just_unlocked" \
    "$dest/aindle/locked.flag" "$dest/aindle/unlocked.flag" \
    "$dest/aindle/next_paint_at" "$dest/aindle/loop.stop" "$dest/aindle/fetching" \
    "$dest/aindle/saver_miss"
  echo "copied scripts to $dest"
}

if [ -n "$KINDLE_VOL" ]; then
  copy_local "$KINDLE_VOL"
  echo "eject the volume, then start from KUAL. USB mass storage cannot run fbink."
  exit 0
fi

if [ -n "$SSH_HOST" ]; then
  echo "USBNetwork host $SSH_HOST"
  ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$SSH_HOST" "mkdir -p /mnt/us/aindle /mnt/us/extensions/aindle"
  scp -o BatchMode=yes "$ROOT/common.sh" "$ROOT/loop.sh" "$ROOT/start.sh" "$ROOT/stop.sh" \
    "$ROOT/page.sh" "$ROOT/keys.sh" "$ROOT/refresh.sh" "$ROOT/operate.sh" \
    "$ROOT/resume.sh" "$ROOT/operate.html" "$ROOT/brand-icon.png" "$ROOT/hub.env.example" \
    "root@$SSH_HOST:/mnt/us/aindle/"
  # documents HTML is self-contained (data URI icon); no sibling PNG required.
  scp -o BatchMode=yes "$ROOT/operate.html" "root@$SSH_HOST:/mnt/us/documents/Aindle操作.html"
  scp -o BatchMode=yes "$ROOT/kual/config.xml" "$ROOT/kual/menu.json" "root@$SSH_HOST:/mnt/us/extensions/aindle/"
  ssh -o BatchMode=yes "root@$SSH_HOST" "test -f /mnt/us/aindle/hub.env || cp /mnt/us/aindle/hub.env.example /mnt/us/aindle/hub.env; rm -f /mnt/us/aindle/fetching /mnt/us/aindle/loop.stop /mnt/us/aindle/kick" || true
  echo "copied over SSH. start with: ssh root@$SSH_HOST sh /mnt/us/aindle/loop.sh local"
  exit 0
fi

echo "Kindle not found. Mount USB storage, or enable USBNetwork and set KINDLE_SSH=root-ip."
exit 1
