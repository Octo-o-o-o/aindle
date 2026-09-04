# Oasis Monitor Demo

YoUsage → Aindle 对齐稿（不连 Hub、不是产品实现）：[`yousage-align.html`](yousage-align.html)。

两种显示，顶栏随时可切换：

- **小屏面板**：主机 / 限额 / 进行中 / 近 1 小时，一次一页。
- **大屏总览**：竖屏双栏（左限额、右任务），主机条带今日 token / 会话。

两种模式共用同一份 mock。顶栏「刷新」即整页重载，适合 e-ink 手动刷新。

## 尺寸与设备适配

所有字号、进度条高度、按钮、留白都以 **Oasis 1 竖屏 1072px 为基准**按比例缩放
（clamp 0.72–1.85），不再使用 `<font size>` 的 7 档固定字号。

默认模式判定：

- UA 含 `Kindle/x.x` 且非 Silk → e-ink → 面板；视口 ≥1700×1000（Scribe 档）→ 总览。
- 桌面 / 平板：短边 < 900px → 面板，否则总览。
- 顶栏手动点过后不会被自动检测改回去；旋转 / resize 会防抖重排。

URL 参数（可叠加）：

| 参数 | 取值 | 作用 |
|---|---|---|
| `mode` | `panels` / `full` | 强制模式 |
| `page` | `hosts` / `quota` / `now` / `recent`（或 0–3） | 面板初始页 |
| `device` | `oasis1` `oasis2` `oasis3` `pw` `basic` `dx` `scribe` | 桌面模拟设备档：套用该档缩放与默认模式（不改窗口大小） |
| `scale` | 0.4–3 | 直接指定缩放，覆盖其它计算 |
| `kindle` | `1` | 强制按 Kindle 面板模式 |
| `debug` | `1` | 顶栏显示视口、缩放、设备猜测、UA |

## 浏览器 / 固件兼容

- 纯 ES5 + table + bgcolor + 行内样式；进度条是两格黑白表格，不依赖 Flex / 渐变 / 阴影。
- 事件绑定用 `onclick` / `window.onresize`，`addEventListener` 仅在存在时用于 `orientationchange`。
- JS 整体 `try/catch`：初始化失败时在页面顶部显示原因，并提示改走 PNG 管线；`<noscript>` 同理。
- serve.py 对 `text/*` 补 `charset=utf-8`，避免老浏览器中文乱码。

## Mock 数据约定

时间线以「周四 9月3日 21:26」为锚点且自洽：限额重置时间都在将来；陈旧主机
（Windows，16 分钟前）名下不再有活跃任务，只有「最后活动 25 分钟前」的 IDLE；
订阅与任务的主机归属一致（Grok 在 MBP、公司 Codex 在 Mini 等）。

## 局域网

```bash
python3 demo/serve.py
```

- 小屏：`http://<hub-lan-ip>:8765/oasis-monitor.html?mode=panels`
- 大屏：`http://<hub-lan-ip>:8765/oasis-monitor.html?mode=full`
- Oasis 1 真机档：`http://<hub-lan-ip>:8765/oasis-monitor.html?device=oasis1&kindle=1`
