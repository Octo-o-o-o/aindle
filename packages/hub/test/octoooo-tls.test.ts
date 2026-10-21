import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request } from 'node:https';
import { mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { outputListener } from '../src/octoooo-tls.js';
test('output TLS is explicit, private, and serves only existing handler', async () => {
  const output = createServer((_req, res) => { res.writeHead(401); res.end('Device binding required'); });
  assert.equal(outputListener(output, {}).host, '127.0.0.1');
  assert.throws(() => outputListener(output, { AINDLE_OCTOOOO_TLS_ENABLED: 'true' }));
  const dir = mkdtempSync(join(tmpdir(), 'aindle-tls-fixture-'));
  const key = join(dir, 'key.pem'), cert = join(dir, 'cert.pem');
  let close: (() => Promise<void>) | undefined;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const env = { AINDLE_OCTOOOO_TLS_ENABLED: 'true', AINDLE_OCTOOOO_TLS_HOST: '127.0.0.1', AINDLE_OCTOOOO_TLS_KEY_FILE: key, AINDLE_OCTOOOO_TLS_CERT_FILE: cert };
    chmodSync(key, 0o644); assert.throws(() => outputListener(output, env)); chmodSync(key, 0o600); chmodSync(cert, 0o600);
    const { server, host } = outputListener(output, env);
    await new Promise<void>(resolve => server.listen(0, host, resolve));
    close = () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const port = (server.address() as AddressInfo).port;
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`https://127.0.0.1:${port}/projection.json`, { rejectUnauthorized: false }, res => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
      req.on('error', reject); req.end();
    }); assert.equal(status, 401);
  } finally { await close?.(); rmSync(dir, { recursive: true, force: true }); }
});
