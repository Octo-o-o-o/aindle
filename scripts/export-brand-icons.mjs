#!/usr/bin/env node
// 一次性品牌导出：机械缩放 / ICO / OG 排版。不作为 Cloudflare 构建步骤。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExtra } from './load-extra-module.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = path.join(ROOT, 'assets', 'brand');
const SOURCE = path.join(BRAND, 'aindle-source.png');
const SIZES = [32, 48, 180, 192, 512];
const ICO_SIZES = [16, 32, 48];
const PAPER = '#F4F1E9';
const INK = '#111111';
const sharp = loadExtra('sharp');

function encodeIco(images) {
  const count = images.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = images.map((img) => {
    const entry = { ...img, offset };
    offset += img.buf.length;
    return entry;
  });
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  entries.forEach((entry, i) => {
    const o = 6 + i * 16;
    out.writeUInt8(entry.width >= 256 ? 0 : entry.width, o);
    out.writeUInt8(entry.height >= 256 ? 0 : entry.height, o + 1);
    out.writeUInt8(0, o + 2);
    out.writeUInt8(0, o + 3);
    out.writeUInt16LE(1, o + 4);
    out.writeUInt16LE(32, o + 6);
    out.writeUInt32LE(entry.buf.length, o + 8);
    out.writeUInt32LE(entry.offset, o + 12);
    entry.buf.copy(out, entry.offset);
  });
  return out;
}

function writeDataUriModule(filePath, dataUri, size) {
  const body =
    '/** 由 scripts/export-brand-icons.mjs 从 assets/brand/icon-' +
    size +
    '.png 生成，请勿手改。 */\n' +
    'export const AINDLE_MARK_SIZE = ' +
    size +
    ' as const;\n' +
    'export const AINDLE_MARK_DATA_URI =\n  ' +
    JSON.stringify(dataUri) +
    ';\n';
  fs.writeFileSync(filePath, body);
}

function copyInto(destDir, files) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const [from, name] of files) {
    fs.copyFileSync(from, path.join(destDir, name));
  }
}

async function renderOg(iconBuf) {
  const icon = await sharp(iconBuf).resize(248, 248).png().toBuffer();
  const svg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="432" y="96" width="1" height="438" fill="${INK}" opacity="0.28"/>
  <text x="488" y="232" font-family="Georgia, Times New Roman, serif" font-size="18" fill="${INK}" letter-spacing="6">DESK-SIDE BOARD</text>
  <text x="488" y="328" font-family="Georgia, Songti SC, STSong, serif" font-size="84" fill="${INK}">Aindle</text>
  <text x="488" y="388" font-family="Songti SC, STSong, Georgia, serif" font-size="32" fill="${INK}">桌边的 AI 工作看板</text>
  <text x="488" y="452" font-family="Georgia, serif" font-size="20" fill="${INK}" opacity="0.7">aindle.octoooo.com</text>
</svg>`);
  return sharp(svg)
    .composite([{ input: icon, left: 112, top: 191 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

if (!fs.existsSync(SOURCE)) {
  console.error('export-brand-icons: missing', path.relative(ROOT, SOURCE));
  process.exit(1);
}

const pngOpts = { compressionLevel: 9, adaptiveFiltering: true };
const sized = {};
for (const size of [...new Set([...SIZES, ...ICO_SIZES])]) {
  const buf = await sharp(SOURCE)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png(pngOpts)
    .toBuffer();
  const meta = await sharp(buf).metadata();
  if (meta.channels !== 4 || !meta.hasAlpha) {
    throw new Error(`icon-${size} lost alpha`);
  }
  sized[size] = buf;
  if (SIZES.includes(size)) {
    const out = path.join(BRAND, `icon-${size}.png`);
    fs.writeFileSync(out, buf);
    console.log('wrote', path.relative(ROOT, out), buf.length);
  }
}

const ico = encodeIco(ICO_SIZES.map((size) => ({ width: size, height: size, buf: sized[size] })));
fs.writeFileSync(path.join(BRAND, 'favicon.ico'), ico);
console.log('wrote', 'assets/brand/favicon.ico', ico.length);

const mark32 = sized[32];
const dataUri = 'data:image/png;base64,' + mark32.toString('base64');
writeDataUriModule(path.join(ROOT, 'packages', 'hub', 'src', 'brand-mark.ts'), dataUri, 32);

const og = await renderOg(sized[512]);
const ogMeta = await sharp(og).metadata();
if (ogMeta.width !== 1200 || ogMeta.height !== 630) {
  throw new Error(`og size ${ogMeta.width}x${ogMeta.height}, expected 1200x630`);
}
fs.writeFileSync(path.join(BRAND, 'og.png'), og);
console.log('wrote', 'assets/brand/og.png', og.length);

const copies = [
  [path.join(BRAND, 'icon-32.png'), 'icon-32.png'],
  [path.join(BRAND, 'icon-48.png'), 'icon-48.png'],
  [path.join(BRAND, 'icon-180.png'), 'icon-180.png'],
];
copyInto(path.join(ROOT, 'packages', 'hub', 'public', 'brand'), copies);
copyInto(path.join(ROOT, 'demo', 'brand'), copies);
fs.copyFileSync(path.join(BRAND, 'favicon.ico'), path.join(ROOT, 'packages', 'hub', 'public', 'favicon.ico'));
fs.copyFileSync(path.join(BRAND, 'favicon.ico'), path.join(ROOT, 'demo', 'favicon.ico'));
fs.copyFileSync(path.join(BRAND, 'icon-32.png'), path.join(ROOT, 'kindle', 'oasis1', 'brand-icon.png'));
console.log('copied runtime marks into hub public, demo, kindle/oasis1');
