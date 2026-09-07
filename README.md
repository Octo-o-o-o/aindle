# <img src="assets/brand/icon-48.png" width="36" height="36" alt=""> Aindle

[English](README.md) | [简体中文](README.zh-CN.md) | [Website](https://aindle.octoooo.com)

[![license](https://img.shields.io/badge/license-MIT-111111)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-111111)](package.json)

**A private, read-only AI work board** for a desk — or a jailbroken Kindle Oasis.

It watches several machines and several subscriptions at once: Claude Code, Codex, Cursor, Grok Build, Kimi, ZCode (GLM Coding Plan), Gemini, Copilot, Kiro, DeepSeek, plus Sub2API. The screen shows **quota bars**, **24h / 7d token spend**, and **in progress / awaiting confirmation / background tasks**. It does not track “productivity”, approve anything on the Kindle, or put prompts, replies, paths, or secrets on the screen.

The pictures below are **mock data**. After `npm install` and `npm run hub` you will see the same layout with the built-in sample. There is no extra Aindle service, database, or Docker.

## What you see

Lock-screen board (Oasis 1, **1072×1448**). Lock to look; unlock and it is a normal Kindle again.

<img src="docs/screenshots/eink-local.png" alt="Kindle Oasis 1 lock screen: quotas, in-progress tasks, battery, mock data" width="420">

The hub board on a small Kindle (Oasis) and a large one (Scribe). One host, Claude + Codex, one live task — the usual first day.

| Kindle Oasis | Kindle Scribe |
| --- | --- |
| <img src="docs/screenshots/simple-oasis.png" alt="Simple mock on a Kindle Oasis: Claude, Codex, Cursor, Grok" width="280"> | <img src="docs/screenshots/simple-scribe.png" alt="Simple mock on a Kindle Scribe: full-width quota ledger and task list" width="360"> |

Three hosts and many seats: [complex Scribe](docs/screenshots/complex-scribe.png) · [complex Oasis](docs/screenshots/complex-oasis.png). On the Kindle itself, open the Experimental Browser and type [https://aindle.octoooo.com/oasis](https://aindle.octoooo.com/oasis) or [https://aindle.octoooo.com/scribe](https://aindle.octoooo.com/scribe). Static copies: `python3 demo/serve.py`.

## Start

Needs **Git** and **Node.js 20+** (22+ on Windows if you want Cursor / Kiro / ZCode). Clone this repo — the package is **not** on npm. First `npm run hub` compiles `@aindle/core` if needed (a few seconds).

```bash
git clone https://github.com/Octo-o-o-o/aindle.git
cd aindle
npm install
npm run hub
```

Open:

- Board: [http://127.0.0.1:8787/monitor.html](http://127.0.0.1:8787/monitor.html)
- Lock-screen HTML: [http://127.0.0.1:8787/eink.html?page=local](http://127.0.0.1:8787/eink.html?page=local)
- Lock-screen PNG: [http://127.0.0.1:8787/dash.png?page=local](http://127.0.0.1:8787/dash.png?page=local) — needs Chrome, Chromium, Edge, or Brave on this machine (`AINDLE_CHROME` if it is not in the usual place)

The two HTML pages are enough to learn the UI. The hub seeds mock data on host `mbp` so the screen is not empty. `AINDLE_SEED_MOCK=0` turns the sample off (PowerShell: `$env:AINDLE_SEED_MOCK='0'`). State is in memory: restarting the hub reseeds the mock unless you turn that off.

No Redis, database, or second Aindle daemon. Hub is one Node process; the agent is another.

### Watch your own machines

In another terminal, from the **same clone**:

```bash
npx aindle init --local
# edit ./config/registry.yaml — uncomment only tools you already use
npx aindle agent --loop 60
```

`init` writes this computer’s name as `host.id` (never `mbp`). The hub sample therefore stays on screen next to your machine until you set `AINDLE_SEED_MOCK=0` and restart the hub. Every tool in the starter file is commented: if you run the agent without uncommenting anything, that host is empty and the sample is still there.

`npx aindle` here is the **local** bin from this repo (`scripts/aindle.mjs`), not a global npm package. Same thing: `npm run init` then `npm run agent -- --loop 60`.

### macOS and Windows

The same commands work in Terminal, PowerShell, and cmd, as long as you run them **from this clone**. Do not type a bare `aindle` — it is not on PATH.

- **Node.js 22+** is recommended on Windows. Node 20 can run the hub and the mock; Cursor / Kiro / ZCode need Node 22’s built-in `node:sqlite`, or a `sqlite3.exe` on PATH.
- Lock-screen `/dash.png` looks for Chrome, Chromium, Edge, or Brave. If none are found, set `AINDLE_CHROME` to the browser path. The two HTML pages do not need a browser installed.
- Kindle on the LAN: allow inbound TCP `8787` on the hub machine (Windows Defender / macOS firewall).
- Tools that live only in **WSL** are a different home directory. Run the agent inside that distro, or set `home:` to the UNC path (`\\wsl$\Ubuntu\home\you\.claude`). `%USERPROFILE%` and `%APPDATA%` expand in `registry.yaml`.

Copy [config/registry.example.yaml](config/registry.example.yaml) if you prefer. Aindle does not auto-scan every `~/.claude-*`. Leave unused entries commented — uncommented seats that cannot be read become empty or `error` cards and stay on screen. Never commit a filled-in `registry.yaml` (it is gitignored).

The agent only reads tools you already logged into on that machine (local files / the same unofficial quota endpoints the CLIs use). It does not need an Aindle account.

```bash
npx aindle agent --dry-run    # print JSON, do not POST
npx aindle agent --once
npx aindle agent --mock       # push the built-in sample once
```

A second computer: clone or copy the repo there, point `AINDLE_HUB_URL` at the hub machine, run the agent. There is no sync service.

| Env | Meaning |
| --- | --- |
| `AINDLE_HUB_URL` | default `http://127.0.0.1:8787` |
| `AINDLE_TOKEN` | same secret as the hub, if you set one |
| `AINDLE_REGISTRY` | path to the YAML |
| `AINDLE_PORT` / `AINDLE_HOST` | hub bind; default `8787` / `0.0.0.0` |

### Optional: Kindle Oasis 1

Primary path: **`/dash.png` + FBInk**. Scripts live in [`kindle/oasis1/`](kindle/oasis1/README.md).

1. Hub on the LAN (or Tailscale). Do **not** use `127.0.0.1` on the Kindle.
2. Copy `kindle/oasis1/` to the device (`/mnt/us/aindle`).
3. Copy `hub.env.example` to `hub.env` on the device, then set `HUB=http://192.168.x.x:8787` (change the IP, keep port `8787`) and optional `TOKEN`.
4. KUAL → start lock-screen monitor. Lock to see the board.
5. Page-turn keys switch **local / now / relay** only while locked. Unlock = stock Kindle.

PNG is exactly **1072×1448**. The hub host needs Chrome, Chromium, Edge, or Brave (`AINDLE_CHROME` if it is not in the default path). Default refresh: 10 minutes idle, 5 minutes when a task is busy.

## What it is / what it is not

| It is | It is not |
| --- | --- |
| A LAN / Tailscale **hub + agent** | A public internet product |
| Per-subscription quota (do **not** add 5h bars across machines) | A TokenTracker / OctoMonitor fork |
| Local JSONL → 24h / 7d tokens and an approximate USD figure | A billing invoice |
| **In progress / awaiting confirmation / background** | A scoreboard or time tracker |
| Kindle **lock-screen** wallpaper | An unlock-to-read replacement |

## How it fits together

```
 MacBook agent          Mac mini agent           Windows agent
  local files + APIs     (often also the hub)     local files + APIs
           \                    |                       /
            +----- POST /api/ingest (redacted JSON) ---+
                                |
                           Aindle Hub
                    /snapshot.json  /view.json
                    /monitor.html   /eink.html
                    /dash.png  (1072×1448)
                                |
                    same LAN or Tailscale
                                |
                         Kindle Oasis 1
                      curl PNG → FBInk
```

| Process | Where | Credentials? | Speaks to |
| --- | --- | --- | --- |
| **agent** | every dev machine | yes, only on that machine | hub, already-computed numbers |
| **hub** | a machine that stays on | no OAuth store | PNG / redacted JSON |
| **kindle-loop** | Oasis | no | one GET of a PNG |

If one agent dies, the last frame stays and that host is marked `stale`. The others keep painting.

Useful URLs: `/health`, `/snapshot.json`, `/view.json`, `/monitor.html`, `/eink.html?page=local\|now\|relay`, `/dash.png?page=…`.

On screen, `wait` today is only Claude `AskUserQuestion` and Codex `request_user_input`. Other tools fall back to age buckets.

## Supported sources

| Tool | Quota | Local 24h/7d tokens | Sessions |
| --- | --- | --- | --- |
| Claude Code | official 5h / 7d / scoped | JSONL | yes |
| Codex | ChatGPT `wham/usage` | rollout JSONL | yes |
| Cursor | `usage-summary` | — | chats |
| Grok Build | billing | — | sessions |
| Kimi | usages API | JSONL | yes |
| ZCode (GLM Coding Plan) | z.ai quota | — | sqlite |
| Gemini | retrieveUserQuota / Antigravity | — | — |
| Copilot (personal) | premium remaining | — | — |
| Kiro | CodeWhisperer limits | — | — |
| DeepSeek | official balance (`kind: spend`) | — | — |
| GLM local | none (honest empty bar) | JSONL | yes |
| Sub2API | admin site / user / people | panel spend | — |

Qwen Code and iFlow have **no quota API** (429 text only). They are not faked. Details: [docs/06-data-sources.md](docs/06-data-sources.md), [docs/13-sub2api.md](docs/13-sub2api.md).

24h / 7d USD is a **static price table** on the agent (`cache_read` ×0.1, `cache_write` ×1.25). Unknown models count tokens only. This is a feel for spend, not an invoice.

## Security defaults

- Snapshots **forbid** `token`, `cookie`, `password`, `secret`, `prompt`, `stack`, and friends. The gate fails the build if those keys appear.
- Agents read credentials only on the machine that owns them (Keychain, `auth.json`, `keyFile`). The hub never stores OAuth.
- Put panel passwords in `0600` files (`passwordFile` / `jwtFile`). Do not paste them into YAML.
- If `AINDLE_TOKEN` is set, every JSON / PNG / HTML read needs the token.
- Bind the hub to LAN / Tailscale. Do not publish `:8787` to the open internet.
- `scripts/check-release.sh` scans the tree for leftover personal hosts and credential markers.

## Packages and docs

| Path | Role |
| --- | --- |
| `packages/core` | `aindle.snapshot.v2` / ingest contract, merge, view-model |
| `packages/hub` | HTTP + `monitor.html` + eink HTML/PNG |
| `packages/agent` | registry → collectors → POST |
| `kindle/oasis1` | lock-screen loop, KUAL menu |
| `demo/` | static mock (generated; do not edit the HTML by hand) |
| `site/` | public website |

| File | What |
| --- | --- |
| [AGENTS.md](AGENTS.md) | short contract for coding agents |
| [llms.txt](llms.txt) | same facts, machine-readable |
| [docs/00-index.md](docs/00-index.md) | reading order |
| [docs/07-architecture.md](docs/07-architecture.md) | architecture and stages |
| [docs/12-testing.md](docs/12-testing.md) | Stage 1 test guide |
| [docs/13-sub2api.md](docs/13-sub2api.md) | Sub2API admin vs user |
| [docs/14-website-and-brand.md](docs/14-website-and-brand.md) | website, brand assets, Cloudflare Pages |
| [demo/README.md](demo/README.md) | demo URL flags |
| [kindle/oasis1/README.md](kindle/oasis1/README.md) | Oasis 1 lock-screen ops |

```bash
npm run check
```

That compiles every package, runs core / hub / agent tests, checks the generated demo, and runs the Kindle wait-script smoke test.

Refresh README screenshots from mock only:

```bash
node scripts/build-demo.mjs
node --import tsx scripts/capture-readme-screenshots.mjs
```

## Not in this release

- Lock-screen cover **without** a jailbreak
- Packaged Windows / Mac mini agent installers
- First-class Oasis 2 / 3 / Scribe device profiles (the canvas is still Oasis 1)
- Official, guaranteed-stable vendor APIs — several quota endpoints are the same undocumented ones the CLIs use. The product must go `stale`, not crash.

## License

[MIT](LICENSE) © 2026 Octo
