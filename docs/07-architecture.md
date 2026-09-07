# 建议架构

## 一句话

Aindle = **三台机器上的只读 agent** + **一台常开 hub** + **Kindle 上的瘦拉图循环**。
不要在 Kindle 里跑 React，不要让三台 TokenTracker 互相抓，不要把限额按机器相加。

## 系统图

```
MacBook Pro agent          Mac mini agent           Windows agent
  读本地 profile / 限额        （建议同时当 hub）         读本地 profile / 限额
  扫本地会话                   扫本地会话                扫本地会话
        \                         |                          /
         \                        |                         /
          +-------- HTTPS/LAN POST /ingest (脱敏快照) ------+
                                  |
                            Aindle Hub
                         (建议：Mac mini)
                    订阅注册表 + 去重 + 渲染
                     GET /dash.png  (1264×1680)
                     GET /snapshot.json  (桌面预览)
                                  |
                         同一私网 / Tailscale
                                  |
                           Kindle Oasis
                      curl PNG → FBInk
                      唤醒/残影/合盖策略
```

## 三个进程，三种权限

| 进程 | 跑在哪 | 可以碰凭证？ | 对外 |
|---|---|---|---|
| **agent** | 每台开发机 | 可以，只在本机打官方 API | 只向 hub 推已经算好的数字 |
| **hub** | 常开机 | 不可以存 OAuth | 只读 PNG / 脱敏 JSON；要配对 |
| **kindle-loop** | Oasis | 不可以 | 只 GET 一张图 |

agent 崩溃不影响上一帧。hub 收不到某台机器时，那台标 `stale`，其它机器照常画。Kindle 拉图失败则留下上一张 PNG。

## 快照合同（hub 对外唯一数据面）

第一版只需要一种 JSON，HTML/PNG 都从它来。字段保持短、可红action。

```json
{
  "schema": "aindle.snapshot.v2",
  "generatedAt": "2026-09-03T13:26:00+08:00",
  "hub": { "id": "mini", "label": "Mac mini" },
  "freshness": {
    "oldestHostMs": 8000,
    "staleHosts": []
  },
  "hosts": [
    {
      "id": "mbp",
      "label": "MacBook Pro",
      "os": "darwin",
      "seenAt": "2026-09-03T13:25:52+08:00",
      "status": "ok"
    }
  ],
  "subscriptions": [
    {
      "id": "claude-home",
      "tool": "claude",
      "label": "Claude · Home",
      "plan": "Max",
      "shared": true,
      "windows": [
        { "key": "5h", "pct": 62, "resetsAt": "2026-09-03T18:00:00+08:00" },
        { "key": "7d", "pct": 41, "resetsAt": "2026-09-06T20:00:00+08:00" }
      ],
      "confidence": "live"
    }
  ],
  "runs": [
    {
      "id": "r1",
      "hostId": "mbp",
      "subscriptionId": "claude-home",
      "tool": "claude",
      "title": "Aindle 调研落盘",
      "project": "Aindle",
      "state": "active",
      "initiator": "human",
      "initiatorConfidence": "direct",
      "stateConfidence": "derived",
      "startedAt": "2026-09-03T13:10:00+08:00",
      "lastActivityAt": "2026-09-03T13:25:40+08:00"
    }
  ],
  "monitorPeriod": "1h"
}
```

禁止进入快照：token、cookie、绝对路径、prompt、完整错误栈、真实公网 IP。

`confidence`：`live | cached | stale | error | none`。`none` 给第三方中转（无官方限额）。

## 为什么 hub 放 Mac mini

- 你点名的三台里，mini 最像 24h 开机的家用服务器。
- Kindle 只认识一个 URL，不能轮询三台再自己拼版。
- MBP 合盖、Windows 睡眠都会让「PC 出图」方案停摆——这正是 alexishida 单机模型的上限。

若 mini 不是常开，备选：永远在线的 NAS / 小 Linux，或 Tailscale 上的一台 VPS（只收脱敏 JSON，仍不收凭证）。

## Kindle 侧（第一版）

抄 alexishida 的「只拉 PNG」，抄 jefftko 的电源策略：

1. 设备档：默认 `oasis1-portrait-1072x1448`（可切换 `oasis1-landscape-1448x1072` 或对照用的 Oasis 3 档）。
2. `dash-loop`：原子下载、失败保留旧图、全刷计数、日志。
3. **不要**默认 `preventScreenSaver=1`。听 `goingToScreenSaver` / `readyToSuspend` / `wakeupFromSuspend`。只在 `readyToSuspend` 里用整数 `rtcWakeup`；休眠前关 Wi-Fi，醒来再开。确认解锁后把无线开关写回锁屏前的值。不要用 `deferSuspend` 对抗休眠。
4. 双速刷新由 **PNG 里的标记或独立 `/meta.json`** 告诉 loop：`intervalSec`、`fullEvery`。hub 根据是否有 active run 改这两个数。
5. KUAL：Start / Stop / Refresh / Uninstall。SSH 安装可以后做；第一版 USB 拷脚本也够。
6. 配对：URL 带长期随机 token，或 mDNS + 一次性码。不要裸 `0.0.0.0`。

