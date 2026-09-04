# Demo 复核（另一会话改动）

对照 [`demo/oasis-monitor.html`](../demo/oasis-monitor.html) 与 [`demo/README.md`](../demo/README.md)，另一会话相对「Flex 失效版」的主要改动如下。

## 结论

**Demo 质量已可用于 Kindle 实验浏览器对照**；另一会话的改动方向正确，mock 时间线也更自洽。正式产品 UI 已复用同一套渲染逻辑，数据源改为 Hub 的 `/view.json`。

## 改动清单

| 项 | 之前 | 现在 |
|---|---|---|
| 布局 | Flex 进度条（Kindle 上成 `\|\|`） | `<table>` 双格 + `bgcolor` 黑白条 |
| JS | 现代语法风险 | 纯 ES5：`var`、`onclick`、`try/catch` 包裹 boot |
| 字号 | `<font size>` 7 档 | 以 Oasis 1 宽 1072px 为基准的 `px()` 缩放（clamp 0.72–1.85） |
| 模式 | 仅 panels/full | + `device` 预设（oasis1…scribe）、`scale`、`kindle=1`、`debug=1` |
| 设备检测 | 简单视口 | UA `Kindle/x.x` 非 Silk → e-ink；Scribe 档 ≥1700×1000 → 总览 |
| 失败 UX | 白屏/半渲染 | 顶栏或 `<noscript>` 提示改走 PNG+FBInk |
| Mock | 时间/主机归属偶有矛盾 | 锚点「周四 9/3 21:26」；Windows 陈旧且无活跃任务 |
| serve.py | 基础静态 | `text/*` 补 `charset=utf-8`，`Cache-Control: no-store` |

## 仍保留的 Demo 边界

- 数据仍是 **内嵌 MOCK**，不连 Hub（静态 demo 目录不变）。
- **无 PNG 输出**；Kindle 侧仍依赖实验浏览器或后续 FBInk 管线。
- Cursor / Grok 限额条在 mock 里有样例，**正式 agent 尚未接 API**（Stage 2）。

## 与正式产品的关系

| 路径 | 用途 |
|---|---|
| `demo/oasis-monitor.html` | 离线 mock、LAN `:8765` 预览 |
| `packages/hub/public/monitor.html` | Hub `:8787` 实时 UI，拉 `/view.json` |

两者渲染逻辑同源；Hub 版顶栏显示 **LIVE** 与快照时间戳。
