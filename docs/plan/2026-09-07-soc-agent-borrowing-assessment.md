# soc-agent 借鉴评估（Aindle）

> 对方 repo:`https://github.com/llm-net/soc-agent`（本机对照用独立 clone，路径不入库）
> 对方版本:git `3d0c3237900b57a1764839df4bc58185a6bf6770`（tag `2609052022-4a8e`）
> 对方 license:**MIT**
> 本产品基线:Aindle `d86597620fba63e13459e76923cc11bbd76796a5`
> 既有评估:同日初稿把「只读采集器」和「未定价徽章」标成 B。本文收回。YoUsage 第一刀已落地，不是本评估缺口。

## TL;DR

**没有值得借鉴的点。** 展示词像（限额、花费），职责相反：Aindle 从本机文件和各家限额 API **只读**汇聚；soc-agent 在请求路径上 **执行** 计量和 429。对方不做 Claude `oauth/usage` / Codex wham / Cursor `usage-summary`，这些 Aindle 已经接了，而且更强。

「本机若跑着 soc-agent 就加采集器」是产品对接设想，不是设计借鉴。没有这台设备就不该写进借鉴表；有了也应另开产品决策，不应从评估里偷渡成 B。

牌价要加厚，来源是 YoUsage `model-pricing.ts`，不是 soc-agent。

第一刀：**不借，不施工。**

裁决计数:**A×0 / B×0 / C×9**。

## 对方是什么

板上网关：代理一笔记一笔。它不读取各家订阅余量 API。管理台用量页是给设备管理员看自己转发了多少钱。

## 借鉴目标（复审后）

只问限额/花费展示里有没有 **现在缺、且只有对方机制能补** 的东西。结论：没有。只读副屏该继续只读；精度来自代理位置，换不过来。

## 能力登记表

| # | 描述 | 对方位置 | 本产品现状 | 裁决 | 理由 |
|---|---|---|---|---|---|
| 1 | 本机网关用量（执行面） | `firmware/internal/usage/` | 无网关。Sub2API 已是只读中转面板（`packages/agent/src/collectors/sub2api.ts`） | **C** | 对接另一产品 ≠ 借鉴其设计。本评估不登记「如果用户装了对方就加源」 |
| 2 | 未定价徽章 / 用量零轮询 | `firmware/web/ui/src/pages/usage.tsx:1-19` | 未知模型不出美元（`packages/agent/src/lib/pricing.ts:36-46`）。限额失败走 last-good，不画假 0% | **C** | 诚实口径已有。再显式一点是打磨，不是缺口 |
| 3 | 官方模型目录 + 只填空价 | `platformcatalog/`；`catalogsync.go:3-47` | 8 条前缀表（`pricing.ts:8-18`）。YoUsage 表更全、同栈 | **C** | 加厚牌价应走 YoUsage，不走人民币微元网关目录 |
| 4 | 多厂商剩余额度条 | 对方无各家 oauth/usage | 已有 Claude/Codex/Cursor/Grok/Kimi/ZCode/Gemini/Copilot 等（`packages/agent/src/collectors/index.ts:31-76`） | **C** | 本产品已强于对方 |
| 5 | 24h/7d token + 近似美元 | 网关小时桶 | 已有 JSONL 扫描（`packages/agent/src/collectors/usage.ts:262-298`） | **C** | 已有；对方精度不可迁移 |
| 6 | 按 Key admit / 429 | `firmware/internal/usage/admit.go` | 只展示，不拒绝 | **C** | 只读红线 |
| 7 | 设备 API 网关 | `firmware/internal/gateway/` | hub 只 ingest。禁止用模型网关 key 当面板凭证 | **C** | 会把 Aindle 做成中转 |
| 8 | 固件 OTA / `soc` helper | `updated/`；`sochelper/` | npm hub/agent；Kindle 是 PNG+FBInk | **C** | 越界 |
| 9 | 等你/人手/后台、标题脱敏 | — | YoUsage 第一刀已落地 | **C** | 已借自另一来源 |

## 红线

1. 私网只读副屏，不是公网产品。
2. 不按机器加总 5h。
3. Kindle 不批准、不画 prompt/路径/secret。
4. hub 不存 OAuth / 上游 Key。
5. 不是对账单。

## 第一刀

不借。不为 soc-agent 开采集器，不改定价 UI，不从本文派生对接任务。

## 不借清单

网关、admit、目录、OTA、helper、对接采集器、未定价打磨。初稿 2 条 B 全部收回。
