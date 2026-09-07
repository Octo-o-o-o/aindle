# Oasis Monitor Demo

`oasis-monitor.html` 是 `packages/hub/public/monitor.html` 的静态演示版：**由
[`../scripts/build-demo.mjs`](../scripts/build-demo.mjs) 生成，请勿手改**。

- 改样式 / 布局 / 交互 → 编辑 `packages/hub/public/monitor.html`
- 改演示数据 → 编辑 [`mock-view.json`](mock-view.json)（复杂）或
  [`mock-view-simple.json`](mock-view-simple.json)（单机）
- 重新生成：

```bash
node scripts/build-demo.mjs          # 写回 oasis-monitor.html + oasis-monitor-simple.html
node scripts/build-demo.mjs --check  # 校验 demo 是否最新（check.sh 会跑）
```

生成原理：monitor.html 里有一个 `<!--DEMO-MOCK-->` 锚点；构建时把
`window.AINDLE_MOCK = <mock-view.json>` 注入到锚点处。页面检测到
`window.AINDLE_MOCK` 就不再请求 `/view.json`，顶栏徽标从 `LIVE` 变为 `DEMO`。

## 两种显示

顶栏随时可切换（按钮在窄屏下会收成「总览 / 面板」）：

- **小屏账本**（手机、窄窗口、Kindle 档）：单页滚动一页装完——衬线日期报头 + 限额账本行
  （品牌图标、双窗胶囊条、<90% 斜纹软填充）+ 进行中 + 已完成 + 钉底页脚。
  ≥700px 时限额是锁屏式单行（名称│竖线│双窗条并排）；<700px 每份订阅名称一行、窗口各自一行。
  ≤3 份订阅自动换宽松大卡；>8 份按烧速取 8 份；列表超长显示「另有 N 项」；
  全无数据时是居中整块空态。
- **大屏总览**：主机条带 + 限额整宽单栏，下方左右分栏（进行中 / 已完成）；≥1600px 时限额卡两列。
- **Scribe / 大屏账本**（`?device=scribe`、UA 含 Scribe / Kindle Build，或大屏 Kindle 画布）：优雅优先的独立版式——衬线大日期/大钟报头、品牌 SVG 图标、三档灰（次级信息不下黑字）、浅灰细线分隔；限额整宽账本行（无 24h/7d 小字），下方左「进行中」（含待确认、后台，无 detail 行），右「已完成」；内容不足一屏时页脚压底。页脚写 `Scribe · 1860×2480`。

状态（视图 / scope / 模式）会写入 `location.hash`，整页刷新后回到原处。

## 尺寸与设备适配

- 默认不缩放（S=1），布局用百分比表格自适应宽度；`device=` 预设或 e-ink UA 时
  按 `设备宽 / 1072` 等比缩放（clamp 0.72–1.85；Scribe 封顶 1.5，溢出由 fitScribeCanvas 自动收缩到一屏）。
- 进度条行是纯百分比列，任何宽度下列对齐、条随容器伸缩；小屏账本的胶囊条用
  `repeating-linear-gradient` 斜纹软填充，老 WebKit 不认渐变时 bgcolor 兜底为实心黑条。
- 视口短边 < 720px、`?kindle=1`、e-ink UA 小屏档 → 小屏账本；< 600px 时顶栏收窄
  （藏说明按钮、meta 只留徽标与时间）。
- Kindle 档（含真机 Oasis 浏览器）优先小屏账本而不是整页卡片看板。

URL 参数（可叠加，缺省回退到 hash 里的上次状态）：

| 参数 | 取值 | 作用 |
|---|---|---|
| `mode` | `panels` / `full` | 强制模式 |
| `view` | `local` / `relay` | 本机 / 中转 |
| `scope` | `admin` / `user` / `people` | 中转下的范围 |
| `page` | — | 已退役：分页器时代的历史参数，保留解析但忽略 |
| `device` | `oasis1` `oasis2` `oasis3` `pw` `basic` `dx` `scribe` | 桌面模拟设备档：套用该档缩放与默认模式（不改窗口大小） |
| `scale` | 0.4–3 | 直接指定缩放，覆盖其它计算 |
| `kindle` | `1` | 强制按 Kindle 面板模式 |

无 query 的设备页（官网 `/oasis`、`/scribe`）用 `window.AINDLE_PRESET` 写入同样的键；`location.search` 仍优先。
| `refresh` | 秒 | 定时拉 `/view.json` 重绘（大屏默认 60s，DEMO 下只重绘） |
| `debug` | `1` | 顶栏显示视口、内容宽、缩放、设备猜测、UA |

## 浏览器 / 固件兼容

- 纯 ES5 + table + bgcolor + 行内样式；进度条是两格黑白表格，不依赖 Flex / 渐变 / 阴影。
- 事件绑定用 `onclick` / `window.onresize`；`addEventListener` 仅在存在时用于
  `orientationchange` / 触摸滑动。
- JS 整体 `try/catch`：初始化失败时在页面顶部显示原因，并提示改走 PNG 管线；`<noscript>` 同理。
- serve.py 对 `text/*` 补 `charset=utf-8`，避免老浏览器中文乱码。

## Mock 数据约定

时间线以「周四 9月3日 21:26」为锚点且自洽：限额重置时间都在将来；陈旧主机
（Windows，16 分钟前）名下 attention 归零并以「上次」前缀显示；
订阅与任务的主机归属一致。本机限额每种 Agent 只列一份：Claude / Codex / Cursor / Grok / Kimi / ZCode / Gemini / DeepSeek。
attention 分桶：进行中 2 · 待确认 2 · 后台任务 3，与各机卡片加总一致。零项不写。

## 局域网

```bash
python3 demo/serve.py
```

- 小屏（复杂）：[http://127.0.0.1:8765/oasis-monitor.html?mode=panels](http://127.0.0.1:8765/oasis-monitor.html?mode=panels)
- 大屏（复杂）：[http://127.0.0.1:8765/oasis-monitor.html?mode=full](http://127.0.0.1:8765/oasis-monitor.html?mode=full)
- 单机简单场景：[oasis-monitor-simple.html](http://127.0.0.1:8765/oasis-monitor-simple.html?mode=full)
- Oasis 1 真机档：[?device=oasis1&kindle=1](http://127.0.0.1:8765/oasis-monitor.html?device=oasis1&kindle=1)
- Scribe 账本：[?device=scribe&mode=full](http://127.0.0.1:8765/oasis-monitor.html?device=scribe&mode=full)
