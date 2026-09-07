# 数据源：用量、限额、任务、多订阅

本文件是 Aindle 采集层的事实表。来源标注：

- **本机目录**：2026-09-03 在这台 MacBook Pro 上看到的路径名
- **参考实现**：TokenTracker / kindle-dashboard / OctoMonitor 源码
- **社区/非官方**：Cursor `usage-summary`、Claude `CLAUDE_CONFIG_DIR` 文章等，未在本会话打过真实 API
- **2026-09-05 增补**：ZCode / Gemini / Copilot / Kiro / DeepSeek / Qwen / iFlow 的调研在本机实测或源码核对（见 §10–§16）

## 1. 先把三个概念拆开

| 概念 | 问题 | 典型来源 | 能不能跨机加总 |
|---|---|---|---|
| **用量 (usage)** | 用了多少 token / 多少钱 | 本地 JSONL / CSV / SQLite | 可以按小时桶相加 |
| **限额 (quota)** | 这份额还剩多少、何时重置 | 各家账号 API | **不能**把三台机器的 5h 条加在一起——同一订阅在多机共享一个池 |
| **任务 (task/run)** | 此刻谁在跑、刚结束了什么 | 本地会话文件 + 启发式 | 按机器并列，不要合并成一条 |

这是架构上最容易做错的地方：用量可以 fan-in；限额必须按 **订阅身份** 去重；任务必须带 **hostId**。

## 2. Claude Code

### 用量

- 路径：`$CLAUDE_CONFIG_DIR/projects/**/*.jsonl`，默认 `~/.claude/projects`
- TokenTracker / OctoMonitor 都扫这个
- 本机：`~/.claude` 有 `projects/` 和磁盘上的 `.credentials.json`；其它 `~/.claude-*` 多数有 `projects/`、未见 `.credentials.json`（Keychain 或非 OAuth）

### 限额

- 接口：`GET https://api.anthropic.com/api/oauth/usage`
- Header：`anthropic-beta: oauth-2025-04-20` + Bearer
- 字段（ccusage / TokenTracker / kindle-dashboard 三方一致）：`five_hour`、`seven_day`、scoped（opus/sonnet）、`extra_usage`
- 凭证：macOS 默认 Keychain `Claude Code-credentials`；若设置了 `CLAUDE_CONFIG_DIR`，较新版本会变成 `Claude Code-credentials-<sha256(path)[:8]>`（社区 issue #20553 后续讨论，**本会话未读 Keychain**）
- 刷新过勤会 429。kindle-dashboard 用 180s 门闩；TokenTracker 有 rate-limit 文件。Aindle 每订阅最多 2–3 分钟一次，失败保留 last-good

### 任务

- OctoMonitor：JSONL mtime + pending tool_use → Active / WaitingApproval / Idle / Completed
- 也可读 statusline / SessionEnd hook（OctoMonitor ingest、TokenTracker hook）
- 「正在跑」是启发式，关终端但文件 30 秒内还热，会显示 Active

### 多订阅（本机已是真实需求）

本机目录名已经说明你在用 profile 隔离。建议 Aindle 用 **显式注册表**，而不是自动扫描所有 `~/.claude*`：

| 目录名（仅名） | 猜测 | 处理 |
|---|---|---|
| `.claude` | 默认 Anthropic | 列入，走 OAuth usage |
| `.claude-personal` / `.claude-work` | 额外 profile 示例 | 列入前由 owner 确认 |
| `.claude-account1` / `account2` | 空（无 projects） | 可能废弃 |
| `.claude-glm` / `.claude-kimi` / `.claude-ds` / `.claude-mimo` | 第三方中转 | **不要**画 Anthropic 5h/7d；最多当本地用量源 |
| `.claude-rn` / `.claude-rn-remote` / `.claude-share` / `.claude-monitor` | 工作/监控向 | 由你标注 |

未确认前，Demo 里的多行 Claude 只是示意。

## 3. Codex

### 用量

- `~/.codex/sessions/**/rollout-*.jsonl` 与 `archived_sessions/`
- 本机额外家目录：`.codex-company`、`.codex-ds`、`.codex-rn`

### 限额

两条已有实现，语义接近但通道不同：

1. **app-server**（kindle-dashboard）：`codex app-server` → `account/rateLimits/read`（primary/secondary ≈ 5h/7d）
2. **ChatGPT web API**（TokenTracker）：`GET https://chatgpt.com/backend-api/wham/usage`，凭证 `~/.codex/auth.json`

