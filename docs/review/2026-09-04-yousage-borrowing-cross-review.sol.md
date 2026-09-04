# YoUsage → Aindle 借鉴评估交叉评审

> 评审对象：`docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md`；对齐稿 `demo/yousage-align.html` 只作信息架构对照。
> YoUsage：本会话 `git log -1` 读到 HEAD `ff31f2c49240c82299aba757614ed9865ce95c7d`（短 hash `ff31f2c`，2026-08-21），与被评估时一致；但工作树不是干净候选：`Docs/05-ux-spec.md` 已修改，工作轨迹 proposal/readback 与 `src/core/handoffs.ts` 均为 untracked。
> Aindle：本会话在仓库根目录执行 `git rev-parse --is-inside-work-tree`，当时真实输出为 `fatal: not a git repository (or any of the parent directories): .git`；此句记录评审时点，不代表后续发布状态。
> 范围：`review_scope=step`；独立、只读交叉评审。除创建 `docs/review/` 并写本报告外，未改 Aindle / YoUsage 产品代码、配置或 Demo，未 commit、push、安装依赖。

## TL;DR（总裁决：按原样做 / 改范围再做 / 不要做 + 一句话）

**总裁决：改范围再做。** 借 `wait`、发起者分桶和收紧标题的方向值得做，但原第一刀不能按原样开工：它把 hook 才有的 permission/Cursor 直接信号写成转录已有信号，又试图在会话身份和分桶已被丢掉的现有合同上直接画三个精确数字。

最终建议见文末：明确选择 **2. 按改写后的第一刀开工**。

## 对评估主张的逐条裁决（主张 | 确认/证伪/部分成立 | file:line | 含义）

### A. Aindle 承重现状

