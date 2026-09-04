# Aindle

把已越狱的 Kindle Oasis 做成书桌旁的 **AI Monitor**：同时看多台机器、多份订阅上的 Claude Code / Codex / Cursor / Grok Build 用量，以及正在进行和刚完成的任务。

> **Stage 1 已落地**：Hub + Agent + 快照合同 + Kindle 兼容实时 UI。Oasis 1 主路径是 `/dash.png` + `kindle/oasis1/`。

Aindle 的边界是“私网只读的 AI 工作态势牌”：回答额度是否可信、哪里确实需要人回来。它不做精力/绩效追踪，不在 Kindle 上审批或回复，也不展示 prompt、reply、命令、路径或 secret。

## 快速开始

```bash
git clone https://github.com/Octo-o-o-o/aindle.git
cd aindle
npm install
npm run check          # 编译 + 单测
npm run hub            # :8787  Hub + monitor UI
npm run agent -- --mock   # 另开终端：推送 mock 快照
```

浏览器打开 [http://127.0.0.1:8787/monitor.html?mode=panels&device=oasis1&kindle=1](http://127.0.0.1:8787/monitor.html?mode=panels&device=oasis1&kindle=1)

完整测试步骤见 [`docs/12-testing.md`](docs/12-testing.md)。Demo 另一会话改动复核见 [`docs/10-demo-review.md`](docs/10-demo-review.md)。

## 结论（先读）

**可行，但不要做成「把 TokenTracker 或 OctoMonitor 直接投到 Kindle 浏览器」。**

推荐路径：每台机器跑只读采集 agent → 一台常开 hub（建议 Mac mini）聚合成脱敏快照 → 渲染成 Oasis 1 的 1072×1448 PNG → Kindle 用 FBInk 拉图刷新。实验浏览器只作对照，不是主界面。

详细论证见 [`docs/08-feasibility-and-recommendation.md`](docs/08-feasibility-and-recommendation.md)。评审见 [`docs/09-review.md`](docs/09-review.md)。

## 打开静态 Demo（mock，不连 Hub）

用浏览器打开 [`demo/oasis-monitor.html`](demo/oasis-monitor.html)，或启动局域网服务：

```bash
python3 demo/serve.py
```

默认画板按 **Kindle Oasis 1 / 1072×1448**。数据是 mock。说明见 [`demo/README.md`](demo/README.md)。

## 文档地图

| 文件 | 内容 |
|---|---|
| [docs/00-index.md](docs/00-index.md) | 文档索引与阅读顺序 |
| [docs/07-architecture.md](docs/07-architecture.md) | 建议架构与分阶段交付 |
| [docs/10-demo-review.md](docs/10-demo-review.md) | Demo 另一会话改动复核 |
| [docs/12-testing.md](docs/12-testing.md) | Stage 1 测试指南 |
| [docs/13-sub2api.md](docs/13-sub2api.md) | Sub2API Admin / 普通用户配置 |
| [YoUsage 借鉴可实施方案](docs/plan/2026-09-04-yousage-borrowing-assessment.fable.md) | `wait`、人手/后台分桶与安全标题的下一批合同 |
| [第一刀实施 Prompt](docs/plan/2026-09-04-yousage-borrowing-IMPL-PROMPT.md) | 交给独立实施会话的范围、门禁与停止条件 |
| [config/registry.example.yaml](config/registry.example.yaml) | 订阅注册表示例 |

## 包结构

| 包 | 说明 |
|---|---|
| `packages/core` | `aindle.snapshot.v1` / ingest 合同、合并、校验 |
| `packages/hub` | HTTP：`/snapshot.json`、`/dash.png`、`/eink.html`、`/monitor.html` |
| `kindle/oasis1` | Oasis 1 拉图循环、KUAL 菜单 |
| `packages/agent` | 读本机注册表 → 采集 → POST hub |

## 本轮仍未做

- 未越狱锁屏封面方案
- Windows / Mac mini 常驻 agent 安装包
