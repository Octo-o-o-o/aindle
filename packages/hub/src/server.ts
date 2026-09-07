import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMockIngest,
  snapshotToViewModel,
  validateIngest,
  type Snapshot,
} from '@aindle/core';
import { einkMeta, parseEinkBattery, parseEinkPage, renderEinkHtml } from './eink.js';
import { renderDashPng } from './png.js';
import { HubStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  host?: string;
  port?: number;
  token?: string;
  hubId?: string;
  hubLabel?: string;
  staleAfterMs?: number;
  seedMock?: boolean;
  publicDir?: string;
}

function defaultPublicDir(): string {
  const candidates = [
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, 'public'),
    path.join(__dirname, '..', '..', 'packages', 'hub', 'public'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'monitor.html'))) return dir;
  }
  return candidates[0]!;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(text);
}

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, { error: 'unauthorized', hint: 'pass ?token= or Authorization: Bearer' });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function checkAuth(req: http.IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const url = new URL(req.url ?? '/', 'http://local');
  const q = url.searchParams.get('token');
  if (q === token) return true;
  const auth = req.headers.authorization ?? '';
  if (auth === `Bearer ${token}`) return true;
  return false;
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  if (filePath.endsWith('.webmanifest')) return 'application/manifest+json';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function lanAddrs(): string[] {
  const found: string[] = [];
  try {
    for (const nets of Object.values(os.networkInterfaces())) {
      if (!nets) continue;
      for (const net of nets) {
        const family = String(net.family);
        if ((family === 'IPv4' || family === '4') && !net.internal) found.push(net.address);
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(found)];
}

export function createHubServer(opts: ServerOptions = {}) {
  const store = new HubStore({
    id: opts.hubId ?? 'hub',
    label: opts.hubLabel ?? 'Aindle Hub',
    staleAfterMs: opts.staleAfterMs,
  });

  if (opts.seedMock !== false) {
    store.ingest(buildMockIngest('mbp'));
  }

  const token = opts.token;
  const PUBLIC_DIR = opts.publicDir ?? defaultPublicDir();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    if (pathname === '/health') {
      json(res, 200, { ok: true, hosts: store.listHostIds() });
      return;
    }

    if (pathname === '/snapshot.json' && req.method === 'GET') {
      if (!checkAuth(req, token)) return unauthorized(res);
      const snap: Snapshot = store.snapshot();
      json(res, 200, snap);
      return;
    }

    if (pathname === '/view.json' && req.method === 'GET') {
      if (!checkAuth(req, token)) return unauthorized(res);
      json(res, 200, snapshotToViewModel(store.snapshot()));
      return;
    }

    if (pathname === '/eink.html' && req.method === 'GET') {
      if (!checkAuth(req, token)) return unauthorized(res);
      const page = parseEinkPage(url.searchParams.get('page'));
      const battery = parseEinkBattery(url.searchParams.get('batt') ?? url.searchParams.get('battery'));
      const lockScreen = url.searchParams.get('lock') === '1' || url.searchParams.get('kindle') === '1';
      const html = renderEinkHtml(snapshotToViewModel(store.snapshot()), page, { battery, lockScreen });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(html);
      return;
    }

    if (pathname === '/eink-meta.json' && req.method === 'GET') {
      if (!checkAuth(req, token)) return unauthorized(res);
      const page = parseEinkPage(url.searchParams.get('page'));
      json(res, 200, einkMeta(snapshotToViewModel(store.snapshot()), page));
      return;
    }

    if (pathname === '/dash.png' && req.method === 'GET') {
      if (!checkAuth(req, token)) return unauthorized(res);
      const page = parseEinkPage(url.searchParams.get('page'));
      const battery = parseEinkBattery(url.searchParams.get('batt') ?? url.searchParams.get('battery'));
      try {
        const buf = await renderDashPng(snapshotToViewModel(store.snapshot()), page, { battery });
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Aindle-Page': page,
          'X-Aindle-Size': '1072x1448',
        });
        res.end(buf);
      } catch (err) {
        json(res, 503, {
          error: 'png_failed',
          hint: String((err as Error).message ?? err),
        });
      }
      return;
    }

    if (pathname === '/api/ingest' && req.method === 'POST') {
      if (!checkAuth(req, token)) return unauthorized(res);
      try {
        const raw = await readBody(req);
        const report = validateIngest(JSON.parse(raw));
        store.ingest(report);
        json(res, 200, { ok: true, hostId: report.host.id });
      } catch (err) {
        json(res, 400, { error: String((err as Error).message ?? err) });
      }
      return;
    }

    let rel = pathname === '/' ? '/monitor.html' : pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      json(res, 404, { error: 'not found', path: rel });
      return;
    }
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });

  return { server, store };
}

export function startHub(opts: ServerOptions = {}) {
  const host = opts.host ?? '0.0.0.0';
  const port = opts.port ?? 8787;
  const { server } = createHubServer(opts);

  server.listen(port, host, () => {
    console.log('Aindle Hub listening on %s:%s', host, port);
    console.log('  health:        http://127.0.0.1:%s/health', port);
    console.log('  snapshot:      http://127.0.0.1:%s/snapshot.json', port);
    console.log('  monitor (UI):  http://127.0.0.1:%s/monitor.html?mode=panels', port);
    console.log('  eink HTML:     http://127.0.0.1:%s/eink.html?page=local', port);
    console.log('  dash PNG:      http://127.0.0.1:%s/dash.png?page=local  (needs Chrome/Chromium)', port);
    if (opts.token) console.log('  auth:          ?token=<hidden>');
    for (const ip of lanAddrs()) {
      console.log('  LAN eink:      http://%s:%s/eink.html?page=local', ip, port);
      console.log('  LAN PNG:       http://%s:%s/dash.png?page=local', ip, port);
      console.log('  LAN monitor:   http://%s:%s/monitor.html?device=oasis1&kindle=1', ip, port);
    }
  });

  return server;
}
