import { randInt } from './rng.js';

const SIZES = [4, 5, 6, 7];

function split(rect, rng, out) {
  const { r, c, h, w } = rect;
  const area = h * w;
  if (area <= 3 || (area <= 8 && rng() < 0.45)) { out.push(rect); return; }
  const cuts = [];
  for (let k = 1; k < h; k++) if (k * w >= 2 && (h - k) * w >= 2) cuts.push(['h', k]);
  for (let k = 1; k < w; k++) if (k * h >= 2 && (w - k) * h >= 2) cuts.push(['w', k]);
  if (!cuts.length) { out.push(rect); return; }
  const longer = cuts.filter(([axis]) => (axis === 'h') === (h >= w));
  const pool = longer.length && rng() < 0.7 ? longer : cuts;
  const [axis, k] = pool[randInt(rng, pool.length)];
  if (axis === 'h') {
    split({ r, c, h: k, w }, rng, out);
    split({ r: r + k, c, h: h - k, w }, rng, out);
  } else {
    split({ r, c, h, w: k }, rng, out);
    split({ r, c: c + k, h, w: w - k }, rng, out);
  }
}

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const rects = [];
  split({ r: 0, c: 0, h: n, w: n }, rng, rects);
  const clues = Array.from({ length: n }, () => Array(n).fill(null));
  for (const q of rects) clues[q.r + randInt(rng, q.h)][q.c + randInt(rng, q.w)] = q.h * q.w;
  return { puzzle: { n, clues }, solution: rects };
}

// answer: a list of rectangles {r, c, h, w}. They cover the grid once, and each holds exactly one number equal to its area.
export function check(puzzle, answer) {
  const { n, clues } = puzzle;
  if (!Array.isArray(answer)) return false;
  const owner = Array.from({ length: n }, () => Array(n).fill(false));
  for (const q of answer) {
    if (!q || ![q.r, q.c, q.h, q.w].every((v) => Number.isInteger(v))) return false;
    if (q.h < 1 || q.w < 1 || q.r < 0 || q.c < 0 || q.r + q.h > n || q.c + q.w > n) return false;
    let clueCount = 0;
    let clueValue = null;
    for (let r = q.r; r < q.r + q.h; r++) for (let c = q.c; c < q.c + q.w; c++) {
      if (owner[r][c]) return false;
      owner[r][c] = true;
      if (clues[r][c] != null) { clueCount++; clueValue = clues[r][c]; }
    }
    if (clueCount !== 1 || clueValue !== q.h * q.w) return false;
  }
  return owner.every((row) => row.every(Boolean));
}
