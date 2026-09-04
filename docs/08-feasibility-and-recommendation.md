# 可行性与建议

## 结论

**可行。** 推荐做，而且值得做成独立项目，而不是再包一层 TokenTracker / OctoMonitor / kindle-dashboard。

可行的依据是三块已经分别被验证过，只是还没装在同一个盒子里：

1. **设备契约已有人跑通**：越狱 Kindle 拉 PNG（或本地 FBInk 画字）当副屏，是现成做法。Oasis 3 的 1264×1680 有实物项目。
2. **限额与用量已有人读通**：本机已经在跑 TokenTracker；Claude / Codex / Cursor / Grok 的本地文件和限额通道都有可参考实现。
3. **「正在做 / 刚做完」已有人建模**：OctoMonitor 的 `RunRecord` + 启发式 + `monitorPeriod` 正是这个语义。

不可行的是另一种理解：**把现成 Dashboard 的 URL 丢给 Kindle 浏览器，或把三台机器的 TokenTracker 云视图投影过去。** 那条路缺任务、缺多订阅、缺 Oasis 分辨率、缺电池/屏保，并且会把未脱敏数据暴露在 LAN。

## 按需求打分

| 需求 | 难度 | 判断 |
|---|---|---|
| Oasis 上稳定显示一块只读板 | 中 | 设备未知代数/固件，但路径清楚。先 Demo，再对实物改设备档 |
| 单机四工具用量 + 限额 | 中 | 本机四件套都在；Cursor/Grok/Codex 限额接口未文档化，要 last-good |
| 正在进行 + 1h 内完成的任务 | 中 | Claude/Codex/Grok 可启发式；Cursor 任务可能长期偏弱，必须允许空白 |
| 多订阅分行 | 中高 | **本机已经有一堆 Claude/Codex 目录**；必须显式注册表，不能自动全扫 |
| 三机汇一屏 | 中高 | 工程问题不是采集，是常开 hub + 限额去重 + Windows agent |
| 官方稳定、零维护 | 高 / 不承诺 | 限额 API 可能改；越狱/固件可能变。产品要能 stale，不要能崩 |

## 建议（按优先级）

### 1. 做成 Aindle，不要 fork 任何一份参考当主干

- 从 kindle-dashboard **借职责切分和 loop 骨架**，不借 Windows Electron 全家桶。
- 从 TokenTracker **借限额通道和「桶与限额分离」**，不嵌它的 CLI，不用它的云。
- 从 OctoMonitor **借任务语义和脱敏原则**，不等它的 maintenance 主线给你加 Grok。
- 从 jefftko **借 Oasis 3 尺寸和唤醒策略**。

三份都是 MIT。借想法、必要时小段重写，比依赖即将归档或营销口径和源码不一致的上游更安全。

### 2. 先单机闭环，再多机

你要的最终形态是三机。但第一刀应该是：**这台已经插满工具的 MacBook Pro → 一张真 PNG → 浏览器或 Kindle。**

原因：多订阅注册表、未文档化接口、Oasis 设备档，每一个都能单独让项目停一周。先在一台机器上证明「屏上的数字不是假的」，再复制 agent。

### 3. 立刻需要你拍板的五件事

没有这五项，实施会话不该开工（符合「没有可判定验收就不实施」）：

1. **Oasis 代数 + 固件 + 是否已有 FBInk/KUAL/SSH。** 代数已确认是 Oasis 1（1072×1448）。仍需固件、FBInk/KUAL/SSH，才能把 Stage 1 做到真机。
2. **订阅白名单。** 哪些 `~/.claude-*` / `~/.codex-*` 是官方套餐，哪些是中转，哪些废弃。
3. **Hub 机器。** 默认建议 Mac mini 常开；若不是，说清楚谁 24h 在线。
4. **副屏姿态。** 竖屏 1264×1680（Demo 默认）还是横屏 1680×1264（更像双栏监控）。
5. **耗电政策。** 「插电常亮 60s」还是「合盖可睡、闲时 5min」。影响 loop 设计。

### 4. Cursor 和「多订阅」要对外诚实

对内可以努力扫 `acp-sessions` / `chats/store.db`，对外文案建议写成：

- Cursor：**套餐用量（账单周期）是一等公民；当前任务尽力而为。**
- 多订阅：**只显示你登记过的。** 自动发现仅用于 doctor，不自动上屏。

否则上线第一周就会出现「GLM 中转被画成 Claude Max 5h 条」或「三台机器三个 80% 其实是同一个 Cursor」。

### 5. 安全默认比功能更早锁死

本机 TokenTracker 云同步已经开着——说明你能接受某种出网聚合。Aindle 仍然默认：

- 凭证不出 agent 所在机器
- hub 只发布百分比和短标题
- Kindle URL 带 token
- 不复用 TokenTracker 的 InsForge 项目

LAN 无鉴权的 kindle-dashboard 模式不要学。

### 6. Demo 的定位

`demo/oasis-monitor.html` 用来讨论版式和信息密度，**不是**采集器已接通的证据。里面的数字全部是 mock。若你觉得竖屏太挤或横屏更好，改 Demo 比改架构便宜。

## 风险清单（开工前应接受）

| 风险 | 缓解 |
|---|---|
| Oasis 不是 3 代 / 分辨率不同 | 设备档；Stage 1 先桌面预览 |
| 固件升级毁掉越狱 | 项目不负责越狱；文档写明风险 |
| Cursor/Codex/Grok 限额 API 改字段 | schema-tolerant + last-good + doctor |
| 为读限额触发 429 / 封会话 | 每订阅 ≥120–180s；共享同一官方账号的多机只让一台拉限额 |
| 「正在跑」误报或漏报 | 文案写「最近活动」，提供 idle 态 |
| Windows 睡眠 / WSL 双家目录 | agent 心跳；注册表写明扫不扫 WSL |
| 密钥进 git / 进 PNG | 合同测试扫快照；渲染 HTML 不接收 secret |
| 范围膨胀成第二个 TokenTracker | 第一版只四工具 + 任务 + Kindle |

## 建议的下一步（等人拍板，不是自动开工）

1. 你回复五项决定（见上）。
2. 若决定开工：用 `impl-prompt` 技能从 `07` + `08` 生成带门禁的 IMPL-PROMPT，**新开实施会话**。
3. 实施会话第一刀：注册表 schema + snapshot 合同 + 把 Demo 改成吃 `/snapshot.json`，仍然可以全是 mock。
4. 第二刀：只接这台 MBP 上你点名的 1–2 个 Claude + 1 个 Codex 真数据。
5. Kindle 真机放到设备信息齐了之后，不要和采集器第一刀绑死。

## 一句话建议

**做。做成「私网墨水副屏」，不要做成「又一个桌面用量网站」。先登记订阅、先单机出真图，再谈三机。**
