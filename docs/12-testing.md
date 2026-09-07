# Testing

## Prerequisites

- Node.js ≥ 20（Windows 上读 Cursor / Kiro / ZCode 建议 22+）
- From the repository root:

```bash
npm install
npm run check
```

`check` compiles every package, bundles `dist/cli.js`, runs schema/merge tests, and checks the generated demo. A fresh clone can also run `npm run hub` / `npx aindle` before that bundle exists: `scripts/ensure-built.mjs` compiles `@aindle/core`, and `scripts/aindle.mjs` prefers `tsx src/cli.ts` in a clone so a stale bundle cannot break `npx aindle`.

## 1. Gate

```bash
npm run check
```

Expect `check: ok`.

## 2. Hub

```bash
npx aindle hub
# same as: npm run hub
```

Default `0.0.0.0:8787`. First start seeds a **mock** snapshot so the UI is not empty. Set `AINDLE_SEED_MOCK=0` to wait for a real agent.

| URL | What |
|---|---|
| http://127.0.0.1:8787/health | Liveness + registered hosts |
| http://127.0.0.1:8787/snapshot.json | Redacted snapshot (`aindle.snapshot.v2`) |
| http://127.0.0.1:8787/view.json | View-model for `monitor.html` |
| http://127.0.0.1:8787/monitor.html?mode=panels&device=oasis1&kindle=1 | 本机面板 |
| http://127.0.0.1:8787/monitor.html?view=relay&scope=admin | 中转 · 全站 |
| http://127.0.0.1:8787/monitor.html?view=relay&scope=user | 中转 · 我的 |
| http://127.0.0.1:8787/eink.html?page=local | Oasis 1 壁纸 HTML（本机） |
| http://127.0.0.1:8787/dash.png?page=local | Oasis 1 PNG 1072×1448 |

```bash
export AINDLE_PORT=8787
export AINDLE_TOKEN=dev-secret
export AINDLE_SEED_MOCK=0
export AINDLE_HUB_ID=mini
export AINDLE_HUB_LABEL="Mac mini"
```

PowerShell:

```powershell
$env:AINDLE_PORT=8787
$env:AINDLE_TOKEN="dev-secret"
$env:AINDLE_HUB_URL="http://127.0.0.1:8787"
```

## 3. Agent

### Mock (no credentials)

```bash
npx aindle agent --mock --dry-run
npx aindle agent --mock
```

### Live collect

```bash
npx aindle init --local    # writes ./config/registry.yaml if missing
# edit registry.yaml — keep only the tools you use

npx aindle agent --dry-run
npx aindle agent --once
npx aindle agent --loop 60
```

```bash
export AINDLE_HUB_URL=http://127.0.0.1:8787
export AINDLE_TOKEN=dev-secret
export AINDLE_REGISTRY=config/registry.yaml
```

**Claude**: macOS Keychain `Claude Code-credentials` → Anthropic usage API; ≥180s throttle. Empty / expired token → run `claude login`. Draws 5h / 7d plus scoped weekly limits in `limits[]` (for example Fable).

**Codex**: `~/.codex/auth.json` → ChatGPT `wham/usage`.

**Cursor**: `state.vscdb` + `cli-config.json` → `cursor.com/api/usage-summary`.

**Grok**: `~/.grok/auth.json`, refresh if needed → Grok billing.

**Kimi**: `~/.kimi-code` credentials → Kimi usages.

**ZCode (GLM Coding Plan)**: `~/.zcode/v2/credentials.json`（AES-256-GCM，密钥按 ZCode 应用的机器派生规则本地解密，可用 `ZCODE_CREDENTIAL_SECRET` 覆盖）→ `api.z.ai /api/monitor/usage/quota/limit`。画 `5h`（TOKENS_LIMIT unit=3）、`7d`（unit=6）与 `月`（TIME_LIMIT unit=5）；`level` → plan（如 Lite）。凭据缺失/过期 → `stale`/`error`；保持 ZCode 应用登录即可自动续期。会话来自 `~/.zcode/cli/db/db.sqlite` 的 `session` 表（标题 / 项目 / 活动时间）。

**Gemini**: `~/.gemini/oauth_creds.json`（token 只读刷新，不回写）→ `loadCodeAssist` 识别档位；付费档远程 `retrieveUserQuota`；免费档 2026-06 起远程配额已关，需 Antigravity IDE 运行中（本地 language server 探针，未运行 → `error` 卡片）。

**Copilot（个人）**: `api.github.com/copilot_internal/user` → premium_interactions 剩余%。token 用 `AINDLE_COPILOT_TOKEN`/`keyFile`；钥匙串读取需 `AINDLE_COPILOT_KEYCHAIN=1`（首次弹授权框）。

**Kiro**: `~/Library/Application Support/kiro-cli/data.sqlite3` token → CodeWhisperer `GetUsageLimits`；token 由 kiro-cli 负责刷新（过期 → error 提示跑一次 CLI）。

**DeepSeek**: 官方 `/user/balance` 余额（kind `spend`）；key 顺序 `DEEPSEEK_API_KEY` → `keyFile` → `~/.qwen/settings.json`；`budget` 配置后画「预算」条。

**GLM**（`~/.claude-glm`）: local sessions only; no official 5h/7d bar (`confidence: none`).

**Qwen / iFlow**: 源码核对无配额 API（429 被动感知），不做假实现——见 `docs/06-data-sources.md` §15–16。

**Sessions**: Claude projects, Codex jsonl, Grok sessions, Cursor chats, ZCode sqlite. Activity in the last 2 minutes → `active`。`wait` 第一刀仅 Claude `AskUserQuestion` + Codex `request_user_input`。

**Sub2API**: `mode: admin` vs `mode: user`. See [13-sub2api.md](13-sub2api.md).

## 4. curl

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/snapshot.json
```

With a token:

```bash
curl -s "http://127.0.0.1:8787/snapshot.json?token=dev-secret"
```

## 5. Stale host

1. Hub + agent running → host `status: ok`.
2. Stop the agent and wait **>5 minutes**.
3. `GET /snapshot.json` → that host is `stale`; last numbers stay on screen.

## 6. Kindle

Same LAN (or Tailscale). **主路径是 PNG + FBInk**，不是实验浏览器。

```
http://<lan-ip>:8787/dash.png?page=local
http://<lan-ip>:8787/dash.png?page=now
http://<lan-ip>:8787/dash.png?page=relay
http://<lan-ip>:8787/eink.html?page=local
```

Check: PNG 正好 1072×1448；三页页脚是 `1/3 本机` / `2/3 进行中` / `3/3 中转`。设备脚本在 `kindle/oasis1/`。

浏览器退路（布局较差，只作对照）：

```
http://<lan-ip>:8787/monitor.html?device=oasis1&kindle=1&mode=panels
```

Check: 单栏粗条，顶栏只有本机/中转，没有「小屏/大屏」。Optional `&refresh=120`。E-ink 更适合手动刷新。

## 7. Static demo

```bash
python3 demo/serve.py
# http://<lan-ip>:8765/oasis-monitor.html?device=oasis1&kindle=1
```

## 8. Not in this release

- Multi-host Mini / Windows agents as a packaged install
- 未越狱锁屏封面方案
- Oasis 2/3 / Scribe 设备档（画板仍按 Oasis 1）