| 主张 | 裁决 | `file:line` / 本会话证据 | 含义 |
|---|---|---|---|
| `RunState` 已有 `wait`，UI / eink 会画 WAIT | **部分成立** | `packages/core/src/schema.ts:12-13` 有 `wait`；`packages/core/src/merge.ts:355-360` 映射 `WAIT`；桌面/旧 Kindle HTML 用 `pill(r.tag)`：`packages/hub/public/monitor.html:277-287,690-699`。但当前专用 eink `runRow` 只画图标、标题、时间、项目，不画 tag：`packages/hub/src/eink.ts:321-330`；它只在刷新决策里认 `WAIT`：`:57-69`。 | schema 和桌面 UI 有 WAIT；“eink 徽章会自动变真”是错的，专用 eink renderer 仍要改。 |
| 活采集 `stateFromAge` 从不返回 `wait`，所以 `waitRuns` 为 0 | **确认，但要限定为当前 live collector 路径** | `packages/agent/src/collectors/sessions.ts:170-175` 只产 `active/idle/done/null`；`:288-318` 所有现行任务入口都走该年龄状态；`:348-354` 才统计 wait。`packages/agent/src/run.ts:17-33` 显示生产上报先 `collectRuns` 再 `collectHostStats`。 | 当前 Aindle 自己采到的 run 不会进入 wait，因而该路径的 `waitRuns` 为 0；schema 仍允许外部/测试构造 wait，不能无条件说字段数学上恒 0。 |
| mock 会造成“已经能 wait”的错觉 | **确认** | `packages/core/src/mock.ts:12-16` 写 `waitRuns: 1`、`tokensToday: '41.8M'`；`:128-134` 直接造了 `state: 'wait'` 和“待批准”。 | Demo/测试能显示 WAIT 不能证明活采集已接线。 |
| `foldSpawned` 已按项目折叠 SubAgent，折叠后丢掉 `spawned` | **部分成立，且评估低估了损失** | `packages/agent/src/collectors/sessions.ts:321-326` 只按 `projectKey` 判断：同项目有任意 main 就删 spawned，然后对幸存项去掉 `spawned`。`:181-239` 对 Claude/Grok/Cursor/Kimi/GLM 先按顶层目录只产一条 run；`:328-345` 最后还截到 24 条。 | 这不是“父子聚合”，而是无计数的删除；无同项目 main 的后台会作为普通 run 幸存并进入 `liveRuns`，同项目多会话又可能在更早阶段已缩成一条。三口径不能在现有结果上可靠回推。 |
| Claude 标题用 `firstUserText`；其它工具没有同类问题 | **前半确认，后半证伪** | Claude `firstUserText` 与 fallback：`packages/agent/src/collectors/sessions.ts:94-110,112-135`；Kimi/GLM 复用同一 meta：`:305-315`。Codex 也在 thread name 后调用 `readCodexUserTitle`：`:266-271`，其实现直接取 `user_message` / `input_text`：`packages/agent/src/collectors/codex.ts:186-239`，测试还把此行为写成合同：`packages/agent/test/codex-sessions.test.ts:220-245`。Grok 会退到 `session_summary`：`sessions.ts:137-151`；Cursor 用 `meta.title` 或 cwd：`:157-167`。 | 第一刀必须同时去掉 Claude/Kimi/GLM `firstUserText`、Codex `readCodexUserTitle`、Grok `session_summary` fallback；只修 Claude 仍会把正文/摘要送进 title。 |
| `tokensToday` 活路径写死 `'—'`，eink / monitor 都能看到它 | **前半确认，后半部分成立** | 活路径：`packages/agent/src/collectors/sessions.ts:348-354`；ViewModel 暴露到 host：`packages/core/src/merge.ts:274-289`；桌面 monitor 画它：`packages/hub/public/monitor.html:721-729`。当前专用 eink 的 footer 只显示 host 在线/陈旧与 seen：`packages/hub/src/eink.ts:267-276`，没有 token。 | `'—'` 确实是活路径事实；mock 的 41.8M 会造成错觉。但当前专用 eink 并不消费 `tokensToday`，所以 Y19 是第二刀/桌面主机条问题，不是本轮 eink 的承重前提。 |
| Aindle JSONL 已有可复用的 head+tail scanner | **确认读取方式，证伪“足以支撑可靠 wait”** | `packages/agent/src/collectors/sessions.ts:63-92` 只读首 16KB 与末 32KB，并把切口处解析失败行静默跳过；Claude meta 只选项目下最新文件：`:112-115`。Codex title 则另读前 512KB/80 行：`packages/agent/src/collectors/codex.ts:186-200`。 | 未闭合请求若落在中段或单行跨过 tail 起点，当前代码看不到。对真正停在提问处的短 Ask 行通常仍在尾部，所以这不否定概念；但它足以否定 Y13“无需换扫描器”和“最小可靠”的说法。 |
| Codex pending approval / rate limit 已在现行 rollout 读取里扫到，只差映射 wait | **证伪** | rate limit 只在 quota 适配器中识别 `token_count.rate_limits`：`packages/agent/src/collectors/codex.ts:410-442,444-474`。任务路径只读首行 meta、thread name/用户标题和 mtime：`packages/agent/src/collectors/sessions.ts:241-285`。YoUsage 自己也明确写 Codex/Grok 文件扫描无 `agent_request/confirm`：`YoUsage/Docs/09-integrations.md:133-137`。 | rate-limit 不是等待信号；Aindle 目前没有 pending-approval parser。原第一刀的 Codex approval 承诺没有 canonical fixture。 |
| snapshot 已经“禁 prompt/路径/secret” | **部分成立** | 产品合同明禁绝对路径、prompt：`docs/01-problem-and-scope.md:13,18-22`、`docs/07-architecture.md:41-96`。但代码只递归拒绝特定**键名**：`packages/core/src/schema.ts:135-159`；`Run.title` / `detail` 仍是任意字符串：`:89-100`，且 UI 会直接显示 `detail`：`packages/hub/public/monitor.html:277-287`。 | 红线是对的，现有 guard 却不能发现藏在 `title/detail` 值中的 prompt、绝对路径或 secret。接 tool input 前必须加字段白名单与值级 sentinel 测试。 |
| Aindle 不自动扫描未注册目录、只读副屏 | **确认** | 注册表由显式文件加载：`packages/agent/src/registry.ts:44-68`；架构验收写明不读未注册目录：`docs/07-architecture.md:143-153`；Kindle 不批准/打断/发消息：`docs/01-problem-and-scope.md:15-22`。 | 第一刀可以保持纯读：只在已注册根读取宿主日志、向既有 hub 上报脱敏字段；无需读 `~/.yousage`、无需调用 YoUsage `/api/state`。 |

补充的脱敏结构取样（只输出类型、字段名与计数，不输出正文/路径）：

