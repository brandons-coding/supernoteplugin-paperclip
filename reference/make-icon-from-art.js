// Redraws assets/icon.png (the toolbar and plugin-list icon) from the
// sticker art. An earlier icon drew the clip at about 40 percent of the
// square, which read as too small next to the native icons; this fits the
// art's ink to FILL of the height, centred, black on opaque white.
// Run with: node reference/make-icon-from-art.js
// Leaves the sticker alone: that's assets/sticker.png and src/stickerPng.ts.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const SRC = path.join(root, 'assets', 'sticker.png');
const OUT = path.join(root, 'assets', 'icon.png');
const SIZE = 48;
const FILL = 0.84;
// Below this coverage a pixel goes white, above it black. The toolbar icons
// next to ours are hard black and white, and grey edges dither on e-ink.
const INK_THRESHOLD = 0.4;

function readRgba(file) {
  const d = fs.readFileSync(file);
  let W = 0;
  let H = 0;
  const idat = [];
  for (let i = 8; i < d.length; ) {
    const n = d.readUInt32BE(i);
    const type = d.toString('ascii', i + 4, i + 8);
    const body = d.subarray(i + 8, i + 8 + n);
    if (type === 'IHDR') {
      W = body.readUInt32BE(0);
      H = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('expected 8-bit RGBA, no interlace');
    }
    if (type === 'IDAT') idat.push(body);
    i += 12 + n;
  }
  const BPP = 4;
  const stride = W * BPP;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    const f = inflated[y * (stride + 1)];
    const src = inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= BPP ? px[y * stride + x - BPP] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= BPP && y > 0 ? px[(y - 1) * stride + x - BPP] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  return {W, H, px};
}

function writeRgba(file, W, H, rgba) {
  const CRC_TABLE = Array.from({length: 256}, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = buf => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) rgba.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const {W, H, px} = readRgba(SRC);
const rawAlpha = (x, y) => px[(y * W + x) * 4 + 3] / 255;

// Keep only the biggest connected blob of ink. The art has a pencil speck to
// the left of the clip; counted, it doubles the width and shrinks the clip.
const INK = 0.05;
const blob = new Int32Array(W * H).fill(-1);
let best = {id: -1, size: 0};
for (let start = 0, id = 0; start < W * H; start++) {
  if (blob[start] !== -1 || rawAlpha(start % W, Math.floor(start / W)) <= INK) continue;
  const stack = [start];
  blob[start] = id;
  let size = 0;
  while (stack.length) {
    const i = stack.pop();
    size++;
    const [x, y] = [i % W, Math.floor(i / W)];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * W + nx;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && blob[n] === -1 && rawAlpha(nx, ny) > INK) {
        blob[n] = id;
        stack.push(n);
      }
    }
  }
  if (size > best.size) best = {id, size};
  id++;
}
const alpha = (x, y) => (blob[y * W + x] === best.id ? rawAlpha(x, y) : 0);

// Fit the ink, not the canvas: the art has empty margin around the clip.
let [x0, y0, x1, y1] = [W, H, -1, -1];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (alpha(x, y) > 0) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
}
const inkW = x1 - x0 + 1;
const inkH = y1 - y0 + 1;
const scale = Math.min((SIZE * FILL) / inkH, (SIZE * FILL) / inkW);
const offX = (SIZE - inkW * scale) / 2;
const offY = (SIZE - inkH * scale) / 2;

// Box filter: each icon pixel averages the art pixels under it, sampled on a
// 4x4 grid. Plenty for a 3.5x shrink.
const SUB = 4;
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let cover = 0;
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const ax = Math.floor(x0 + (x + (sx + 0.5) / SUB - offX) / scale);
        const ay = Math.floor(y0 + (y + (sy + 0.5) / SUB - offY) / scale);
        if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) cover += alpha(ax, ay);
      }
    }
    const v = cover / (SUB * SUB) >= INK_THRESHOLD ? 0 : 255;
    out.fill(v, (y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3);
    out[(y * SIZE + x) * 4 + 3] = 255;
  }
}

writeRgba(OUT, SIZE, SIZE, out);
console.log(`icon.png ${SIZE}x${SIZE}, ink ${inkW}x${inkH} scaled ${scale.toFixed(3)} to ${Math.round(inkH * scale)} px tall`);
