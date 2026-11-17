// Writes extension/icons/icon-{16,32,48,128}.png: a paper-colored briefcase on an evergreen rounded tile.
// 128px follows the Chrome Web Store guideline (96x96 artwork + 16px transparent padding per side);
// the small toolbar sizes are full-bleed so the briefcase stays legible.
// Shapes are signed-distance functions, supersampled 4x per pixel for smooth edges.  usage: node tools/icons.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../extension/icons/', import.meta.url));
const INK = [31, 111, 80]; // --evergreen
const PAPER = [246, 247, 244]; // --paper
const SS = 4;

/** Signed distance to a rounded rectangle (negative inside). Coordinates are 0..1 of the tile. */
function rrect(x, y, x0, y0, x1, y1, r) {
  const dx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
  const dy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}

/** Color at tile coordinates (0..1), or null when outside the tile. */
function tile(x, y) {
  if (rrect(x, y, 0, 0, 1, 1, 0.22) > 0) return null;
  const handle = rrect(x, y, 0.37, 0.2, 0.63, 0.42, 0.07);
  if (handle <= 0 && handle >= -0.06) return PAPER; // handle: a 0.06-thick ring
  if (rrect(x, y, 0.17, 0.34, 0.83, 0.78, 0.08) <= 0) { // body
    if (rrect(x, y, 0.445, 0.49, 0.555, 0.59, 0.025) <= 0) return PAPER; // clasp
    if (Math.abs(y - 0.54) < 0.022) return INK; // lid seam
    return PAPER;
  }
  return INK;
}

function png(size, pad) {
  const inner = size - 2 * pad;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = tile((px + (sx + 0.5) / SS - pad) / inner, (py + (sy + 0.5) / SS - pad) / inner);
        if (!c) continue;
        r += c[0]; g += c[1]; b += c[2]; a++;
      }
      const i = py * (size * 4 + 1) + 1 + px * 4;
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
for (const [size, pad] of [[16, 0], [32, 0], [48, 2], [128, 16]]) {
  writeFileSync(`${out}icon-${size}.png`, png(size, pad));
  console.log(`wrote icons/icon-${size}.png (${size}x${size}, ${pad}px padding)`);
}