- 最近 120 个 Claude JSONL 的各 4MB tail 中，看到 9 个 `AskUserQuestion`；形态为 assistant `tool_use {type,name,id,input}`，`input` 键为 `questions`，9 个都由后续 user `tool_result {type,tool_use_id,content}` 以 id 配对。普通 `Bash/Read/Edit/Write` 的 `input` 键分别含 `command/file_path/content` 等敏感载荷。
- 最近 300 个 Codex rollout 的各 4MB tail 中，看到 16 个 `response_item/function_call name=request_user_input`，均有同 `call_id` 的 `function_call_output`；未看到名为 approval/permission 的事件。它证明当前样本中“显式向用户提问”可配对，不证明 rollout pending approval 是稳定合同。
- 最近 250 个 Cursor JSONL 的各 3MB tail 中，看到 5 个 `AskQuestion`，但块没有 id，未见可按 id 配对的 `tool_result`，且样本中其后仍可继续出现 assistant tool call。不能只凭最后一个 `AskQuestion` 断言“正在等人”。

### B. 评估登记表抽查

| 主张 | 裁决 | `file:line` / 本会话证据 | 含义 |
|---|---|---|---|
| Y01 精力引擎是已交付能力；Aindle 没有且应判 C | **确认** | YoUsage `src/core/engine.ts:31-64,103-150` 有在线有序账本、迟到回滚重放；产品定位明确是精力计量：`Docs/01-product-vision.md:5-12`。Aindle 明确只读额度/任务副屏：`Aindle/docs/01-problem-and-scope.md:5-22`。 | 精力引擎判 C 不过猛；owner 已否决 S0/精力页，不能借状态语义之名把 HU/EP 带回来。 |
| Y04 working / waiting_confirm / waiting_review 借为 B，转录可直接给 Claude Ask/permission 与 Codex approval | **部分成立** | 状态机确实在产线代码中：`YoUsage/src/core/sessions.ts:10-15`；但 Claude permission 来自 `Notification` hook、Ask 来自 `PreToolUse` hook：`Docs/09-integrations.md:6-27`，代码同样如此：`src/collect/synth.ts:125-207`。Codex 文件扫描无 request/confirm：`Docs/09-integrations.md:133-137`。Aindle 状态仍只有年龄档：`Aindle/packages/agent/src/collectors/sessions.ts:170-175`。 | **B 方向正确，第一刀信号源错误。** 无 hooks 时，Claude 只能把结构可配对的 `AskUserQuestion` 当直接 wait；普通 permission 不能从“未回 tool_result 的任意工具”可靠推出。Codex 只先支持已取证的 `request_user_input`，不支持未取证 approval。 |
| Y05 human / agent / machine 三桶为 B | **确认能力与 B，证伪“Aindle 只差上屏”** | YoUsage `isHumanBucket/openBreakdown`：`src/core/sessions.ts:18-23,77-94`；Codex/Grok/Cursor demote 规则：`Docs/09-integrations.md:65-75,90-98`。Aindle schema 无 initiator：`packages/core/src/schema.ts:89-100`，并在 `foldSpawned` 删除字段：`packages/agent/src/collectors/sessions.ts:321-326`。 | 三桶值得借，但必须先保住逐会话身份与 initiator；这不是改一行文案。 |
| Y06 attested / inferred 为 B | **确认** | YoUsage 只让 attested 进入触发分子：`src/core/sessions.ts:63-74`，正式 UX 区分直接 waiting 与估算 review：`Docs/05-ux-spec.md:61-68`。Aindle 的 `Confidence` 只挂订阅，不挂 Run：`packages/core/src/schema.ts:6-7,55-69,89-100`。 | B 正确；若屏上出现“工具直接记录/估算”，Run 或派生统计必须带 state confidence，不能借订阅 confidence 冒充。 |
| Y07 HandoffItem 代码 C、只借枚举 B | **部分成立** | `src/core/handoffs.ts` 当前存在但 `git ls-files --error-unmatch` 返回 1，是 untracked；本会话 `git ls-tree -r --name-only HEAD` 未找到 handoffs/work-trajectory，`git grep ... HEAD -- src web apple` 也未找到 HandoffItem/content-lab 生产接线。readback 同样说 Phase A 未开始：`Docs/review/2026-09-04-work-trajectory-impl-readback.fable.md:16-24,42-45,74-82`。 | 不得把 projector 当 HEAD 已交付能力。只借 `needs_input/ready_to_check/running/quiet` 词义的判断是对的，但第一刀只需要前两者中“直接 needs_input”的窄子集。 |
| Y08 工作轨迹只借原则、不借实现 | **确认** | proposal 自报草案且不可直接生产：`Docs/proposals/2026-08-30-work-trajectory-and-return-cues.md:1-8`；readback 明确 C8、R3、Phase A 未完成：`Docs/review/2026-09-04-work-trajectory-impl-readback.fable.md:16-24,42-45`。这些文件本会话还都是 untracked，且上述 HEAD tree/grep 无生产接线。 | 评估没有把未交付实验写成已交付，判断正确。 |
| Y09 会话正文/本机工作记忆全部只是实验，因此 C | **部分成立，最终 C 正确** | YoUsage 正式能力已有一个很窄的按需原文回看：`Docs/04-behavioral-signals.md:48-59`、`Docs/08-privacy-security.md:39`；产线文件 `src/daemon/recheck-context.ts:1-8,17-45` 确实定义按需 ask/permission/review 节选，但通用工作卡/本机记忆仍只在未追踪 proposal，且 HEAD grep 无生产接线。 | 能力描述混合了“已交付的有限 recheck”与“未交付的通用 memory”。Aindle 仍应判 C：Kindle 不需要正文回看，且这会扩大肩窥面。 |
| Y10 S0 低刷新预计算原则为 B，但不读 S0 | **确认** | 产线 `computeS0` 预计算 `waitingAgents/load`：`YoUsage/src/daemon/s0.ts:60-126`；Aindle 自有快照是对外唯一数据面：`Aindle/docs/07-architecture.md:41-96`。 | 借“上游算好、屏只显示”的原则即可；owner 否决读取 S0 后，没有理由接 YoUsage runtime。 |
| Y12 hooks 本轮判 C；不用 hooks 也能把 wait 接完整 | **前半确认，后半证伪** | Claude/Cursor hooks 安装和 matcher 是真实代码：`YoUsage/src/collect/install-hooks.ts:28-50`、`src/collect/install-cursor-hooks.ts:26-37`。直接 permission/AskQuestion 依赖这些 hooks：`Docs/09-integrations.md:10-18,43-59`。 | 本轮不装 hooks 的 C 判断正确；代价必须诚实写入覆盖面：Cursor 精确 wait 留空，Claude permission 留空。C 不等于“已有转录信号可无损替代”。 |
| Y13 Aindle 已有 head+tail，扫描骨架无需借，判 C | **证伪，改判 B（实现原则）** | Aindle 是固定 16KB+32KB 无游标读取：`packages/agent/src/collectors/sessions.ts:63-92`；YoUsage 是逐文件字节 offset、半行续读、inode/缩短重扫：`YoUsage/src/collect/transcript.ts:785-824,847-925`。 | 不应复制 YoUsage 代码，但应借“逐会话有序增量 + 重写恢复 + 启动 lookback”的扫描语义。Y13 是第一刀可靠 wait 的前置，不是 token 第二刀才考虑。 |
| Y14 Cursor 日 token 聚合 API 为 B（第二刀） | **确认能力与阶段，修正文案** | 代码调用 Cursor 自有 dashboard 聚合端点并把 cache 并入 input：`YoUsage/src/collect/cursor-api.ts:93-117,128-195`；Aindle 当前 Cursor 只承诺账期 usage-summary 且警告未文档化：`Aindle/docs/06-data-sources.md:77-98`。 | B/第二刀正确；应称“Cursor 自有但未文档化的 dashboard API”，不能称稳定官方 API。owner 否决精力页不影响将来填 host token，但不应混入本刀。 |
| Y19 cache 并入 input 为 B（第二刀） | **确认** | YoUsage 正式口径：`Docs/09-integrations.md:75`；Claude 代码确实把 cache creation/read 计入 input：`src/collect/transcript.ts:240-294`。Aindle 活路径 `tokensToday: '—'`：`Aindle/packages/agent/src/collectors/sessions.ts:348-354`。 | 账目口径值得借，但不影响本刀 wait/标题；保持第二刀正确。 |
| Y24 字段白名单为 B | **确认，而且比原评估更承重** | YoUsage hook 白名单只保留 session、basename、事件类、工具名/选项数：`src/collect/yo-log.ts:13-78,81-115`；隐私 Docs 明禁工具参数、正文和原路径：`Docs/08-privacy-security.md:21-35`。Aindle guard 只扫 key：`Aindle/packages/core/src/schema.ts:135-159`。 | B 正确；必须升级为第一刀 P0 验收条件，而不只是“标题更干净”的原则。 |
| Y40 “实测/估算”两级词为 B，只改文案层 | **部分成立** | YoUsage UX 将直接等待与估算验收分开：`Docs/05-ux-spec.md:61-68`。Aindle Run 无 confidence：`packages/core/src/schema.ts:89-100`。 | 语义 B 正确；“只改文案层”错误。要展示两级，snapshot/VM 必须携带来源置信，或第一刀严格只显示 direct wait、完全不显示估算层。 |
| Y41 “在等你”不等于“跑完可能可看” | **确认语义；第一刀范围被 Demo 偷跑** | YoUsage 正式 UX 明确“在等你回复”是 hooks 直采断言、“待验收”是 Stop 估算：`Docs/05-ux-spec.md:61-63`；评估正文把“可能可查看”放第二刀：`Aindle/docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md:109-112`，但对齐稿中页已经画出该分区：`Aindle/demo/yousage-align.html:195-205`。 | 分层语义不要推翻；第一刀只画 direct wait。对齐稿比唯一 SoT 更激进，不能拿它作为本刀验收图。 |
| Y42 子代理降级、不占人手为 B，Aindle 已做一半 | **部分成立** | YoUsage 多源 demote：`Docs/09-integrations.md:69-75,90-98`；Aindle Codex 能读 parent/thread source：`packages/agent/src/collectors/sessions.ts:241-285`，但 `foldSpawned` 删除信息且其它源先按项目压缩：`:181-239,321-345`。 | B 正确；“做了一半”仍显乐观。要得到 K，先恢复逐会话 cardinality，再聚合显示。 |
| Y15 显式额外根判 C（Aindle 已更好） | **确认** | Aindle 只加载显式 registry：`packages/agent/src/registry.ts:44-68`；正式架构验收不读未注册目录：`docs/07-architecture.md:143-153`。 | 不借 `yo collect`，保持 Aindle 自有注册表。 |
| Y18 Kimi `wire.jsonl` 因已有 Kimi collector 而属重复建设 | **部分成立，第一刀仍判 C** | Aindle quota 层确有 Kimi：`packages/agent/src/collectors/index.ts:30-44`，任务层却把 Kimi 当 Claude projects 格式：`packages/agent/src/collectors/sessions.ts:305-315`；YoUsage 的 wire 能力是 token/initiator/结束态：`YoUsage/Docs/09-integrations.md:119-125`。 | 两者不是同一能力；“完全重复”不准。但原生 Kimi wire 不属于本刀，所以 C 仍正确。 |
| Y39 新鲜度哨兵、Y43 quota last-good 判 C | **确认** | Aindle snapshot 有 freshness/host status：`packages/core/src/schema.ts:79-87,103-118`；ViewModel 暴露 seen/status：`packages/core/src/merge.ts:274-289`；架构说明断流保留上一帧：`docs/07-architecture.md:35-39`。 | 这些现状已优于再造 YoUsage 显示链。token 的 supersedes 是第二刀另题，不能误说 Aindle 已有 token 账本。 |

