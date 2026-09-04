const INK = '#111111';

// Codex / Cursor / Kimi: Simple Icons brand marks. Claude: classic sparkle (the
// official SI glyph is too fine for 1-bit e-ink). Grok: no published SI glyph.
const PATHS = {
  claude:
    'M12 2c.35 3.1 1.25 5.65 3.05 7.45C16.85 11.25 19.4 12.15 22.5 12.5c-3.1.35-5.65 1.25-7.45 3.05C13.25 17.35 12.35 19.9 12 23c-.35-3.1-1.25-5.65-3.05-7.45C7.15 13.75 4.6 12.85 1.5 12.5c3.1-.35 5.65-1.25 7.45-3.05C10.75 7.65 11.65 5.1 12 2z',
  codex:
    'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  cursor:
    'M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23',
  kimi: 'M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441',
  grok: 'M12 1.2 14.2 9 22.8 12 14.2 15 12 22.8 9.8 15 1.2 12 9.8 9Z',
} as const;

export type AgentBrand = keyof typeof PATHS | 'other';

export function agentBrand(raw: string): AgentBrand {
  const s = String(raw ?? '').toLowerCase();
  if (/claude|anthropic/.test(s)) return 'claude';
  if (/codex|openai|chatgpt/.test(s)) return 'codex';
  if (/cursor/.test(s)) return 'cursor';
  if (/kimi|moonshot/.test(s)) return 'kimi';
  if (/grok|xai/.test(s)) return 'grok';
  return 'other';
}

const FIT: Record<Exclude<AgentBrand, 'other'>, string | undefined> = {
  claude: undefined,
  codex: undefined,
  cursor: undefined,
  // Official Kimi mark sits high-left in the 24 box (orb at y≈0.35). Nudge it
  // down and in so the ink matches the other 28px brand squares.
  kimi: 'translate(1.15 0.95) scale(0.92)',
  grok: undefined,
};

function wrap(d: string, size: number, brand: Exclude<AgentBrand, 'other'>): string {
  const fit = FIT[brand];
  const path = fit ? `<g transform="${fit}"><path fill="${INK}" d="${d}"/></g>` : `<path fill="${INK}" d="${d}"/>`;
  return `<svg class="aicon" data-brand="${brand}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

function letterIcon(raw: string, size: number): string {
  const ch = String(raw ?? '')
    .replace(/[^A-Za-z\u4e00-\u9fff]/g, '')
    .slice(0, 1)
    .toUpperCase() || '?';
  const glyph = ch
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<svg class="aicon" data-brand="other" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="none" stroke="${INK}" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="${INK}">${glyph}</text></svg>`;
}

export function agentIcon(tool: string, size = 24): string {
  const brand = agentBrand(tool);
  if (brand === 'other') return letterIcon(tool, size);
  return wrap(PATHS[brand], size, brand);
}
