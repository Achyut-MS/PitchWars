import { DIRS, growRegions, randInt, shuffle } from './rng.js';

const SIZES = [5, 6, 6, 7];
const BASE = {
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  S: [[0, 1], [0, 2], [1, 0], [1, 1]],
};

function normalise(cells) {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const sig = (cells) => normalise(cells).map((p) => p.join(',')).join(';');

// Every way each shape can lie: rotated and flipped.
const ORIENTATIONS = [];
for (const [letter, cells] of Object.entries(BASE)) {
  const seen = new Set();
  let cur = cells;
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const s = sig(cur);
      if (!seen.has(s)) { seen.add(s); ORIENTATIONS.push({ letter, cells: normalise(cur) }); }
      cur = cur.map(([r, c]) => [c, -r]);
    }
    cur = cur.map(([r, c]) => [r, -c]);
  }
}
const SHAPE_OF = new Map(ORIENTATIONS.map((o) => [sig(o.cells), o.letter]));

const key = (r, c) => `${r},${c}`;

function hasBlock(shaded, r, c) {
  for (const [a, b] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) {
    if (shaded.has(key(a, b)) && shaded.has(key(a + 1, b)) && shaded.has(key(a, b + 1)) && shaded.has(key(a + 1, b + 1))) return true;
  }
  return false;
}

function connected(cells) {
  if (!cells.length) return true;
  const set = new Set(cells.map(([r, c]) => key(r, c)));
  const seen = new Set([key(...cells[0])]);
  const queue = [cells[0]];
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [dr, dc] of DIRS) {
      const k = key(r + dr, c + dc);
      if (set.has(k) && !seen.has(k)) { seen.add(k); queue.push([r + dr, c + dc]); }
    }
  }
  return seen.size === set.size;
}

function touchesSameShape(shapeByCell, regions, r, c, letter, region) {
  for (const [dr, dc] of DIRS) {
    const k = key(r + dr, c + dc);
    if (shapeByCell.has(k)) {
      const [a, b] = [r + dr, c + dc];
      if (regions[a][b] !== region && shapeByCell.get(k) === letter) return true;
    }
  }
  return false;
}

// budget is shared: solve decrements budget.left (node count, deterministic).
function solve(rows, regions, count, budget) {
  const placements = Array.from({ length: count }, () => []);
  for (const o of ORIENTATIONS) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < rows; c++) {
      const cells = o.cells.map(([a, b]) => [r + a, c + b]);
      if (cells.some(([a, b]) => a >= rows || b >= rows)) continue;
      const id = regions[cells[0][0]][cells[0][1]];
      if (cells.every(([a, b]) => regions[a][b] === id)) placements[id].push({ letter: o.letter, cells });
    }
  }
  if (placements.some((p) => !p.length)) return null;
  const order = [...Array(count).keys()].sort((a, b) => placements[a].length - placements[b].length);
  const shaded = new Set();
  const shapeByCell = new Map();
  const chosen = [];
  function go(i) {
    if (i === order.length) return connected(chosen.flatMap((p) => p.cells));
    if (--budget.left < 0) return false;
    const id = order[i];
    for (const p of placements[id]) {
      if (p.cells.some(([r, c]) => touchesSameShape(shapeByCell, regions, r, c, p.letter, id))) continue;
      p.cells.forEach(([r, c]) => { shaded.add(key(r, c)); shapeByCell.set(key(r, c), p.letter); });
      const blocked = p.cells.some(([r, c]) => hasBlock(shaded, r, c));
      if (!blocked) { chosen.push(p); if (go(i + 1)) return true; chosen.pop(); }
      p.cells.forEach(([r, c]) => { shaded.delete(key(r, c)); shapeByCell.delete(key(r, c)); });
      if (budget.left < 0) return false;
    }
    return false;
  }
  return go(0) ? chosen.flatMap((p) => p.cells) : null;
}

// Total search nodes one generate() call may spend, so it never blocks the server for long.
export const NODE_CAP = 3000;

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const count = Math.max(4, Math.floor((n * n) / 6.5));
  const budget = { left: NODE_CAP };
  for (let attempt = 0; attempt < 400 && budget.left > 0; attempt++) {
    budget.left -= 40; // cost of building a region layout
    const cells = shuffle(rng, [...Array(n * n).keys()]).slice(0, count).map((i) => [Math.floor(i / n), i % n]);
    const regions = growRegions(rng, n, n, cells);
    const sizes = Array(count).fill(0);
    regions.flat().forEach((id) => sizes[id]++);
    if (sizes.some((s) => s < 4)) continue;
    const solution = solve(n, regions, count, budget);
    if (solution) return { puzzle: { n, regions, count }, solution };
  }
  throw new Error('could not build a LITS puzzle');
}

// answer: a list of shaded cells [row, col]. One tetromino per region, no 2 by 2 block, one connected piece,
// and two touching pieces of different regions never have the same shape.
export function check(puzzle, answer) {
  const { n, regions, count } = puzzle;
  if (!Array.isArray(answer) || answer.length !== count * 4) return false;
  const seen = new Set();
  for (const p of answer) {
    if (!Array.isArray(p) || !p.every(Number.isInteger) || p[0] < 0 || p[1] < 0 || p[0] >= n || p[1] >= n) return false;
    if (seen.has(key(...p))) return false;
    seen.add(key(...p));
  }
  const byRegion = Array.from({ length: count }, () => []);
  for (const [r, c] of answer) byRegion[regions[r][c]].push([r, c]);
  const shapeByCell = new Map();
  for (let id = 0; id < count; id++) {
    const cells = byRegion[id];
    if (cells.length !== 4 || !connected(cells)) return false;
    const letter = SHAPE_OF.get(sig(cells));
    if (!letter) return false;
    cells.forEach(([r, c]) => shapeByCell.set(key(r, c), letter));
  }
  for (const [r, c] of answer) {
    if (hasBlock(seen, r, c)) return false;
    if (touchesSameShape(shapeByCell, regions, r, c, shapeByCell.get(key(r, c)), regions[r][c])) return false;
  }
  return connected(answer);
}