登记表还有一个 P2 记账错误：正文写 `B × 10`，但随后列出 Y04、Y05、Y06、Y07、Y08、Y10、Y14、Y19、Y24、Y40、Y41、Y42 共 12 个带 B 的概念（其中两条是混合裁决），见评估 `:97-99`。这不改变产品裁决，但计数必须按“整项 B”还是“混合项含 B”统一。

## 第一刀交叉结论（wait / 三口径 / 标题 各一段）

### wait

**最小可靠定义应是“仍未闭合、未过期、来源可直接证明的人向请求”，不是“最后一个 tool call 没结果”。**

- Claude 第一刀只认 `assistant.message.content[*].type == tool_use && name == AskUserQuestion`。打开键是 `tool_use.id`；同 session 后续 `user.message.content[*].type == tool_result && tool_use_id == id` 精确闭合。若出现更晚的普通 human user 消息但没有配对 result，保守地把旧请求清为“已回应或放弃”（只消除 wait，不声称发生 confirm）；60 分钟仍无任何闭合则过期。YoUsage 的 60 分钟合同见 `Docs/09-integrations.md:20-27`。
- Claude permission **没有一个可白名单化的 tool name**。普通 `Bash/Edit/Write/...` 未见 result 也可能是工具仍在执行、进程退出或日志未刷；YoUsage 用 `Notification(permission_prompt)` hook 才直接打开 permission wait（`Docs/09-integrations.md:10-18`）。owner 已否决 hooks，因此本刀不能承诺 permission wait。
- Codex 可先认本机会话已取证的 `response_item/function_call name=request_user_input`，以 `call_id` 对 `function_call_output.call_id` 闭合，再用后续 user_message/60 分钟作保守清理。**不能**把它写成 pending approval；现行 Aindle 只扫 rate limit，YoUsage 正式 Docs 也说 Codex 文件扫描无 request/confirm。
- Cursor 当前转录 `AskQuestion` 在脱敏样本里没有 id/result 配对，YoUsage 的直接信号来自 hook；Grok 只有 turn completed/user chunk，Kimi/GLM 在 Aindle 也没有已声明且有 fixture 的等待事件。因此第一刀覆盖文案必须写 **“Claude AskUserQuestion + Codex request_user_input；Cursor/Grok/Kimi/GLM 暂无直接 wait，留空”**。后续若每个源补到脱敏真实 fixture，再逐个开放，不能靠工具名相似自动套用。
- 只看最后一条 tool_use 不够：同一消息可有多个 content block，关闭事件按 id/call_id 出现在后续行，文件会半行写入或 inode 重写；还要区分后台 initiator。应按 session 有序维护 open-set。启动时只回看最近 60 分钟对应的完整记录，稳态用 byte offset 增量；文件缩短/inode 变化则重建该时间窗。当前固定 head+tail 不能作为可靠匹配器。

