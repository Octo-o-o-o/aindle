import test from 'node:test';
import assert from 'node:assert/strict';
import { OctooooProjectionClient, renderOctooooEink } from '../src/octoooo-output.js';
import { createOctooooOutputServer } from '../src/octoooo-server.js';
const binding = { deviceId: 'eink-fixture', token: 'fixture-only-device-token' };
function fixture(stale = false) {
  let revoked = false; let corrupted = false;
  const items = Array.from({ length: 51 }, (_, i) => ({ kind: i === 0 ? 'usage' : 'activity', id: String(i), value: { title: '<secret-private-title>', body: 'private body', value: 132, stale, observed_at: new Date().toISOString() } }));
  const transport = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${binding.token}`);
    if (revoked) return new Response('{}', { status: 403 });
    const url = new URL(String(input));
    if (url.pathname.endsWith('/delta')) return Response.json({ schema_version: '1.2.0', authorization: 'grant', changes: [], has_more: false });
    const offset = url.searchParams.has('page') ? 50 : 0;
    return Response.json({ schema_version: '1.2.0', snapshot_id: 'snapshot', authorization: corrupted && offset ? 'different' : 'grant', watermark: 8, offset, total: 51, items: items.slice(offset, offset + 50), complete: offset === 50, next_page: offset ? null : 'next', cursor: offset ? 'cursor' : null, expires_at: new Date(Date.now() + 60000).toISOString() });
  }) as typeof fetch;
  return { transport, revoke() { revoked = true; }, corrupt() { corrupted = true; } };
}
test('all pages, generic rendering, overflow percent, changed grant rejected', async () => {
  const f = fixture(); const client = new OctooooProjectionClient('https://fixture.invalid', f.transport);
  const snapshot = await client.snapshot(binding); assert.equal(snapshot.items.length, 51);
  const html = renderOctooooEink(snapshot, 0); assert.match(html, /132%/); assert.match(html, /第 1\/9 页/); assert.doesNotMatch(html, /secret-private-title|private body/);
  assert.match(renderOctooooEink(snapshot, 8), /第 9\/9 页/); assert.throws(() => renderOctooooEink(snapshot, 9));
  f.corrupt(); await assert.rejects(client.snapshot(binding)); f.revoke(); await assert.rejects(client.confirm(binding, snapshot));
});
test('PNG late revoke cannot return already rendered content; route requires device auth', async () => {
  const f = fixture(); const server = createOctooooOutputServer({ core: 'https://fixture.invalid', transport: f.transport,
    renderPng: async () => { f.revoke(); return Buffer.from('private-render-sentinel'); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo; const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/dash.png')).status, 401);
    const response = await fetch(base + '/dash.png', { headers: { Authorization: `Bearer ${binding.token}`, 'x-octo-device-id': binding.deviceId } });
    assert.equal(response.status, 409); assert.doesNotMatch(await response.text(), /private-render-sentinel/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('Oasis PNG lease and page metadata share the authorized snapshot and expire during slow rendering', async () => {
  const f = fixture(); let slow = false; const clock = Date.now;
  const server = createOctooooOutputServer({ core: 'https://fixture.invalid', transport: f.transport,
    renderPng: async () => { if (slow) Date.now = () => clock() + 31000; return Buffer.from('synthetic-png'); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${binding.token}`, 'x-octo-device-id': binding.deviceId };
  try {
    assert.equal((await fetch(base + '/eink-meta.json', {headers})).status, 409);
    const png = await fetch(base + '/dash.png', {headers}); assert.equal(png.status, 200);
    const expires = Number(png.headers.get('x-octoooo-expires'));
    assert.ok(expires > clock()/1000 && expires <= clock()/1000 + 30);
    assert.deepEqual(await (await fetch(base + '/eink-meta.json', {headers})).json(), {pages:9, available:true});
    const next = await fetch(base + '/dash.png?page=8', {headers});
    assert.equal(next.status, 200); assert.equal(next.headers.get('x-octoooo-expires'), String(expires));
    slow = true;
    const expired = await fetch(base + '/dash.png', {headers});
    assert.equal(expired.status, 409); assert.doesNotMatch(await expired.text(), /synthetic-png/);
  } finally { Date.now = clock; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('usage metrics render per unit: tokens/amounts never show as percent', async () => {
  const f = fixture();
  const items = [
    { kind: 'usage', id: 'p', value: { metric: 'used_percent', value: 42, observed_at: new Date().toISOString(), provider: 'codex', window: '5h' } },
    { kind: 'usage', id: 't', value: { metric: 'used_tokens', value: 15300, observed_at: new Date().toISOString(), provider: 'codex', window: '24h' } },
    { kind: 'usage', id: 's', value: { metric: 'spent_amount', value: 3.5, currency: 'USD', observed_at: new Date().toISOString(), provider: 'codex', window: '24h' } },
    { kind: 'usage', id: 'b', value: { metric: 'balance_amount', value: 12.25, currency: 'CNY', observed_at: new Date().toISOString(), provider: 'codex', window: '24h' } },
    { kind: 'usage', id: 'u', value: { metric: 'used_bytes', value: 7, observed_at: new Date().toISOString(), provider: 'codex', window: '5h' } },
    { kind: 'usage', id: 'n', value: { metric: 'spent_amount', value: 9, currency: 'usd', observed_at: new Date().toISOString(), provider: 'codex', window: '24h' } },
  ];
  const snapshot = { items, authorization: 'g', cursor: 'c', fetchedAt: new Date().toISOString() };
  const html = renderOctooooEink(snapshot, 0);
  assert.match(html, /42%/); assert.match(html, />15300</); assert.match(html, /USD 3\.50/); assert.match(html, /CNY 12\.25/);
  assert.match(html, />7</); assert.doesNotMatch(html, /15300%|3\.5%|usd 9/);
  const server = createOctooooOutputServer({ core: 'https://fixture.invalid', transport: f.transport });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    const res = await fetch(base + '/projection.json', { headers: { Authorization: `Bearer ${binding.token}`, 'x-octo-device-id': binding.deviceId } });
    assert.equal(res.status, 200);
    const projection = await res.json() as { rows: Array<{ kind: string; metric: string | null; currency: string | null }> };
    const usageRow = projection.rows.find((row) => row.kind === 'usage');
    assert.equal(usageRow?.metric, 'used_percent'); assert.equal(usageRow?.currency, null);
  } finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
});

test('reset-stale survives HTML, PNG and weak projection; visible PNG expiry matches header', async () => {
  const f=fixture(true);let rendered='';
  const server=createOctooooOutputServer({core:'https://fixture.invalid',transport:f.transport,renderPng:async html=>{rendered=html;return Buffer.from('synthetic');}});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const headers={Authorization:`Bearer ${binding.token}`,'x-octo-device-id':binding.deviceId};
  try {
    const html=await (await fetch(base+'/eink.html',{headers})).text();assert.match(html,/旧采样 · 非实时/);
    const png=await fetch(base+'/dash.png',{headers});assert.equal(png.status,200);assert.match(rendered,/旧采样 · 非实时/);
    assert.ok(rendered.includes(new Date(Number(png.headers.get('x-octoooo-expires'))*1000).toISOString()));
    const projection=await (await fetch(base+'/projection.json',{headers})).json() as {rows:Array<{kind:string;stale:boolean}>};
    assert.equal(projection.rows.find(row=>row.kind==='usage')?.stale,true);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
