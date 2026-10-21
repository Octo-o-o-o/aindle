import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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


test('Oasis metadata denial prevents paint and curl receives credentials only through stdin', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'octo-oasis-auth-'));
  try {
    const source=fs.readFileSync(new URL('../../../kindle/oasis1/loop.sh',import.meta.url),'utf8');
    const helpers=source.slice(source.indexOf('projection_unavailable() {'),source.indexOf('\nradio_on() {'));
    const fetcher=source.slice(source.indexOf('fetch_and_paint() {'),source.indexOf('\nwhile [ ! -f "$STOP" ]'));
    const http=source.slice(source.indexOf('http_get() {'),source.indexOf('\n}',source.indexOf('http_get() {'))+2);
    const curl=path.join(dir,'curl');fs.writeFileSync(curl,'#!/bin/sh\nprintf "%s\n" "$@" > "$TRACE.args"\ncat > "$TRACE.stdin"\n',{mode:0o700});
    const script=`ROOT='${dir}'\nIMG=$ROOT/dash.png\nMETA=$ROOT/meta.json\nLOG=$ROOT/log\nTRACE=$ROOT/trace\nexport TRACE\nPATH='${dir}':$PATH\nFBINK=true\nFETCHING=$ROOT/fetching\nOCTOOOO_MODE=1\nPROJECTION_EXPIRES=0\nTOKEN=SYNTHETIC_TOKEN_123\nOCTOOOO_DEVICE_ID=fixture-device\nPAGE=0\nfailures=0\nclock=1000\nnow_s() { echo "$clock"; }\nin_screensaver() { return 0; }\npaint() { echo PAINTED >> "$TRACE"; }\nradio_on() { :; }\nend_fetch() { :; }\nwait_wifi() { return 0; }\ndash_url() { echo synthetic-png; }\nmeta_url() { echo synthetic-meta; }\nsleep() { :; }\n${helpers}\n${http}\nhttp_get https://fixture.invalid/dash.png "$IMG.tmp" 18 || exit 10\nhttp_get() { if [ "$1" = synthetic-png ]; then echo PNG > "$2"; printf 'X-Octoooo-Expires: 1029\r\n' > "$2.headers"; return 0; fi; return 22; }\n${fetcher}\nfetch_and_paint && exit 11\n[ ! -f "$IMG" ] && [ ! -f "$IMG.tmp" ] || exit 12\nexit 0\n`;
    const result=spawnSync('sh',['-c',script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    assert.equal(fs.existsSync(path.join(dir,'trace')),false);
    assert.doesNotMatch(fs.readFileSync(path.join(dir,'trace.args'),'utf8'),/SYNTHETIC_TOKEN_123|Bearer/);
    assert.match(fs.readFileSync(path.join(dir,'trace.stdin'),'utf8'),/Authorization: Bearer SYNTHETIC_TOKEN_123/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