“不含正文”需要拆成两种含义：普通 `JSON.parse` 必然把整条 JSONL（包括 `input/text`）读入内存；能保证的是**不提取、不持久化、不进 snapshot/UI**。如果 owner 的意思是连进程内都不能 materialize 正文，就必须用流式 tokenizer 跳过 value，原方案没有写。无论哪种实现，保留字段都应冻结为：

- Claude：行 `type/timestamp/sessionId/isSidechain/origin.kind/entrypoint`；内容块只留 `type/name/id/tool_use_id`。
- Codex：行 `type/timestamp`；payload 只留 `type/name/call_id`，以及 session meta 的 `id/thread_source/parent_thread_id` 和 **cwd basename**。
- 通用游标：`inode/offset/mtime`、已登记源 id、项目 basename。
- 明确丢弃：`message.text/content` 的文本值、`tool_use.input` 整体、Codex `arguments/output`、`tool_result.content/toolUseResult`、完整 cwd/path/command、异常栈。`questions.length` 第一刀也不需要，避免为一个计数读取问题与选项正文。

### 三口径

**不改 schema 只改文案，就是在撒谎。** 当前 `liveRuns` 混合 active/idle/wait，`foldSpawned` 会删除后台身份，Claude 等源又按项目只留一条，24 条截断还发生在 host stats 之前（`packages/agent/src/run.ts:20-21` 与 `collectors/sessions.ts:328-354`）。所以 `liveRuns` 既不是“人手”，也不能反推出“后台”。

