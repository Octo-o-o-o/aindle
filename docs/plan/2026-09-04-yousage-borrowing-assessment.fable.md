# YoUsage → Aindle 借鉴：可实施方案

> 状态：**可实施，取代本文旧版“借鉴评估”的第一刀描述**。
> 决策依据：[`../review/2026-09-04-yousage-borrowing-cross-review.sol.md`](../review/2026-09-04-yousage-borrowing-cross-review.sol.md)。
> 对照基线：YoUsage `ff31f2c49240c82299aba757614ed9865ce95c7d`；其 LICENSE 为 BSL 1.1。只借产品语义，不复制 YoUsage runtime 或实现。
> 对齐稿：[`../../demo/yousage-align.html`](../../demo/yousage-align.html) 只是 mock，不是已交付能力或验收证据。

## 1. 产品定位

Aindle 是放在书桌边、运行于私网的 **AI 工作态势只读副屏**。它汇总登记过的机器、订阅和本机会话，只回答两个问题：

1. 额度还剩多少，这个读数是否新鲜、可信。
2. 哪些会话确实在等人，哪些仍由人主导，哪些在后台运行。

它不是精力追踪器、绩效表、任务管理器、审批入口或转录浏览器。Kindle 不批准、不回复、不展示 prompt/reply、命令、路径、tool input/output 或 secret。状态来自可解释的本机结构事件；信号不足时宁可不报 `wait`，不能猜“等你”。

因此本轮值得借的是 YoUsage 对“等你”和“后台”的语义切分，不是 HU%、工作轨迹、复核清单、hooks、S0 或 `/api/state`。

## 2. 总裁决与本批边界

**按交叉评审改写后的第一刀开工。** 本批只有五个工作包：

1. 升级会话数据合同，保留 `initiator` 与状态置信，不再在采集期丢掉后台身份。
2. 仅为 Claude `AskUserQuestion`、Codex `request_user_input` 实现未闭合结构事件扫描。
3. 从完整会话集先计算“等你 N · 人手 M · 后台 K”，再截断列表，并让专用 e-ink renderer 真正画出 WAIT。
4. 移除所有 prompt/summary 标题回退，只保留正式标题元数据与项目兜底。
5. 补齐隐私、状态机、计数、UI 与回归测试，并同步合同文档。

本批不做：Claude permission、Codex approval、Cursor/Grok/Kimi/GLM 的 `wait`；YoUsage hooks/runtime；`tokensToday`；“可能可查看”；第四页；工作轨迹；任何动作面。

## 3. 支持矩阵：先把能力说窄

| 工具 | 第一刀可直接确认的 `wait` | 闭合 | 没信号时 |
|---|---|---|---|
| Claude | `assistant.message.content[].type=tool_use` 且 `name=AskUserQuestion` | 同 `id` 的后续 `tool_result.tool_use_id`，或后续真实 human user turn，或超过 60 分钟 | 只用年龄档；permission 不报 `wait` |
| Codex | `response_item.payload.type=function_call` 且 `name=request_user_input` | 同 `call_id` 的后续 `function_call_output`，或后续真实 user turn，或超过 60 分钟 | 只用年龄档；approval/rate-limit 不报 `wait` |
| Cursor | 无已确认的闭合结构信号 | — | 只用年龄档 |
| Grok | 无已确认的闭合结构信号 | — | 只用年龄档 |
| Kimi / GLM | 无已确认的闭合结构信号 | — | 只用年龄档 |

页面和 README 必须明确写“`wait` 第一刀仅 Claude + Codex 上述两种请求”。不能用通用文案暗示六种工具都有等人信号。

## 4. 数据合同

本批对 agent、hub、snapshot 与 UI 做一次协调升级。不要在 `aindle.*.v1` 里静默增加新语义：

```ts
type Initiator = 'human' | 'agent' | 'machine';
type SignalConfidence = 'direct' | 'derived';
type WaitReason = 'needs_input';

type Run = {
  // 现有字段保留
  initiator: Initiator;
  initiatorConfidence: SignalConfidence;
  stateConfidence: SignalConfidence;
  waitReason?: WaitReason; // 仅 state=wait 时允许
};
```

- `INGEST_SCHEMA` 与 `SNAPSHOT_SCHEMA` 同步升到 `v2`；monorepo 内 agent/hub/mock/tests/docs 一次升级。
- hub 对 v1 ingest 明确返回 schema error，不把缺失字段默认成人手或 0。旧 agent 会变 stale，这是可见且诚实的失败。
- `state='wait'` 必须同时满足 `stateConfidence='direct'` 与 `waitReason='needs_input'`；年龄推断永远不能产出 `wait`。
- `initiatorConfidence='direct'` 只用于格式里明确存在的 sidechain/subagent/headless/user/machine 标记；没有明确标记时允许 `human + derived`，但不能据此制造 `wait`。
- `detail` 不得承载问题、权限、命令、路径或 tool input；等待态只写固定枚举文案。