都不是公开稳定文档。Aindle 优先 app-server（官方 CLI 自己的通道），失败再 rollout 里的 `rate_limits` 事件。

多 `CODEX_HOME` 必须 **分别** 出限额条。kindle-dashboard 把它合成一张卡，正是你不要的。

### 任务

OctoMonitor 对 Codex 最强：进度、pending approval、resume。启发式比 Claude 略宽（2min/10min）。Windows 上还要考虑 WSL 里另一份 `~/.codex`。

## 4. Cursor

这里有两个完全不同的「Cursor」，文档里必须写清楚。

| 表面 | 路径 | 能得到 | 得不到 |
|---|---|---|---|
| **Cursor IDE 账号** | `state.vscdb` + `cli-config.json` | 套餐用量 CSV、`usage-summary` 的 Auto/API/账单周期 | 可靠的「当前 Agent 任务」列表 |
| **Cursor Agent CLI 会话** | `~/.cursor/chats/**/store.db`（OctoMonitor opt-in） | 会话/模型/活动 | token/cost（官方 store 无用量） |

本机 `~/.cursor` 可见 `chats/`、`cli-config.json`、`acp-sessions/`。未读 `state.vscdb`。

`usage-summary`（社区逆向，Cursor 自己的 dashboard 也打它）：

- `billingCycleStart` / `billingCycleEnd`
- `individualUsage.plan.{autoPercentUsed, apiPercentUsed, totalPercentUsed}`
- Team/Enterprise 可能没有 `individualUsage.plan`，只能解析展示文案

**未文档化，可能改字段。** 采集器必须 schema-tolerant，失败画 `stale` 而不是 0%。

多 Cursor 订阅：通常一台机器一份 IDE 登录。三台机器若登录 **同一** Cursor 号，限额应显示一行并标注「3 机共享」；若 Windows 是另一份 Ultra，才是第二行。这要靠注册表，不能靠「发现了三份 state.vscdb 就加出 300%」。

任务：TokenTracker 没有 Cursor 会话行。OctoMonitor 的 CLI store 不等于 IDE Composer 面板。第一版 Cursor 可以：**限额必做，任务能扫到再显示，扫不到就只显示「IDE 最近活动」或留空，不要编。**

## 5. Grok Build

### 用量

- `~/.grok/sessions/**/{updates.jsonl,signals.json,summary.json}`
- 本机 sessions 目录约 1854 个（只计目录数，未读内容）
- `active_sessions.json` 此刻是空列表——「正在跑」不能只靠这个文件

### 限额

- `~/.grok/auth.json`（未读内容）
- TokenTracker：`cli-chat-proxy.grok.com/v1/billing`
- 窗口：日 / 周 / 月，可能还有 on-demand
- 多 scope 时 TokenTracker 只取第一个带 key 的——若你有多份 Grok，要改成按注册表选 scope

### 任务

有本地 session 文件，可套 OctoMonitor 同类启发式。Grok 不在 OctoMonitor 里，Aindle 要自写 adapter。TokenTracker 能出会话行但无 running 标志。

## 6. 推荐的订阅注册表（产品核心，不是配置边角）

```yaml
# 示意，不是已存在的文件
subscriptions:
  - id: claude-personal
    tool: claude
    label: Claude · Personal
    kind: anthropic-oauth
    machine: mbp          # 凭证落在哪台；限额全局一份
    configDir: ~/.claude-personal
  - id: claude-glm
    tool: claude
    label: GLM 中转
    kind: third-party-tokens
    quota: none           # 只贡献用量和任务，不画 5h 条
  - id: codex-company
    tool: codex
    label: Codex · 公司
    kind: chatgpt-oauth
    machine: mini
    home: ~/.codex-company
  - id: cursor-personal
    tool: cursor
    label: Cursor Ultra
    kind: cursor-ide
    machines: [mbp, mini] # 同一账号
    dedupe: shared-quota
  - id: grok-main
    tool: grok
    label: Grok Build
    kind: xai-oauth
    machine: mbp
    scope: default
```

没有这张表，自动发现会把中转、废弃目录、同一账号的三份缓存画成「十二份订阅」。

## 7. 「当前任务」最小可靠算法

不要读进程表当 SoT。`wait` 第一刀仅 Claude `AskUserQuestion` 与 Codex `request_user_input` 的未闭合结构事件（按 `tool_use.id` / `call_id` 配对，60 分钟有序窗口）。Cursor / Grok / Kimi / GLM 没有直接等人信号，只走年龄档。年龄启发式永远不能产 `wait`。