第一刀应让每个可见 session 保留 `initiator: human|agent|machine` 与 `stateConfidence: direct|derived|heuristic`（`bucket` 可由 initiator 推出，无需重复字段）；逐会话采集后再按 parent/project 在 UI 聚合。三个数的唯一口径为：`等你 N = human + direct open request`；`人手 M = human + active/idle，排除 wait`；`后台 K = agent/machine + active/idle/wait`。统计必须在 UI 的 12/24 条显示截断之前完成。因为这是 ingest/snapshot/VM 的语义合同变化，应显式版本化或提供可验证的兼容迁移；不能把订阅的 `confidence` 借给任务。专用 eink 还必须新增数字行和 WAIT 可见标记，现有 `einkMeta` 只改变刷新频率。

### 标题

收紧方向正确，但影响面比评估写的大：Claude、Kimi、GLM 共用 `firstUserText`，Codex 有 `readCodexUserTitle`，Grok 还有 `session_summary` fallback。第一刀应只留正式元数据：Claude `customTitle`、Codex `session_index.jsonl.thread_name`、Cursor `meta.title`、Grok `generated_title`，再退到 `Tool · project basename`。Codex thread name 并没有被评估漏掉，当前代码也已优先使用它（`sessions.ts:266-271`；`codex.ts:241-256`）；Claude custom title、Cursor meta title、Grok generated title 也已存在。

