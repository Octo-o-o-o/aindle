import type { ViewModel } from '@aindle/core';
import { agentBrand, agentIcon } from './eink-icons.js';

export const OASIS1 = { w: 1072, h: 1448 } as const;
export const EINK_PAGES = ['local', 'now', 'relay'] as const;
export type EinkPage = (typeof EINK_PAGES)[number];

const INK = '#111111';
const PAPER = '#F4EFE4';
const PLAN_NAMES: Record<string, string> = {
  LEVEL_INTERMEDIATE: '进阶',
  LEVEL_BASIC: '基础',
  LEVEL_FREE: 'Free',
  LEVEL_PRO: 'Pro',
  LEVEL_PREMIUM: 'Premium',
  TYPE_PURCHASE: '订阅',
  TYPE_PRO: 'Pro',
  TYPE_FREE: 'Free',
  TYPE_ENTERPRISE: '企业',
  TYPE_TEAM: 'Team',
};

type Win = { key: string; pct: number; reset: string };
type Run = ViewModel['now'][number];
type Sub = {
  id: string;
  tool: string;
  label: string;
  source: string;
  scope?: string;
  kind?: string;
  none?: number;
  error?: number;
  windows?: Win[];
};

function asSubs(vm: ViewModel): Sub[] {
  return vm.subs as Sub[];
}

export type EinkOpts = { battery?: number; lockScreen?: boolean };

export function parseEinkPage(raw: string | null | undefined): EinkPage {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'now' || v === 'tasks' || v === '1') return 'now';
  if (v === 'relay' || v === 'sub2api' || v === '2') return 'relay';
  return 'local';
}

export function parseEinkBattery(raw: string | null | undefined): number | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

export function einkMeta(vm: ViewModel, page: EinkPage) {
  const busy = (vm.now ?? []).some((r) => r.tag === 'ACTIVE' || r.tag === 'WAIT');
  return {
    device: 'oasis1',
    width: OASIS1.w,
    height: OASIS1.h,
    page,
    pages: EINK_PAGES,
    intervalSec: busy ? 300 : 600,
    fullEvery: busy ? 3 : 2,
    generatedAt: vm.generatedAt,
    busy: busy ? 1 : 0,
  };
}

