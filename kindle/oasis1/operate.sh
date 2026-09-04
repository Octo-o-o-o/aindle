#!/bin/sh
# Pause the PNG wallpaper and open the interactive monitor.
# Use this for 刷新 / 本机 / 中转 / 详情. Home + KUAL「回到壁纸」returns.

ROOT=/mnt/us/aindle
ENVFILE=$ROOT/hub.env
HTML=$ROOT/operate.html
DOC=/mnt/us/documents/Aindle操作.html

if [ -f "$ENVFILE" ]; then
  # shellcheck disable=SC1090
  . "$ENVFILE"
fi
HUB="${HUB:-http://192.168.1.2:8790}"
PATHQ="${OPERATE:-/monitor.html?device=oasis1&kindle=1}"
URL="$HUB$PATHQ"

# Loop only paints during screensaver, so the browser can stay up.
if [ -x /mnt/us/extensions/kindle-monitor/bin/stop.sh ]; then
  sh /mnt/us/extensions/kindle-monitor/bin/stop.sh >/dev/null 2>&1 || true
fi

lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1 || true

write_html() {
  dest=$1
  cat > "$dest" <<EOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${URL}">
<title>Aindle 操作</title>
</head>
<body style="font-family:sans-serif;padding:24px;">
<p>正在打开监控。若没有跳转，在实验浏览器里打开：</p>
<p><a href="${URL}">${URL}</a></p>
<p>看完后按 Home。锁屏仍是监控，解锁照常读书。</p>
</body>
</html>
EOF
}

write_html "$HTML"
write_html "$DOC" 2>/dev/null || true

echo "[aindle] operate $URL"

# Try known booklet / browser entry points. Firmware differs; HTML is the fallback.
if lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?uri=${URL}" >/dev/null 2>&1; then
  exit 0
fi
if lipc-set-prop com.lab126.appmgrd start "app://com.lab126.booklet.browser?uri=${URL}" >/dev/null 2>&1; then
  exit 0
fi
if [ -x /usr/bin/mesquite ]; then
  /usr/bin/mesquite -u "$URL" >/dev/null 2>&1 &
  exit 0
fi
if [ -x /usr/bin/browser ]; then
  /usr/bin/browser "$URL" >/dev/null 2>&1 &
  exit 0
fi

echo "[aindle] open experimental browser: $URL"
echo "[aindle] or open the document Aindle操作.html"
