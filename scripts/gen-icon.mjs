// Generates resources/icon.png (256x256) — a green disc with a music note.
// Dependency-free; run with: node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const GREEN = [29, 185, 84, 255];
const DARK = [18, 18, 18, 255];

const pixels = Buffer.alloc(SIZE * SIZE * 4); // transparent by default

function put(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

const cx = 128;
const cy = 128;
const radius = 118;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= radius) put(x, y, GREEN);
    else if (d <= radius + 1.5) put(x, y, [...GREEN.slice(0, 3), Math.round(255 * (radius + 1.5 - d) / 1.5)]);
  }
}

// Music note: stem, beam and two heads in dark.
for (let y = 70; y <= 165; y++) {
  for (let x = 0; x < 10; x++) {
    put(108 + x, y, DARK); // left stem
    put(162 + x, y, DARK); // right stem
  }
}
for (let y = 70; y <= 92; y++) {
  for (let x = 108; x <= 171; x++) put(x, y, DARK); // beam
}
function head(hx, hy) {
  for (let y = -16; y <= 16; y++) {
    for (let x = -22; x <= 22; x++) {
      if ((x / 22) ** 2 + (y / 16) ** 2 <= 1) put(hx + x, hy + y, DARK);
    }
  }
}
head(96, 168);
head(150, 168);

// --- PNG encoding ---
function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = join(dirname(fileURLToPath(import.meta.url)), '../resources/icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
