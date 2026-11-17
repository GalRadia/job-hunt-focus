// Writes extension/icons/icon-{16,32,48,128}.png: an evergreen rounded square with a paper-colored target.
// Each size is drawn at 4x and box-downsampled, so small sizes stay smooth.  usage: node tools/icons.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../extension/icons/', import.meta.url));
const INK = [31, 111, 80]; // --evergreen
const PAPER = [246, 247, 244]; // --paper
const SS = 4;

/** Coverage + color at unit coordinates (0..1) of the 128px design. */
function sample(u, v) {
  const x = u * 128, y = v * 128;
  const cx = Math.max(0, Math.abs(x - 64) - 40), cy = Math.max(0, Math.abs(y - 64) - 40);
  if (Math.hypot(cx, cy) > 24) return null; // outside the rounded square
  const d = Math.hypot(x - 64, y - 64);
  return d < 12 || (d > 26 && d < 36) ? PAPER : INK;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        if (!c) continue;
        r += c[0]; g += c[1]; b += c[2]; a++;
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw.set(a ? [r / a, g / a, b / a, (a / (SS * SS)) * 255].map(Math.round) : [0, 0, 0, 0], i);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${out}icon-${size}.png`, png(size));
  console.log(`wrote icons/icon-${size}.png`);
}
