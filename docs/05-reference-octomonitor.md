# 参考：OctoMonitor

本地参考路径：`~/WorkSpace/OctoMonitor`
许可证：MIT
状态：README / CLAUDE.md 写明 **maintenance-only（2026-07-30）**，不再新增 runtime adapter 或产品扩张；2026-09-30 复审是否归档。今天是 2026-09-03。

这是三份参考里 **任务/会话模型最接近「AI Monitor」** 的。本机已安装 `octomonitor`，但 `~/.octomonitor/` 没有 `config.json`，更像还没开过 Remote Access。

## 它实际是什么

单机 local-first 监控器。本机文件是 SoT，无数据库。WebSocket 推全量 `snapshot.replace`，前端 Monitor / Usage / Commits / Heatmap。

默认管理面：`127.0.0.1:46321`。可选远程只读：`0.0.0.0:46322`，配对码 10 分钟，cookie 30 天，只开放 Monitor / Usage，并做 `redact_bootstrap`。

**模型是一台主机 → 多块副屏，不是多台主机 → 一块屏。** `RunRecord` 没有 `hostId` / `machineId`。

## 任务模型（Aindle 应直接借语义，不借死字段）

`BootstrapPayload.runs: RunRecord[]` 才是任务实体。`recentCompletions` 类型在、生产路径填空数组；「刚完成」靠前端 `monitorPeriod`（默认 1h）过滤 `runs`。

`RunState`：`Active | WaitingApproval | Idle | Completed | Error | Stale | …`

启发式（本机文件 mtime / 事件，**不是进程表**）：

| 工具 | Active | Idle | 否则 |
|---|---|---|---|
| Claude | <60s | <5min | Completed（pending tool_use <30min 则 WaitingApproval） |
| Codex | <2min | <10min | Completed；卡住的 Running 变 Idle，不误标 Completed |
| P0（含 Cursor） | <60s | <5min | Completed |

前端分区：waiting → attention；active → active；error 类 → error；**Idle 和 Completed 都进 done**。`active` / `waitingApproval` 永远显示；其它状态要 `lastActivityAt` 落在周期内。

这正好对应你要的「正在进行 + 短期完成」。Aindle 应显式增加 `hostId` 和 `subscriptionId`，不要假装 OctoMonitor 已经有。

## 四家工具支持质量

| 产品 | 级别 | 能做什么 | 不能做什么 |
|---|---|---|---|
| Claude Code | Monitored | JSONL + statusline/hook ingest；token/cost/状态/workspace | 无官方账号级 remaining；quota 靠 HUD 缓存或 statusline，不是 `api/oauth/usage` |
| Codex | Monitored | JSONL、5h/7d rate_limits、事件时间线 | 单 `CODEX_HOME`；cost 常为估计 |
| Cursor Agent | Experimental opt-in | 仅 `OCTOMONITOR_CURSOR_PRIVATE_STORE=1` 时读 `~/.cursor/chats/**/store.db` | **用量 N/A**；不是 Cursor IDE `state.vscdb` |
| Grok Build | **不存在** | — | `ToolKind` 无 Grok；全库零命中 |

maintenance-only 意味着：**不要提 PR 等它加 Grok / 多机 / 多订阅 / Oasis 壳。** Fork 或在 Aindle 重写。

## 多订阅

`accountAlias` 在生产路径是占位符（`local-probe` / `local-ingest`），远程还会抹掉。`IdentityState` 是「每个 ToolKind 一条」，不是每个订阅一条。Hermes profiles 是唯一真正的多实例，与 Claude/Codex 无关。

## E-ink 主题

`docs/history/kindle-eink-design-system-guidelines.md` 自称历史探索，不是现行 SoT。现行主题有 `eink` / `kindle-light` / `kindle-dark`。原则可用：无彩色、无阴影、灰阶纹理。

**没有** `/companion/eink` 专用低刷新页。Remote viewer 仍是完整 React Monitor。把 Kindle 浏览器指到 `:46322` 当产品方案，本仓库未验证，且和 e-ink 约束相悖。

历史愿景 `docs/history/agent-mission-control.md` 曾设想 Kindle 路由只显示 active / waiting / today tokens / quota / last updated，15–60s 轮询。那是未落地的目标态。

## 远程 viewer 可借的协议

- 帧：`{ "type": "snapshot.replace", "payload": BootstrapPayload }`
- 远程脱敏：去掉绝对路径、alias、transcript、error 细节，保留 tool / projectName / model / state / tokens / quota / 时间戳
- 配对：短码 + HttpOnly cookie，无 Secure（适配 LAN HTTP）

Aindle 的 hub → 桌面预览可以用类似协议。Kindle **不要**吃 WebSocket；它吃 PNG。

## 对 Aindle 的借用裁决

| 借 | 不借 |
|---|---|
| `RunRecord` 字段最小集 + 状态启发式 | 整仓 Rust 服务当 Kindle 后端 |
| `monitorPeriod` 作为「短时完成」窗口 | 指望 `recentCompletions`（死字段） |
| `redact_bootstrap` 的暴露边界 | 远程 viewer 当多机汇聚 |
| kindle/eink 灰阶原则 | Cursor 本地 store 当用量源 |
| 只读副屏、不做 approve/kill | 在本仓库加 Grok adapter |

本机已装 CLI，单机验证采集时可以 **对照** OctoMonitor 的 Monitor 页，但产品数据面应是 Aindle 自己的 snapshot。
