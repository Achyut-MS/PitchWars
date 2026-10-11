import { randInt, shuffle } from './rng.js';

const SIZES = [4, 4, 5, 6];
const HIDE = [0.25, 0.5, 0.5, 0.55]; // share of clues that are hidden

function visible(line) {
  let best = 0;
  let count = 0;
  for (const h of line) if (h > best) { best = h; count++; }
  return count;
}

function latin(n, rng) {
  const rows = shuffle(rng, [...Array(n).keys()]);
  const cols = shuffle(rng, [...Array(n).keys()]);
  const sym = shuffle(rng, [...Array(n).keys()]);
  return rows.map((r) => cols.map((c) => sym[(r + c) % n] + 1));
}

// Reveals the top clue of column c, computed for that same column.
export function revealTop(puzzle, g, c) {
  puzzle.top[c] = visible(g.map((row) => row[c]));
}

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const g = latin(n, rng);
  const col = (c) => g.map((row) => row[c]);
  const clue = (v) => (rng() < HIDE[level - 1] ? null : v);
  const puzzle = {
    n,
    top: g[0].map((_, c) => clue(visible(col(c)))),
    bottom: g[0].map((_, c) => clue(visible(col(c).reverse()))),
    left: g.map((row) => clue(visible(row))),
    right: g.map((row) => clue(visible([...row].reverse()))),
  };
  if ([...puzzle.top, ...puzzle.bottom, ...puzzle.left, ...puzzle.right].every((x) => x === null)) {
    revealTop(puzzle, g, randInt(rng, n));
  }
  return { puzzle, solution: g };
}

// answer: an n by n grid of heights 1..n. No repeats in a row or column, and every clue is met.
export function check(puzzle, answer) {
  const { n } = puzzle;
  if (!Array.isArray(answer) || answer.length !== n) return false;
  for (const row of answer) {
    if (!Array.isArray(row) || row.length !== n) return false;
    if (!row.every((v) => Number.isInteger(v) && v >= 1 && v <= n)) return false;
    if (new Set(row).size !== n) return false;
  }
  for (let c = 0; c < n; c++) {
    const col = answer.map((row) => row[c]);
    if (new Set(col).size !== n) return false;
    if (puzzle.top[c] != null && visible(col) !== puzzle.top[c]) return false;
    if (puzzle.bottom[c] != null && visible([...col].reverse()) !== puzzle.bottom[c]) return false;
  }
  for (let r = 0; r < n; r++) {
    if (puzzle.left[r] != null && visible(answer[r]) !== puzzle.left[r]) return false;
    if (puzzle.right[r] != null && visible([...answer[r]].reverse()) !== puzzle.right[r]) return false;
  }
  return true;
}
