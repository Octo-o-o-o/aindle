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
HUB="${HUB:-http://192.168.1.2:8787}"
PATHQ="${OPERATE:-/monitor.html?device=oasis1&kindle=1}"
URL="$HUB$PATHQ"

# Loop only paints during screensaver, so the browser can stay up.
if [ -x /mnt/us/extensions/kindle-monitor/bin/stop.sh ]; then
  sh /mnt/us/extensions/kindle-monitor/bin/stop.sh >/dev/null 2>&1 || true
fi

lipc-set-prop com.lab126.cmd wirelessEnable 1 >/dev/null 2>&1 || true

write_html() {
  dest=$1
  cat > "$dest" <<AIN_OPERATE_HTML
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${URL}">
<title>Aindle 操作</title>
</head>
<body style="font-family:sans-serif;padding:24px;">
<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsSAAALEgHS3X78AAADYklEQVRYw+1Wz2tcVRT+zrnvvUwyc9+bl7FjphbBkRLNwoVZFYvUgrgzLYIL3QjVpUXpHxCyqX+BBVcWqoIo2kZ3BVEbcCMILiXpIiDTNA8yLcZ58+a9+3UxMzCERCck1s18y3vPOfe73z0/LjDBBP8z5Ah+umfNAeDjIi2HWD9WBQQAG43GTKfTuUgWZwEVT2TNm5r6dmtra3do818QGB7+xO7u7lcAz4Fwgz0VkZ9nyuU3Wq1WchgS5hAEFACNMdcAXiDZBSEESKAH4Nk8z5/sdrs3h7bHqYACcNVq9WVXFD+wH1tFJCUBkCUCTkRkamrqfJIkPw19xgk8DggAzrkPABgQTiDief7bQRC8JSLSP4za62UfHnfWKwDEcfyStbZXqVR61lYYReEaSQGAKArvVCoV2kqlZ63N4zg+O+4Fx1UApLsMwBOBExGoms9EpP8War4QEbCvgnHOXT7U7f7t7etxfMY5dxGgAxAAuGetuTU0stbcFOAegACEI92Fer1+ZpADemQF0qK4AsAH0OvfXlc3N5PWoIrM5mbSUtVV7avQI+lnWXrlqAooAFer1c6RXCKRDcvW94MbI8lJAPCD4Ab7ZeWByIqCS7Va7ZVxVDiwPBcXF/0oitbCMGQY2iwMLaMo/G4f8tpPxuj70FqG1mZhZBlF4dpAuQNL3vwTgVKpdCJLUyXwjSp+AzQ0oluNkydv7+zspCP9n81mM0rT9DUIu6ryCRw+FzV/NBqNu+12e/cwBAQAFxYWgiRJ3iuce1pVYYzeLZWmP5ZA19O//n6nND39Z6fT2QaA2dnZ57M0fd/z5etSqfypc5whcMo5dyrLsmeazeav29vbxbid0AAoqtXq66S7RYKDxi4AIYLbvu9/aYxfAnB94HMpz/NulmVvisj5QWAShEBEVJfa7fbqMPboYd5BXY/ku87Rici6I1MAKUAQ8lyW5Vc9D7+Uy+UfPc+ZBw86r+Z5/iKADsk7IqKOnBHBtCNPK3kJwOp+8+HAWVCvV18oCpNFUdTa2Nh4OGg6AoBzc3Mnut3usqrmAOicS2u12kfr6+sPRyfh/Py8TZLkKWOK4P799u/H0ZJ1lHQURdfjOL62j40ex39A99b63r3l5WUAwMrKykF2o78kBzy+79kEE0wwNh4BV7di1pLIPEoAAAAASUVORK5CYII=" width="32" height="32" alt="Aindle"></p>
<p>正在打开监控。若没有跳转，在实验浏览器里打开：</p>
<p><a href="${URL}">${URL}</a></p>
<p>看完后按 Home。锁屏仍是监控，解锁照常读书。</p>
</body>
</html>
AIN_OPERATE_HTML
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