标题收紧后，未命名会话会出现重复项目名，这是可读性损失但不是阻塞：用工具图标/工具名 + 项目 basename 区分，宁可重复，也不要重新读取 prompt 填“聪明标题”。现有 UI 任务行已有 tool 图标与 project 列：`packages/hub/src/eink.ts:321-330`。应补跨 Claude/Codex/Kimi/GLM/Grok 的 fixture，断言已知正文/path/secret sentinel 不出现在 `title` 或 `detail`。

## 必须改的方案缺陷（P0/P1 才挡开工；P2 记录不挡）

| 严重度 | 缺陷 | canonical path 与开工条件 |
|---|---|---|
| **P0** | 现有 `liveRuns/foldSpawned` 上直接画 N/M/K 会产生假精确数字 | Claude 等源可先按项目缩成一条（`sessions.ts:181-239`），同项目 spawned 再被删（`:321-326`），最后先截 24 再算 stats（`:328-354`、`run.ts:20-21`）。开工前必须把“逐会话身份 + initiator + 截断前计数”写入 schema/验收。 |
| **P0** | “只读 tool_use 结构”没有字段白名单，存在正文/路径/secret 进入 Kindle 的 canonical path | 真实 tool input 的稳定字段就有 `command/file_path/content/questions`；Aindle `Run.title/detail` 接受任意字符串（`schema.ts:89-100`），key-only guard 不扫值（`:135-159`），monitor 会渲染 detail（`monitor.html:277-287`）。这是方案验收缺口，不是声称已有新泄漏。开工前须冻结上述 allowlist，并用值级 sentinel 覆盖 snapshot 与两套 renderer。 |
| **P1** | wait 来源承诺超出声明支持面 | YoUsage 正式路径显示 permission/Cursor direct wait 来自 hooks，Codex/Grok file scanner 无 request/confirm（`Docs/09-integrations.md:6-27,43-59,133-137`）。第一刀必须删掉 Claude permission、Codex pending approval、Cursor 全覆盖承诺，只保留 Claude Ask + Codex request_user_input。 |
| **P1** | 固定 head+tail 不能承担有序开闭合 | Aindle `readJsonlRecords` 会漏中段/跨切口行（`sessions.ts:63-92`），而 wait 需要匹配后续 result、过期和重写。开工合同须改为每 session 的有序 lookback + offset + inode/缩短恢复，并加入 open/close/half-line/rewrite/expiry fixtures。 |
| **P1** | “WAIT 徽章会自动出现”与专用 eink 合同不符 | `merge.ts` 产 WAIT，但 `eink.ts:321-330` 不渲染 tag；现有 eink 测试只断页面/尺寸/刷新，不断 WAIT 文案：`packages/hub/test/eink.test.ts:42-87`。验收必须同时覆盖 desktop monitor 与专用 eink。 |
| **P2** | 对齐稿中页提前画了“可能可查看 · 估算” | 对齐稿 `demo/yousage-align.html:195-205` 已画；正文 `docs/plan/...:109-112` 明列第二刀。保持 mock 标识，并从第一刀验收图中移除/标第二刀。 |
| **P2** | 标题 fallback 的可读性与覆盖范围写得不全 | 补 Kimi/GLM、Codex prompt fallback、Grok session_summary；无安全标题时统一 `Tool · project`。不因难看恢复正文。 |
| **P2** | BSL 描述过度绝对、B 项计数不一致 | License 允许 copy/modify/derivative/redistribute 的非生产使用，但副本/衍生物继续受 BSL；B 计数也需统一。两者不挡语义重写的第一刀。 |

## 评估已经正确、不要推翻的结论

