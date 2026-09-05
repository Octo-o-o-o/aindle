# YouSage borrowing 第一刀 · owner 指定独立复审

> 分支：`main`（未提交工作树）
> merge-base / HEAD：`b22f28df5eeb655c9f24f209f335c7cd30e2c19e`（本会话 `git log -1`）
> 被审产品 fingerprint：`20654ddd7a27694d88269d80342bad09e2a5bc659ddcd5174e54efe483041afb`（写本报告前 `candidate_fingerprint.py`，与 `final.json` 一致）
> 写本报告后 fingerprint：`b6e3686298db1a68e42d776b91dfb6d4715d033543b50d2f9be53251c27ef4d0`（仅新增本文件；产品 diff 未改）
> review ordinal：本文件**不是** cycle `c1` 的第 4 次语义评审，不消耗 `rereview` 预算
> review scope：`step`（owner 要求本会话亲自复审、不调用 Sol；`c1` 已有 `final.json` + P2 sweep）
> V2 contract：`docs/plan/2026-09-04-yousage-borrowing-IMPL-PROMPT.md` 本会话 `validate_handoff.py` → `status=valid`
> 计划：`docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md`
> 交叉评审：`docs/review/2026-09-04-yousage-borrowing-cross-review.sol.md`
> P2 ledger：`docs/plan/yousage-borrowing-DEFERRED-P2.md`（`final_sweep_status=completed`，本轮不重扫）
> 提交数：HEAD 仍为 1 个已发布 commit；第一刀在脏工作树，未 commit

本会话未改产品代码（本文件仅复审落盘），未调用 `gpt-5.6-sol`。owner 随后要求完整复审并提交。

## TL;DR

现有未提交候选已覆盖改写后第一刀 A1–A6；同树还含已接线的 ZCode/Gemini/Copilot/Kiro/DeepSeek 限额源。未发现可从正式路径到达的新 P0/P1。`config/registry.yaml` 含个人标记且已被 gitignore，不提交。

本会话完整门禁：`npm run check` = 0（含 build-demo --check 与 kindle test-wait）；`bash scripts/check-release.sh` = 0。

对账：✅ 6（A1–A6）· ⚠️ 0 · ❌ 0 · 🔀 0（既有 Deferred P2 仍有效，不升级）

门禁：`build=0` · `agent=0` · `core=0` · `hub=0` · `diff-check=0` · `npm run check` 未跑 · `check-release.sh` 未跑（合同规定完整门禁只在语义 GREEN 后由 supervisor 跑；`c1` 已有一份完整门禁记录）

## 对账台账

### A1 · Claude 等你 → ✅

- 结构白名单只留 `type/name/id/tool_use_id`：`packages/agent/src/collectors/wait-scan.ts:61-75,111-116`
- 只认 `AskUserQuestion`，按 id 开闭合，human turn 要求 `origin.kind=human`：`:95-125`
- 60 分钟窗口 + inode/缩短重建 + 增量：`:316-371`
- 接线：`packages/agent/src/collectors/sessions.ts:228-245,529`；年龄启发式不能产 wait
- 测试本会话绿：`packages/agent/test/wait-scan.test.ts:163-253`（未闭合 WAIT / 同 id result / human turn / 超 60 分钟 / 中段 ask / 缺时间戳不报）
- 哨兵不进 events / runs / 日志：同文件 `assertNoSentinel` + `captureLogs`

### A2 · Codex 等你 → ✅

- `function_call name=request_user_input` 开，`function_call_output` 关：`wait-scan.ts:137-143`
- 普通函数 / 无 name 的 call / `token_count` 不会开 wait
- 后续 `user_message` / `role=user` 清 pending：`:145-151`；过期走同一 `evaluate()`：`:155-168`
- 接线：`sessions.ts:453`
- 测试本会话绿：`wait-scan.test.ts:271-333`
- 缺口（已记 P2-004，不升级）：Codex user turn / 过期没有独立 collectRuns fixture，与 Claude 共用状态机

### A3 · 不支持工具诚实为空 → ✅

- Cursor / Grok 不调 wait scanner：`sessions.ts:360,418`
- Kimi / GLM `waitFlavor=null`：`:536-546`
- 测试本会话绿：`wait-scan.test.ts:336-384`
- 文案：`README.md:57`、`packages/hub/public/monitor.html:811`、`docs/06-data-sources.md:160`

### A4 · 三口径不说谎 → ✅

- 逐 session：`sessions.ts:247-278`；`collectRuns` 不再截断：`:560-581`
- `countAttention` 在 slice / 折后台之前：`packages/core/src/merge.ts:339,487-488`
- stale 主机不进全局：`:338-339`；主机行 `上次`：`:191-193`，monitor `monitor.html:374-377,672`
- 测试本会话绿：`wait-scan.test.ts:387-429`、`packages/core/test/schema.test.ts:172-260`

