import { formatAttention, type ViewModel } from '@aindle/core';
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
  billing?: string;
  usage?: { h24Tokens: string; h24Cost: string; d7Tokens: string; d7Cost: string };
};

function billGlyph(billing?: string): string {
  if (billing === 'subscription') return '订';
  if (billing === 'metered') return '量';
  return '';
}

function asSubs(vm: ViewModel): Sub[] {
  return vm.subs as Sub[];
}

export type EinkOpts = {
  battery?: number;
  lockScreen?: boolean;
  width?: number;
  height?: number;
};

const LAYOUT = {
  padTop: 30,
  padBottom: 54,
  mast: 56,
  hair: 29,
  quotaRow: 66,
  taskRow: 70,
  sec: 32,
  secAfterBlock: 58,
  empty: 64,
  safety: 24,
} as const;

export function einkCanvas(opts?: EinkOpts): { w: number; h: number } {
  return { w: opts?.width ?? OASIS1.w, h: opts?.height ?? OASIS1.h };
}

function taskBlockHeight(rows: number): number {
  if (rows <= 0) return LAYOUT.empty;
  return rows * LAYOUT.taskRow;
}

function doneBlockHeight(rows: number): number {
  if (rows <= 0) return 0;
  return LAYOUT.secAfterBlock + rows * LAYOUT.taskRow;
}

