# Sub2API

Aindle treats Sub2API as a **separate subscription source**. Official Claude / Codex / Cursor bars and relay-site data can appear on the same Kindle screen, but they must not be merged into one card.

There are two views. Configure them as two registry entries.

| `mode` | Who | What you see | APIs |
|---|---|---|---|
| `admin` | Site operator | Site-wide summary + each upstream account (5h / 7d / Fable when the panel provides them) | `/admin/accounts`, `/admin/accounts/:id/usage`, `/admin/dashboard/snapshot-v2` |
| `user` | Regular user, or an admin looking only at themselves | That user's spend / limits / keys | `/user/profile`, `/usage/dashboard/stats`, `/user/platform-quotas`, `/keys` |

An account can be `admin` on the panel and still use `mode: user` in Aindle. User mode only calls `/user/*` and never lists other people's keys or the full account table.

## Do not use the wrong credential

| Credential | What it is for | Can Aindle read the panel with it? |
|---|---|---|
| Gateway / model key (`/v1`, `/responses`, `*.key`) | Claude Code / Codex talking to the relay | **No** |
| Panel email + password, or panel JWT | Web console | **Yes** |
| Admin API key (`x-api-key`) | Server-to-server admin | **Yes** (admin mode only) |

Put passwords, JWTs, and admin keys in `~/.config/sub2api/` with mode `0600`. Do not commit them. Do not put them in the registry YAML itself.

## Network

Many public panels sit behind Cloudflare and only accept Cloudflare-origin traffic on `80/443`. A laptop hitting `https://your-panel.example` may get **403**.

The app itself often listens on the VPS loopback, for example `127.0.0.1:8080`. From a home machine, open an SSH tunnel to **that loopback port**, not to Caddy `:80`:

```bash
ssh -N -L 18080:127.0.0.1:8080 user@your-vps
```

Then set:

```yaml
baseUrl: http://127.0.0.1:18080
```

A dedicated model-gateway hostname (paths like `/v1`, `/responses`) usually has **no** `/api/v1/user` or `/admin`. Point `baseUrl` at the **panel**, or at a tunnel to the panel process.

`baseUrl` is required (or set `AINDLE_SUB2API_BASE_URL`). There is no hardcoded default host.

## Registry examples

### Admin: whole site

```yaml
  - id: sub2api-admin
    tool: sub2api
    mode: admin
    label: Sub2API · site
    baseUrl: http://127.0.0.1:18080
    email: admin@example.com
    passwordFile: ~/.config/sub2api/admin.password
```

### User: only this login

```yaml
  - id: sub2api-user
    tool: sub2api
    mode: user
    label: Sub2API · my usage
    baseUrl: http://127.0.0.1:18080
    email: user@example.com
    passwordFile: ~/.config/sub2api/user.password
```

Friends should only get `mode: user` and their own `passwordFile`.

### Other auth

```yaml
    jwtFile: ~/.config/sub2api/panel.jwt
    adminKeyFile: ~/.config/sub2api/admin.key
```

Priority: `adminKeyFile` / `AINDLE_SUB2API_ADMIN_KEY` → `jwtFile` / `AINDLE_SUB2API_JWT` → `email` + `passwordFile`. A successful password login caches a JWT under `~/.config/sub2api/.jwt-*.json` (`0600`).

## What appears on the screen

**Admin**

- One site-wide summary (account count, lifetime / today spend). If there is no quota bar, this is a text card, not a fake 0%.
- One card per upstream account (`anthropic · …`, `openai · …`). Official windows become 5h / 7d / Fable bars.

**User**

- One personal summary (lifetime / today spend, key count).
- Platform day / week / month USD caps are drawn only when the panel sets them.
- An individual key bar is drawn only when that key has `quota > 0`. `quota = 0` means unlimited — no fake bar.

If the tunnel drops, only Sub2API cards fail. Local Claude / Codex / Cursor / Grok collectors keep working.
