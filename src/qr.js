// A small, dependency-free QR Code encoder (byte mode, error correction level M, versions 1-10).
// Written for the join sign so the QR code is made offline, on the Pi, with no library or web service.
// Layout follows ISO/IEC 18004; checked in test/qr.test.js against a published codeword vector and
// by decoding the rendered image with independent decoders (zbar, OpenCV).

// Per version for level M: [ec codewords per block, [[blocks, data codewords per block], ...]]
const BLOCKS = [
  null,
  [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
  [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_BYTES = 213;

// GF(256), primitive polynomial 0x11D.
const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

export function rsRemainder(data, degree) {
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

const bitAt = (v, i) => ((v >>> i) & 1) === 1;

// The data codewords (before error correction) for a UTF-8 string at the given version.
export function dataCodewords(text, version) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  const [ec, groups] = BLOCKS[version];
  const capacity = groups.reduce((s, [n, d]) => s + n * d, 0);
  const bits = [];
  const put = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  void ec;
  return out;
}

function fits(len, version) {
  const [, groups] = BLOCKS[version];
  const capacity = groups.reduce((s, [n, d]) => s + n * d, 0);
  return 4 + (version < 10 ? 8 : 16) + len * 8 <= capacity * 8;
}

// Final codeword sequence: data blocks interleaved, then error correction blocks interleaved.
export function allCodewords(text, version) {
  const data = dataCodewords(text, version);
  const [ecLen, groups] = BLOCKS[version];
  const blocks = [];
  let at = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { blocks.push(data.slice(at, at + d)); at += d; }
  const ecs = blocks.map((b) => rsRemainder(b, ecLen));
  const out = [];
  for (let i = 0; i < Math.max(...blocks.map((b) => b.length)); i++) blocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
  for (let i = 0; i < ecLen; i++) ecs.forEach((e) => out.push(e[i]));
  return out;
}

export function encode(text) {
  const len = Buffer.byteLength(String(text), 'utf8');
  let version = 1;
  while (version <= 10 && !fits(len, version)) version++;
  if (version > 10) throw new Error('QR text too long');
  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { mod[y][x] = dark; fn[y][x] = true; } };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(cx + dx, cy + dy, d !== 2 && d !== 4);
    }
  }
  const pos = ALIGN[version];
  pos.forEach((cy, i) => pos.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask) => {
    let rem = mask; // level M is 00, so the 5 data bits are just the mask
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((mask << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bitAt(bits, i));
    set(8, 7, bitAt(bits, 6)); set(8, 8, bitAt(bits, 7)); set(7, 8, bitAt(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bitAt(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bitAt(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bitAt(bits, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bitAt(bits, i)); set(b, a, bitAt(bits, i));
    }
  }

  const codewords = allCodewords(text, version);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && bit < codewords.length * 8) { mod[y][x] = bitAt(codewords[bit >>> 3], 7 - (bit & 7)); bit++; }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
  ];
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    apply(m); drawFormat(m);
    const s = penalty(mod, size);
    if (s < bestScore) { bestScore = s; best = m; }
    apply(m); // undo
  }
  apply(best); drawFormat(best);
  return { version, size, modules: mod.map((r) => r.slice()) };
}

function penalty(m, size) {
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map((r) => r[i])); }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    const s = line.map((v) => (v ? '1' : '0')).join('');
    for (const pat of ['00001011101', '10111010000']) for (let at = s.indexOf(pat); at >= 0; at = s.indexOf(pat, at + 1)) score += 40;
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  const dark = m.reduce((s, r) => s + r.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 20) - (size * size * 10)) / (size * size)) * 10;
  return score;
}

// An SVG string: black modules on a white background with a 4-module quiet zone. Only numbers go in.
export function qrSvg(text, { label = 'QR code' } = {}) {
  const { size, modules } = encode(text);
  const q = 4;
  const total = size + 2 * q;
  let d = '';
  modules.forEach((row, y) => { let x = 0; while (x < size) { if (!row[x]) { x++; continue; } let e = x; while (e < size && row[e]) e++; d += `M${x + q} ${y + q}h${e - x}v1h-${e - x}z`; x = e; } });
  const safe = String(label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
