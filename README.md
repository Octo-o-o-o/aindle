# Aindle

[English](README.md) | [简体中文](README.zh-CN.md)

[![license](https://img.shields.io/badge/license-MIT-111111)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-111111)](package.json)

**A private, read-only AI work board** for a desk — or a jailbroken Kindle Oasis.

Aindle watches several machines and several subscriptions at once: Claude Code, Codex, Cursor, Grok Build, Kimi, ZCode (GLM Coding Plan), Gemini, Copilot, Kiro, DeepSeek, plus Sub2API. It shows **quota bars**, **24h / 7d token spend**, and **what is running / waiting / just finished**. It does not track “productivity”, approve anything on the Kindle, or put prompts, replies, paths, or secrets on the screen.

The pictures below are **mock data**. Open the same pages locally with `python3 demo/serve.py`.

## Screenshots

### Simple — one Mac, two subscriptions

One host, Claude + Codex, one live task. This is the usual first-day setup.

| Phone (390×844) | Desktop (1600×1000) |
| --- | --- |
| <img src="docs/screenshots/simple-phone.png" alt="Simple scenario on a phone: two quota cards and 24h spend" width="280"> | <img src="docs/screenshots/simple-desktop.png" alt="Simple scenario on a desktop: quotas on the left, live and recent tasks on the right" width="520"> |

### Complex — three hosts, many accounts

MacBook Pro + Mac mini + a stale Windows box. Shared Claude seats, company Codex, Cursor / Grok / GLM, wait / human / background buckets, and a Sub2API relay lane.

| Phone | Desktop |
| --- | --- |
| <img src="docs/screenshots/complex-phone.png" alt="Complex scenario on a phone: many subscription quota cards" width="280"> | <img src="docs/screenshots/complex-desktop.png" alt="Complex scenario on a desktop: three hosts, eight local subscriptions, live and recent tasks" width="520"> |

### Kindle Oasis 1 (1072×1448)

The Oasis 1 path is a **PNG + FBInk lock-screen loop**, not the experimental browser. The HTML below is the same layout, forced into Kindle panel mode.

<img src="docs/screenshots/kindle-oasis1.png" alt="Kindle Oasis 1 panel: hosts and quota bars on a 1072-wide canvas" width="420">

## What it is / what it is not

| It is | It is not |
| --- | --- |
| A LAN / Tailscale **hub + agent** | A public internet product |
| Per-subscription quota (do **not** add 5h bars across machines) | A TokenTracker / OctoMonitor fork |
| Local JSONL → 24h / 7d tokens and an approximate USD figure | A billing invoice |
| “Waiting for you / human / background” | A scoreboard or time tracker |
| Kindle **lock-screen** wallpaper | An unlock-to-read replacement |

Unlock the Kindle and it is a normal book reader again. Look at the board by locking (power button or cover).

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

Three processes, three permission levels:

| Process | Where | Credentials? | Speaks to |
| --- | --- | --- | --- |
| **agent** | every dev machine | yes, only on that machine | hub, already-computed numbers |
| **hub** | a machine that stays on | no OAuth store | PNG / redacted JSON |
| **kindle-loop** | Oasis | no | one GET of a PNG |

If one agent dies, the last frame stays and that host is marked `stale`. The others keep painting.

## Quick start

```bash
git clone https://github.com/Octo-o-o-o/aindle.git
cd aindle
npm install
npm run check          # compile + tests + demo freshness
npm run hub            # :8787  Hub + UI  (seeds mock data)
```

In another terminal:

```bash
npm run agent -- --mock          # push the built-in sample once
# or live:
npx aindle init --local          # writes ./config/registry.yaml
# edit the file — keep only tools you actually use
npx aindle agent --loop 60
```

Then open:

- Desktop overview: [http://127.0.0.1:8787/monitor.html?mode=full](http://127.0.0.1:8787/monitor.html?mode=full)
- Phone / Kindle panels: [http://127.0.0.1:8787/monitor.html?mode=panels](http://127.0.0.1:8787/monitor.html?mode=panels)
- Oasis 1 preview: [http://127.0.0.1:8787/monitor.html?device=oasis1&kindle=1](http://127.0.0.1:8787/monitor.html?device=oasis1&kindle=1)
- Lock-screen HTML: [http://127.0.0.1:8787/eink.html?page=local](http://127.0.0.1:8787/eink.html?page=local)
- Lock-screen PNG: [http://127.0.0.1:8787/dash.png?page=local](http://127.0.0.1:8787/dash.png?page=local)

Hub starts with mock data so the UI is not empty. Set `AINDLE_SEED_MOCK=0` if you only want live agents.

### Static demo (no hub)

```bash
python3 demo/serve.py
```

- Simple: [http://127.0.0.1:8765/oasis-monitor-simple.html?mode=full](http://127.0.0.1:8765/oasis-monitor-simple.html?mode=full)
- Complex: [http://127.0.0.1:8765/oasis-monitor.html?mode=full](http://127.0.0.1:8765/oasis-monitor.html?mode=full)

Regenerate those HTML files after changing `packages/hub/public/monitor.html` or the mock JSON:

```bash
node scripts/build-demo.mjs
```

## Daily use

### 1. Hub

```bash
npx aindle hub
# or: npm run hub
```

| Env | Meaning |
| --- | --- |
| `AINDLE_PORT` | default `8787` |
| `AINDLE_HOST` | default `0.0.0.0` |
| `AINDLE_TOKEN` | if set, require `?token=` or `Authorization: Bearer` |
| `AINDLE_HUB_ID` / `AINDLE_HUB_LABEL` | how this hub names itself |
| `AINDLE_SEED_MOCK` | `0` to skip the built-in sample |

Useful URLs: `/health`, `/snapshot.json`, `/view.json`, `/monitor.html`, `/eink.html?page=local\|now\|relay`, `/dash.png?page=…`.

### 2. Agent

```bash
npx aindle init                 # ~/.config/aindle/registry.yaml
npx aindle init --local         # ./config/registry.yaml
npx aindle agent --dry-run      # print JSON, do not POST
npx aindle agent --once
npx aindle agent --loop 60
npx aindle agent --mock
```

| Env | Meaning |
| --- | --- |
| `AINDLE_HUB_URL` | default `http://127.0.0.1:8787` |
| `AINDLE_TOKEN` | same secret as the hub |
| `AINDLE_REGISTRY` | path to the YAML |

Copy [config/registry.example.yaml](config/registry.example.yaml). **Only list subscriptions you want watched.** Aindle does not auto-scan every `~/.claude-*`. Never commit a filled-in `registry.yaml` (it is gitignored).

### 3. Monitor UI

The page is ES5 + tables so a Kindle experimental browser can open it. Prefer PNG on a real Oasis.

| Query | Values | Effect |
| --- | --- | --- |
| `mode` | `panels` / `full` | phone pages vs desktop overview |
| `view` | `local` / `relay` | official seats vs Sub2API |
| `scope` | `admin` / `user` / `people` | relay slices |
| `page` | `hosts` / `quota` / `now` / `recent` | starting panel |
| `device` | `oasis1` `oasis2` `oasis3` `pw` `basic` `dx` `scribe` | scale preset |
| `kindle` | `1` | Kindle chrome (taller bars, simpler header) |
| `refresh` | seconds | reload `/view.json` (demo only redraws) |

Short side &lt; 720px → panels. Width ≥ 1600px → two quota columns.

On screen you get three counts: **waiting for you · human · background**. `wait` today is only Claude `AskUserQuestion` and Codex `request_user_input`. Other tools fall back to age buckets.

### 4. Kindle Oasis 1

Primary path: **`/dash.png` + FBInk**. Scripts live in [`kindle/oasis1/`](kindle/oasis1/README.md).

1. Hub on the LAN (or Tailscale). Do **not** use `127.0.0.1` on the Kindle.
2. Copy `kindle/oasis1/` onto the device (`/mnt/us/aindle`).
3. Edit `hub.env`: real `HUB=http://192.168.x.x:8787` and optional `TOKEN`.
4. KUAL → start lock-screen monitor.
5. Lock to see the board. Page-turn keys switch **local / now / relay** only while locked. Unlock = stock Kindle.
6. Default refresh: 10 minutes idle, 5 minutes when a task is busy. USB mass-storage and the loop cannot run together — eject, then start again.

```
http://<lan-ip>:8787/dash.png?page=local
http://<lan-ip>:8787/dash.png?page=now
http://<lan-ip>:8787/dash.png?page=relay
```

PNG is exactly **1072×1448**. Need Chrome or Chromium on the hub host (`AINDLE_CHROME` if it is not in the default path).

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

24h / 7d USD is a **static price table** on the agent (`cache_read` ×0.1, `cache_write` ×1.25). Unknown models count tokens only. This is a feel for spend, not an invoice. Sources idle for 7 days with structured evidence are hidden; sources with no evidence (Cursor / Grok, …) stay visible.

## Security defaults

- Snapshots **forbid** `token`, `cookie`, `password`, `secret`, `prompt`, `stack`, and friends. The gate fails the build if those keys appear.
- Agents read credentials only on the machine that owns them (Keychain, `auth.json`, `keyFile`). The hub never stores OAuth.
- Put panel passwords in `0600` files (`passwordFile` / `jwtFile`). Do not paste them into YAML.
- If `AINDLE_TOKEN` is set, every JSON / PNG / HTML read needs the token.
- Bind the hub to LAN / Tailscale. Do not publish `:8787` to the open internet.
- `scripts/check-release.sh` scans the tree for leftover personal hosts and credential markers.

## Packages

| Path | Role |
| --- | --- |
| `packages/core` | `aindle.snapshot.v2` / ingest contract, merge, view-model |
| `packages/hub` | HTTP + `monitor.html` + eink HTML/PNG |
| `packages/agent` | registry → collectors → POST |
| `kindle/oasis1` | lock-screen loop, KUAL menu |
| `demo/` | static mock (generated; do not edit the HTML by hand) |

## Docs

| File | What |
| --- | --- |
| [docs/00-index.md](docs/00-index.md) | reading order |
| [docs/07-architecture.md](docs/07-architecture.md) | architecture and stages |
| [docs/12-testing.md](docs/12-testing.md) | Stage 1 test guide |
| [docs/13-sub2api.md](docs/13-sub2api.md) | Sub2API admin vs user |
| [demo/README.md](demo/README.md) | demo URL flags |
| [kindle/oasis1/README.md](kindle/oasis1/README.md) | Oasis 1 lock-screen ops |

```bash
npm run check
```

That compiles every package, runs core / hub / agent tests, checks the generated demo, and runs the Kindle wait-script smoke test.

## Not in this release

- Lock-screen cover **without** a jailbreak
- Packaged Windows / Mac mini agent installers
- First-class Oasis 2 / 3 / Scribe device profiles (the canvas is still Oasis 1)
- Official, guaranteed-stable vendor APIs — several quota endpoints are the same undocumented ones the CLIs use. The product must go `stale`, not crash.

## License

[MIT](LICENSE) © 2026 Octo
