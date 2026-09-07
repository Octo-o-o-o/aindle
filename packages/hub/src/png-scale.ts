import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  if (rgba.length !== width * height * 4) throw new Error('pixel buffer size');
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function decodePng8(buf: Buffer): { w: number; h: number; rgba: Buffer } {
  if (buf.length < 8 || buf.subarray(0, 8).compare(SIG) !== 0) throw new Error('not a png');
  let w = 0;
  let h = 0;
  let depth = 0;
  let color = 0;
  const idats: Buffer[] = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8]!;
      color = data[9]!;
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (depth !== 8 || (color !== 2 && color !== 6)) {
    throw new Error(`unsupported png ${depth}/${color}`);
  }
  const bpp = color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = w * bpp;
  const rgba = Buffer.alloc(w * h * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[src++]!;
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[src++]!;
      const a = i >= bpp ? row[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) v = (x + paeth(a, b, c)) & 255;
      else if (filter !== 0) throw new Error(`png filter ${filter}`);
      row[i] = v;
    }
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      const si = x * bpp;
      rgba[di] = row[si]!;
      rgba[di + 1] = row[si + 1]!;
      rgba[di + 2] = row[si + 2]!;
      rgba[di + 3] = bpp === 4 ? row[si + 3]! : 255;
    }
    prev = row;
  }
  return { w, h, rgba };
}

/** Nearest-neighbor scale. Used when Chrome ignores --force-device-scale-factor on HiDPI. */
export function scalePngTo(buf: Buffer, width: number, height: number): Buffer {
  const src = decodePng8(buf);
  if (src.w === width && src.h === height) return buf;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.h - 1, Math.floor(((y + 0.5) * src.h) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.w - 1, Math.floor(((x + 0.5) * src.w) / width));
      src.rgba.copy(rgba, (y * width + x) * 4, (sy * src.w + sx) * 4, (sy * src.w + sx) * 4 + 4);
    }
  }
  return encodeRgbaPng(width, height, rgba);
}
