const SIZES = [4, 5, 6, 7];
const SHOWN = [1, 0.85, 0.7, 0.6]; // share of cells that show a number

function around(grid, r, c, n) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const a = r + dr;
      const b = c + dc;
      if (a >= 0 && b >= 0 && a < n && b < n && grid[a][b]) count++;
    }
  }
  return count;
}

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const solution = Array.from({ length: n }, () => Array.from({ length: n }, () => rng() < 0.5));
  const clues = solution.map((row, r) => row.map((_, c) => (rng() < SHOWN[level - 1] ? around(solution, r, c, n) : null)));
  return { puzzle: { n, clues }, solution };
}

// answer: an n by n grid of true (filled) or false. Each number counts the filled cells in its 3 by 3 block.
export function check(puzzle, answer) {
  const { n, clues } = puzzle;
  if (!Array.isArray(answer) || answer.length !== n) return false;
  for (const row of answer) if (!Array.isArray(row) || row.length !== n || !row.every((v) => typeof v === 'boolean')) return false;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (clues[r][c] != null && around(answer, r, c, n) !== clues[r][c]) return false;
  }
  return true;
}