### 4.1 发起者映射

| 工具 | `agent` | `machine` | `human` |
|---|---|---|---|
| Claude/Kimi/GLM | `isSidechain=true` 或明确非 human 的 agent origin | 明确 scheduled/machine origin | `origin.kind=human`；缺标记时 `derived` |
| Codex | `thread_source=subagent` 或有 `parent_thread_id` | 明确 scheduled/machine source | `thread_source=user`；缺标记时 `derived` |
| Grok | `session_kind=headless/subagent` | 明确 machine/scheduled kind | `session_kind=interactive`；缺标记时 `derived` |
| Cursor | 已确认的后台标记（若 fixture 证明存在） | 已确认的 machine 标记 | 否则 `human + derived` |

未知字符串不得自行扩成新的“后台”规则；先保守落到 `human + derived` 并加 fixture 后再扩映射。

## 5. `wait` 的最小可靠实现

### 5.1 有序窗口，不看“最后一条”

对每个当前 60 分钟内有活动的候选会话，按文件顺序重建最近 60 分钟结构事件：

1. 遇到允许的 ask/function call，以 `tool_use.id` 或 `call_id` 加入 pending set。
2. 遇到匹配的 result/output，从 pending set 删除。
3. 遇到其后的真实 human user turn，关闭此前 pending；只读 role/type/origin，不读正文。
4. 文件截断、inode 变化或进程重启时，从 EOF 向前重建 60 分钟窗口；正常 `--loop` 增量只读新增 bytes。
5. 只要窗口无法按时间和 id 可靠重建，就不报 `wait`，退回年龄态并标 `derived`。

现行 16KB head + 32KB tail 只能继续服务轻量元数据，不能作为 `wait` 状态机输入。未闭合请求可能在文件中段；只看最后一条 `tool_use` 也无法判断它后来是否已闭合。

### 5.2 结构字段白名单

`wait` scanner 只允许检查：

- row/payload/message 的 `type`、`role`、`timestamp`；
- tool/function 的 `name`、`id`、`tool_use_id`、`call_id`；
- Claude 的 `origin.kind`、`isSidechain`；
- Codex 的 `thread_source`、`parent_thread_id`。

明确禁止读取、返回、缓存或记录：`text`、`input`、`arguments`、`output`、`content` 中的文本、命令、文件路径、prompt/reply。结构 reader 的返回值只能是时间戳、枚举、布尔值和 opaque id；日志不得打印原始行。现有其它时间统计逻辑不在本批重写范围，但新的 wait 路径不得依赖它的正文提取函数。

## 6. 三口径与页面合同

三个数字互斥，先在完整 `snapshot.runs` 上计算，再做任何列表 `.slice()`：

```text
等你 N = initiator=human
       ∧ state=wait
       ∧ stateConfidence=direct

人手 M = initiator=human
       ∧ state∈{active,idle}

后台 K = initiator∈{agent,machine}
       ∧ state∈{active,idle,wait}
```

- 不再由 `foldSpawned` 删除后台记录；折叠只发生在 ViewModel/渲染层。
- ViewModel 新增全局和每主机的 `attention: { waiting, human, background }`，并保留每条 run 的发起者/置信字段供排序和测试。
- `now` 页顶部和主机条显示“等你 N · 人手 M · 后台 K”。列表优先顺序是直接 `WAIT`、人手 active、idle；后台个体默认折成一行，不把 K 条铺满屏。
- stale 主机不计入全局三数；主机行若保留最后值，必须明确前缀“上次”，不得当当前值相加。
- 专用 `packages/hub/src/eink.ts` 的 `runRow` 必须实际渲染 WAIT，不得只在刷新策略里把它当 busy。
- 快速刷新可以由非 stale 的 direct WAIT、active 人手或 active 后台触发；仍保持现有三页，不新增页面。

`liveRuns` 可作为 v2 内部兼容统计保留，但 UI 不再把它单独命名成“进行中”，也不能用它代替三口径。

## 7. 标题合同

标题源按工具固定，任何路径都不再读 user prompt 首句或 session summary：

| 工具 | 允许顺序 |
|---|---|
| Claude / Kimi / GLM | `custom-title` → `Tool · projectLeaf` → `Tool` |
| Codex | `session_index.jsonl.thread_name`（含 parent thread）→ `Codex · projectLeaf` → `Codex` |
| Grok | `summary.json.generated_title` → `Grok · projectLeaf` → `Grok` |
| Cursor | `meta.json.title` → `Cursor · cwdLeaf` → `Cursor` |

