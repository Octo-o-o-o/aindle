#!/usr/bin/env node
// Cloudflare Pages `_headers` matching: every matching rule applies.
// Same-name headers stack; two CSPs are AND, the later one does not replace.

export function parsePagesHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    if (!/^[ \t]/.test(raw)) {
      current = { path: raw.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const cut = raw.indexOf(':');
    if (cut === -1) continue;
    current.headers.push({
      name: raw.slice(0, cut).trim(),
      value: raw.slice(cut + 1).trim(),
    });
  }
  return rules;
}

export function pathMatches(pattern, pathname) {
  let rx = '^';
  for (const ch of pattern) {
    if (ch === '*') rx += '.*';
    else if ('\\^$+?.()|[]{}'.includes(ch)) rx += `\\${ch}`;
    else rx += ch;
  }
  rx += '$';
  return new RegExp(rx).test(pathname);
}

export function headersFor(rules, pathname) {
  const out = [];
  for (const rule of rules) {
    if (pathMatches(rule.path, pathname)) out.push(...rule.headers);
  }
  return out;
}

export function headerValues(headers, name) {
  const needle = String(name).toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === needle).map((h) => h.value);
}

export function toNodeHeaders(list, extra = {}) {
  const headers = { ...extra };
  for (const { name, value } of list) {
    if (headers[name] === undefined) {
      headers[name] = value;
      continue;
    }
    const prev = headers[name];
    headers[name] = Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return headers;
}
