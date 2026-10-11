import { growRegions, randInt, shuffle } from './rng.js';

const SIZES = [5, 6, 7, 8];

function placeQueens(n, rng) {
  const cols = [];
  const used = new Set();
  function go(r) {
    if (r === n) return true;
    for (const c of shuffle(rng, [...Array(n).keys()])) {
      if (used.has(c)) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) <= 1) continue;
      cols.push(c); used.add(c);
      if (go(r + 1)) return true;
      cols.pop(); used.delete(c);
    }
    return false;
  }
  go(0);
  return cols;
}

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const cols = placeQueens(n, rng);
  const regions = growRegions(rng, n, n, cols.map((c, r) => [r, c]));
  return { puzzle: { n, regions }, solution: cols };
}

// answer: one column number per row. One queen per row, column and region; queens never touch.
export function check(puzzle, answer) {
  const { n, regions } = puzzle;
  if (!Array.isArray(answer) || answer.length !== n) return false;
  if (!answer.every((c) => Number.isInteger(c) && c >= 0 && c < n)) return false;
  if (new Set(answer).size !== n) return false;
  if (new Set(answer.map((c, r) => regions[r][c])).size !== n) return false;
  for (let r = 1; r < n; r++) if (Math.abs(answer[r] - answer[r - 1]) <= 1) return false;
  return true;
}