删除 Claude/Kimi/GLM 的 `firstUserText` 回退、Codex 的 `readCodexUserTitle` 回退、Grok 的 `session_summary` 回退。`projectLeaf` 只保留末段；标题继续长度限制和 HTML escaping。

## 8. 预计改动面

必须检查并按需要修改：

- `packages/core/src/schema.ts`、`merge.ts`、`mock.ts`、`validate.ts`
- `packages/agent/src/collectors/sessions.ts`，以及新增一个只返回结构状态的 wait scanner
- `packages/agent/src/collectors/codex.ts`（复用 rollout 元数据，不读 arguments）
- `packages/hub/src/eink.ts`、`packages/hub/public/monitor.html`
- agent/core/hub 相关单测与 `docs/06-data-sources.md`、`docs/07-architecture.md`、`docs/12-testing.md`、`README.md`

必须保持不变：`config/registry.yaml`、YoUsage 全仓、`demo/oasis-monitor.html`、`demo/yousage-align.html`、Kindle 设备脚本和额度采集逻辑。不得安装 hooks，不得自动发现未注册目录。

工作区当前已有 `packages/agent/src/collectors/user-ask.ts` 与相关 startedAt 测试；把它视为前置工作并保留行为，不能用本批标题收紧误删“最后一次真实用户发起时间”的功能。

## 9. 验收合同

### A1 · Claude 等你

fixture 包含 `AskUserQuestion`，其 `input` 放置唯一 secret/path 哨兵。未闭合时 60 秒内 run 为 direct WAIT；追加同 id `tool_result` 后离开 WAIT；追加真实 human user turn也关闭；超 60 分钟不再 WAIT。快照、ViewModel、HTML、PNG 输入模型和日志均不含哨兵。

### A2 · Codex 等你

fixture 包含 `request_user_input` function call，`arguments` 放置唯一 secret/path 哨兵。未闭合时为 direct WAIT；同 `call_id` output、后续 user turn或过期均关闭。普通函数调用、`token_count.rate_limits` 和未命名 approval 不得误报。

### A3 · 不支持工具诚实为空

Cursor `AskQuestion`、Grok/Kimi/GLM 的热文件都只能走 active/idle/done；没有正式闭合 id 的 fixture 不得产出 WAIT。README/UI 明示第一刀支持矩阵。

### A4 · 三口径不说谎

fixture：同项目 1 个 human active、1 个 human WAIT、3 个 sidechain/headless active，再补 30 条旧记录。结果必须是“等你 1 · 人手 1 · 后台 3”；列表截断不改变数字；后台不冒充人手。stale 主机不计入全局数字。

### A5 · 标题不含正文

每个工具 fixture 在 prompt、reply、`input`、`arguments`、`session_summary` 放不同哨兵。快照/VM/两种 renderer 都不得出现；正式 title metadata 存在时采用它，不存在时得到 `Tool · projectLeaf` 或 `Tool`。

### A6 · UI 与兼容失败

- desktop monitor 与专用 e-ink 都能看见 WAIT 和三口径。
- e-ink 仍为三页，PNG 仍为 1072×1448。
- v1 ingest 对 v2 hub 返回明确 schema error；不静默显示 0。
- registry 白名单、credential 本地化与 snapshot secret gate 保持有效。

## 10. 门禁与停止条件

Focused gates：

```bash
npm run build
node --import tsx --test packages/agent/test/*.test.ts
node --import tsx --test packages/core/test/*.test.ts
node --import tsx --test packages/hub/test/*.test.ts
git diff --check
```

语义复审 GREEN 后，完整门禁只跑：

```bash
npm run check
bash scripts/check-release.sh
```

没跑的门禁必须写“未跑”。以下情况停止并交给 owner，不自行扩范围：

- 需要 hooks 才能拿到的 permission/Cursor wait；
- 真实 Claude/Codex 格式与上述 canonical fixture 不同，且无法用结构字段闭合；
- 需要读取 `input/arguments/text/output` 才能判 wait；
- 需要破坏 v2 协调升级以兼容一个未声明的外部消费者；
- 需要改注册表、YoUsage、设备脚本、Demo 或额度采集器。

## 11. 后续阶段（不预授权）

第一刀有真实运行证据后，再单独评估：

- `tokensToday` 的权威来源与 cache 计量口径；
- “刚停，可能可查看”的估算层；
- 更细的 machine/scheduled 映射；
- 是否需要可选 hooks 补 permission/Cursor wait。

这些都不能混入本批，也不能先在对齐稿里冒充已交付。
