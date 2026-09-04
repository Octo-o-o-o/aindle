# Aindle 第一刀实施 Prompt

你在 Aindle 仓库的既有 Codex 会话中继续工作。先把当前 turn 当成新的实施授权；不要依赖此前聊天记忆，以下列仓库文件为唯一事实源：

- `docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md`：最终可实施方案与验收合同。
- `docs/review/2026-09-04-yousage-borrowing-cross-review.sol.md`：零上下文交叉评审证据。
- `docs/01-problem-and-scope.md`、`docs/06-data-sources.md`、`docs/07-architecture.md`、`docs/12-testing.md`：Aindle 产品与安全边界。

## Workflow V2 contract（原样保留，不得被后文放宽）

```workflow-v2
{"policy_version":2,"policy_revision":"2.4.2","reviewers_per_candidate":1,"max_repair_rounds":3,"max_rereview_rounds":3,"max_semantic_children_per_parent":1,"second_red_action":"progress_gated_continue","full_gate_policy":"once_on_final_candidate_then_only_after_relevant_change","recursive_review_allowed":false,"p2_default_action":"record_and_defer_to_final_sweep","p2_immediate_fix_requires_owner":true,"max_final_p2_sweeps":1,"max_same_root_cause_repairs":2,"max_strategy_resets":1,"task_mode":"supervised_delivery","first_red_action":"auto_repair_once","rereview_context":"fresh_zero_context","full_gate_timing":"after_semantic_review_green","post_green_continue":"preaccepted_next_stage_only","reviewer_write_scope":"review_artifacts_only","review_manifest_validator_required":true}
```

## 目标

按方案完整交付“改写后的第一刀”，不是重新做产品设计：

1. `wait` 只接 Claude `AskUserQuestion` 与 Codex `request_user_input` 的未闭合结构事件。
2. 升级 v2 Run 合同，保留 `initiator`、发起者置信、状态置信与固定 `waitReason`。
3. 在完整会话集上计算“等你 N · 人手 M · 后台 K”，再截断/折叠列表；desktop 与专用 e-ink 都实际显示。
4. 删除 prompt/summary 标题回退，按方案使用正式 metadata 与 `Tool · projectLeaf`。
5. 完成方案 A1–A6 的测试、文档同步和门禁。

## 开工前核验

先执行并记录真实输出：

```bash
git status --short --branch
git log -1 --oneline
python3 ~/.octoworkflow/candidate_fingerprint.py
python3 ~/.octoworkflow/validate_handoff.py docs/plan/2026-09-04-yousage-borrowing-IMPL-PROMPT.md
```

若工作树已有改动，先辨认并保留；当前仓库在首次发布前已经存在 `packages/agent/src/collectors/user-ask.ts` 及相关 startedAt 测试，它们不是本批要删除的代码。不要覆盖用户改动，不要把已有改动冒充本批产出。

## 不可突破的边界

- 不读或保存 prompt/reply 正文来判 `wait`；不得检查 `tool_use.input`、function `arguments`、result/output 文本。只用方案 §5.2 的结构白名单。
- 不把 Claude permission、Codex approval、Cursor/Grok/Kimi/GLM 写成已支持 wait；信号不足就走年龄态。
- 不接 YoUsage `/api/state`，不读 `~/.yousage`，不复制 YoUsage BSL 源码，不安装 hooks。
- 不做 HU%、工作轨迹、复核清单、`tokensToday`、第四页、“可能可查看”或动作面。
- 不改 `config/registry.yaml`、YoUsage、`demo/oasis-monitor.html`、`demo/yousage-align.html`、`kindle/oasis1/` 与额度采集逻辑。
- snapshot/VM/HTML 不得出现 prompt、reply、input、arguments、output、命令、原始路径或测试哨兵。
- 不用 `git add -A`；不 commit、push、merge、部署，候选完成后交回 supervisor。

## 实施方法

先完整读方案和交叉评审，再自行检查当前代码坐标。把方案五个工作包作为一个候选实现；允许按依赖顺序施工，但不要扩大产品范围。特别注意：

- `wait` 必须是 60 分钟有序状态机，按 id/call_id 配对；现行 16KB/32KB head+tail 不能作为它的输入。
- 计数必须发生在 `foldSpawned`/ViewModel 列表截断之前；stale 主机不能贡献当前全局数字。
- `state=wait` 只允许 `direct + needs_input`；年龄启发式不能制造 wait。
- v1→v2 失败必须显式，不得把缺字段默认为 0 或 human。
- e-ink `runRow` 要真正画 WAIT；不能只改 mock 或文案。

## 验收与门禁

逐条实现并对账方案 A1–A6。迭代期只跑受影响 focused gates：

```bash
npm run build
node --import tsx --test packages/agent/test/*.test.ts
node --import tsx --test packages/core/test/*.test.ts
node --import tsx --test packages/hub/test/*.test.ts
git diff --check
```

候选完成后停止实施并汇报：精确 changed paths、每条验收的 file:line、真实命令与 exit code、未跑项、偏离和 blocker。不要自评 GREEN、不要派 reviewer。由 supervisor 启动一名全新零上下文 reviewer；首次可复现且范围内的 P0/P1 按 Workflow V2 自动返工，P2 只进本任务唯一 ledger。语义 GREEN 后由 supervisor 跑一次完整门禁：

```bash
npm run check
bash scripts/check-release.sh
```

若为了通过验收必须读取正文、装 hooks、改未授权目录、猜未知格式或扩大支持工具，立即停下并给出 canonical path 与最小缺口，不要绕过。
