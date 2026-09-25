#!/usr/bin/env node
import { outputListener } from './octoooo-tls.js';
import { createOctooooOutputServer } from './octoooo-server.js';
const endpoint = process.env.AINDLE_OCTOOOO_CORE;
if (!endpoint) throw new Error('Set AINDLE_OCTOOOO_CORE to the explicitly configured HTTPS core origin');
const port = Number(process.env.AINDLE_OCTOOOO_PORT ?? '8792');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const { server, host } = outputListener(createOctooooOutputServer({ core: endpoint }), process.env);
server.listen(port, host, () => process.stdout.write(`Octoooo read-only projection listening on configured endpoint:${port}\n`));
process.once('SIGTERM', () => server.close()); process.once('SIGINT', () => server.close());
