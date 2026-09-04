import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/cli.js',
  banner: { js: '#!/usr/bin/env node' },
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
chmodSync(path.join(root, 'dist', 'cli.js'), 0o755);
console.log('cli bundle: dist/cli.js');