横屏值得做成第二设备档：限额在左、任务在右，Oasis 实体键翻「过热订阅 / 全部订阅」。第一版先做竖屏，和 jefftko 实物一致，也方便对照 Demo。

## 渲染

hub 用无头 Chrome / Playwright 打开与 Demo 同源的 HTML，传入 snapshot，截 **正好** 1264×1680（或设备档）。不要依赖「主显示器工作区不够就缩小再放大」那种 alexishida 路径——那会在小笔记本上出糊图。

桌面预览直接打开同一 HTML。PiP 可以后做。

## 和现有软件的关系

```
本机 TokenTracker / OctoMonitor  ── 只作对照，不是运行时依赖
Aindle agent                     ── 自己扫文件、自己打限额
```

第一版 **允许** 一个兼容模式：agent 若发现本机 TokenTracker `:7680` 活着，可以只借 `usage-limits` 做对照测试，但产品路径仍要能在没有 TokenTracker 时工作。OctoMonitor 已 maintenance-only，更不要当硬依赖。

## 分阶段（必须先有验收，再施工）

### Stage 0 — 已在本仓库完成的部分

- 调研文档
- Oasis 3 尺寸的静态 Demo

验收：用浏览器打开 `demo/oasis-monitor.html`，竖屏画板为 1264×1680，信息层次能在一臂距离读懂。

### Stage 1 — 单机闭环（建议先在 MBP）

范围：只这台 MacBook Pro；只注册你点名的官方订阅；只出 HTML + PNG；Kindle 能显示（若设备就绪）或桌面预览代替。

验收：

1. `aindle agent` 不读未注册目录。
2. `GET /snapshot.json` 符合 `aindle.snapshot.v2`，不含凭证。v1 ingest 返回明确 schema error。
3. PNG 像素正好是设备档。
4. 拔掉采集源后，快照 `confidence=stale` 且上一帧数字还在。
5. 门禁：单测合同校验 + 渲染尺寸断言。

### Stage 2 — 任务 + 双速刷新

范围：Claude / Codex / Grok 会话启发式；Cursor 任务能则显示、不能则诚实空白。

验收：人为保存一个正在写的 JSONL，60s 内出现 `active`；停 10 分钟后进入 `done` 或从「正在」消失；`monitorPeriod=1h` 仍能看到。

### Stage 3 — 多机

范围：mini + Windows agent；hub 固定 mini；订阅去重。

验收：停 MBP agent 5 分钟，屏上 MBP 变 stale，另两台仍 live；同一 Cursor 账号两台登录只出现一条限额。

### Stage 4 — Kindle 安装体验

范围：KUAL、唤醒恢复、配对、中文安装说明。

验收：合盖再开，8–15s 内恢复完整板；错误 URL 不会覆盖好图。

## 明确不采用的备选

| 方案 | 为什么否 |
|---|---|
| Kindle 浏览器开 OctoMonitor `:46322` | 单机、React、无 Grok、无多订阅；浏览器不适合 e-ink |
| 只开 TokenTracker 云同步再投屏 | 无会话、无限额、无「正在跑」；数据出你家 |
| 三台各跑 kindle-dashboard | Windows-only、单账号、分辨率错、三 URL 无法一屏 |
| jefftko 2 KiB 文本协议 | 装不下多订阅+任务 |
| 在 OctoMonitor 主线加功能 | maintenance-only，2026-09-30 可能归档 |

## 技术选型（建议，不是开工命令）

- agent / hub：TypeScript（你本机 Node 工具链已在）或小 Go 二进制。不要第一版就上 Tauri 重壳。
- 渲染：Playwright 截和 Demo 同一套 HTML。
- 配置：YAML 注册表 + 每机 `host.yaml`。
- 测试：快照 schema 测试、去重测试、PNG 尺寸测试。不在第一版做视觉回归金图。

## 安全默认值

- hub bind 可配置，默认只对 RFC1918 / Tailscale CGNAT 回答
- `/dash.png` 和 `/snapshot.json` 要 query token 或 cookie
- agent → hub 用预共享密钥
- 日志里打印路径用 home-relative，不打印 token
- 不提交 `registry.yaml` 真名以外的秘密；文档继续用占位符
