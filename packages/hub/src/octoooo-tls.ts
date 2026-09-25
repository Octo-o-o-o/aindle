import { createServer } from 'node:https';
import { openSync, closeSync, fstatSync, readFileSync, constants } from 'node:fs';
import type { Server } from 'node:http';
function privatePem(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.() || stat.size > 1048576) throw new Error('TLS material must be an owned regular 0600 file');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}
export function outputListener(output: Server, env: NodeJS.ProcessEnv): { server: Server; host: string } {
  if (env.AINDLE_OCTOOOO_TLS_ENABLED !== 'true') return { server: output, host: '127.0.0.1' };
  const host = env.AINDLE_OCTOOOO_TLS_HOST;
  const key = env.AINDLE_OCTOOOO_TLS_KEY_FILE;
  const cert = env.AINDLE_OCTOOOO_TLS_CERT_FILE;
  if (!host || !key || !cert || /[\s/@?#]/.test(host)) throw new Error('Explicit TLS host/key/certificate required');
  return { server: createServer({ key: privatePem(key), cert: privatePem(cert), minVersion: 'TLSv1.2' }, (req, res) => output.emit('request', req, res)), host };
}