```
state =
  open AskUserQuestion / request_user_input (direct) ? wait
  : age(lastActivity) < activeWindow ? active
  : age(lastActivity) < idleWindow   ? idle
  : completed
```

采集按逐 session，不按项目折叠。三口径在完整 `snapshot.runs` 上先算：等你 = human∧wait∧direct；人手 = human∧{active,idle}；后台 = agent|machine∧{active,idle,wait}。stale 主机不计入全局。标题只来自正式 metadata 或 `Tool · projectLeaf`，不来自 prompt / session_summary。

## 8. 跨机限额去重

例：同一 Claude Max 在 MBP 和 mini 都登录。

- 两台 agent 各自扫描到会话（任务要两行，因为工作区不同）
- 限额只显示一行，`freshness = max(两台成功拉取时间)`，`sourceHost = 最近成功的那台`
- 若两台读数差 > 5% 且都未过期，标 `conflict`，不要平均

## 9. 风险与红线

- 限额接口多数 **未文档化**。采集器要版本探测 + last-good，不能把解析失败当 0%。
- 凭证只在 **持有该凭证的机器** 上使用，经 HTTPS 打官方，**绝不**汇到 hub 或 Kindle。
- Hub 快照只含百分比、重置时间、短标题、机器名。
- 不要为了刷新 Grok/Codex token 写回用户 `auth.json`，除非你明确授权「可写凭证」。只读 refresh 失败就标 `reauth`。
- TokenTracker 已开云同步。Aindle 默认不读、不写他们的云。

## 10. ZCode（z.ai GLM Coding Plan）——已接入

- 凭证：`~/.zcode/v2/credentials.json`，`enc:v1:<iv>.<tag>.<data>`（base64url）AES-256-GCM；密钥 = sha256(`zcode-credential-fallback:<platform>:<homedir>:<用户名>` 或 `ZCODE_CREDENTIAL_SECRET`)——与 ZCode 应用一致，本机可解密（2026-09-05 实测）。
- 限额：`GET https://api.z.ai/api/monitor/usage/quota/limit`，Bearer `oauth:zai:access_token`。`limits[]`：`TOKENS_LIMIT unit=3`→5h、`unit=6`→周、`TIME_LIMIT unit=5`→月（unit 语义对照 ZCode 渲染层）；`level`→plan（lite→Lite）。
- 会话：`~/.zcode/cli/db/db.sqlite` 的 `session` 表（title/directory/task_type/time_*），只读 + WAL 兼容。
- 套餐名可另从 `/api/biz/subscription/list` 拿（未接入，一个端点够用）。

## 11. Gemini CLI / Antigravity——已接入（分档）

- 凭证：`~/.gemini/oauth_creds.json`（access/refresh/expiry_date ms）。刷新用 gemini-cli 公开 client（只读刷新，**不回写文件**）。
- 档位：`POST cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`（`ideType: ANTIGRAVITY`）→ currentTier/paidTier/cloudaicompanionProject。免费档 2026-06 起 consumer 远程配额 API 已 403（`retrieveUserQuota`/`fetchAvailableModels`/`retrieveUserQuotaSummary` 全 PERMISSION_DENIED，本机实测）。
- 付费档（Code Assist Standard）：`retrieveUserQuota`/`fetchAvailableModels` → `buckets[].remainingFraction` + `resetTime`，used% = 1−fraction（同模型取最小）。
- 免费档唯一实时来源：**Antigravity IDE 本地 language server**（`https://127.0.0.1:<port>/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`，端口/CSRF 从进程参数 `--extension_server_port`/`--extension_server_csrf_token` 取，自签证书仅 loopback）。应用未运行 → 明确标不可用，不猜数。
- 禁止调用 `onboardUser`（写操作）。

## 12. GitHub Copilot（个人 premium requests）——已接入

- 端点：`GET https://api.github.com/copilot_internal/user`（VS Code/Zed/CodexBar 同款，未文档化）；`quota_snapshots.premium_interactions.percent_remaining` → used% = 100−remaining；`quota_reset_date_utc`；`copilot_plan`。
- 官方替代：`GET /users/{user}/settings/billing/premium_request/usage`（逐条明细，需自购订阅，百分比要自己按 300/1500 换算）——未接入。
- Token：Copilot CLI 存 macOS keychain（service `copilot-cli`）；跨进程读取会弹授权框 → **默认关闭**，走 `AINDLE_COPILOT_TOKEN`/`keyFile`，钥匙串路径 `AINDLE_COPILOT_KEYCHAIN=1` 显式开启（首次需点「始终允许」）。

