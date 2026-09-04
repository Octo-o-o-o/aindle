#!/bin/sh
# Make sure the lock-screen loop is running. Does not cover the book.
ROOT=/mnt/us/aindle
PAGE=$(tr -d ' \n\r' < "$ROOT/page" 2>/dev/null)
sh "$ROOT/start.sh" "${PAGE:-local}"
echo "[aindle] lock-screen monitor on"