- **不做精力第四页、不读 S0、不搬 HU/EP/体征/复核清单。** YoUsage 的核心是人的精力计量（`Docs/01-product-vision.md:5-12`），Aindle 的核心是只读额度与任务副屏（`Aindle/docs/01-problem-and-scope.md:5-22`），两者应相邻而不融合。
- **不把未交付工作轨迹当已交付能力。** proposal 明写不可直接生产，readback 明写 C8/R3/Phase A 未完成；当前相关文件又不在 YoUsage HEAD。这一裁决事实站得住。
- **不装 YoUsage hooks、不接 `/api/state`、不直接读 `~/.yousage`。** owner 已否决精力页后，剩余第一刀只需读取 Aindle registry 已登记的宿主工具日志；明确加一条验收“依赖图、文件读取和网络请求均不出现 YoUsage runtime”即可消除残留耦合。
- **Cursor/Grok/Kimi/GLM 没有 direct wait 时宁可空白。** 这不是永久否决，而是当前无 hooks、无稳定 fixture 的诚实边界；Aindle 原文也要求 Cursor 当前任务扫不到就留空（`docs/06-data-sources.md:77-98`）。
- **`tokensToday`、Cursor 聚合 API、cache 口径留到第二刀。** 它们回答消耗账目，不是让 WAIT 变真的必要条件。
- **标题不再取 prompt 首句。** 这是 Aindle 自己已经存在的隐私债，不是从 YoUsage 引入的新需求。
- **WAIT 与“可能可查看”不得混写。** direct request 才能写“等你”；turn complete 只能是估算 review。这个语义边界值得保留，但后者不进本刀。
- **显式 registry、只读 Kindle、上一帧/新鲜度、quota last-good 继续沿用 Aindle 自己的实现。** 不要把 TokenTracker/OctoMonitor 的建议能力或 Aindle 文档中的候选架构冒充已落地代码；本报告的现状结论均以上述产品文件为准。

License 裁决需收窄为：YoUsage `LICENSE:10-28` 允许个人/组织内部生产使用，但排除员工监控/绩效服务及向第三方提供托管、管理服务或商业产品；`:35-37` 明确 BSL 不是 Open Source；`:46-49` 允许 copy/modify/derivative/redistribute 和非生产使用；`:62-70` 要求副本、修改和衍生物继续受 BSL；每个版本四年后转 Apache 2.0。于是，“借公开语义、在 Aindle 独立重写，不复制源码”是正确且稳妥的工程选择；“BSL 一概禁止再分发、法律上只能重写”则不是许可证原文。若 Aindle 要以不同开源许可或商业产品分发，不能直接搬当前 BSL 源码。

## 漏项与重复建设

**未发现登记表之外、比三口径/隐私更值得插入第一刀的 YoUsage 能力。** 但登记表内有一个被低估的项：**Y13 应从 C 改成 B（扫描语义）**。不是搬 YoUsage scanner，而是把“逐会话有序 offset、半行续读、inode/缩短恢复、启动仅回看 wait TTL”写成 Aindle 自己的最小采集合同；否则 Y04 无法可靠成立。

原评估当成缺口、但 Aindle 已有更好答案的部分包括：Y15 显式 registry（Aindle 已默认不自动发现）、Y39 host freshness/上一帧、Y43 quota last-good、三页 eink 与自己的多机 snapshot。它们应复用，不另建 YoUsage runtime。Y18 则不能简单称“已重复”：Aindle 的 Kimi collector 与 YoUsage 原生 `wire.jsonl` 不是同一能力；只是原生 wire 超出本刀，所以仍不做。

对齐稿本身清楚标了 mock（`demo/yousage-align.html:112-122`），这一点正确；但中页已画“可能可查看”并展示 3 Claude Task + 1 Codex 子线程（`:195-205`），比正文第一刀多承诺了 review 分层和当前采集拿不到的后台 cardinality。它只能保留为方向图，不能作为“按原样实现”的验收基准。

本轮门禁：**未跑**。这是方案事实交叉评审，没有实施候选；只读取了 Aindle 的 `codex-sessions/schema/eink` 等测试源码，未把其断言当成本会话测试通过证据。

### Owner 三选一

**选择 2：按改写后的第一刀开工。** 精确改动限定为以下 5 条：

1. wait 覆盖收窄为 Claude `AskUserQuestion` 与 Codex `request_user_input` 的结构化开闭合；不承诺 permission，不承诺 Cursor/Grok/Kimi/GLM。
2. wait 采集改为逐 session 的 60 分钟有序 lookback + byte offset 增量 + inode/缩短恢复；按 id/call_id 闭合，后续 human/60 分钟只作保守清理。
3. 升级 ingest/snapshot/VM 合同，保留逐会话 `initiator` 与 `stateConfidence`；统计在折叠和 12/24 条 UI 截断前计算，再画“等你 N · 人手 M · 后台 K”。
4. 冻结结构字段 allowlist，彻底丢弃 input/arguments/text/output/原路径；用已知正文、路径、secret sentinel 验证 snapshot、desktop monitor、专用 eink 都不泄漏。
5. 删除 Claude/Kimi/GLM first-user、Codex user-message、Grok session-summary 标题 fallback；保留正式 title/thread metadata 与 `Tool · project`，并让专用 eink 真正显示 WAIT。
