import fs from 'node:fs';
export interface DisplayRow { provider: string; account: string; window: string; value: number | null; stale: boolean }
export interface DisplayFrame { generation: string; expiresAt: number; available: boolean; synthetic: boolean; pending: number; running: number; completed: number; usage: DisplayRow[] }
const empty = (): DisplayFrame => ({ generation: '', expiresAt: 0, available: false, synthetic: false, pending: 0, running: 0, completed: 0, usage: [] });
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : 0;
export function readOctoooo(file: string | undefined, now = Date.now()): DisplayFrame {
  try {
    if (!file || fs.statSync(file).size > 1048576) return empty();
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (value.schema !== 'octoooo.display.v1' || value.available !== true || typeof value.generated_at !== 'number' || value.generated_at > now || typeof value.expires_at !== 'number' || value.expires_at <= now || value.expires_at - value.generated_at > 30000 || !Array.isArray(value.usage)) return empty();
    const rows: DisplayRow[] = value.usage.slice(0, 100).map((raw: Record<string, unknown>, index: number) => ({
      provider: ['codex', 'claude', 'claude-code', 'cursor', 'openai', 'anthropic'].includes(String(raw.provider)) ? String(raw.provider) : 'AI',
      account: typeof raw.account === 'string' && /^账号 [0-9]{1,4}$/.test(raw.account) ? raw.account : `账号 ${index + 1}`,
      window: ['primary', 'secondary', 'tertiary', 'five-hour', '5h', 'weekly', 'week', 'daily', 'day', 'monthly', 'month'].includes(String(raw.window)) ? String(raw.window) : '其他窗口',
      value: typeof raw.value === 'number' && Number.isFinite(raw.value) && raw.value >= 0 && raw.value <= 10000 ? raw.value : null,
      stale: raw.stale !== false || typeof raw.observed_at !== 'string' || !Number.isFinite(Date.parse(raw.observed_at)) || Date.parse(raw.observed_at) > now || now - Date.parse(raw.observed_at) > 300000 || (typeof raw.reset_at === 'string' && Date.parse(raw.reset_at) <= now),
    }));
    return { generation: typeof value.generation === 'string' && /^[a-z0-9-]{1,64}$/.test(value.generation) ? value.generation : '', expiresAt: value.expires_at, available: true, synthetic: value.synthetic === true, pending: count(value.pending), running: count(value.running), completed: count(value.completed), usage: rows };
  } catch { return empty(); }
}
export function renderOctoooo(frame: DisplayFrame, page = 0, png = false): string {
  const pages = Math.max(1, Math.ceil(frame.usage.length / 8));
  const selected = Math.max(0, Math.min(pages - 1, Number.isSafeInteger(page) ? page : 0));
  const rows = frame.usage.slice(selected * 8, (selected + 1) * 8);
  const body = frame.available ? `<p>${frame.pending} 待查看　·　${frame.running} 运行中　·　${frame.completed} 已完成</p><h2>订阅窗口 · 已用比例</h2>${rows.map(row => `<article><div><b>${row.provider} · ${row.account}</b><small>${row.window} · ${row.stale ? '过期 / 待采样' : '采样有效'}</small></div><strong>${row.value === null ? '未知' : row.value + '%'}</strong></article>`).join('') || '<p>未配置或未获用量授权</p>'}` : '<h2>未连接 / 授权缓存已清除</h2><p>回主设备检查连接与授权。</p>';
  const controls = png ? '' : `<nav><button onclick="turn(-1)">上一页</button><span>${selected + 1} / ${pages}</span><button onclick="turn(1)">下一页</button><button onclick="location.reload()">刷新</button></nav>`;
  const script = png ? '' : `<script>function turn(n){var u=new URL(location.href);u.searchParams.set('page',Math.max(0,Math.min(${pages-1},${selected}+n)));location.href=u.href;}setTimeout(function(){document.getElementById('content').textContent='授权缓存已到期，请刷新';},Math.max(0,${frame.expiresAt}-Date.now()));</script>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Octoooo · 只读用量</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:system-ui,sans-serif}main{max-width:1072px;margin:auto;padding:56px}header{border-bottom:4px solid;padding-bottom:22px;display:flex;justify-content:space-between;font-size:28px}h1{font-size:76px;font-weight:400;margin:36px 0}h2{font-size:28px}p{font-size:24px}article{display:flex;justify-content:space-between;align-items:center;border-top:1px solid;padding:24px 0;font-size:24px}small{display:block;margin-top:10px;font-size:20px}strong{font-size:42px}footer{border-top:3px solid;margin-top:32px;padding-top:22px;font-size:20px}nav{display:flex;gap:20px;align-items:center;margin-top:30px}button{background:#fff;border:2px solid;padding:12px;font-size:20px}</style><main><header><b>Octoooo</b><span>${frame.synthetic ? '合成演示' : '只读投影'}</span></header><h1>${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}</h1><div id="content">${body}</div>${controls}<footer>第 ${selected + 1} / ${pages} 页 · ${frame.usage.length} 个窗口<br>${png ? '静态画面 · 时间为生成时刻' : '前台网页 · 不代表系统锁屏'}<br>事项查看不改变源任务；各账号窗口不相加。<br>${png ? '静态像素不会自行清除；恢复阅读需设备脚本。' : '授权缓存到期后清除正文；设备离线时请退出此画面。'}</footer></main>${script}</html>`;
}