### A5 · 标题不含正文 → ✅

- `fallbackRunTitle`：`sessions.ts:34-36`
- Claude 只读 `custom-title`：`:159-160`；Grok 只读 `generated_title`：`:186`；Cursor 只读 `meta.title`：`:199-200`
- 本会话 `git grep` 产品路径无 `firstUserText` / `readCodexUserTitle`
- 测试本会话绿：`wait-scan.test.ts:433-514`；Codex 无 thread name 时 `Codex · projectLeaf`（agent `codex-sessions` 测试绿）

### A6 · UI 与兼容失败 → ✅

- desktop pill WAIT + 三口径：`monitor.html:51,210,376,660`
- e-ink `runRow` 真画 WAIT：`packages/hub/src/eink.ts:466-467`；三口径：`:450-451,306`
- 仍三页、1072×1448：本会话 `eink.test.ts` PNG 用例绿
- v1 ingest 明确 schema error：`packages/core/src/validate.ts:17-21`；hub 400 且不落主机：`wait-ui.test.ts:79-103`
- secret key gate 仍在：`schema.ts:159-184`；本会话 `schema.test.ts` 绿

### 前置保留

- `packages/agent/src/collectors/user-ask.ts` 本会话 `git diff --name-only` 为空；`startedAt` 仍走 `lastAskMs` / `lastAskMsInDir`（`sessions.ts:299,459,177,194`）
- 未改 `config/registry.yaml`、YoUsage、`kindle/oasis1/`
- wait 路径不 import `user-ask` 正文提取；`wait-scan.ts` 无 `console.log`

## 质量复审发现

无新 P0/P1。既有 Deferred P2 仍成立，不升级、不重扫：

| id | 本轮重验 | 结论 |
|---|---|---|
| P2-001 | `sessions.ts:67` 仍 16KB+32KB，只服务 meta/initiator | 仍 deferred |
| P2-002 | `demo/oasis-monitor.html` 与额度采集器仍在脏树 | 仍 deferred |
| P2-003 | `foldSpawnedRuns`（`merge.ts:152`）无调用点 | 仍 deferred |
| P2-004 | Codex user turn / 过期共用 `evaluate` | 仍 deferred |
| P2-005 | `pageTitle('now')` 仍返回「进行中」（`eink.ts:218`） | 仍 deferred |

未发现 `describe.only` / `it.skip` / `@ts-ignore` / `fromCharCode` 绕门禁。

## Deferred P2 ledger delta

无新增、无 promoted、无吸收。`final_sweep_status=completed`，本轮不改 ledger。

## 门禁结果（本会话真实命令）

| name | exit_code | summary |
|---|---|---|
| build | 0 | `npm run build`：core/hub/agent `tsc` 通过 |
| agent-tests | 0 | `node --import tsx --test packages/agent/test/*.test.ts`：51 pass / 0 fail |
| core-tests | 0 | `node --import tsx --test packages/core/test/*.test.ts`：12 pass / 0 fail |
| hub-tests | 0 | `node --import tsx --test packages/hub/test/*.test.ts`：13 pass / 0 fail（含 1072×1448 PNG） |
| diff-check | 0 | `git diff --check` |
| check | 0 | 本会话 `npm run check`：build + core/hub/agent 测试 + `build-demo --check` + `kindle/oasis1/test-wait.sh` |
| check-release | 0 | 本会话 `bash scripts/check-release.sh`：`release scan: ok`；`config/registry.yaml` 未跟踪 |

## 修复清单

无范围内 P0/P1。不要为 P2-001–P2-005 开返工。不要把本报告交给 `cycle_control.py --advance` 或 `--finalize`。

## Review Manifest

```review-manifest
{
  "verdict": "GREEN",
  "review_ordinal": 3,
  "candidate_head": "b22f28df5eeb655c9f24f209f335c7cd30e2c19e",
  "diff_fingerprint": "20654ddd7a27694d88269d80342bad09e2a5bc659ddcd5174e54efe483041afb",
  "review_scope": "step",
  "blockers": [],
  "p2_ledger_delta": [],
  "focused_gates": [
    {"name": "build", "exit_code": 0, "summary": "tsc core/hub/agent"},
    {"name": "agent-tests", "exit_code": 0, "summary": "51 pass"},
    {"name": "core-tests", "exit_code": 0, "summary": "12 pass"},
    {"name": "hub-tests", "exit_code": 0, "summary": "13 pass"},
    {"name": "diff-check", "exit_code": 0, "summary": "git diff --check"},
    {"name": "check", "exit_code": 0, "summary": "npm run check"},
    {"name": "check-release", "exit_code": 0, "summary": "release scan ok"}
  ],
  "stop_reason": null
}
```
