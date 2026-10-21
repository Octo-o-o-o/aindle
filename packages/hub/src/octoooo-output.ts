export function weakProvider(value: unknown): string { const name = String(value ?? '').toLowerCase(); return ['codex', 'claude', 'gemini', 'grok', 'kimi', 'cursor', 'copilot', 'kiro', 'deepseek', 'zcode', 'openai', 'anthropic'].includes(name) ? name : '订阅'; }
export function weakWindow(value: unknown): string { const name = String(value ?? ''); return /^(?:[0-9]{1,5}[mhdw]|daily|weekly|monthly)$/.test(name) ? name : '窗口'; }
export interface OctooooBinding { deviceId: string; token: string; }
export interface OctooooItem { kind: string; id: string; value: Record<string, unknown>; }
export interface OctooooPage { schema_version: string; snapshot_id: string; authorization: string; watermark: number; offset: number; total: number; items: OctooooItem[]; next_page: string | null; cursor: string | null; complete: boolean; expires_at: string; }
export interface OctooooSnapshot { items: OctooooItem[]; authorization: string; cursor: string; fetchedAt: string; }
export class OctooooProjectionClient {
  private endpoint: string;
  constructor(endpoint: string, private transport: typeof fetch = fetch, allowLoopback = false) {
    const url = new URL(endpoint);
    if ((url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('HTTPS core origin required');
    this.endpoint = url.origin;
  }
  private async request(path: string, binding: OctooooBinding): Promise<unknown> {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(binding.deviceId) || !binding.token || binding.token.length > 512) throw new Error('Device binding required');
    const response = await this.transport(this.endpoint + path, { headers: { Authorization: `Bearer ${binding.token}`, 'x-octo-device-id': binding.deviceId, 'Octoooo-Protocol-Version': '1.1.0' }, redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Core authorization or snapshot rejected (${response.status})`);
    return response.json();
  }
  async snapshot(binding: OctooooBinding): Promise<OctooooSnapshot> {
    let token: string | null = null; let first: OctooooPage | undefined; const items: OctooooItem[] = []; const keys = new Set<string>(); const tokens = new Set<string>();
    for (;;) {
      const page = await this.request('/v2/sync/snapshot?limit=50' + (token ? '&page=' + encodeURIComponent(token) : ''), binding) as OctooooPage;
      if (page.schema_version !== '1.2.0' || !Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== items.length || !Array.isArray(page.items) || !Number.isFinite(Date.parse(page.expires_at)) || Date.parse(page.expires_at) <= Date.now() ||
        (first && (first.snapshot_id !== page.snapshot_id || first.authorization !== page.authorization || first.watermark !== page.watermark || first.total !== page.total))) throw new Error('Incomplete or changed snapshot');
      first ??= page;
      for (const item of page.items) {
        const key = item.kind + ':' + item.id;
        if (!['activity', 'source', 'usage'].includes(item.kind) || typeof item.id !== 'string' || !item.id || !item.value || typeof item.value !== 'object' || Array.isArray(item.value) || keys.has(key)) throw new Error('Invalid snapshot item');
        keys.add(key); items.push(item);
      }
      if (items.length > page.total) throw new Error('Snapshot overflow');
      if (page.complete) {
        if (items.length !== page.total || page.next_page !== null || typeof page.cursor !== 'string' || !page.cursor) throw new Error('Incomplete snapshot');
        return { items, authorization: page.authorization, cursor: page.cursor, fetchedAt: new Date().toISOString() };
      }
      if (page.cursor !== null || !page.next_page || tokens.has(page.next_page) || page.items.length === 0) throw new Error('Broken page chain');
      token = page.next_page; tokens.add(token);
    }
  }
  async confirm(binding: OctooooBinding, snapshot: OctooooSnapshot): Promise<void> {
    const delta = await this.request('/v2/sync/delta?limit=50&cursor=' + encodeURIComponent(snapshot.cursor), binding) as { schema_version: string; authorization: string; changes: unknown[]; has_more: boolean };
    if (delta.schema_version !== '1.2.0' || delta.authorization !== snapshot.authorization || !Array.isArray(delta.changes) || delta.changes.length !== 0 || delta.has_more !== false) throw new Error('Projection changed during rendering; refresh required');
  }
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function weakUsageMetric(value: unknown): string { const m = value === undefined || value === null ? 'used_percent' : String(value); return ['used_percent', 'used_tokens', 'spent_amount', 'balance_amount'].includes(m) ? m : 'unknown'; }
export function weakCurrency(value: unknown): string | null { const c = String(value ?? ''); return /^[A-Z]{3}$/.test(c) ? c : null; }
export function weakUsageValue(metric: string, value: unknown, currency: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '未知';
  if (metric === 'used_tokens') return Number.isSafeInteger(value) ? String(value) : '未知';
  if (metric === 'spent_amount' || metric === 'balance_amount') { const c = weakCurrency(currency); return c ? `${c} ${value.toFixed(2)}` : '未知'; }
  return metric === 'used_percent' ? `${value}%` : String(value);
}
const METRIC_TAG: Record<string, string> = { used_tokens: 'Token', spent_amount: '支出', balance_amount: '余额' };
export function renderOctooooEink(snapshot: OctooooSnapshot, page: number, width = 1072, height = 1448, leaseMs = 60000): string {
  const pages = Math.max(1, Math.ceil(snapshot.items.length / 6));
  if (!Number.isInteger(page) || page < 0 || page >= pages) throw new Error('Page outside snapshot');
  const now = Date.now();
  const rows = snapshot.items.slice(page * 6, page * 6 + 6).map((item) => {
    const usage = item.kind === 'usage'; const v = item.value;
    const metric = usage ? weakUsageMetric(v.metric) : '';
    const value = usage ? weakUsageValue(metric, v.value, v.currency) : '未知';
    const observed = usage ? v.observed_at : v.source_observed_at;
    const at = typeof observed === 'string' ? Date.parse(observed) : NaN;
    const freshness = !Number.isFinite(at) || at > now ? '采集时间未知' : now - at > 60000 || v.stale === true || v.availability === 'stale' ? '旧采样 · 非实时' : '采样时间有效';
    const title = usage ? escape(weakProvider(v.provider) + ' · ' + weakWindow(v.window) + (METRIC_TAG[metric] ? ' · ' + METRIC_TAG[metric] : '')) : item.kind === 'activity' ? '有事项可查看' : '来源观察';
    const state = item.kind === 'source' ? ({ running: '运行中', idle: '空闲', needs_attention: '需要关注', completed: '已完成', failed: '失败', unknown: '未知' } as Record<string, string>)[String(v.status)] ?? '未知' : '请在手机查看';
    return `<section><span>${title}</span><strong>${usage ? escape(value) : state}</strong><small>${freshness} · ${Number.isFinite(at) ? escape(new Date(at).toISOString()) : '—'}</small></section>`;
  }).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Octoooo 只读屏</title><style>*{box-sizing:border-box}body{margin:0;padding:6%;width:${width}px;min-height:${height}px;background:#fff;color:#111;font-family:system-ui,sans-serif}header{font-size:26px;letter-spacing:5px;border-bottom:3px solid;padding-bottom:24px}h1{font-size:56px;font-weight:500;margin:36px 0 12px}p{font-size:22px;line-height:1.6}section{padding:14px 0;border-bottom:1px solid #aaa;min-height:120px}span{font-size:22px}strong{display:block;font-size:32px;font-weight:500;margin:6px 0}small{font-size:17px}nav{display:flex;justify-content:space-between;margin-top:24px;font-size:24px}a{color:#111}footer{font-size:18px;line-height:1.6;margin-top:32px}@media(max-width:${width - 1}px){body{width:100%;min-height:100vh}h1{font-size:40px}strong{font-size:28px}}</style><header>OCTOOOO</header><h1>此刻，留给自己</h1><p>只读 · ${snapshot.items.length} 项授权内容 · 第 ${page + 1}/${pages} 页</p>${rows || '<section><strong>暂无授权内容</strong><small>未知不是零</small></section>'}<nav>${page > 0 ? `<a href="?page=${page - 1}">上一页</a>` : '<span></span>'}<a href="?page=0">刷新</a>${page + 1 < pages ? `<a href="?page=${page + 1}">下一页</a>` : '<span></span>'}</nav><footer>生成于 ${escape(snapshot.fetchedAt)}<br>有效至 ${escape(new Date(Math.floor((Date.parse(snapshot.fetchedAt) + leaseMs) / 1000) * 1000).toISOString())} · 过时画面不代表当前授权<br>翻页和刷新不会标为已读。读态与任务状态各自独立。</footer></html>`;
}
