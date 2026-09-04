# Testing

## Prerequisites

- Node.js ≥ 20
- From the repository root:

```bash
npm install
npm run check
```

`check` compiles every package, bundles the `aindle` CLI, runs schema/merge tests, and scans the tree for personal-host / credential markers.

## 1. Gate

```bash
npm run check
```

Expect `check: ok`.

## 2. Hub

```bash
npx aindle hub
# or, from a clone: npm run hub
```

Default `0.0.0.0:8787`. First start seeds a **mock** snapshot so the UI is not empty. Set `AINDLE_SEED_MOCK=0` to wait for a real agent.

| URL | What |
|---|---|
| http://127.0.0.1:8787/health | Liveness + registered hosts |
| http://127.0.0.1:8787/snapshot.json | Redacted snapshot (`aindle.snapshot.v1`) |
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

**GLM / ZCode**: local sessions only today; no official 5h/7d bar (`confidence: none`).

**Sessions**: Claude projects, Codex jsonl, Grok sessions, Cursor chats. Activity in the last 2 minutes → `active`.

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
