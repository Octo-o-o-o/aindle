# Codex 交叉评审 Prompt（只读）

把下面「正文」整段贴进 Codex。工作目录建议开在 Aindle 仓库根目录，并确保能读到本机 YoUsage 仓库。不要实施、不要改产品代码。

---

## 正文（从这里复制）

你是独立交叉评审，不是方案作者，也不是实施者。本轮只读，禁止改 Aindle / YoUsage 产品代码，禁止 commit / push / 装依赖以外的写操作。报告可以写到 Aindle 的 `docs/review/`，不要动 `packages/`、`kindle/`、`config/`、`demo/oasis-monitor.html`。

### 背景

另一会话评估了「YoUsage 有什么值得推到 Keno」。Owner 已锁定：

1. **Keno = Aindle**（Kindle 书桌副屏，本仓库）
2. **不要**单独一页只读 YoUsage 精力一瞥，不读 S0，不加第四页
3. **允许**读转录里的 `tool_use` **结构**来判定 `wait`（不含 prompt/reply 正文，不装 hooks）
4. 标题源收紧（不用 user 正文首句）随第一刀接受

被审方案（唯一 SoT，不要凭聊天记忆补）：

- `docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md`
- 对齐稿（mock，不是证据）：`demo/yousage-align.html`

对方产品：本机 YoUsage 仓库（评估时 HEAD 记为 `ff31f2c`，你必须自己 `git log -1` 核对，变了就写明）。

Aindle 当时 `git rev-parse` 报不是 git 仓库。你也要自己核一次，不要沿用这句话。

### 你要回答的唯一问题

这份评估的事实是否站得住，第一刀是否值得按原样做。
不是「润色文案」，也不是「再设计一个更大的产品」。

### 证据纪律

- 方案里每一条「Aindle 已有 / 没有 / wait 从未产出 / 标题来自 firstUserText / tokensToday 恒为 —」都必须用你本会话读到的 `file:line` 证实或证伪。作者自述不算证据。
- YoUsage 能力描述同样必须回到对方代码或正式 Docs（01–16）。提案 / Demo / 未进生产的实验不能当成已交付能力。
- 不要编造 commit hash、测试结果、命令输出。没跑的门禁就写「未跑」。
- License 要读 YoUsage `LICENSE` 原文，不猜。
- **Review 价值边界**：把一条评估裁决打成错误 / 第一刀不可行之前，必须给出 canonical path：当前产品代码或声明支持的输入格式上，真实会发生什么。不要用「万一有一种怪 JSON」吓退；那种记 P2。
- 不要把 TokenTracker / OctoMonitor 的能力误记成 Aindle 已实现，也不要把 Aindle 文档里的建议架构当成已落地。

### 必读（先读方案，再两边取证，不要先下结论）

**方案**

1. 评估全文
2. 对齐稿 HTML（只看它主张的信息架构，不当证据）

**Aindle 最少读这些，可按线索再扩：**

- `docs/01-problem-and-scope.md`
- `docs/06-data-sources.md`
- `docs/07-architecture.md`
- `docs/08-feasibility-and-recommendation.md`
- `packages/core/src/schema.ts`
- `packages/core/src/merge.ts`
- `packages/core/src/mock.ts`
- `packages/agent/src/collectors/sessions.ts`
- `packages/agent/src/collectors/index.ts`
- `packages/agent/src/collectors/claude.ts`
- `packages/agent/src/collectors/codex.ts`
- `packages/agent/src/collectors/cursor.ts`
- `packages/hub/src/eink.ts`
- `packages/hub/public/monitor.html`（任务/主机条怎么画）
- 相关单测（至少 sessions / schema / eink）

**YoUsage 最少读这些，可按线索再扩：**

- `Docs/01-product-vision.md`
- `Docs/04-behavioral-signals.md`
- `Docs/05-ux-spec.md`（L0/L1 与「等你 / 待验收」两级置信）
- `Docs/08-privacy-security.md` §2
- `Docs/09-integrations.md`（confirm 合成、initiator、转录口径）
- `src/core/sessions.ts`
- `src/collect/transcript.ts`（或实际扫描器）
- `LICENSE`
- `Docs/proposals/2026-08-30-work-trajectory-and-return-cues.md` 只作「未进生产」对照
- `Docs/review/2026-09-04-work-trajectory-impl-readback.fable.md` 核对其「未完整实施」是否仍真

### 交叉审查清单（逐条给 确认 / 证伪 / 部分成立 + 证据）

**A. 承重现状（防把已做当没做，也防把没做写成已有）**

