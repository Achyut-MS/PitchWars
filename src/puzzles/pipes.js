import { shuffle, randInt } from './rng.js';

// A tile is a number made of four bits: north 1, east 2, south 4, west 8.
const N = 1, E = 2, S = 4, W = 8;
const SIZES = [3, 4, 5, 6];
export const rotate = (mask, times) => {
  let m = mask;
  for (let i = 0; i < times; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const mask = Array.from({ length: n }, () => Array(n).fill(0));
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = shuffle(rng, [[-1, 0, N, S], [0, 1, E, W], [1, 0, S, N], [0, -1, W, E]])
      .filter(([dr, dc]) => r + dr >= 0 && c + dc >= 0 && r + dr < n && c + dc < n && !seen[r + dr][c + dc]);
    if (!options.length) { stack.pop(); continue; }
    const [dr, dc, here, there] = options[0];
    mask[r][c] |= here;
    mask[r + dr][c + dc] |= there;
    seen[r + dr][c + dc] = true;
    stack.push([r + dr, c + dc]);
  }
  const turns = mask.map((row) => row.map(() => randInt(rng, 4)));
  const tiles = mask.map((row, r) => row.map((m, c) => rotate(m, turns[r][c])));
  const solution = turns.map((row) => row.map((t) => (4 - t) % 4));
  return { puzzle: { n, tiles }, solution };
}

// answer: an n by n grid of how many quarter turns to give each tile. Every open end must meet another open end and all tiles must join up.
export function check(puzzle, answer) {
  const { n, tiles } = puzzle;
  if (!Array.isArray(answer) || answer.length !== n) return false;
  for (const row of answer) if (!Array.isArray(row) || row.length !== n || !row.every((t) => Number.isInteger(t) && t >= 0 && t < 4)) return false;
  const m = tiles.map((row, r) => row.map((t, c) => rotate(t, answer[r][c])));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const t = m[r][c];
    if (t & N && !(r > 0 && m[r - 1][c] & S)) return false;
    if (t & S && !(r < n - 1 && m[r + 1][c] & N)) return false;
    if (t & E && !(c < n - 1 && m[r][c + 1] & W)) return false;
    if (t & W && !(c > 0 && m[r][c - 1] & E)) return false;
  }
  const seen = new Set(['0,0']);
  const queue = [[0, 0]];
  while (queue.length) {
    const [r, c] = queue.pop();
    const t = m[r][c];
    const next = [[t & N, r - 1, c], [t & S, r + 1, c], [t & E, r, c + 1], [t & W, r, c - 1]];
    for (const [open, a, b] of next) {
      if (open && !seen.has(`${a},${b}`)) { seen.add(`${a},${b}`); queue.push([a, b]); }
    }
  }
  return seen.size === n * n;
}

export const GLYPH = { 0: ' ', 1: '╵', 2: '╶', 3: '└', 4: '╷', 5: '│', 6: '┌', 7: '├', 8: '╴', 9: '┘', 10: '─', 11: '┴', 12: '┐', 13: '┤', 14: '┬', 15: '┼' };