export function fitEinkTaskLists<T>(
  live: T[],
  done: T[],
  quotaCount: number,
  canvas: { w: number; h: number } = OASIS1,
): { live: T[]; done: T[] } {
  const budget =
    canvas.h -
    LAYOUT.padTop -
    LAYOUT.padBottom -
    LAYOUT.mast -
    LAYOUT.hair -
    LAYOUT.safety -
    quotaCount * LAYOUT.quotaRow -
    LAYOUT.sec;
  if (taskBlockHeight(live.length) + doneBlockHeight(done.length) <= budget) {
    return { live, done };
  }
  const doneMax = Math.floor((budget - taskBlockHeight(live.length) - LAYOUT.secAfterBlock) / LAYOUT.taskRow);
  if (live.length && done.length && doneMax >= 1) {
    return { live, done: done.slice(0, doneMax) };
  }
  const maxLive = Math.max(live.length ? 1 : 0, Math.floor(budget / LAYOUT.taskRow));
  return { live: live.slice(0, Math.min(live.length, maxLive)), done: [] };
}

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
  const busy =
    Boolean(vm.refreshBusy) ||
    (vm.attention?.waiting ?? 0) > 0 ||
    (vm.now ?? []).some((r) => r.tag === 'ACTIVE' || r.tag === 'WAIT');
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
  const canvas = einkCanvas(opts);
  const body =
    page === 'now'
      ? renderNow(vm, canvas)
      : page === 'relay'
        ? renderRelay(vm)
        : renderLocal(vm, canvas);
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
  .qbig { padding:16px 0 14px; border-bottom:1px solid ${INK}; }
  .qbig:last-child { border-bottom:0; }
  .qb-head { display:flex; align-items:center; gap:14px; margin-bottom:10px; }
  .qb-icon { width:34px; height:34px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .qb-title { font-size:38px; font-weight:700; line-height:1.1; }
  .qb-sub { font-size:22px; font-weight:700; }
  .qb-row { display:flex; align-items:center; gap:14px; padding:7px 0; }
  .qb-key { width:88px; flex-shrink:0; font-size:24px; font-weight:700; }
  .qb-pct { width:86px; flex-shrink:0; text-align:right; font-size:30px; font-weight:700; font-variant-numeric:tabular-nums; }
  .qb-reset { width:170px; flex-shrink:0; text-align:right; font-size:20px; font-weight:700; }
  .qb-note { font-size:24px; font-weight:700; }
  .mbar.big { height:22px; }
  .trow { display:flex; align-items:center; padding:14px 0; border-bottom:1px solid ${INK}; }
  .trow:last-child { border-bottom:0; }
  .ticon { width:28px; height:28px; flex-shrink:0; display:flex; align-items:center; justify-content:flex-start; margin-right:10px; }
  .ttitle { flex:1; font-size:30px; font-weight:700; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .twait { flex-shrink:0; margin-right:10px; font-size:18px; font-weight:700; letter-spacing:1px; border:2px solid ${INK}; padding:2px 8px; }
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

// 本地限额 ≤2 份时改用宽松大卡：每个窗口独占一行、加粗的条、显示重置时间，
// 把少量订阅省下的纵向空间用掉，页面不至于单薄。
const EXPANDED_QUOTA_MAX = 2;

function quotaUnits(subs: Sub[], expanded: boolean): number {
  if (!expanded) return subs.length;
  let units = 0;
  for (const s of subs) {
    const rows = Math.max(1, Math.min(uniqWindows(s.windows ?? []).length, 3));
    units += Math.ceil((30 + 54 + rows * 36 + (s.usage ? 36 : 0)) / LAYOUT.quotaRow);
  }
  return units;
}

function renderLocal(vm: ViewModel, canvas: { w: number; h: number } = OASIS1): string {
  const quotas = localSubs(vm);
  const expanded = quotas.length > 0 && quotas.length <= EXPANDED_QUOTA_MAX;
  const fitted = fitEinkTaskLists(vm.now ?? [], (vm.recent ?? []).slice(0, 3), quotaUnits(quotas, expanded), canvas);
  const rows = quotas.length
    ? `<div class="block">${quotas.map((s) => (expanded ? quotaBig(s) : quotaRow(s))).join('')}</div>`
    : `<div class="empty">还没有本机限额。</div>`;
  const taskBlock = fitted.live.length
    ? `<div class="block">${fitted.live.map((r) => runRow(r)).join('')}</div>`
    : `<div class="empty">这一小时没有进行中的会话。</div>`;
  const doneBlock = fitted.done.length
    ? `<div class="sec">已完成</div><div class="block">${fitted.done.map((r) => runRow(r)).join('')}</div>`
    : '';
  return `
    ${rows}
    <div class="sec">${esc(nowCountLabel(vm))}</div>
    ${taskBlock}
    ${doneBlock}`;
}

function renderNow(vm: ViewModel, canvas: { w: number; h: number } = OASIS1): string {
  const fitted = fitEinkTaskLists(vm.now ?? [], (vm.recent ?? []).slice(0, 3), 0, canvas);
  const liveBlock = fitted.live.length
    ? `<div class="block">${fitted.live.map((r) => runRow(r)).join('')}</div>`
    : `<div class="empty">现在没有进行中或刚停下来的会话。</div>`;
  const recentBlock = fitted.done.length
    ? `<div class="block">${fitted.done.map((r) => runRow(r)).join('')}</div>`
    : '';
  return `
    <div class="sec">${esc(nowCountLabel(vm))}</div>
    ${liveBlock}
    ${recentBlock ? `<div class="sec">刚结束 ${fitted.done.length}</div>${recentBlock}` : ''}`;
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
    ? `<div class="block">${accounts
        .map((s) => (accounts.length <= EXPANDED_QUOTA_MAX ? quotaBig(s) : quotaRow(s)))
        .join('')}</div>`
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
  const glyph = billGlyph(sub.billing);
  const meters = wins.length
    ? wins.map((w) => quotaMeter(w)).join('')
    : `<div class="empty" style="padding:0;">${sub.error ? '暂时读不到' : '还没有读数'}</div>`;
  return `
    <div class="qrow">
      <div class="qname">
        <div class="qhead">
          <div class="qicon">${agentIcon(sub.tool, 28)}</div>
          <div class="qtitle">${esc(title)}</div>
          ${glyph ? `<div class="qtitle" style="font-size:18px;border:1px solid ${INK};padding:1px 5px;">${glyph}</div>` : ''}
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

function uniqWindows(windows: Win[]): Win[] {
  const out: Win[] = [];
  const seen = new Set<string>();
  for (const w of windows) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    out.push(w);
  }
  return out;
}

function quotaBigLabel(sub: Sub): string {
  let label = cardSub(sub);
  const title = quotaSourceName(sub.tool);
  if (title && label.startsWith(`${title} · `)) label = label.slice(title.length + 3);
  return label === title ? '' : label;
}

function quotaBig(sub: Sub): string {
  const title = quotaSourceName(sub.tool);
  const subLabel = clip(quotaBigLabel(sub), 22);
  const glyph = billGlyph(sub.billing);
  const wins = uniqWindows(sub.windows ?? []).slice(0, 3);
  const meters = wins.length
    ? wins.map((w) => quotaBigMeter(w)).join('')
    : `<div class="qb-row"><div class="qb-note">${sub.error ? '暂时读不到' : '还没有读数'}</div></div>`;
  const usage = sub.usage
    ? `<div class="qb-row"><div class="qb-note" style="font-size:20px;">24h ${esc(sub.usage.h24Tokens)} tok ≈${esc(sub.usage.h24Cost)} · 7d ${esc(sub.usage.d7Tokens)} tok ≈${esc(sub.usage.d7Cost)}</div></div>`
    : '';
  return `
    <div class="qbig">
      <div class="qb-head">
        <div class="qb-icon">${agentIcon(sub.tool, 34)}</div>
        <div class="qb-title">${esc(title)}</div>
        ${subLabel ? `<div class="qb-sub">${esc(subLabel)}</div>` : ''}
        ${glyph ? `<div class="qb-sub" style="font-size:18px;border:1px solid ${INK};padding:1px 6px;">${glyph}</div>` : ''}
      </div>
      ${meters}
      ${usage}
    </div>`;
}

function quotaBigMeter(w: Win): string {
  const pct = clampPct(w.pct);
  const fillClass = pct >= 90 ? 'mfill' : 'mfill soft';
  const reset = w.reset && w.reset !== '—' ? `重置 ${w.reset}` : '';
  return `
    <div class="qb-row">
      <div class="qb-key">${esc(prettyWinKey(w.key))}</div>
      <div class="mbar big"><div class="${fillClass}" style="width:${pct}%"></div></div>
      <div class="qb-pct">${pct}%</div>
      <div class="qb-reset">${esc(reset)}</div>
    </div>`;
}

function nowCountLabel(vm: ViewModel): string {
  return formatAttention(vm.attention ?? { waiting: 0, human: 0, background: 0 });
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
  const waitMark = run.tag === 'WAIT' ? `<div class="twait">WAIT</div>` : '';
  return `
    <div class="trow">
      <div class="ticon">${agentIcon(run.tool, 24)}</div>
      ${waitMark}
      <div class="ttitle">${esc(run.title)}</div>
      <div class="tmeta">
        <div class="telapsed">${esc(runWhen(run))}</div>
        <div class="tsource">${esc(runProject(run))}</div>
      </div>
    </div>`;
}

// The fixed-height e-ink page fits about eight quota cards; keep errors
// (re-login hints) and the most-burned windows when there are more sources.
const LOCAL_CARD_MAX = 8;

function localSubs(vm: ViewModel): Sub[] {
  const subs = asSubs(vm).filter((s) => {
    if (s.source !== 'local') return false;
    if (s.error) return true;
    if (s.none) return false;
    return (s.windows?.length ?? 0) > 0;
  });
  if (subs.length <= LOCAL_CARD_MAX) return subs;
  return subs
    .sort((a, b) => Number(Boolean(b.error)) - Number(Boolean(a.error)) || maxPct(b) - maxPct(a))
    .slice(0, LOCAL_CARD_MAX);
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
  if (/zcode/i.test(s)) return 'ZCode';
  const brand = agentBrand(s);
  if (brand !== 'other' && SOURCE_NAMES[brand]) return SOURCE_NAMES[brand];
  const stripped = s.replace(/\s+(Max|Pro|Plus|Ultra|Build|Builder|Team|Lite|Free|进阶|基础|企业)$/i, '').trim();
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