1. `RunState` 是否真有 `wait`？UI / eink 是否真会画 WAIT？
2. 活采集 `stateFromAge` 是否真的永不返回 `wait`？`waitRuns` 是否因此恒 0？mock 是否造成「已经能 wait」的错觉？
3. `foldSpawned` 现在到底折叠了什么、漏了什么？折叠后 `spawned` 是否被丢掉？`liveRuns` 是否仍可能含后台？
4. Claude 标题是否真的会用 `firstUserText`？Codex / Grok / Cursor 呢？
5. `tokensToday` 活路径是否真写死 `'—'`？eink / monitor 现在看不看得到这个字段？
6. Aindle 读 jsonl 是全文件还是 head+tail？**这对「用 tool_use 判 wait」是否致命？** 未闭合请求若只出现在文件中段，现行 16KB/32KB 窗口看不看得到？
7. Codex pending approval / rate limit 事件在现行 `codex.ts` / rollout 读取里是否已经扫到，只是没映射成 `wait`？

**B. 评估登记表**

- 抽查全部 **B 项** 和你认为可疑的 **C 项**（至少 Y01、Y04、Y05、Y08、Y09、Y12、Y14、Y19、Y24、Y41、Y42）。
- 每条：对方是否真有该能力、Aindle 现状描述是否对、A/B/C 是否判错。
- 重点打：「把 YoUsage 未交付的工作轨迹当成可借实现」「把精力引擎判 C 是否过猛或不够狠」「hooks 判 C 是否让 wait 在 Cursor 上永久空白」。

**C. 第一刀可行性（这是本轮主战场）**

评估第一刀是：

1. 用转录 `tool_use` 结构（不含正文）把 `wait` 接活
2. 上屏「等你 N · 人手 M · 后台 K」
3. 标题不再用 prompt 首句

请独立回答：

- **wait 的最小可靠定义是什么？** Claude 哪些 tool 名算「等人」？permission 和 AskUserQuestion 在转录里长什么样？怎样算闭合（后续 tool_result / user 消息 / 过期）？只看最后一条 tool_use 够不够？
- **「不含正文」做得到吗？** `tool_use.input` 经常带着问题文本、路径、命令。评估有没有把「不读 message.text」和「不读 tool_use.input」混为一谈？你建议的字段白名单是什么？
- **Cursor / Grok / Kimi / GLM 第一刀有没有 wait 信号？** 没有是否应诚实写成「仅 Claude+Codex」，而不是暗示全工具？
- **三口径会不会和现有 `liveRuns` / `now` 列表合同打架？** 要不要改 snapshot schema（initiator/bucket/confidence）？不改 schema 只改文案是否在撒谎？
- **标题收紧之后，屏上是否会变成一排无意义的项目名？** 评估有没有低估可读性损失？有没有已有、且不含 prompt 的更好标题源（例如 Codex thread name 文件）被漏写？
- **第一刀会不会破坏只读副屏 / 快照禁 secret / 不自动扫描未注册目录？**
- **对齐稿中页**有没有比评估正文更激进的承诺（例如已经在画「可能可查看」分层，而正文把它放在第二刀）？

**D. 红线与产品边界**

- BSL 1.1 对「借设计、重写语义」的判断是否正确？
- 「不要接 YoUsage `/api/state`」在 owner 已否决精力页之后，是否还有残留耦合风险（例如本机直接读 `~/.yousage`）？
- 有没有评估漏掉的、其实更值得推到 Aindle 的 YoUsage 能力？必须给编号、证据、以及为什么原评估漏了。没有就明确写「未发现漏项」。
- 有没有评估当成缺口、其实 Aindle 已经更好的项（重复建设）？

### 输出

写到：

`docs/review/2026-09-04-yousage-borrowing-cross-review.sol.md`

结构必须包含：

```markdown
# YoUsage → Aindle 借鉴评估交叉评审
> 评审对象 / 你读到的 YoUsage HEAD / Aindle 是否 git 仓库 / 只读
## TL;DR（总裁决：按原样做 / 改范围再做 / 不要做 + 一句话）
## 对评估主张的逐条裁决（主张 | 确认/证伪/部分成立 | file:line | 含义）
## 第一刀交叉结论（wait / 三口径 / 标题 各一段）
## 必须改的方案缺陷（P0/P1 才挡开工；P2 记录不挡）
## 评估已经正确、不要推翻的结论
## 漏项与重复建设
```

严重度：

- **P0**：按原方案做会让屏上数字说谎，或把 prompt/路径/secret 送上 Kindle
- **P1**：第一刀在声明支持的工具上走不通，或和现有 snapshot/UI 合同冲突
- **P2**：口径更干净、测试更稳、文案更好，但不挡开工

最后给 owner 三选一，不要左右都对：

1. 按原评估第一刀开工
2. 按你改写后的第一刀开工（列出精确改动，不超过 5 条）
3. 先补方案再谈实施

不要实施。不要生成 IMPL-PROMPT。不要把对齐稿改成产品页。
