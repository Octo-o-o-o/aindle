import { chmodSync, copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'cli.js');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __aindleCreateRequire } from 'node:module';
const require = __aindleCreateRequire(import.meta.url);`,
  },
  logLevel: 'info',
});

const publicDir = path.join(root, 'dist', 'public');
mkdirSync(publicDir, { recursive: true });
copyFileSync(
  path.join(root, 'packages', 'hub', 'public', 'monitor.html'),
  path.join(publicDir, 'monitor.html'),
);
copyFileSync(
  path.join(root, 'config', 'registry.example.yaml'),
  path.join(root, 'dist', 'registry.example.yaml'),
);
try {
  chmodSync(out, 0o755);
} catch {
  /* Windows ignores POSIX modes */
}
try {
  unlinkSync(path.join(root, 'dist', 'cli.cjs'));
} catch {
  /* optional leftover */
}
console.log('cli bundle: dist/cli.js');
