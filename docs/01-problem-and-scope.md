# 问题与范围

## 一句话

你已经有一台越狱过的 Kindle Oasis。你希望它成为书桌边的只读副屏：一眼看到 **MacBook Pro、Mac mini、Windows** 上，多份 **Claude Code / Codex / Cursor / Grok Build** 订阅还剩多少额度，以及 **此刻正在跑** 和 **刚刚结束** 的任务。

## 目标

1. **多机：** 至少三台物理机的心跳、用量、任务汇到同一块屏。
2. **多订阅：** 同一工具的多份账号 / 套餐能分开显示，而不是合成一张糊涂的总条。
3. **用量 + 任务：** 限额条（5 小时 / 周 / 月 / 账单周期，按各家真实语义）和任务列表同时在。
4. **适合 Kindle：** 电子墨水可读，刷新策略不伤屏、不过度耗电，断网时留下一帧可信画面。
5. **本地优先：** 凭证不出机器；Kindle 上只出现脱敏后的标题、百分比、机器名、状态。

## 非目标（第一版明确不做）

- 不在这个项目里教你越狱，也不修改越狱组件。
- 不在 Kindle 上批准 / 打断 / 发送消息。副屏只读。
- 不把 prompt、回复、文件内容、绝对路径画到屏上。
- 不把 TokenTracker 的云排行榜、桌宠、成就搬过来。
- 不把 OctoMonitor 的 Commits / Heatmap / Hook Manager 搬过来。
- 不做公开互联网暴露。默认只信 LAN / Tailscale 一类私网。
- 不承诺官方稳定 API。若干限额接口是各家自己的网页/CLI 在用的未文档化端点。

## 本机会话实际看到的现实

探测时间：2026-09-03。探测机器：当前工作区所在的 **MacBook Pro**（`scutil --get ComputerName` = `MacBook Pro`）。没有探测 Mac mini 或 Windows。

### 已安装的工具与监控器

本机 `PATH` 上存在：`claude`、`codex`、`cursor`、`grok`、`tokentracker`、`octomonitor`。

家目录存在：`~/.claude`、`~/.codex`、`~/.cursor`、`~/.grok`、`~/.tokentracker`、`~/.octomonitor`。

含义：你不是从零开始。用量账本和会话扫描在这台 Mac 上已经有现成软件在跑。Aindle 的问题是 **汇聚 + 墨水屏契约**，不是「第一次学会读 Claude 日志」。

### 多配置目录已经存在（这是产品约束，不是假设）

Claude 侧，除默认 `~/.claude` 外，至少还有这些目录名（只列名字，未读内容）：

`~/.claude-account1`、`~/.claude-account2`、`~/.claude-work`、`~/.claude-ds`、`~/.claude-glm`、`~/.claude-kimi`、`~/.claude-mimo`、`~/.claude-monitor`、`~/.claude-rn`、`~/.claude-rn-remote`、`~/.claude-science`、`~/.claude-share`

其中 **只有** `~/.claude` 在磁盘上看到 `.credentials.json`。其余多数带 `projects/`，说明它们是真实工作过的 profile，凭证更可能在 macOS Keychain（`CLAUDE_CONFIG_DIR` 会派生独立 Keychain 项），或走第三方 API、不再用 Anthropic OAuth。

Codex 侧同样已经分家：`~/.codex`、`~/.codex-company`、`~/.codex-ds`、`~/.codex-rn`。

Grok 侧：`~/.grok/auth.json` 存在；`~/.grok/sessions` 下本会话数到约 **1854** 个目录；`active_sessions.json` 是空列表。

### TokenTracker / OctoMonitor 使用痕迹

- TokenTracker 的 `~/.tokentracker/tracker/` 里已有 `queue.jsonl`、`session.queue.jsonl`、若干 `*-usage-limits-cache.json`。`cloud-sync-pref.json` 为 `enabled: true`（本会话只读了这个开关，没有读用量数字，也没有读 machine id 进文档）。
- OctoMonitor 的 `~/.octomonitor/` 只有 `litellm_pricing.json` 和 `workflows`，**没有** `config.json`。按 OctoMonitor 文档，远程 viewer 状态写在 `config.json`；更可能是这台机器还没开过 Remote Access。

### 参考仓库位置

用户说的 `~/WorkSpace/Reference/kindle-dashboar` 实际路径是：

`~/WorkSpace/Reference/kindle-dashboard`

另外两份参考：

- `~/WorkSpace/Reference/TokenTracker`
- `~/WorkSpace/OctoMonitor`

## 必须由你拍板的事实（调研无法代劳）

1. **Oasis 是哪一代？** **已确认：Oasis 1（2016，6 寸，1072×1448）**。Oasis 2/3 才是 7 寸 1264×1680。Demo 默认按 Oasis 1，并可用 `?device=oasis3` 对照。
2. **哪几个目录才是「订阅」？** `~/.claude-glm` / `~/.claude-kimi` / `~/.codex-ds` 看起来像第三方中转，不应和 Anthropic / OpenAI 官方套餐画在同一套 5h/7d 条上。
3. **Hub 放哪台？** 常开的 Mac mini 最合适；如果 mini 不是 24h 开机，就要改架构。
4. **三台机器是否同一私网 / Tailscale？** 决定 Kindle 拉谁、agent 推到谁。
5. **刷新频率能接受闪屏和耗电到什么程度？** 这决定「像监控墙」还是「像天气牌」。
