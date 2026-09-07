# 文档索引

新用户请先看仓库根目录 [README.zh-CN.md](../README.zh-CN.md) / [README.md](../README.md)，或官网 [aindle.octoooo.com](https://aindle.octoooo.com)。下面 `01–10` 是立项调研，不是安装手册。

阅读顺序：先 `01` 看问题是不是我们想的那样，再 `02` 看 Kindle 能不能扛住，然后 `03–05` 看三份参考各自能借什么，再用 `06–07` 对数据与架构，最后 `08` 结论、`09` 复核。

| 编号 | 文件 | 回答的问题 |
|---|---|---|
| 01 | [problem-and-scope.md](01-problem-and-scope.md) | 你到底要一块什么屏？本机已经有哪些现成痕迹？ |
| 02 | [kindle-oasis-constraints.md](02-kindle-oasis-constraints.md) | Oasis 分辨率、刷新、电池、浏览器、越狱边界是什么？ |
| 03 | [reference-kindle-dashboard.md](03-reference-kindle-dashboard.md) | alexishida 的 PNG 拉图方案具体怎么工作？缺什么？ |
| 04 | [reference-tokentracker.md](04-reference-tokentracker.md) | TokenTracker 能采到哪些用量？跨机怎么同步？ |
| 05 | [reference-octomonitor.md](05-reference-octomonitor.md) | OctoMonitor 怎么表示「正在做 / 刚做完」？远程 viewer 能不能当 Kindle 壳？ |
| 06 | [data-sources.md](06-data-sources.md) | Claude / Codex / Cursor / Grok 的限额、会话、多订阅分别从哪来？ |
| 07 | [architecture.md](07-architecture.md) | Aindle 应该长成什么样？先做哪一截？ |
| 08 | [feasibility-and-recommendation.md](08-feasibility-and-recommendation.md) | 可不可行？建议怎么做、先问你哪几个决定？ |
| 09 | [review.md](09-review.md) | 上面这些说法里，哪些是坐实的，哪些是推断，哪些互相打架？ |
| 10 | [demo-review.md](10-demo-review.md) | 另一会话对 Demo 的改动复核 |
| 12 | [testing.md](12-testing.md) | Stage 1 Hub/Agent 测试指南 |
| 13 | [sub2api.md](13-sub2api.md) | Sub2API Admin / 普通用户如何配置 |
| 14 | [website-and-brand.md](14-website-and-brand.md) | 官网、品牌图标、Cloudflare Pages Git 配置 |

当前实施合同：[`plan/2026-09-04-yousage-borrowing-assessment.fable.md`](plan/2026-09-04-yousage-borrowing-assessment.fable.md)。独立交叉评审：[`review/2026-09-04-yousage-borrowing-cross-review.sol.md`](review/2026-09-04-yousage-borrowing-cross-review.sol.md)。实施 handoff：[`plan/2026-09-04-yousage-borrowing-IMPL-PROMPT.md`](plan/2026-09-04-yousage-borrowing-IMPL-PROMPT.md)。官网与品牌：[`plan/2026-09-05-website-branding.md`](plan/2026-09-05-website-branding.md)。

Demo：[`../demo/oasis-monitor.html`](../demo/oasis-monitor.html)（mock） · Hub 实时 UI：`:8787/monitor.html` · 官网：[`../site/index.html`](../site/index.html) · 给 agent：[`../AGENTS.md`](../AGENTS.md) · [`../llms.txt`](../llms.txt)

## 证据纪律

文档里凡写「本会话观察到」的，都来自 2026-09-03 这次调研实际读到的文件、目录名或命令输出。凡写「参考实现」「社区报告」「未在本机验证」的，都不是产品承诺。

没有读过、因此也没有写入文档的东西：

- 任何 `credentials.json` / `auth.json` / cookie / Keychain 内容
- TokenTracker `queue.jsonl` 与限额缓存的具体数字
- Kindle 序列号、真实 IP、SSH 密码