export function renderEinkHtml(vm: ViewModel, page: EinkPage, opts?: EinkOpts): string {
  const body =
    page === 'now' ? renderNow(vm) : page === 'relay' ? renderRelay(vm) : renderLocal(vm);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Aindle · ${esc(pageTitle(page))}</title>
<style>
  html, body { width:${OASIS1.w}px; height:${OASIS1.h}px; margin:0; padding:0; overflow:hidden; background:${PAPER}; color:${INK}; }
  body { font-family:"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",Helvetica,Arial,sans-serif; -webkit-font-smoothing:none; font-weight:700; }
  * { box-sizing:border-box; }
  .wrap { width:${OASIS1.w}px; height:${OASIS1.h}px; position:relative; background:${PAPER}; color:${INK}; overflow:hidden; }
  .pad { padding:30px 30px 54px; }
  .mast { display:flex; justify-content:space-between; align-items:center; }
  .when { display:flex; align-items:baseline; gap:12px; }
  .date { font-size:48px; font-weight:700; letter-spacing:2px; }
  .side { display:flex; align-items:center; justify-content:flex-end; gap:16px; }
  .brand { font-size:20px; font-weight:700; letter-spacing:3px; text-align:right; }
  .batt { display:flex; align-items:center; justify-content:flex-end; gap:8px; font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; }
  .batt-can { width:40px; height:16px; border:2px solid ${INK}; border-radius:3px; overflow:hidden; position:relative; }
  .batt-can:after { content:""; position:absolute; right:-5px; top:4px; width:3px; height:8px; background:${INK}; }
  .batt-fill { display:block; height:100%; background:${INK}; }
  .status { font-size:22px; font-weight:700; margin:0; }
  .hair { height:1px; background:${INK}; margin:14px 0; }
  .sec { font-size:24px; font-weight:700; letter-spacing:2px; margin:0 0 4px; }
  .sec + .block { margin-top:0; }
  .block + .sec { margin-top:26px; }
  .qrow { display:flex; align-items:center; min-height:56px; padding:14px 0; border-bottom:1px solid ${INK}; }
  .qrow:last-child { border-bottom:0; }
  .qname { width:188px; flex-shrink:0; padding-right:16px; }
  .qhead { display:flex; align-items:center; gap:10px; }
  .qicon { width:28px; height:28px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .qtitle { font-size:32px; font-weight:700; line-height:1.15; }
  .aicon { display:block; flex-shrink:0; overflow:visible; }
  .qdiv { width:1px; align-self:stretch; background:${INK}; margin-right:16px; flex-shrink:0; }
  .qmeters { flex:1; display:flex; flex-direction:row; align-items:center; gap:22px; min-width:0; }
  .mrow { flex:1; min-width:0; display:flex; align-items:center; gap:8px; }
  .mkey { width:64px; flex-shrink:0; font-size:22px; font-weight:700; }
  .mbar { flex:1; height:16px; border:2px solid ${INK}; border-radius:999px; overflow:hidden; background:#fff; }
  .mfill { height:100%; background:${INK}; }
  .mfill.soft { background:repeating-linear-gradient(-45deg, ${INK} 0 3px, #fff 3px 7px); }
  .mpct { width:72px; flex-shrink:0; text-align:right; font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; }
  .trow { display:flex; align-items:center; padding:14px 0; border-bottom:1px solid ${INK}; }
  .trow:last-child { border-bottom:0; }
  .ticon { width:28px; height:28px; flex-shrink:0; display:flex; align-items:center; justify-content:flex-start; margin-right:10px; }
  .ttitle { flex:1; font-size:30px; font-weight:700; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tmeta { display:flex; align-items:baseline; flex-shrink:0; gap:14px; padding-left:16px; }
  .telapsed { width:7.5em; text-align:right; font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .tsource { width:8em; text-align:right; font-size:22px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .empty { font-size:28px; font-weight:700; padding:18px 0; }
  .foot { position:absolute; left:0; right:0; bottom:0; height:48px; border-top:1px solid ${INK}; display:flex; align-items:center; justify-content:space-between; padding:0 30px; font-size:20px; font-weight:700; }
</style>
</head>
<body>
<div class="wrap">
  <div class="pad">
    ${renderHeader(vm, page, opts)}
    ${body}
  </div>
  ${renderFooter(vm, page, opts)}
</div>
</body>
</html>`;
}

function pageTitle(page: EinkPage): string {
  if (page === 'now') return '进行中';
  if (page === 'relay') return '中转';
  return '本机';
}

function pageIndex(page: EinkPage): number {
  return EINK_PAGES.indexOf(page) + 1;
}

function renderHeader(vm: ViewModel, page: EinkPage, opts?: EinkOpts): string {
  const when = splitDate(vm.date);
  return `
    <div class="mast">
      <div class="when">
        <div class="date">${esc(when.day)}</div>
        ${when.week ? `<div class="date">${esc(when.week)}</div>` : ''}
      </div>
      <div class="side">
        <div class="brand">AINDLE · ${esc(pageTitle(page))}</div>
        ${batteryMark(opts?.battery)}
      </div>
    </div>
    <div class="hair"></div>`;
}

function batteryMark(n?: number): string {
  if (n == null) return '';
  const w = Math.max(6, Math.min(100, n));
  return `<div class="batt"><span class="batt-can"><span class="batt-fill" style="width:${w}%"></span></span><span>${n}%</span></div>`;
}

function renderFooter(vm: ViewModel, page: EinkPage, opts?: EinkOpts): string {
  const hint =
    page === 'local'
      ? '翻页键看任务 / 中转'
      : page === 'now'
        ? '翻页键看本机 / 中转'
        : '翻页键看本机 / 任务';
  const left = opts?.lockScreen
    ? ''
    : `${pageIndex(page)}/3 · ${esc(pageTitle(page))} · ${esc(hint)}`;
  const right = [shortStamp(vm), headerStatus(vm)].filter(Boolean).join('  ·  ');
  return `<div class="foot"><div>${left}</div><div>${esc(right)}</div></div>`;
}

function renderLocal(vm: ViewModel): string {
  const quotas = localSubs(vm);
  const live = vm.now ?? [];
  const tasks = live;
  const done = (vm.recent ?? []).slice(0, 3);
  const rows = quotas.length
    ? `<div class="block">${quotas.map((s) => quotaRow(s)).join('')}</div>`
    : `<div class="empty">还没有本机限额。</div>`;
  const taskBlock = tasks.length
    ? `<div class="block">${tasks.map((r) => runRow(r)).join('')}</div>`
    : `<div class="empty">这一小时没有进行中的会话。</div>`;
  const doneBlock = done.length
    ? `<div class="sec">已完成</div><div class="block">${done.map((r) => runRow(r)).join('')}</div>`
    : '';
  return `
    ${rows}
    <div class="sec">${esc(nowCountLabel(vm))}</div>
    ${taskBlock}
    ${doneBlock}`;
}

function renderNow(vm: ViewModel): string {
  const live = vm.now ?? [];
  const recent = vm.recent ?? [];
  const liveBlock = live.length
    ? `<div class="block">${live.map((r) => runRow(r)).join('')}</div>`
    : `<div class="empty">现在没有进行中或刚停下来的会话。</div>`;
  const shownRecent = recent.slice(0, 3);
  const recentBlock = shownRecent.length
    ? `<div class="block">${shownRecent.map((r) => runRow(r)).join('')}</div>`
    : '';
  return `
    <div class="sec">${esc(nowCountLabel(vm))}</div>
    ${liveBlock}
    ${recentBlock ? `<div class="sec">刚结束 ${recent.length}</div>${recentBlock}` : ''}`;
}

function renderRelay(vm: ViewModel): string {
  const site = asSubs(vm).find((s) => s.source === 'relay' && s.kind === 'site');
  const accounts = asSubs(vm)
    .filter((s) => s.source === 'relay' && s.scope === 'admin' && s.kind === 'account' && !s.none && (s.windows?.length ?? 0) > 0)
    .sort((a, b) => maxPct(b) - maxPct(a))
    .filter((s) => maxPct(s) >= 5)
    .slice(0, 6);
  const people = asSubs(vm)
    .filter((s) => s.source === 'relay' && s.scope === 'people')
    .filter((s) => /今日 \$[1-9]|今日 \$\d+\.\d*[1-9]/.test(s.label ?? ''))
    .slice(0, 3);
  const mine = asSubs(vm).find((s) => s.source === 'relay' && s.scope === 'user' && s.kind === 'member');

  const siteBox = site
    ? `<div class="empty" style="padding:10px 0;"><span style="font-size:18px;">全站</span><br><span class="qtitle">${esc(clip(cardSub(site), 32))}</span></div>`
    : `<div class="empty">还没有中转全站数据。</div>`;

  const peopleLine = people.length
    ? `<div class="status" style="margin:0 0 12px;">今日活跃：${people
        .map((p) => esc(`${prettyTool(p.tool)} ${todaySpend(p.label)}`))
        .join(' · ')}</div>`
    : '';

  const mineLine = mine
    ? `<div class="status" style="margin:0 0 12px;">我的 · ${esc(clip(cardSub(mine), 36))}</div>`
    : '';

  const acct = accounts.length
    ? `<div class="block">${accounts.map((s) => quotaRow(s)).join('')}</div>`
    : `<div class="empty">上游账号还没有读数。</div>`;

  return `
    ${siteBox}
    ${peopleLine}
    ${mineLine}
    <div class="sec">上游 ${accounts.length}</div>
    ${acct}`;
}

function splitDate(raw: string): { day: string; week: string } {
  const t = String(raw ?? '').replace(/\s+/g, '').trim();
  const m = t.match(/^(.*?)([周星期][一二三四五六日天])$/);
  if (m?.[1] && m[2]) return { day: m[1], week: m[2] };
  return { day: String(raw ?? '').trim(), week: '' };
}

function headerStatus(vm: ViewModel): string {
  const hosts = vm.hosts ?? [];
  const host = hosts[0];
  const bits = [vm.hub];
  if (host) {
    bits.push(`${clip(host.name, 14)} ${host.ok ? '在线' : '陈旧'}`, host.seen);
  } else {
    bits.push('还没有主机上报');
  }
  return bits.filter(Boolean).join('  ·  ');
}

function quotaRow(sub: Sub): string {
  const wins = pickWindows(sub.windows ?? []);
  const title = quotaSourceName(sub.tool);
  const meters = wins.length
    ? wins.map((w) => quotaMeter(w)).join('')
    : `<div class="empty" style="padding:0;">${sub.error ? '暂时读不到' : '还没有读数'}</div>`;
  return `
    <div class="qrow">
      <div class="qname">
        <div class="qhead">
          <div class="qicon">${agentIcon(sub.tool, 28)}</div>
          <div class="qtitle">${esc(title)}</div>
        </div>
      </div>
      <div class="qdiv"></div>
      <div class="qmeters">${meters}</div>
    </div>`;
}

function quotaMeter(w: Win): string {
  const pct = clampPct(w.pct);
  const fillClass = pct >= 90 ? 'mfill' : 'mfill soft';
  return `
    <div class="mrow">
      <div class="mkey">${esc(prettyWinKey(w.key))}</div>
      <div class="mbar"><div class="${fillClass}" style="width:${pct}%"></div></div>
      <div class="mpct">${pct}%</div>
    </div>`;
}

function nowCountLabel(vm: ViewModel): string {
  const listed = (vm.now ?? []).length;
  const main = Number.isFinite(vm.nowMain) ? vm.nowMain : listed;
  const total = Number.isFinite(vm.nowTotal) ? Math.max(vm.nowTotal, main) : main;
  return `进行中 ${listed} / ${total}`;
}

function runProject(run: Run): string {
  const folder = String(run.folder ?? '').trim();
  if (!folder || folder === 'No Folder') return '—';
  return folder;
}

function runWhen(run: Run): string {
  const done = run.tag === 'DONE' || run.tag === 'FAIL';
  if (done) return run.ended || '—';
  return run.elapsed || '0秒前';
}

function runRow(run: Run): string {
  return `
    <div class="trow">
      <div class="ticon">${agentIcon(run.tool, 24)}</div>
      <div class="ttitle">${esc(run.title)}</div>
      <div class="tmeta">
        <div class="telapsed">${esc(runWhen(run))}</div>
        <div class="tsource">${esc(runProject(run))}</div>
      </div>
    </div>`;
}

function localSubs(vm: ViewModel): Sub[] {
  return asSubs(vm).filter((s) => {
    if (s.source !== 'local') return false;
    if (s.error) return true;
    if (s.none) return false;
    return (s.windows?.length ?? 0) > 0;
  });
}

function prettyWinKey(key: string): string {
  if (/^api$/i.test(key)) return '三方';
  if (/^(auto|自由)$/i.test(key)) return '自有';
  return key;
}

function windowLane(key: string): 'burst' | 'free' | 'week' | 'cycle' | 'other' {
  const k = key.toLowerCase();
  if (/fable|opus|sonnet|5h|三方|api|session/.test(k)) return 'burst';
  if (/自由|自有|auto/.test(k)) return 'free';
  if (/7d|本周|week/.test(k)) return 'week';
  if (/账期|月|billing|cycle/.test(k)) return 'cycle';
  return 'other';
}

function bestInLane(windows: Win[], lane: ReturnType<typeof windowLane>): Win | undefined {
  return windows
    .filter((w) => windowLane(w.key) === lane)
    .sort((a, b) => b.pct - a.pct || a.key.localeCompare(b.key))[0];
}

export function pickWindows(windows: Win[]): Win[] {
  if (windows.length <= 1) return windows;
  const unique: Win[] = [];
  const seen = new Set<string>();
  for (const w of windows) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    unique.push(w);
  }
  const burst = bestInLane(unique, 'burst');
  const free = bestInLane(unique, 'free');
  const week = bestInLane(unique, 'week');
  const cycle = bestInLane(unique, 'cycle');
  if (burst && free) return [burst, free];
  if (burst && week) return [burst, week];
  if (free && week) return [free, week];
  if (burst && cycle) return [burst, cycle];
  if (week && cycle) return [week, cycle];
  return [...unique].sort((a, b) => b.pct - a.pct).slice(0, 2);
}

function maxPct(sub: Sub): number {
  return Math.max(0, ...(sub.windows ?? []).map((w) => w.pct));
}

function clampPct(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 0 && n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

export function prettyTool(raw: string): string {
  let s = String(raw ?? '').trim();
  for (const [key, label] of Object.entries(PLAN_NAMES)) {
    if (s === key) return label;
    s = s.replace(new RegExp(`\\b${key}\\b`, 'g'), label);
  }
  return s.replace(/\s+/g, ' ').trim();
}

const SOURCE_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  grok: 'Grok',
  kimi: 'Kimi',
};

export function quotaSourceName(raw: string): string {
  const s = prettyTool(raw);
  const brand = agentBrand(s);
  if (brand !== 'other' && SOURCE_NAMES[brand]) return SOURCE_NAMES[brand];
  const stripped = s.replace(/\s+(Max|Pro|Plus|Ultra|Build|Builder|Team|Free|进阶|基础|企业)$/i, '').trim();
  return stripped || s;
}

function cardSub(sub: Sub): string {
  const title = prettyTool(sub.tool);
  let label = String(sub.label ?? '').trim();
  if (title && label.startsWith(`${title} · `)) label = label.slice(title.length + 3);
  if (label === title) return '';
  return label;
}

function todaySpend(label: string): string {
  const m = String(label).match(/今日 \$[0-9.]+/);
  return m ? m[0] : '';
}

function clockText(raw?: string): string {
  if (!raw) return '';
  const d = Date.parse(raw);
  if (!Number.isFinite(d)) return '';
  const x = new Date(d);
  const hh = String(x.getHours()).padStart(2, '0');
  const mm = String(x.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function shortStamp(vm: ViewModel): string {
  const data = clockText(vm.generatedAt) || vm.time;
  return data ? `数据 ${data}` : '';
}

function clip(s: string, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  if (chars.length <= n) return t;
  return `${chars.slice(0, Math.max(1, n - 1)).join('')}…`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
