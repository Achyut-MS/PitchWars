// Small seedable random number generator, so tests can repeat a puzzle exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rng, n) => Math.floor(rng() * n);

export function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Grows regions from seed cells until every cell of an n by m grid belongs to one.
export function growRegions(rng, rows, cols, seeds) {
  const reg = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const frontier = [];
  seeds.forEach(([r, c], id) => { reg[r][c] = id; frontier.push([r, c]); });
  while (frontier.length) {
    const i = randInt(rng, frontier.length);
    const [r, c] = frontier[i];
    const free = DIRS.map(([dr, dc]) => [r + dr, c + dc])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < rows && b < cols && reg[a][b] === -1);
    if (!free.length) { frontier.splice(i, 1); continue; }
    const [a, b] = free[randInt(rng, free.length)];
    reg[a][b] = reg[r][c];
    frontier.push([a, b]);
  }
  return reg;
}
