import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOctoooo, renderOctoooo } from '../src/octoooo.js';
test('projection clears expired/revoked files, masks content, and separates static PNG', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-display-test-')); const file = path.join(dir, 'frame.json');
  try {
    const input = { schema: 'octoooo.display.v1', generated_at: 1000, expires_at: 31000, available: true, synthetic: true, generation: 'g', pending: 17, running: 1, completed: 2, body: 'NESTED_SECRET', usage: [{ provider: 'SECRET', account: '<script>SECRET</script>', window: '/SECRET', value: 132, stale: true }, { provider: 'codex', account: '账号 2', window: 'weekly', value: null, stale: true }] };
    fs.writeFileSync(file, JSON.stringify(input));
    const frame = readOctoooo(file, 2000); assert.equal(frame.pending, 17); assert.equal(frame.usage[0]?.value, 132);
    const html = renderOctoooo(frame); assert.doesNotMatch(html, /SECRET/); assert.match(html, /132%/); assert.match(html, /未知/); assert.match(html, /前台网页/);
    assert.match(renderOctoooo(frame, 0, true), /静态画面/); assert.doesNotMatch(renderOctoooo(frame, 0, true), /<script>/);
    assert.equal(readOctoooo(file, 31001).available, false);
    fs.writeFileSync(file, JSON.stringify({...input, available: false})); assert.equal(readOctoooo(file, 2000).usage.length, 0);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('projection credential cannot access the source hub or control routes', async () => {
  const { createHubServer } = await import('../src/server.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-http-test-'));
  const file = path.join(dir, 'frame.json');
  const token = 'synthetic-hub-control-token-0123456789';
  const projectionToken = 'synthetic-projection-only-token-0123456789';
  const now = Date.now();
  fs.writeFileSync(file, JSON.stringify({schema:'octoooo.display.v1',generated_at:now,expires_at:now+30000,available:true,synthetic:true,generation:'g',pending:17,running:3,completed:2,usage:[]}));
  const { server } = createHubServer({token,octooooProjectionFile:file,octooooProjectionToken:projectionToken});
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    assert.equal((await fetch(base+'/octoooo.html')).status,401);
    assert.equal((await fetch(base+'/octoooo.html',{headers:{Authorization:`Bearer ${token}`}})).status,401);
    const response=await fetch(base+'/octoooo.html',{headers:{Authorization:`Bearer ${projectionToken}`}});
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); assert.match(await response.text(),/17 待查看/);
    assert.equal((await fetch(base+'/snapshot.json',{headers:{Authorization:`Bearer ${projectionToken}`}})).status,401);
    assert.equal((await fetch(base+'/api/ingest',{method:'POST',headers:{Authorization:`Bearer ${projectionToken}`},body:'{}'})).status,401);
    fs.writeFileSync(file,JSON.stringify({schema:'octoooo.display.v1',available:false}));
    const revoked=await fetch(base+'/octoooo.html',{headers:{Authorization:`Bearer ${projectionToken}`}});
    assert.match(await revoked.text(),/授权缓存已清除/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); fs.rmSync(dir,{recursive:true,force:true}); }
});

test('Oasis projection page keys wrap across all windows without touching reading controls', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-oasis-keys-'));
  try {
    const script = fs.readFileSync(new URL('../../../kindle/oasis1/page.sh', import.meta.url), 'utf8').replace('ROOT=/mnt/us/aindle', `ROOT='${dir}'`);
    const file = path.join(dir,'page.sh'); fs.writeFileSync(file,script);
    fs.writeFileSync(path.join(dir,'hub.env'),'OCTOOOO_MODE=1\n');
    fs.writeFileSync(path.join(dir,'page'),'0\n'); fs.writeFileSync(path.join(dir,'meta.json'),JSON.stringify({pages:13,available:true}));
    for (let page=1;page<=13;page++) {
      const result=spawnSync('sh',[file,'next']); assert.equal(result.status,0);
      assert.equal(fs.readFileSync(path.join(dir,'page'),'utf8').trim(),String(page%13));
    }
    assert.equal(spawnSync('sh',[file,'prev']).status,0); assert.equal(fs.readFileSync(path.join(dir,'page'),'utf8').trim(),'12');
    assert.equal(fs.existsSync(path.join(dir,'kick')),true);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('Oasis never repaints projection cache and clears it on fetch failure or expired lease', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octo-oasis-lease-'));
  try {
    const source = fs.readFileSync(new URL('../../../kindle/oasis1/loop.sh', import.meta.url), 'utf8');
    const helpers = source.slice(source.indexOf('projection_unavailable() {'), source.indexOf('\nradio_on() {'));
    const fetcher = source.slice(source.indexOf('fetch_and_paint() {'), source.indexOf('\nwhile [ ! -f "$STOP" ]'));
    const fake = path.join(dir,'fbink'); fs.writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$*" >> "$TRACE"\n',{mode:0o700});
    const script = `ROOT='${dir}'\nIMG=$ROOT/dash.png\nMETA=$ROOT/meta.json\nLOG=$ROOT/log\nTRACE=$ROOT/trace\nexport TRACE\nFBINK='${fake}'\nFETCHING=$ROOT/fetching\nOCTOOOO_MODE=1\nPROJECTION_EXPIRES=0\nPAGE=0\nfailures=0\nclock=1000\nnow_s() { echo "$clock"; }\nin_screensaver() { return 0; }\npaint() { echo REPAINTED >> "$TRACE"; }\nradio_on() { :; }\nend_fetch() { :; }\nwait_wifi() { return 0; }\nhttp_get() { return 1; }\ndash_url() { echo synthetic; }\nsleep() { :; }\n${helpers}\n${fetcher}\necho old > "$IMG"\npaint_cache && exit 10\n[ ! -f "$IMG" ] || exit 11\nprintf 'X-Octoooo-Expires: 1029\\r\\n' > "$IMG.tmp.headers"\nprojection_read_lease || exit 12\nclock=1030\nprojection_lease_current && exit 13\nclock=1000\nPROJECTION_EXPIRES=1060\nprojection_lease_current && exit 14\necho old > "$IMG"\nfetch_and_paint && exit 15\n[ ! -f "$IMG" ] || exit 16\nexit 0\n`;
    const result = spawnSync('sh',['-c',script],{encoding:'utf8'}); assert.equal(result.status,0,result.stderr);
    const trace=fs.readFileSync(path.join(dir,'trace'),'utf8'); assert.doesNotMatch(trace,/REPAINTED/); assert.match(trace,/Octoooo unavailable/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
