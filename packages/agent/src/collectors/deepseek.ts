import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Subscription, UsageWindow } from '@aindle/core';
import { expandHome, type RegistrySubscription } from '../registry.js';
import { clampPercent } from '../lib/util.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

// DeepSeek is pay-as-you-go: the only official number is the account balance
// (GET /user/balance). There is no usage API, so the optional registry
// `budget` (CNY per top-up period) turns the balance into a 预算 bar:
// pct grows as the balance drains and drops again after each top-up.
const BALANCE_URL = 'https://api.deepseek.com/user/balance';

interface BalanceRow {
  currency?: string;
  total_balance?: string;
}

function qwenSettingsKey(home: string): string | undefined {
  const file = path.join(home, '.qwen', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(file, 'utf8')) as { env?: Record<string, string> };
    const key = settings.env?.DEEPSEEK_API_KEY?.trim();
    return key || undefined;
  } catch {
    return undefined;
  }
}

export function resolveDeepSeekKey(entry: RegistrySubscription): string | undefined {
  const fromEnv = process.env.DEEPSEEK_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (entry.keyFile) {
    try {
      const text = fs.readFileSync(expandHome(entry.keyFile), 'utf8').trim();
      if (text) return text;
    } catch {
      /* fall through */
    }
  }
  return qwenSettingsKey(expandHome(entry.home ?? '~'));
}

export function deepSeekBalanceRows(body: unknown): Array<{ currency: string; total: number }> {
  if (!body || typeof body !== 'object') return [];
  const infos = (body as { balance_infos?: unknown }).balance_infos;
  if (!Array.isArray(infos)) return [];
  const out: Array<{ currency: string; total: number }> = [];
  for (const raw of infos) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as BalanceRow;
    const total = Number(row.total_balance);
    if (!Number.isFinite(total)) continue;
    out.push({ currency: String(row.currency ?? 'CNY'), total });
  }
  return out;
}

export function deepSeekWindows(
  balances: Array<{ currency: string; total: number }>,
  budgetCny?: number,
): UsageWindow[] {
  const cny = balances.find((b) => b.currency === 'CNY') ?? balances[0];
  const budget = Number(budgetCny);
  if (!cny || !Number.isFinite(budget) || budget <= 0) return [];
  const pct = clampPercent(((budget - cny.total) / budget) * 100);
  if (pct === null) return [];
  return [{ key: '预算', pct }];
}

export async function collectDeepSeek(entry: RegistrySubscription): Promise<Subscription> {
  const key = `deepseek:${entry.id}`;
  const cached = quotaPeek<Subscription>(key);
  if (!quotaDue(key) && cached) {
    return { ...cached, confidence: cached.windows.length ? 'cached' : cached.confidence };
  }

  const make = (windows: UsageWindow[], label: string, confidence: Subscription['confidence']): Subscription => ({
    id: entry.id,
    tool: 'DeepSeek',
    label,
    plan: entry.plan ?? 'API',
    shared: entry.shared,
    source: 'local',
    kind: 'spend',
    windows,
    confidence,
  });

  const apiKey = resolveDeepSeekKey(entry);
  if (!apiKey) {
    const empty = make([], '未找到 API Key', 'error');
    quotaRemember(key, empty, false);
    return empty;
  }

  try {
    const res = await fetch(BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) throw new Error('DeepSeek key 无效');
    if (!res.ok) throw new Error(`DeepSeek balance HTTP ${res.status}`);
    const body = (await res.json()) as { is_available?: boolean };
    if (body.is_available === false) throw new Error('DeepSeek key 不可用');
    const balances = deepSeekBalanceRows(body);
    if (!balances.length) throw new Error('DeepSeek balance 解析失败');
    const primary = balances.find((b) => b.currency === 'CNY') ?? balances[0];
    const symbol = primary.currency === 'CNY' ? '¥' : primary.currency === 'USD' ? '$' : `${primary.currency} `;
    const sub = make(deepSeekWindows(balances, entry.budget), `余额 ${symbol}${primary.total.toFixed(2)}`, 'live');
    quotaRemember(key, sub, true);
    return sub;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fallback = cached ?? make([], message.slice(0, 24), 'error');
    quotaRemember(key, fallback, false);
    return { ...fallback, confidence: fallback.windows.length ? 'stale' : 'error' };
  }
}
