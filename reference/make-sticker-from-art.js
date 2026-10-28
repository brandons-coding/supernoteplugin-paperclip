// Turns the hand-drawn paperclip (opaque white background) into a black
// paperclip on transparent, so a placed sticker never blanks out handwriting
// under it. Writes assets/sticker.png; run scripts/embed-sticker.js after.
// Run with: node reference/make-sticker-from-art.js
// Input is 8-bit RGBA, non-interlaced, which is what the source file is.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'paperclip-art-original.png');

const d = fs.readFileSync(SRC);
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

// Undo the per-row PNG filters.
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

// Darkness becomes opacity, ink goes pure black. Keeps the antialiased edge
// instead of a hard threshold; the Nomad is black and white, so softness that
// the panel can't show is harmless.
const raw = Buffer.alloc(H * (1 + stride));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = y * stride + x * BPP;
    const lum = (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) / 1000;
    const alpha = Math.round((255 - lum) * (px[o + 3] / 255));
    raw[y * (1 + stride) + 1 + x * BPP + 3] = alpha;
  }
}

const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(path.join(root, 'assets', 'sticker.png'), png);
console.log(`sticker.png ${png.length} bytes, ${W}x${H}`);
