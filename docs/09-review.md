# 调研文档复核

复核时间：2026-09-03。复核对象：本仓库 `docs/01`–`08` 与 `demo/`。
角色：同一作者的第二遍证伪，不是零上下文外部 reviewer。结论若要当实施合同，仍建议再开一次只读审查。

## 总评

文档没有把「参考仓库能做什么」写成「Aindle 已经能做什么」。三份参考的能力边界、本机目录实证、以及「限额按订阅去重 / 任务按机器并列」写清楚了。主要残缺是 **设备未见面** 和 **未打过任何官方限额 API**。这两点在 `README` / `08` 里有写，没有藏。

**没有发现足以推翻「可行」的硬矛盾。** 发现若干需要收紧的表述和一处必须由 owner 决定才能继续的缺口。

## 已坐实（本会话有证据）

| 说法 | 证据 |
|---|---|
| Aindle 原是空目录 | 开工前 glob 为 0 文件 |
| 用户给的 kindle 路径少打了 `d` | `~/WorkSpace/Reference/kindle-dashboard` 存在 |
| kindle-dashboard 是 Paperwhite 1072×1448、Claude+Codex、Windows 优先、无任务 | 其 README、`constants.ts`、`collectors/index.js`、`dashboard.html` |
| TokenTracker 本地 API 绑 127.0.0.1；跨机是云；无限额/会话上传 | `serve.js`、`cloud-account.js`、`PRIVACY.md` |
| TokenTracker 本机已装且云同步开着 | `which tokentracker`；`cloud-sync-pref.json` 的 `enabled: true` |
| OctoMonitor maintenance-only、无 Grok、远程 viewer 单机对多屏、`recentCompletions` 生产为空 | 其 README；全库 Grok 零命中（explore 报告）；`probe.rs` empty completions |
| 本机四工具家目录都在 | `ls` 存在性 |
| 本机有多份 Claude/Codex 目录 | 目录名列表；仅 `~/.claude` 见到 `.credentials.json` |
| Grok sessions 很多、active 列表空 | 目录计数；`active_sessions.json` 类型为 list、长度 0 |
| OctoMonitor 本机不像开过 remote | `~/.octomonitor` 无 `config.json` |

## 推断（写进文档但未在本机验证）

| 说法 | 风险 | 文档是否标明 |
|---|---|---|
| 你的 Oasis 更可能是 2/3，Demo 用 1264×1680 | 若是 Oasis 1 则整板比例错 | 是，`01`/`02`/`08` 都要求确认 |
| `~/.claude-glm` 等是中转、不应画 5h 条 | 命名推断，可能误判 | 是，写成「猜测」 |
| 其它 Claude 目录凭证在 Keychain | 符合社区对 `CLAUDE_CONFIG_DIR` 的描述；未跑 `security` | 是 |
| jefftko 的 Oasis 3 + 5.18.2 实物 | 来自其 README，不是你的机器 | 是 |
| Cursor `usage-summary` 字段形状 | 社区 / ai-usagebar，本会话未请求该 API | 是 |
| 30 分钟一刷电池 2–4 周 | 社区文章，不是 Oasis 实测 | 是 |
| Mac mini 常开 | 你点名有这台机器，未探测 | 是 |
| 启发式「60s = active」够用 | 抄 OctoMonitor；远程 SSH / GUI 会偏 | 是 |

## 文档间曾经或仍然需要小心的表述

1. **TokenTracker「100% local」vs 本机云同步已开。** `04` 已拆穿营销口径。`08` 用这件事说明「你能接受某种出网」，不是建议 Aindle 走同一条云。保留。
2. **Cursor 用量 N/A vs TokenTracker 能画 Cursor 条。** 两者都对：源不一样。`05` 与 `06` 已拆 IDE cookie vs CLI store。Demo 必须继续画「账单周期」而不是假 5h。
3. **kindle-dashboard 与 jefftko 同名。** `03` 末节已分开。口头上请说「alexishida」和「jefftko」，避免实施时拉错仓库。
4. **`preventScreenSaver` vs 合盖可睡。** `02`/`07` 选择 jefftko 策略。若你要插电常亮，应写成明确 override，而不是默默改回 alexishida。
5. **`07` 曾有一处 ASCII 图损坏**，复核时已改成两行纯文本。若再看到替换字符，以现在版本为准。

## 过强或应降级的句子

| 原文倾向 | 应读成 |
|---|---|
| 「限额接口三方一致」 | Claude `oauth/usage` 的主字段三方一致；Codex 有 app-server 与 wham 两条通道，只是窗口语义接近 |
| 「Grok 1854 sessions」 | 是目录数上限扫描，不是 1854 个活跃任务 |
| 「可行」 | 工程可行 + 产品值得做；不是本周能买到安装包 |
| Demo 很像真屏 | 只验证版式。未验证 FBInk、未验证中文在 Kindle 字体里的缺字 |

## 证伪清单（我试着把「可行」打穿）

1. **「多订阅做不到」？** 否。`CLAUDE_CONFIG_DIR` / `CODEX_HOME` 是现成隔离。难的是登记和去重，不是物理不可读。
2. **「Cursor 完全没用量」？** 否。OctoMonitor 那条路没用量；TokenTracker 那条路有账号级用量。Aindle 应走后者做条，前者最多辅助任务。
3. **「没有官方任务 API 所以不能做 Monitor」？** 否。OctoMonitor 已经用文件启发式做了可用户用的 Monitor。要接受误报，不要接受空白到不能看。
4. **「Kindle 浏览器其实够用」？** 未测，但 OctoMonitor 远程面是完整 React，和 e-ink 原则冲突。即使能打开，也不应当主方案。这条仍是判断，不是实验。
5. **「直接用 TokenTracker 云 + 截图」？** 否。云不含 sessions/limits；且你要的是正在跑的任务。`04` 写死了。
6. **本机其实没有多订阅？** 否。目录名已经否定「单账号假设」。

## Demo 复核

对照 `02` 的版式约束检查 `demo/oasis-monitor.html`（写完后按文件实读，不是凭记忆）：

必须满足：

- 默认画板 CSS 尺寸 1072×1448（Oasis 1 竖）或 1448×1072（横）；Oasis 3 仅为对照档
- 无彩色状态灯当唯一编码（可用实心/空心/纹理）
- 无持续动画
- 明确写 MOCK / DEMO
- 同时出现：三机心跳、多订阅条、正在做、短时完成
- Cursor 条的窗口名不是「5h」
- 不出现真实 token / IP / 家目录绝对路径

若不满足，记为 P0 并当场改，不把 Demo 当已验收。

## 对实施会话的约束（复核后冻结）

1. 未收到 `08` 里五项 owner 决定，不开始 Stage 1 以外的「接真机 / 扫全目录 / 装 Kindle」。
2. 允许的 Stage 0.5：把 Demo 继续改版式、补 snapshot schema 的 TypeScript 类型，仍用 mock。
3. 禁止：读取并粘贴任何 credentials；把 TokenTracker InsForge 当 backend；改 OctoMonitor 主线。
4. 完整门禁要等真正实施合同写出来再定。本轮没有 `scripts/check.sh`，这不是 OctoWorkFlow 缺门禁——本项目还没有产品合同。

## 复核结论

调研可以当方案讨论的 SoT。
**可行性结论成立：做独立的 hub-and-spoke 墨水副屏。**
Demo 只证明「这块屏的信息架构说得通」，不证明采集或真机。