## 13. Kiro（kiro.dev）——已接入（脆弱）

- Token：macOS `~/Library/Application Support/kiro-cli/data.sqlite3`；Windows `%APPDATA%\kiro-cli\data.sqlite3`（兼查 `%LOCALAPPDATA%` 与 `~\.kiro-cli`）；Linux `$XDG_DATA_HOME/kiro-cli` 或 `~/.kiro-cli`。表 `auth_kv`（key `kirocli:social:token`，旧版 `kirocli:odic:token`；JSON 含 access_token/expires_at/profile_arn）。CLI 负责刷新——过期就跑一次 kiro-cli。
- 限额：`POST https://codewhisperer.us-east-1.amazonaws.com/`，`X-Amz-Target: AmazonCodeWhispererService.GetUsageLimits`，body `{profileArn}`。计划内用量 = `currentUsage − currentOverages`；plan 上限字段未文档化 → 容错探测多个候选键，拿不到就 label 显示原始 credits，不画假条。重置 `nextDateReset`。

## 14. DeepSeek——已接入（余额型）

- `GET https://api.deepseek.com/user/balance` Bearer API key（官方稳定）。响应 `balance_infos[].total_balance/currency`（字符串）；**没有用量 API**。
- key 解析顺序：`DEEPSEEK_API_KEY` → `keyFile` → `~/.qwen/settings.json` env.DEEPSEEK_API_KEY（本机 Qwen Code 即此配置）。
- 类型 `kind: spend`；注册表 `budget`（元）把余额换算成「预算」条（花超充值额会回落），不配则 label-only。

## 15. Qwen Code / Qwen Coding Plan——结论：**无配额 API，不接入**

- 全历史源码（v0.23.0）核对：`chat.qwen.ai` 只有 `oauth2/device/code` 与 `oauth2/token` 两个路径；`/usage` 命令是本地 `~/.qwen/usage/token-usage-YYYY-MM.jsonl` 统计的别名；配额只在 429 错误体文本里出现（`insufficient_quota` / "will reset at"）。
- Bailian `sk-sp-` Coding Plan（`coding.dashscope.aliyuncs.com`）同样没有用量查询端点。
- 注意：Qwen OAuth token 刷新失败会导致 CLI **清空凭据**——监控工具切勿触发其刷新。

## 16. iFlow CLI——结论：**无配额 API，不接入**

- npm bundle（0.5.14/0.5.19）反混淆核对：仅 `apis.iflow.cn/v1/chat*` 推理、`iflow.cn/api/oauth/getUserInfo`（无配额字段）等；无任何 usage/quota/plan 端点；配额同样只在 429 文本（gemini-cli 残留文案）。

## 17. 未接入的其余候选

Windsurf / Trae / CodeBuddy / Qoder / Antigravity 独立凭据 / OpenRouter / new-api：本机未安装或数据路径不明；需要时按本文档同套路调研（本地凭据 → 只读探测 → 容错解析）。

## 18. 本地 token 消耗采集（24h / 7d，已接入）

- 采集在 agent 端完成，hub 不落历史库：每次采集时从本地会话 JSONL 现算滚动窗口。
- 来源：Claude / Kimi / GLM 的 `projects/**/*.jsonl`（`message.usage` 四项 + `message.model`）；Codex 的 `rollout-*.jsonl`（`token_count` 的 `last_token_usage`，模型取 session_meta/turn_context）。只处理 8 天内 mtime 的文件。
- 增量缓存 `~/.config/aindle/usage-cache.json`：按文件记录已读 offset + 按小时聚合桶，文件只追加时每次只读增量；size 回退（轮换/截断）则全量重解析。
- 折合美元：agent 内置静态定价表（`lib/pricing.ts`，前缀匹配），cache_read 按 0.1× 输入价、cache_write 按 1.25× 输入价；未知模型只计 token、不出美元。定价是近似值，用于直观感受，不是对账依据。
- Sub2API（按量中转）没有 token 数，用 `breakdown.days`/`today` 折算 7d/24h 的美元成本。
- 7 天无使用的来源（有 usage/breakdown 证据且全零、`lastUsedAt` 早于 7 天前）在 hub 视图模型层被过滤，不进限额列表；无采集证据的来源（Cursor / Grok 等）不误杀。
