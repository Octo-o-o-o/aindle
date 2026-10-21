import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { OctooooProjectionClient, renderOctooooEink, weakCurrency, weakProvider, weakUsageMetric, weakWindow, type OctooooBinding, type OctooooSnapshot } from './octoooo-output.js';
import { htmlToPng } from './png.js';
interface Session { binding: OctooooBinding; expires: number; }
interface OutputOptions { core: string; allowLoopback?: boolean; secureCookies?: boolean; transport?: typeof fetch; renderPng?: typeof htmlToPng; }
const LOGIN = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Octoooo 只读屏配对</title><h1>连接已批准的只读设备</h1><form method="post" action="/session"><label>设备 ID <input name="deviceId" required></label><br><label>设备凭据 <input name="token" type="password" autocomplete="off" required></label><br><button>连接</button></form><p>使用独立设备凭据。不要填写 owner 或来源凭据。</p>';
export function createOctooooOutputServer(opts: OutputOptions): http.Server {
  const client = new OctooooProjectionClient(opts.core, opts.transport, opts.allowLoopback);
  const sessions = new Map<string, Session>();
  const snapshots = new Map<string, { snapshot: OctooooSnapshot; expires: number }>();
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of snapshots) if (value.expires <= now) snapshots.delete(key);
    let cacheKey: string | undefined;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(LOGIN); return; }
      if (req.method === 'POST' && url.pathname === '/session') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new Error('Cross-origin login rejected');
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Form too large'); }
        const form = new URLSearchParams(body); const binding = { deviceId: form.get('deviceId') ?? '', token: form.get('token') ?? '' };
        const snapshot = await client.snapshot(binding); await client.confirm(binding, snapshot);
        if (sessions.size >= 128) throw new Error('Session limit');
        const sid = randomBytes(32).toString('hex'); sessions.set(sid, { binding, expires: now + 15 * 60000 });
        res.setHeader('Set-Cookie', `octoooo_session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${opts.secureCookies !== false ? '; Secure' : ''}`);
        res.writeHead(303, { Location: '/eink.html' }); res.end(); return;
      }
      if (req.method !== 'GET' || !['/eink.html', '/dash.png', '/projection.json', '/eink-meta.json'].includes(url.pathname)) { res.writeHead(404); res.end('Not found'); return; }
      const sid = /(?:^|;\s*)octoooo_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      const header = req.headers.authorization;
      const binding = header?.startsWith('Bearer ') ? { deviceId: String(req.headers['x-octo-device-id'] ?? ''), token: header.slice(7) } : sid ? sessions.get(sid)?.binding : undefined;
      if (!binding) { res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(LOGIN); return; }
      const page = Number(url.searchParams.get('page') ?? 0);
      if (!Number.isSafeInteger(page) || page < 0) throw new Error('Invalid page');
      cacheKey = createHash('sha256').update(JSON.stringify([binding.deviceId, binding.token])).digest('hex');
      let snapshot: OctooooSnapshot;
      if (page === 0 && url.pathname !== '/eink-meta.json') { snapshot = await client.snapshot(binding); snapshots.set(cacheKey, { snapshot, expires: now + 60000 }); }
      else { const stored = snapshots.get(cacheKey); if (!stored) throw new Error('Snapshot expired; start at page zero'); snapshot = stored.snapshot; }
      await client.confirm(binding, snapshot);
      if (url.pathname === '/eink-meta.json') {
        if (Date.now() >= Date.parse(snapshot.fetchedAt) + 30000) throw new Error('PNG lease expired');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ pages: Math.max(1, Math.ceil(snapshot.items.length / 6)), available: true })); return;
      }
      if (url.pathname === '/projection.json') {
        // Compatibility surfaces receive the same restricted data, never Aindle collector input.
        const rows = snapshot.items.map((item) => ({ kind: item.kind, id: item.id,
          provider: weakProvider(item.value.provider), window: weakWindow(item.value.window),
          stale: item.value.stale === true || item.value.availability === 'stale',
          title: item.kind === 'usage' ? '订阅用量' : item.kind === 'source' ? '来源观察' : '有事项可查看',
          status: ['running', 'idle', 'needs_attention', 'completed', 'failed', 'unknown', 'unread', 'read', 'dismissed'].includes(String(item.value.status)) ? item.value.status : 'unknown',
          metric: item.kind === 'usage' ? weakUsageMetric(item.value.metric) : null,
          currency: item.kind === 'usage' ? weakCurrency(item.value.currency) : null,
          value: item.kind === 'usage' && typeof item.value.value === 'number' && Number.isFinite(item.value.value) && item.value.value >= 0 ? item.value.value : null,
          observed_at: typeof (item.value.observed_at ?? item.value.source_observed_at) === 'string' && Number.isFinite(Date.parse(String(item.value.observed_at ?? item.value.source_observed_at))) ? new Date(String(item.value.observed_at ?? item.value.source_observed_at)).toISOString() : null }));
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ schema: 'octoooo.weak.v1', complete: true, total: rows.length, rows, generated_at: snapshot.fetchedAt, valid_until: new Date(Date.parse(snapshot.fetchedAt) + 60000).toISOString() })); return;
      }
      const html = renderOctooooEink(snapshot, page, 1072, 1448, url.pathname === '/dash.png' ? 30000 : 60000);
      const body = url.pathname === '/dash.png' ? await (opts.renderPng ?? htmlToPng)(html, 1072, 1448, true) : html;
      await client.confirm(binding, snapshot);
      if (url.pathname === '/dash.png') {
        const expires = Math.floor((Date.parse(snapshot.fetchedAt) + 30000) / 1000);
        if (Date.now() >= expires * 1000) throw new Error('PNG lease expired during rendering');
        res.setHeader('X-Octoooo-Expires', String(expires));
      }
      res.setHeader('Content-Type', url.pathname === '/dash.png' ? 'image/png' : 'text/html; charset=utf-8'); res.end(body);
    } catch (_) {
      if (cacheKey) snapshots.delete(cacheKey);
      res.writeHead(409, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><h1>内容不可用</h1><p>授权或快照已变化。旧画面不代表当前授权。请从第一页重新同步；若仍失败请重新配对。</p><a href="/eink.html">刷新第一页</a>');
    }
  });
}
