# 参考：TokenTracker

本地参考路径：`~/WorkSpace/Reference/TokenTracker`
许可证：MIT（Copyright 2026 xiufengsun）

这是三份参考里 **用量和限额覆盖最全** 的。本机已经安装 `tokentracker`，并且 `~/.tokentracker/tracker/cloud-sync-pref.json` 为开启。它很适合当「本机采集器怎么读」的教材，**不适合当 Kindle 壳，也不适合当多订阅汇聚层**。

## README 营销 vs 源码

| README 说法 | 源码实际 |
|---|---|
| 100% local，无账号无 API Key | 用量解析在本地；**限额**用本机已存 OAuth 打各家接口。可选 InsForge 云同步 |
| How It Works 画 Local SQLite | 自家账本是 `~/.tokentracker/tracker/queue.jsonl`（UTC 半小时桶）。SQLite 只用来读别人的库（Cursor `state.vscdb` 等） |
| `status --json` 给 agent 喂数据 | 输出的是 hook/集成健康，**不是**用量、限额或会话 |
| 跨设备账户视图 | 已实现，但是 **云**；sessions / 限额 / 项目用量故意不上传 |
| 13 家限额 | `LIMIT_PROVIDER_IDS` 确有 13 个，含 Claude / Codex / Cursor / Grok |

证据：`README.md`；`docs/PRIVACY.md`；`src/commands/status.js`；`src/lib/cloud-account.js`；`src/commands/serve.js` 的 `LOCAL_BIND_HOST = "127.0.0.1"`。

## 四家目标工具怎么采

### Claude Code

- Hook：写入 `~/.claude/settings.json` 的 `Stop` / `SessionEnd`
- 用量：扫 `~/.claude/projects/**/*.jsonl`，增量 inode/offset
- 限额：macOS Keychain `Claude Code-credentials`，Linux/Windows 则 `~/.claude/.credentials.json` → `GET https://api.anthropic.com/api/oauth/usage`
- **不**用官方 billing 门户算 token 账；OAuth 只为限额服务
- 多 `CLAUDE_CONFIG_DIR`：**未作为一等模型扫描**。默认只跟当前这份登录态

### Codex

- Hook：`~/.codex/config.toml` notify
- 用量：`sessions/` + `archived_sessions/` 的 `rollout-*.jsonl`
- 限额：`~/.codex/auth.json` → `GET https://chatgpt.com/backend-api/wham/usage`（以及 reset-credits）
- Windows 可把 native + WSL 家目录 union；这是双安装，不是双订阅

### Cursor

- **无 hook。** 从 Cursor 的 `state.vscdb` 读 `cursorAuth/accessToken`，拼 `WorkosCursorSessionToken` cookie
- 用量：`GET https://cursor.com/api/dashboard/export-usage-events-csv?strategy=tokens`，然后 wipe+refill 本地桶
- 限额：同一 cookie → `GET https://cursor.com/api/usage-summary`
- 路径：macOS `~/Library/Application Support/Cursor`；Windows `%APPDATA%\Cursor`
- **不进入** session 浏览器（sessions API 只有 claude / codex / grok）
- 这是 **Cursor IDE 账号用量**，不是 OctoMonitor 那个 opt-in 的 `~/.cursor/chats/**/store.db`

### Grok Build

- Hook：`~/.grok/hooks/99-tokentracker-usage.json`
- 用量：`~/.grok/sessions/<cwd-encoded>/<id>/{updates.jsonl,signals.json,summary.json}`；优先 `turn_completed.usage`，否则 `signals.totalTokens` 水印
- Windows：native 与 WSL **二选一，不合并**
- 限额：`~/.grok/auth.json` 里 **第一个带 key 的 scope** → `https://cli-chat-proxy.grok.com/v1/billing?format=credits`
- 窗口是日 / 周 / 月，**没有 Claude 那种 5h**

## 限额窗口语义（不要统一成一种 bar）

| 工具 | 真实窗口 | TokenTracker 是否取出 | UI 是否画全 |
|---|---|---|---|
| Claude | `five_hour`、`seven_day`、opus/scoped、`extra_usage`（月） | 是 | extra_usage **取了但不画成条** |
| Codex | 5h session、7d weekly、credits / spark | 是 | 有 |
| Cursor | **账单周期** 的 plan / Auto / API 百分比，reset = `billingCycleEnd` | 是 | 有，但不是 5h/周 |
| Grok | daily / weekly / monthly + on-demand | 是 | 有 |

把四家画成清一色「5h / 7d」会说谎。Cursor 的 80% 是本月套餐，不是五小时窗口。

## 多账号 / 多订阅

**没有。** 每家读「这台机器当前那一份登录态」：

- Claude：第一份能解析的 Keychain / credentials
- Codex：一份 `auth.json`（`ChatGPT-Account-Id` 只是避免免费/多账号 4xx，不是订阅列表）
- Cursor：当前 `state.vscdb` 的一个 cookie
- Grok：`auth.json` 第一个带 `key` 的 scope，其余忽略

对本机可能存在的 `~/.claude-work`、`~/.codex-company` 这类目录，TokenTracker **不会自动变成多行订阅**。

## 多机

本地 HTTP **只绑 127.0.0.1:7680**（占用则 +1；WSL 常用 7681）。Kindle 打不到另一台机器的 TokenTracker。

跨机只有 opt-in 云：

- 每机 `machineId`
- 上传半小时桶到他们的 InsForge
- 读回 account summary / heatmap
- **不上传** sessions、限额、路径

你这台 Mac 已经打开云同步。即便如此，云视图也给不了 Kindle 需要的「正在跑的任务 + 每份订阅的 5h 条」。Aindle 不应复用他们的云项目或 anon key。

## 会话 / 任务

`session-analytics` 写 `session.queue.jsonl`。`ended_at` = 日志最后一条时间戳，**不是**「会话已结束」。空闲 >30min 不计入 `active_ms`，但跨度仍在。

浏览器行有 title / source / tokens / resume_command，**没有** `running | done`。正在写的会话只要已经写出 token，就会以「最近 ended_at」出现。覆盖仅 Claude / Codex / Grok，无 Cursor。

## 本机 HTTP 里真正有用的端点

默认 `http://127.0.0.1:7680/functions/tokentracker-*`：

| 路径 | 对 Aindle |
|---|---|
| `usage-limits` | 单机限额，2 分钟内存缓存 |
| `usage-summary` | 本地（或 `?account=1` 云）总量 |
| `sessions` | 本地会话，无 running 标志，无 Cursor |
| `machine-id` | 本机身份 |
| `status --json` | **不要当用量 API** |

写接口需要 `x-tokentracker-local-auth`。GET 用量对 loopback 可用。

## 许可证与复用边界

MIT，想法可借。不建议：

- 整仓嵌进 Aindle（`rollout.js` 极大）
- 复制未文档化的 Cursor / Codex / Grok 请求还宣称「官方支持」
- 为了读限额去写回用户的 `auth.json`（TokenTracker 的 Grok/Codex 路径会 refresh 并写回）
- 让 Kindle 打 TokenTracker 的 127.0.0.1

建议借的是 **字段形状** 和 **「限额与用量桶分开、限额保留 last-good」** 这两条纪律。
