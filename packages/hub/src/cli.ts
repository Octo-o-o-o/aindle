#!/usr/bin/env node
import { startHub } from './server.js';

const port = Number(process.env.AINDLE_PORT ?? '8787');
const host = process.env.AINDLE_HOST ?? '0.0.0.0';
const token = process.env.AINDLE_TOKEN;
const hubId = process.env.AINDLE_HUB_ID ?? 'hub';
const hubLabel = process.env.AINDLE_HUB_LABEL ?? 'Aindle Hub';
const seedMock = process.env.AINDLE_SEED_MOCK !== '0';

startHub({ host, port, token, hubId, hubLabel, seedMock });
