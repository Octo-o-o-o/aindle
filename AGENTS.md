# Aindle

Private, read-only AI work board. Hub + agents on your LAN (or Tailscale). Optional jailbroken Kindle Oasis 1 lock screen. Not a SaaS, time tracker, or approval UI.

## Run

```bash
npm install
npm run hub
# http://127.0.0.1:8787/monitor.html
# http://127.0.0.1:8787/eink.html?page=local
# http://127.0.0.1:8787/dash.png?page=local
```

```bash
npx aindle init --local          # writes ./config/registry.yaml
npx aindle agent --loop 60       # live collectors
npx aindle agent --mock          # push the built-in sample once
npx aindle agent --dry-run       # print JSON, do not POST
```

```bash
npm run check                    # packages + demo freshness + kindle smoke
npm run site:build && npm run site:check
node scripts/build-demo.mjs      # after monitor.html or demo/mock-view*.json
node --import tsx scripts/capture-readme-screenshots.mjs
```

Hub seeds mock data unless `AINDLE_SEED_MOCK=0`. Default port `8787` (`AINDLE_PORT`).

## Do not

- Commit `config/registry.yaml`, `.env`, passwords, cookies, live snapshots, or personal host names.
- Put prompts, replies, absolute paths, or secrets on eink / monitor.
- Publish `:8787` to the public internet. The website (`site/`) is intro + mock demo only.
- Treat 24h/7d USD as an invoice. It is a static price table on the agent.
- Invent vendor quota APIs. If a source cannot be read, hide it or go `stale`.

## Layout

| Path | Role |
| --- | --- |
| `packages/core` | `aindle.snapshot.v2` / ingest, merge, view-model |
| `packages/hub` | HTTP + `monitor.html` + eink HTML/PNG |
| `packages/agent` | registry → collectors → POST `/api/ingest` |
| `kindle/oasis1` | lock-screen loop (PNG + FBInk), KUAL |
| `demo/` | generated mock HTML; edit `monitor.html` + `mock-view*.json` |
| `site/` | public website; build to `dist/site` |

On-screen buckets: **进行中** (human) · **待确认** (direct wait) · **后台任务** (agent/machine). `wait` today is Claude `AskUserQuestion` and Codex `request_user_input` only.

Oasis 1 canvas is **1072×1448**. Lock-screen PNG needs Chrome/Chromium on the hub host.

## Docs

- [README.md](README.md) / [README.zh-CN.md](README.zh-CN.md)
- [docs/00-index.md](docs/00-index.md)
- [docs/06-data-sources.md](docs/06-data-sources.md)
- [docs/14-website-and-brand.md](docs/14-website-and-brand.md)
- [kindle/oasis1/README.md](kindle/oasis1/README.md)
