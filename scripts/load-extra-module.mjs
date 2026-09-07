// 解析一次性工具（sharp / playwright 等）。Cloudflare 构建不要 import 本文件。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireHere = createRequire(fileURLToPath(import.meta.url));

export function loadExtra(name) {
  try {
    return requireHere(name);
  } catch {
    /* fall through */
  }
  for (const dir of String(process.env.NODE_PATH || '')
    .split(path.delimiter)
    .filter(Boolean)) {
    try {
      return createRequire(path.join(dir, name, 'package.json'))(name);
    } catch {
      /* try next */
    }
  }
  throw new Error(`${name} not found. Install it once, or set NODE_PATH to a node_modules that contains it.`);
}
