import { collectClaude } from './claude.js';
import { collectCodex } from './codex.js';
import { collectCursor } from './cursor.js';
import { collectGrok } from './grok.js';
import { collectKimi } from './kimi.js';
import { collectSub2Api } from './sub2api.js';
import { collectZcode } from './zcode.js';
import { collectGemini } from './gemini.js';
import { collectCopilot } from './copilot.js';
import { collectKiro } from './kiro.js';
import { collectDeepSeek } from './deepseek.js';
import type { Subscription } from '@aindle/core';
import type { RegistrySubscription } from '../registry.js';
import { quotaDue, quotaPeek, quotaRemember } from '../lib/quota-gate.js';

function collectGlm(entry: RegistrySubscription): Subscription {
  return {
    id: entry.id,
    tool: 'GLM',
    label: entry.label,
    plan: entry.plan,
    shared: entry.shared,
    source: 'local',
    kind: 'quota',
    windows: [],
    confidence: 'none',
  };
}

export async function collectSubscription(entry: RegistrySubscription): Promise<Subscription> {
  const many = await collectSubscriptions(entry);
  return many[0] ?? collectGlm(entry);
}

export async function collectSubscriptions(entry: RegistrySubscription): Promise<Subscription[]> {
  switch (entry.tool) {
    case 'claude':
      return [await collectClaude(entry)];
    case 'codex':
      return [await collectCodex(entry)];
    case 'cursor':
      return [await collectCursor(entry)];
    case 'grok':
      return [await collectGrok(entry)];
    case 'kimi':
      return [await collectKimi(entry)];
    case 'glm':
      return [collectGlm(entry)];
    case 'zcode':
      return [await collectZcode(entry)];
    case 'gemini':
      return [await collectGemini(entry)];
    case 'copilot':
      return [await collectCopilot(entry)];
    case 'kiro':
      return [await collectKiro(entry)];
    case 'deepseek':
      return [await collectDeepSeek(entry)];
    case 'sub2api': {
      const key = `sub2api:${entry.id}:${entry.mode ?? 'user'}`;
      const cached = quotaPeek<Subscription[]>(key);
      if (!quotaDue(key) && cached?.length) {
        return cached.map((row) => ({
          ...row,
          confidence: row.confidence === 'live' ? 'cached' : row.confidence,
        }));
      }
      const rows = await collectSub2Api(entry);
      quotaRemember(
        key,
        rows,
        rows.some((row) => row.confidence === 'live' || row.windows.length > 0 || Boolean(row.breakdown)),
      );
      return rows;
    }
    default:
      return [
        {
          id: entry.id,
          tool: entry.tool,
          label: entry.label,
          plan: entry.plan,
          shared: entry.shared,
          source: 'local',
          kind: 'quota',
          windows: [],
          confidence: 'none',
        },
      ];
  }
}

export {
  collectClaude,
  collectCodex,
  collectCursor,
  collectGrok,
  collectGlm,
  collectKimi,
  collectZcode,
  collectGemini,
  collectCopilot,
  collectKiro,
  collectDeepSeek,
};
