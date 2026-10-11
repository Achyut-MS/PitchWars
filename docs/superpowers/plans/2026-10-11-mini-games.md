# Startup Showdown: Plan 4 of 7, Mini Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the CFO an optional second job during the Competition: solve puzzles for coins. Seven puzzle types (Queens, Sets, Tower, Mosaic, Pipes, Shikaku, Lits), difficulty that rises by itself, a fixed reward, two free skips and then a 10-coin penalty, and the Mini-Game Jam attack halving the reward.

**Architecture:** Each puzzle is a small module with `generate(level, rng)` (returns the puzzle the player sees and a stored solution) and `check(puzzle, answer)` (checks the **rules**, so any valid answer is accepted, not only the stored one). The server keeps the solution and never sends it. A `puzzle_sessions` table records every puzzle shown, solved or skipped. The browser side of each puzzle is a set of pure functions (`initial`, `apply`, `render`, `answer`) so it is tested in Node.

**Tech Stack:** unchanged. The puzzle code in this plan has already been run and passes its tests (generators for every level, checkers, damaged-answer detection, and tapping the stored solution through the browser functions).

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`, Section 2.0.1 and Section 10. Plans 1 to 3 must be finished first.

## Global Constraints

- Everything from the Global Constraints of Plans 1 to 3 still applies.
- **Puzzles:** Queens, Sets, Tower, Mosaic, Pipes, Shikaku, Lits. Everything is built into the platform and works offline.
- **Who plays:** only the **CFO**, during the **Competition** phase.
- **Difficulty rises automatically:** level 1 at the start; one level up for every **2 puzzles solved**, up to level 4. The CFO never chooses.
- **Rewards:** level 1 and 2 pay **20 coins**; level 3 and 4 pay **40 coins**. A solved puzzle adds to the wallet at once and to `mini_coins`.
- **Skips:** the first **2 skips per game and company are free**. Every later skip costs **10 coins**, taken from the wallet. The count is for the whole game.
- **No time limit per puzzle.** Only the Competition timer applies.
- **Mini-Game Jam** (Plan 3's `minigame_half` attack) halves the reward (rounded down) while it is active against the CFO's company.
- **The solution never leaves the server.** The browser receives only the puzzle.
- **A wrong answer costs nothing;** it is counted and logged.
- **Recording:** every puzzle shown (kind, level, time), solved or skipped (free or paid), time taken and coins earned is logged. No move-by-move data.

## Review Focus

1. **The solution leaking to the browser** through the view or a message (Task 5).
2. **Submitting an answer twice** (double tap) must pay once (Task 4).
3. **A skip with the wallet near -200** is still allowed, and the penalty is applied exactly once (Task 4).
4. **A puzzle that cannot be generated** (Lits with an unlucky seed) must not leave the CFO without a puzzle (Task 4).
5. **Garbage answers** (null, wrong shape, huge arrays) must be refused, never crash the server (Task 1, Task 2).
6. **The Competition ending while a puzzle is open:** submitting after the end is refused (Task 4).

## File Structure

```
src/puzzles/
  rng.js  queens.js  sets.js  tower.js  mosaic.js  pipes.js  shikaku.js  lits.js  index.js
src/minigame.js          session engine: start, submit, skip, rewards
src/db.js                (modify) puzzle_sessions table
src/views.js             (modify) CFO puzzle block
src/server.js            (modify) puzzle messages
public/puzzles/ui.js     browser side of all seven puzzles
public/render.js         (modify) the CFO puzzle panel
public/app.js            (modify) puzzle state and taps
test/puzzles.test.js  test/puzzle-ui.test.js  test/minigame.test.js  test/views-puzzle.test.js  test/render-puzzle.test.js
```

---

### Task 1: Random numbers, and the first four puzzles (Queens, Sets, Tower, Mosaic)

**Files:**
- Create: `src/puzzles/rng.js`, `src/puzzles/queens.js`, `src/puzzles/sets.js`, `src/puzzles/tower.js`, `src/puzzles/mosaic.js`, `src/puzzles/index.js`, `test/puzzles.test.js`

**Interfaces:**
- Produces:
  - `mulberry32(seed) -> rng`, `randInt(rng, n)`, `shuffle(rng, list)`, `DIRS`, `growRegions(rng, rows, cols, seeds)`.
  - For each puzzle module: `generate(level 1..4, rng) -> { puzzle, solution }` and `check(puzzle, answer) -> boolean` (never throws).
  - `PUZZLES` (kind to module), `NAMES` (kind to display name), `KINDS` (array of kinds).
  - Answer shapes: Queens, one column per row (`[2, 0, 3, ...]`); Sets, a list of groups of three card numbers; Tower, an n by n grid of heights; Mosaic, an n by n grid of booleans.

- [ ] **Step 1: Write the failing tests**

`test/puzzles.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, KINDS } from '../src/puzzles/index.js';
import { mulberry32 } from '../src/puzzles/rng.js';

for (const kind of KINDS) {
  test(`${kind}: every level makes a puzzle whose own solution passes the checker`, () => {
    for (let level = 1; level <= 4; level++) {
      for (let seed = 1; seed <= 12; seed++) {
        const { puzzle, solution } = PUZZLES[kind].generate(level, mulberry32(seed * 101 + level));
        assert.equal(PUZZLES[kind].check(puzzle, solution), true, `${kind} level ${level} seed ${seed}`);
      }
    }
  });
  test(`${kind}: nonsense answers are refused and never throw`, () => {
    const { puzzle } = PUZZLES[kind].generate(2, mulberry32(7));
    for (const bad of [null, undefined, 5, 'x', [], {}, [[]], [null], [[1, 2, 3]]]) {
      assert.equal(PUZZLES[kind].check(puzzle, bad), false);
    }
  });
  test(`${kind}: the same seed gives the same puzzle`, () => {
    const a = PUZZLES[kind].generate(3, mulberry32(42));
    const b = PUZZLES[kind].generate(3, mulberry32(42));
    assert.deepEqual(a, b);
  });
}

const mutate = {
  queens: (s) => { const a = [...s]; [a[0], a[1]] = [a[1], a[0]]; return a; },
  sets: (s) => s.map((g, i) => (i === 0 ? [g[0], g[1], s[1][2]] : i === 1 ? [g[0], g[1], s[0][2]] : g)),
  tower: (s) => s.map((row, r) => (r === 0 ? [row[1], row[0], ...row.slice(2)] : row)),
  mosaic: (s) => s.map((row, r) => (r === 0 ? row.map((v, c) => (c === 0 ? !v : v)) : row)),
  pipes: (s) => s.map((row, r) => (r === 0 ? row.map((v, c) => (c === 0 ? (v + 1) % 4 : v)) : row)),
  shikaku: (s) => s.slice(1),
  lits: (s) => s.slice(1),
};
for (const kind of KINDS) {
  test(`${kind}: a damaged solution is caught in most puzzles`, () => {
    let caught = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { puzzle, solution } = PUZZLES[kind].generate(3, mulberry32(seed));
      if (!PUZZLES[kind].check(puzzle, mutate[kind](solution))) caught++;
    }
    assert.ok(caught >= 14, `${kind} caught ${caught} of 20`);
  });
}
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/puzzles/index.js`

- [ ] **Step 3: Write the implementation**

`src/puzzles/rng.js`:

```js
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
```

`src/puzzles/queens.js`:

```js
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
```

`src/puzzles/sets.js`:

```js
import { randInt, shuffle } from './rng.js';

const GROUPS = [2, 3, 4, 4]; // how many sets to find at each level

const third = (a, b) => a.map((x, i) => (x === b[i] ? x : 3 - x - b[i]));
const same = (a, b) => a.every((x, i) => x === b[i]);
const key = (card) => card.join('');
const isSet = (a, b, c) => same(third(a, b), c);

function randomCard(rng) { return [0, 0, 0, 0].map(() => randInt(rng, 3)); }

export function generate(level, rng) {
  const k = GROUPS[level - 1];
  for (;;) {
    const cards = [];
    const seen = new Set();
    let ok = true;
    for (let g = 0; g < k && ok; g++) {
      let placed = false;
      for (let tries = 0; tries < 50 && !placed; tries++) {
        const a = randomCard(rng);
        const b = randomCard(rng);
        if (same(a, b)) continue;
        const c = third(a, b);
        const keys = [key(a), key(b), key(c)];
        if (keys.some((x) => seen.has(x))) continue;
        keys.forEach((x) => seen.add(x));
        cards.push(a, b, c);
        placed = true;
      }
      ok = placed;
    }
    if (!ok) continue;
    const order = shuffle(rng, cards.map((_, i) => i));
    const shown = order.map((i) => cards[i]);
    const solution = [];
    for (let g = 0; g < k; g++) solution.push([0, 1, 2].map((j) => order.indexOf(g * 3 + j)));
    return { puzzle: { cards: shown }, solution };
  }
}

// answer: a list of groups of three card numbers. Every card is used once and each group is a set.
export function check(puzzle, answer) {
  const { cards } = puzzle;
  if (!Array.isArray(answer) || answer.length * 3 !== cards.length) return false;
  const used = new Set();
  for (const g of answer) {
    if (!Array.isArray(g) || g.length !== 3) return false;
    for (const i of g) {
      if (!Number.isInteger(i) || i < 0 || i >= cards.length || used.has(i)) return false;
      used.add(i);
    }
    if (!isSet(cards[g[0]], cards[g[1]], cards[g[2]])) return false;
  }
  return used.size === cards.length;
}
```

`src/puzzles/tower.js`:

```js
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
    puzzle.top[randInt(rng, n)] = visible(col(0));
    puzzle.top[0] = visible(col(0));
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
```

`src/puzzles/mosaic.js`:

```js
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
```

`src/puzzles/index.js` (for now, only these four):

```js
import * as queens from './queens.js';
import * as sets from './sets.js';
import * as tower from './tower.js';
import * as mosaic from './mosaic.js';

export const PUZZLES = { queens, sets, tower, mosaic };
export const NAMES = { queens: 'Queens', sets: 'Sets', tower: 'Tower', mosaic: 'Mosaic' };
export const KINDS = Object.keys(PUZZLES);
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS for the four puzzles (the `mutate` table in the test already has entries for the other three; they are used in Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/puzzles test/puzzles.test.js
git commit -m "feat: queens, sets, tower and mosaic puzzles with rule checkers"
```

---

### Task 2: Pipes, Shikaku and Lits

**Files:**
- Create: `src/puzzles/pipes.js`, `src/puzzles/shikaku.js`, `src/puzzles/lits.js`
- Modify: `src/puzzles/index.js`

**Interfaces:**
- Produces: the same `generate` and `check` pair for each. Answer shapes: Pipes, an n by n grid of quarter turns 0 to 3 to apply to each given tile; Shikaku, a list of rectangles `{ r, c, h, w }`; Lits, a list of shaded cells `[row, col]`. Tiles are numbers with bits north 1, east 2, south 4, west 8. `pipes.js` also exports `rotate(mask, times)` and `GLYPH` (mask to a drawing character).
- Lits rules checked: one tetromino (shape L, I, T or S) per region; no 2 by 2 block of shaded cells; all shaded cells form one connected piece; two touching tetrominoes of different regions never have the same shape.

- [ ] **Step 1: Write the failing tests**

`test/puzzles.test.js` from Task 1 already loops over every kind in `KINDS`. Extend `src/puzzles/index.js` first (it is the only line that makes the new kinds visible to the tests), so the existing tests fail for the missing modules:

```js
import * as queens from './queens.js';
import * as sets from './sets.js';
import * as tower from './tower.js';
import * as mosaic from './mosaic.js';
import * as pipes from './pipes.js';
import * as shikaku from './shikaku.js';
import * as lits from './lits.js';

export const PUZZLES = { queens, sets, tower, mosaic, pipes, shikaku, lits };
export const NAMES = { queens: 'Queens', sets: 'Sets', tower: 'Tower', mosaic: 'Mosaic', pipes: 'Pipes', shikaku: 'Shikaku', lits: 'Lits' };
export const KINDS = Object.keys(PUZZLES);
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `./pipes.js`

- [ ] **Step 3: Write the implementation**

`src/puzzles/pipes.js`:

```js
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
```

`src/puzzles/shikaku.js`:

```js
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
```

`src/puzzles/lits.js`:

```js
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
  let nodes = 0;
  function go(i) {
    if (i === order.length) return connected(chosen.flatMap((p) => p.cells));
    if (++nodes > budget) return false;
    const id = order[i];
    for (const p of placements[id]) {
      if (p.cells.some(([r, c]) => touchesSameShape(shapeByCell, regions, r, c, p.letter, id))) continue;
      p.cells.forEach(([r, c]) => { shaded.add(key(r, c)); shapeByCell.set(key(r, c), p.letter); });
      const blocked = p.cells.some(([r, c]) => hasBlock(shaded, r, c));
      if (!blocked) { chosen.push(p); if (go(i + 1)) return true; chosen.pop(); }
      p.cells.forEach(([r, c]) => { shaded.delete(key(r, c)); shapeByCell.delete(key(r, c)); });
      if (nodes > budget) return false;
    }
    return false;
  }
  return go(0) ? chosen.flatMap((p) => p.cells) : null;
}

export function generate(level, rng) {
  const n = SIZES[level - 1];
  const count = Math.max(4, Math.floor((n * n) / 6.5));
  for (let attempt = 0; attempt < 400; attempt++) {
    const cells = shuffle(rng, [...Array(n * n).keys()]).slice(0, count).map((i) => [Math.floor(i / n), i % n]);
    const regions = growRegions(rng, n, n, cells);
    const sizes = Array(count).fill(0);
    regions.flat().forEach((id) => sizes[id]++);
    if (sizes.some((s) => s < 4)) continue;
    const solution = solve(n, regions, count, 4000);
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
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS for all seven puzzles (each: its own solution passes, nonsense answers refused, same seed same puzzle, damaged solution caught). Lits is the slowest, about 15 ms per puzzle.

- [ ] **Step 5: Commit**

```bash
git add src/puzzles
git commit -m "feat: pipes, shikaku and lits puzzles"
```

---

### Task 3: The browser side of the puzzles

**Files:**
- Create: `public/puzzles/ui.js`, `test/puzzle-ui.test.js`

**Interfaces:**
- Produces `UI[kind]` for every kind, each with:
  - `initial(puzzle) -> state`
  - `apply(puzzle, state, tap) -> newState` (never changes the old state). A tap is `{ cell: [row, col] }`, or `{ card: index }` for Sets.
  - `render(puzzle, state) -> html` (a table of `<td data-cell="r,c">`, or buttons with `data-card="i"` for Sets; region colour classes `reg-0` to `reg-7`)
  - `answer(puzzle, state) -> answer` in the shape of Tasks 1 and 2.
- Tap rules: Queens, tapping a cell puts the row's queen there (tap again removes it). Sets, tapping a card picks it; the third pick makes a group; tapping a grouped card ungroups that group. Tower, a tap cycles the number from empty up to n and back. Mosaic and Lits, a tap toggles a cell. Pipes, a tap turns the tile a quarter turn. Shikaku, tap one corner then the opposite corner to draw a rectangle (an overlapping one is ignored); tapping inside a drawn rectangle removes it.

- [ ] **Step 1: Write the failing tests**

`test/puzzle-ui.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, KINDS } from '../src/puzzles/index.js';
import { mulberry32 } from '../src/puzzles/rng.js';
import { UI } from '../public/puzzles/ui.js';

// Turns the stored solution into the taps a player would make.
const taps = {
  queens: (p, sol) => sol.map((c, r) => ({ cell: [r, c] })),
  sets: (p, sol) => sol.flat().map((card) => ({ card })),
  tower: (p, sol) => sol.flatMap((row, r) => row.flatMap((v, c) => Array(v).fill({ cell: [r, c] }))),
  mosaic: (p, sol) => sol.flatMap((row, r) => row.map((on, c) => (on ? { cell: [r, c] } : null)).filter(Boolean)),
  pipes: (p, sol) => sol.flatMap((row, r) => row.flatMap((t, c) => Array(t).fill({ cell: [r, c] }))),
  shikaku: (p, sol) => sol.flatMap((q) => [{ cell: [q.r, q.c] }, { cell: [q.r + q.h - 1, q.c + q.w - 1] }]),
  lits: (p, sol) => sol.map(([r, c]) => ({ cell: [r, c] })),
};

for (const kind of KINDS) {
  test(`${kind}: tapping the solution in the browser builds an answer the server accepts`, () => {
    for (let level = 1; level <= 4; level++) {
      const { puzzle, solution } = PUZZLES[kind].generate(level, mulberry32(level * 31));
      let state = UI[kind].initial(puzzle);
      for (const t of taps[kind](puzzle, solution)) state = UI[kind].apply(puzzle, state, t);
      assert.equal(PUZZLES[kind].check(puzzle, UI[kind].answer(puzzle, state)), true, `${kind} level ${level}`);
    }
  });
  test(`${kind}: the first render gives a grid or cards that can be tapped`, () => {
    const { puzzle } = PUZZLES[kind].generate(1, mulberry32(5));
    const html = UI[kind].render(puzzle, UI[kind].initial(puzzle));
    assert.ok(kind === 'sets' ? html.includes('data-card=') : html.includes('data-cell='));
  });
  test(`${kind}: a tap never changes the old state in place`, () => {
    const { puzzle, solution } = PUZZLES[kind].generate(1, mulberry32(9));
    const s0 = UI[kind].initial(puzzle);
    const frozen = JSON.stringify(s0);
    UI[kind].apply(puzzle, s0, taps[kind](puzzle, solution)[0]);
    assert.equal(JSON.stringify(s0), frozen);
  });
}

test('queens and lits draw a border exactly where two neighbouring cells belong to different regions', () => {
  const p = { n: 2, count: 2, regions: [[0, 0], [1, 1]] };
  for (const kind of ['queens', 'lits']) {
    const html = UI[kind].render(p, UI[kind].initial(p));
    const cellOf = (r, c) => html.match(new RegExp(`<td class="([^"]*)" data-cell="${r},${c}"`))[1].split(' ');
    assert.deepEqual(cellOf(0, 0).filter((x) => /^b[trbl]$/.test(x)), ['bb'], kind);
    assert.deepEqual(cellOf(0, 1).filter((x) => /^b[trbl]$/.test(x)), ['bb'], kind);
    assert.deepEqual(cellOf(1, 0).filter((x) => /^b[trbl]$/.test(x)), ['bt'], kind);
    assert.deepEqual(cellOf(1, 1).filter((x) => /^b[trbl]$/.test(x)), ['bt'], kind);
  }
});

test('the outer edge of the grid and the inside of a region have no region border', () => {
  const p = { n: 3, count: 1, regions: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
  const html = UI.queens.render(p, UI.queens.initial(p));
  assert.equal(/class="[^"]*\bb[trbl]\b/.test(html), false);
});

test('shikaku: tapping a placed rectangle removes it, and an overlapping rectangle is ignored', () => {
  const p = { n: 4, clues: Array.from({ length: 4 }, () => Array(4).fill(null)) };
  let s = UI.shikaku.initial(p);
  for (const t of [[0, 0], [1, 1]]) s = UI.shikaku.apply(p, s, { cell: t });
  assert.equal(s.rects.length, 1);
  for (const t of [[1, 1], [2, 2]]) s = UI.shikaku.apply(p, s, { cell: t });
  // the second tap on (1,1) removes the existing rectangle; then (2,2) starts a new corner
  assert.equal(s.rects.length, 0);
  assert.deepEqual(s.first, [2, 2]);
});

test('sets: tapping a grouped card ungroups it, and the card text is escaped markup-free', () => {
  const p = { cards: [[0, 0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2]] };
  let s = UI.sets.initial(p);
  for (const card of [0, 1, 2]) s = UI.sets.apply(p, s, { card });
  assert.equal(s.groups.length, 1);
  s = UI.sets.apply(p, s, { card: 1 });
  assert.equal(s.groups.length, 0);
  assert.equal(UI.sets.render(p, s).includes('<script'), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../public/puzzles/ui.js`

- [ ] **Step 3: Write the implementation**

`public/puzzles/ui.js`:

```js
// Browser side of the seven puzzles. Pure functions, so they are tested in Node.
// Each puzzle: initial(puzzle) -> state, apply(puzzle, state, tap) -> state, render(puzzle, state) -> html, answer(puzzle, state) -> answer
const cell = (r, c, cls, text = '') => `<td class="${cls}" data-cell="${r},${c}">${text}</td>`;
const table = (rows) => `<table class="puzzle-grid">${rows.join('')}</table>`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Thick borders where two neighbouring cells belong to different regions, so regions never rely on colour alone.
const SIDES = [['bt', -1, 0], ['br', 0, 1], ['bb', 1, 0], ['bl', 0, -1]];
const edges = (regions, r, c) => SIDES
  .filter(([, dr, dc]) => regions[r + dr] && regions[r + dr][c + dc] !== undefined && regions[r + dr][c + dc] !== regions[r][c])
  .map(([name]) => name).join(' ');

const queens = {
  initial: (p) => ({ cols: Array(p.n).fill(null) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.cols[r] = n.cols[r] === c ? null : c; return n; },
  answer: (p, s) => s.cols,
  render: (p, s) => table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => cell(r, c, `reg reg-${reg} ${edges(p.regions, r, c)}${s.cols[r] === c ? ' on' : ''}`.replace(/  +/g, ' '), s.cols[r] === c ? '♛' : '')).join('')}</tr>`)),
};

const SHAPES = ['▲', '●', '■'];
const sets = {
  initial: () => ({ picked: [], groups: [] }),
  apply: (p, s, { card }) => {
    const n = clone(s);
    const g = n.groups.findIndex((grp) => grp.includes(card));
    if (g >= 0) { n.groups.splice(g, 1); return n; }
    const i = n.picked.indexOf(card);
    if (i >= 0) { n.picked.splice(i, 1); return n; }
    n.picked.push(card);
    if (n.picked.length === 3) { n.groups.push(n.picked); n.picked = []; }
    return n;
  },
  answer: (p, s) => s.groups,
  render: (p, s) => `<div class="cards">${p.cards.map(([shape, colour, count, fill], i) => {
    const g = s.groups.findIndex((grp) => grp.includes(i));
    const cls = `card c${colour} f${fill}${s.picked.includes(i) ? ' picked' : ''}${g >= 0 ? ` group g${g % 4}` : ''}`;
    return `<button class="${cls}" data-card="${i}" aria-label="Card ${i + 1}">${SHAPES[shape].repeat(count + 1)}</button>`;
  }).join('')}</div>`,
};

const tower = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(0)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = (n.grid[r][c] + 1) % (p.n + 1); return n; },
  answer: (p, s) => s.grid,
  render: (p, s) => {
    const edge = (v) => `<th>${v ?? ''}</th>`;
    const rows = [`<tr><th></th>${p.top.map(edge).join('')}<th></th></tr>`];
    s.grid.forEach((row, r) => rows.push(`<tr>${edge(p.left[r])}${row.map((v, c) => cell(r, c, 'num', v || '')).join('')}${edge(p.right[r])}</tr>`));
    rows.push(`<tr><th></th>${p.bottom.map(edge).join('')}<th></th></tr>`);
    return table(rows);
  },
};

const mosaic = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(false)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = !n.grid[r][c]; return n; },
  answer: (p, s) => s.grid,
  render: (p, s) => table(s.grid.map((row, r) => `<tr>${row.map((on, c) => cell(r, c, on ? 'fill on' : 'fill', p.clues[r][c] ?? '')).join('')}</tr>`)),
};

const GLYPH = { 0: ' ', 1: '╵', 2: '╶', 3: '└', 4: '╷', 5: '│', 6: '┌', 7: '├', 8: '╴', 9: '┘', 10: '─', 11: '┴', 12: '┐', 13: '┤', 14: '┬', 15: '┼' };
const turn = (mask, times) => { let m = mask; for (let i = 0; i < times; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const pipes = {
  initial: (p) => ({ turns: Array.from({ length: p.n }, () => Array(p.n).fill(0)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.turns[r][c] = (n.turns[r][c] + 1) % 4; return n; },
  answer: (p, s) => s.turns,
  render: (p, s) => table(p.tiles.map((row, r) => `<tr>${row.map((t, c) => cell(r, c, 'pipe', GLYPH[turn(t, s.turns[r][c])])).join('')}</tr>`)),
};

const shikaku = {
  initial: () => ({ rects: [], first: null }),
  apply: (p, s, { cell: [r, c] }) => {
    const n = clone(s);
    const inside = (q) => r >= q.r && r < q.r + q.h && c >= q.c && c < q.c + q.w;
    if (!n.first) {
      const hit = n.rects.findIndex(inside);
      if (hit >= 0) n.rects.splice(hit, 1); else n.first = [r, c];
      return n;
    }
    const [r0, c0] = n.first;
    const q = { r: Math.min(r0, r), c: Math.min(c0, c), h: Math.abs(r - r0) + 1, w: Math.abs(c - c0) + 1 };
    n.first = null;
    const overlaps = n.rects.some((o) => q.r < o.r + o.h && o.r < q.r + q.h && q.c < o.c + o.w && o.c < q.c + q.w);
    if (!overlaps) n.rects.push(q);
    return n;
  },
  answer: (p, s) => s.rects,
  render: (p, s) => table(p.clues.map((row, r) => `<tr>${row.map((v, c) => {
    const k = s.rects.findIndex((q) => r >= q.r && r < q.r + q.h && c >= q.c && c < q.c + q.w);
    const first = s.first && s.first[0] === r && s.first[1] === c;
    return cell(r, c, `rect${k >= 0 ? ` in r${k % 6}` : ''}${first ? ' first' : ''}`, v ?? '');
  }).join('')}</tr>`)),
};

const lits = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(false)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = !n.grid[r][c]; return n; },
  answer: (p, s) => s.grid.flatMap((row, r) => row.map((on, c) => (on ? [r, c] : null)).filter(Boolean)),
  render: (p, s) => table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => cell(r, c, `reg reg-${reg % 8} ${edges(p.regions, r, c)}${s.grid[r][c] ? ' on' : ''}`.replace(/  +/g, ' '), '')).join('')}</tr>`)),
};

export const UI = { queens, sets, tower, mosaic, pipes, shikaku, lits };
export { esc };
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/puzzles test/puzzle-ui.test.js
git commit -m "feat: browser-side taps and rendering for the seven puzzles"
```

---

### Task 4: The puzzle session engine

**Files:**
- Modify: `src/db.js` (append the table)
- Create: `src/minigame.js`, `test/minigame.test.js`

**Interfaces:**
- Consumes: `PUZZLES`, `KINDS`, `NAMES` (Tasks 1 and 2), `isLocked` (Plan 3), `phaseAt`, `playerIn`, `logEvent`
- Produces (`src/minigame.js`):
  - `FREE_SKIPS = 2`, `SKIP_PENALTY = 10`
  - `levelFor(solved) -> 1..4` (`min(4, 1 + floor(solved / 2))`), `rewardFor(level) -> 20 | 40`
  - `openPuzzle(db, gameId, company) -> row | undefined`
  - `publicPuzzle(db, row) -> { id, kind, name, level, reward, puzzle, skipsFreeLeft }` (no solution)
  - `startPuzzle(ctx, game, admissionId, rng = Math.random) -> row` (CFO only, Competition only; returns the open one if there is one; picks a kind different from the last one shown; retries up to 5 times if a generator fails)
  - `submitPuzzle(ctx, game, admissionId, answer) -> { ok: boolean, coins }`
  - `skipPuzzle(ctx, game, admissionId) -> { penalty }`
- Errors: `'only the CFO can play puzzles'`, `'puzzles are only open during the competition'`, `'no puzzle is open'`, `'not in this game'`.
- Table:

```sql
CREATE TABLE IF NOT EXISTS puzzle_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  company     TEXT NOT NULL,
  admission_id TEXT NOT NULL,
  kind        TEXT NOT NULL,
  level       INTEGER NOT NULL,
  puzzle      TEXT NOT NULL,
  solution    TEXT NOT NULL,
  shown_at    INTEGER NOT NULL,
  ended_at    INTEGER,
  result      TEXT CHECK (result IN ('solved','skipped')),
  coins       INTEGER NOT NULL DEFAULT 0,
  penalty     INTEGER NOT NULL DEFAULT 0,
  wrong_tries INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 1: Write the failing tests**

`test/minigame.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition, atSec } from './helpers.js';
import { levelFor, rewardFor, startPuzzle, submitPuzzle, skipPuzzle, openPuzzle, publicPuzzle } from '../src/minigame.js';
import { launchAttack } from '../src/attacks.js';
import { companyState } from '../src/state.js';
import { mulberry32 } from '../src/puzzles/rng.js';

const wallet = (h) => companyState(h.db, h.gameId, 'A').wallet;
const stored = (h) => JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution);
const start = (h, seed = 1) => startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(seed));
const solve = (h) => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, stored(h));

test('difficulty rises one level for every two puzzles solved, up to level 4', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 20].map(levelFor), [1, 1, 2, 2, 3, 3, 4, 4, 4]);
});

test('levels 1 and 2 pay 20 coins, levels 3 and 4 pay 40', () => {
  assert.deepEqual([1, 2, 3, 4].map(rewardFor), [20, 20, 40, 40]);
});

test('only the CFO can play, and only during the competition', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => startPuzzle(h.ctx, h.game(), h.seat.A.CMO), /only the CFO/);
  atSec(h, 500);
  assert.throws(() => start(h), /only open during the competition/);
});

test('a puzzle starts at level 1 and asking again returns the same open puzzle', () => {
  const h = toCompetition(makeRunning());
  const a = start(h);
  assert.equal(a.level, 1);
  assert.equal(start(h, 99).id, a.id);
});

test('solving pays the reward into the wallet and into mini game coins', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const r = solve(h);
  assert.deepEqual(r, { ok: true, coins: 20 });
  assert.equal(wallet(h), 1020);
  assert.equal(companyState(h.db, h.gameId, 'A').mini_coins, 20);
});

test('submitting the same answer twice pays once', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const sol = stored(h);
  assert.equal(submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol).ok, true);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol), /no puzzle is open/);
  assert.equal(wallet(h), 1020);
});

test('a wrong answer pays nothing, costs nothing and keeps the puzzle open', () => {
  const h = toCompetition(makeRunning());
  start(h);
  assert.deepEqual(submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, null), { ok: false, coins: 0 });
  assert.equal(wallet(h), 1000);
  assert.equal(openPuzzle(h.db, h.gameId, 'A').wrong_tries, 1);
});

test('every second solved puzzle makes the next one harder, and level 3 pays 40', () => {
  const h = toCompetition(makeRunning());
  const levels = [];
  for (let i = 0; i < 5; i++) {
    levels.push(start(h, i + 1).level);
    solve(h);
  }
  assert.deepEqual(levels, [1, 1, 2, 2, 3]);
  start(h, 50); solve(h);
  start(h, 51);
  assert.equal(solve(h).coins, 40);
});

test('the next puzzle is a different kind from the one before', () => {
  const h = toCompetition(makeRunning());
  let last = null;
  for (let i = 0; i < 8; i++) {
    const p = start(h, i + 7);
    assert.notEqual(p.kind, last);
    last = p.kind;
    solve(h);
  }
});

test('the first two skips are free, the third costs 10 coins, for the whole game', () => {
  const h = toCompetition(makeRunning());
  const penalties = [];
  for (let i = 0; i < 4; i++) { start(h, i + 1); penalties.push(skipPuzzle(h.ctx, h.game(), h.seat.A.CFO).penalty); }
  assert.deepEqual(penalties, [0, 0, 10, 10]);
  assert.equal(wallet(h), 980);
});

test('skips do not make the next puzzle easier, and skipped puzzles do not raise the level', () => {
  const h = toCompetition(makeRunning());
  start(h); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  start(h, 2); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  assert.equal(start(h, 3).level, 1);
});

test('a paid skip is allowed with a nearly empty wallet and is charged once', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -195 WHERE company='A'").run();
  for (let i = 0; i < 2; i++) { start(h, i + 1); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO); }
  start(h, 3);
  assert.equal(skipPuzzle(h.ctx, h.game(), h.seat.A.CFO).penalty, 10);
  assert.equal(wallet(h), -205);
  assert.throws(() => skipPuzzle(h.ctx, h.game(), h.seat.A.CFO), /no puzzle is open/);
});

test('Mini-Game Jam halves the reward while it is active against the CFO company', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.B.CEO, 'minigame_jam', () => 0); // B attacks A for 30 s
  start(h);
  assert.equal(solve(h).coins, 10);
  atSec(h, 835);
  start(h, 2);
  assert.equal(solve(h).coins, 20);
});

test('the public puzzle never contains the solution, and shows the free skips left', () => {
  const h = toCompetition(makeRunning());
  const row = start(h);
  const pub = publicPuzzle(h.db, row);
  assert.equal(pub.skipsFreeLeft, 2);
  assert.equal(JSON.stringify(pub).includes(JSON.stringify(stored(h))), false);
  assert.deepEqual(Object.keys(pub).sort(), ['id', 'kind', 'level', 'name', 'puzzle', 'reward', 'skipsFreeLeft']);
});

test('after the competition ends nothing can be submitted', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const sol = stored(h);
  atSec(h, 1762);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol), /only open during the competition/);
});

test('a generator that fails is retried instead of leaving the CFO without a puzzle', async () => {
  const h = toCompetition(makeRunning());
  const { PUZZLES } = await import('../src/puzzles/index.js');
  const original = PUZZLES.queens.generate;
  let calls = 0;
  PUZZLES.queens.generate = (...a) => { calls++; if (calls < 3) throw new Error('boom'); return original(...a); };
  try {
    for (let seed = 1; seed < 40 && calls === 0; seed++) {
      h.db.prepare('DELETE FROM puzzle_sessions').run();
      start(h, seed);
    }
    assert.ok(openPuzzle(h.db, h.gameId, 'A'));
  } finally { PUZZLES.queens.generate = original; }
});

test('shown, solved and skipped puzzles are logged with the time taken', () => {
  const h = toCompetition(makeRunning());
  start(h);
  atSec(h, 812);
  solve(h);
  start(h, 2);
  skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  const types = h.db.prepare("SELECT type, payload FROM events WHERE type LIKE 'puzzle_%' ORDER BY id").all();
  assert.deepEqual(types.map((t) => t.type), ['puzzle_shown', 'puzzle_solved', 'puzzle_shown', 'puzzle_skipped']);
  assert.equal(JSON.parse(types[1].payload).seconds, 12);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/minigame.js`

- [ ] **Step 3: Write the minimal implementation**

Append the `puzzle_sessions` table (above) to `SCHEMA` in `src/db.js`. Then `src/minigame.js`:

```js
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { playerIn, companyState } from './state.js';
import { isLocked } from './attacks.js';
import { PUZZLES, KINDS, NAMES } from './puzzles/index.js';

export const FREE_SKIPS = 2;
export const SKIP_PENALTY = 10;

export const levelFor = (solved) => Math.min(4, 1 + Math.floor(solved / 2));
export const rewardFor = (level) => (level <= 2 ? 20 : 40);

export const openPuzzle = (db, gameId, company) =>
  db.prepare('SELECT * FROM puzzle_sessions WHERE game_id=? AND company=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(gameId, company);

const count = (db, gameId, company, result) =>
  db.prepare('SELECT COUNT(*) AS n FROM puzzle_sessions WHERE game_id=? AND company=? AND result=?').get(gameId, company, result).n;

export function publicPuzzle(db, row) {
  const skipped = count(db, row.game_id, row.company, 'skipped');
  return {
    id: row.id, kind: row.kind, name: NAMES[row.kind], level: row.level, reward: rewardFor(row.level),
    puzzle: JSON.parse(row.puzzle), skipsFreeLeft: Math.max(0, FREE_SKIPS - skipped),
  };
}

function cfo(ctx, game, admissionId) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CFO') throw new Error('only the CFO can play puzzles');
  if (phaseAt(game, ctx.now()).phase !== 'competition') throw new Error('puzzles are only open during the competition');
  return p;
}

export function startPuzzle(ctx, game, admissionId, rng = Math.random) {
  const p = cfo(ctx, game, admissionId);
  const open = openPuzzle(ctx.db, game.id, p.company);
  if (open) return open;
  const level = levelFor(count(ctx.db, game.id, p.company, 'solved'));
  const last = ctx.db.prepare('SELECT kind FROM puzzle_sessions WHERE game_id=? AND company=? ORDER BY id DESC LIMIT 1').get(game.id, p.company);
  const kinds = KINDS.filter((k) => !last || k !== last.kind);
  let made = null;
  let kind = null;
  for (let attempt = 0; attempt < 5 && !made; attempt++) {
    kind = kinds[Math.floor(rng() * kinds.length)];
    try { made = PUZZLES[kind].generate(level, rng); } catch { made = null; }
  }
  if (!made) throw new Error('could not make a puzzle, please try again');
  const info = ctx.db.prepare(
    'INSERT INTO puzzle_sessions (game_id, company, admission_id, kind, level, puzzle, solution, shown_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(game.id, p.company, admissionId, kind, level, JSON.stringify(made.puzzle), JSON.stringify(made.solution), ctx.now());
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'puzzle_shown', payload: { sessionId: Number(info.lastInsertRowid), kind, level } });
  return ctx.db.prepare('SELECT * FROM puzzle_sessions WHERE id=?').get(info.lastInsertRowid);
}

export function submitPuzzle(ctx, game, admissionId, answer) {
  const p = cfo(ctx, game, admissionId);
  const row = openPuzzle(ctx.db, game.id, p.company);
  if (!row) throw new Error('no puzzle is open');
  let ok = false;
  try { ok = PUZZLES[row.kind].check(JSON.parse(row.puzzle), answer) === true; } catch { ok = false; }
  if (!ok) {
    ctx.db.prepare('UPDATE puzzle_sessions SET wrong_tries = wrong_tries + 1 WHERE id=?').run(row.id);
    return { ok: false, coins: 0 };
  }
  const halved = isLocked(ctx, game, p.company, 'minigame_half');
  const reward = rewardFor(row.level);
  const coins = halved ? Math.floor(reward / 2) : reward;
  ctx.db.transaction(() => {
    ctx.db.prepare("UPDATE puzzle_sessions SET ended_at=?, result='solved', coins=? WHERE id=?").run(ctx.now(), coins, row.id);
    ctx.db.prepare('UPDATE company_state SET wallet = wallet + ?, mini_coins = mini_coins + ? WHERE game_id=? AND company=?').run(coins, coins, game.id, p.company);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'puzzle_solved',
      payload: { sessionId: row.id, kind: row.kind, level: row.level, coins, halved, seconds: Math.round((ctx.now() - row.shown_at) / 1000), wrongTries: row.wrong_tries } });
  })();
  return { ok: true, coins };
}

export function skipPuzzle(ctx, game, admissionId) {
  const p = cfo(ctx, game, admissionId);
  const row = openPuzzle(ctx.db, game.id, p.company);
  if (!row) throw new Error('no puzzle is open');
  const penalty = count(ctx.db, game.id, p.company, 'skipped') >= FREE_SKIPS ? SKIP_PENALTY : 0;
  ctx.db.transaction(() => {
    ctx.db.prepare("UPDATE puzzle_sessions SET ended_at=?, result='skipped', penalty=? WHERE id=?").run(ctx.now(), penalty, row.id);
    if (penalty) ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(penalty, game.id, p.company);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'puzzle_skipped',
      payload: { sessionId: row.id, kind: row.kind, level: row.level, penalty, free: penalty === 0, seconds: Math.round((ctx.now() - row.shown_at) / 1000) } });
  })();
  return { penalty };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/minigame.js test/minigame.test.js
git commit -m "feat: puzzle sessions with rising difficulty, rewards, skips and Mini-Game Jam"
```

---

### Task 5: Views and messages for the CFO

**Files:**
- Modify: `src/views.js`, `src/server.js`
- Create: `test/views-puzzle.test.js`

**Interfaces:**
- Produces:
  - In the competition `viewFor` block of the **CFO only**: `puzzle: publicPuzzle(...) | null` and `puzzlesDone: { solved, skipped }`. Other roles get neither field.
  - Participant messages `puzzle_next`, `puzzle_submit { answer }`, `puzzle_skip`. `puzzle_next` and `puzzle_skip` reply with the usual state push. `puzzle_submit` also sends the sender `{ type: 'puzzle_result', ok, coins }`.
  - Organizer view (`game`): `puzzles: { A: { solved, skipped, coins }, B: { ... } }`.

- [ ] **Step 1: Write the failing tests**

`test/views-puzzle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition } from './helpers.js';
import { viewFor, organizerView } from '../src/views.js';
import { startPuzzle, submitPuzzle, skipPuzzle, openPuzzle } from '../src/minigame.js';
import { mulberry32 } from '../src/puzzles/rng.js';

test('the CFO sees no puzzle until one is started, then the puzzle without the solution', () => {
  const h = toCompetition(makeRunning());
  assert.equal(viewFor(h.ctx, h.seat.A.CFO).competition.puzzle, null);
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(3));
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(v.competition.puzzle.level, 1);
  assert.equal(v.competition.puzzle.skipsFreeLeft, 2);
  const solution = openPuzzle(h.db, h.gameId, 'A').solution;
  assert.equal(JSON.stringify(v).includes(solution), false);
});

test('other roles and the other company never see the CFO puzzle', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(3));
  assert.equal('puzzle' in viewFor(h.ctx, h.seat.A.CMO).competition, false);
  assert.equal(viewFor(h.ctx, h.seat.B.CFO).competition.puzzle, null);
});

test('the CFO view counts puzzles solved and skipped', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(2));
  skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CFO).competition.puzzlesDone, { solved: 1, skipped: 1 });
});

test('the organizer sees puzzle totals for both companies', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  assert.deepEqual(organizerView(h.ctx).game.puzzles, { A: { solved: 1, skipped: 0, coins: 20 }, B: { solved: 0, skipped: 0, coins: 0 } });
});
```

Add to `test/competition-actions.test.js`'s style (new file `test/puzzle-actions.test.js`) three message tests: a non-CFO `puzzle_next` returns `{ type: 'error', error: 'only the CFO can play puzzles' }`; `puzzle_next` from the CFO returns a `state` whose `view.competition.puzzle` is not null; `puzzle_submit` with a wrong answer returns `{ type: 'puzzle_result', ok: false, coins: 0 }` as one of the next two messages. Reuse the `competing()` helper pattern from `test/competition-actions.test.js` (boot the app, import ten players, assign, start, pick ideas, set the clock to 800 s) and log the CFO in as `S2`.

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`competition.puzzle` is undefined)

- [ ] **Step 3: Write the minimal implementation**

In `src/views.js` import `{ openPuzzle, publicPuzzle }` from `./minigame.js` and add a helper:

```js
const puzzleCount = (db, gameId, company, result) =>
  db.prepare('SELECT COUNT(*) AS n FROM puzzle_sessions WHERE game_id=? AND company=? AND result=?').get(gameId, company, result).n;
```

In `competitionView`, before the `return`, add:

```js
  let puzzleBlock = {};
  if (p.role === 'CFO') {
    const row = openPuzzle(ctx.db, game.id, p.company);
    puzzleBlock = {
      puzzle: row ? publicPuzzle(ctx.db, row) : null,
      puzzlesDone: { solved: puzzleCount(ctx.db, game.id, p.company, 'solved'), skipped: puzzleCount(ctx.db, game.id, p.company, 'skipped') },
    };
  }
```

and spread `...puzzleBlock` into the returned object. In `organizerView`'s `game` object add:

```js
      puzzles: Object.fromEntries(['A', 'B'].map((c) => [c, {
        solved: puzzleCount(ctx.db, game.id, c, 'solved'),
        skipped: puzzleCount(ctx.db, game.id, c, 'skipped'),
        coins: ctx.db.prepare("SELECT COALESCE(SUM(coins), 0) AS n FROM puzzle_sessions WHERE game_id=? AND company=? AND result='solved'").get(game.id, c).n,
      }])),
```

In `src/server.js` import `{ startPuzzle, submitPuzzle, skipPuzzle }` and add to `participantActions`:

```js
    puzzle_next: (id, m, g) => startPuzzle(ctx, g, id),
    puzzle_submit: (id, m, g) => submitPuzzle(ctx, g, id, m.answer),
    puzzle_skip: (id, m, g) => skipPuzzle(ctx, g, id),
```

and, after the line that sends `attack_result`, add:

```js
          if (msg.type === 'puzzle_submit') send(ws, { type: 'puzzle_result', ok: !!(result && result.ok), coins: result ? result.coins : 0 });
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views.js src/server.js test/views-puzzle.test.js test/puzzle-actions.test.js
git commit -m "feat: CFO puzzle view, messages and organizer totals"
```

---

### Task 6: The CFO puzzle panel in the browser

**Files:**
- Modify: `public/render.js`, `public/app.js`, `public/styles.css`
- Create: `test/render-puzzle.test.js`

**Interfaces:**
- Produces in `public/render.js`: `renderPuzzlePanel(v) -> html`, shown by `renderCompetition` for the CFO only (inside `<main>`, after the shield panel). It shows:
  - no puzzle: a "Start a puzzle" button (`data-send` `{"type":"puzzle_next"}`) and the text "Puzzles are optional. Solved puzzles earn coins.";
  - an open puzzle: the name and level, the reward, `<div id="puzzle-slot" data-puzzle-id data-kind></div>` (filled by the browser), a **Check answer** button (`id="puzzle-submit"`) and a **Skip** button (`data-send` `{"type":"puzzle_skip"}`) with the text "Free skips left: N" or "Skipping now costs 10 coins".
- `public/app.js`: keeps the puzzle's tap state in memory (`puzzleState`), reset whenever the puzzle id changes; after each render fills `#puzzle-slot` with `UI[kind].render(...)`; a click on `[data-cell]` or `[data-card]` inside the slot applies the tap and redraws only the slot; `#puzzle-submit` sends `{ type: 'puzzle_submit', answer }`; the message `puzzle_result` shows a toast: "Solved! +N coins" or "Not quite yet".

- [ ] **Step 1: Write the failing tests**

`test/render-puzzle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from '../public/render.js';

const cfo = (puzzle, over = {}) => ({
  me: { admissionId: 'S2', name: 'Mira', company: 'A', role: 'CFO', status: 'in_game' },
  screen: 'game', clock: { phase: 'competition', remainingSec: 500 }, problem: { id: 1, title: 'Food waste', statement: '' }, wallet: 900,
  idea: { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: '' }, ideation: null, owned: [], summary: null,
  shop: { open: true, catalog: [], mine: [], queue: [] },
  competition: { rates: { CTO: 0, CMO: 0, COO: 0, total: 0 }, notices: [], hint: null, shield: null, attack: null, puzzle, puzzlesDone: { solved: 1, skipped: 0 }, ...over },
});

test('the CFO sees a start button when no puzzle is open', () => {
  const html = renderScreen(cfo(null));
  assert.match(html, /"type":"puzzle_next"/);
  assert.match(html, /optional/i);
});

test('an open puzzle shows its name, level, reward, a slot, check and skip', () => {
  const html = renderScreen(cfo({ id: 7, kind: 'queens', name: 'Queens', level: 2, reward: 20, puzzle: {}, skipsFreeLeft: 2 }));
  assert.match(html, /Queens/);
  assert.match(html, /20 coins/);
  assert.match(html, /id="puzzle-slot" data-puzzle-id="7" data-kind="queens"/);
  assert.match(html, /id="puzzle-submit"/);
  assert.match(html, /"type":"puzzle_skip"/);
  assert.match(html, /Free skips left: 2/);
});

test('after the free skips the skip button warns about the cost', () => {
  const html = renderScreen(cfo({ id: 8, kind: 'sets', name: 'Sets', level: 3, reward: 40, puzzle: {}, skipsFreeLeft: 0 }));
  assert.match(html, /Skipping now costs 10 coins/);
});

test('other roles never get a puzzle panel', () => {
  const v = cfo(null);
  v.me.role = 'CTO';
  delete v.competition.puzzle;
  assert.equal(renderScreen(v).includes('puzzle_next'), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`puzzle_next` is not in the output)

- [ ] **Step 3: Write the minimal implementation**

In `public/render.js` add:

```js
function renderPuzzlePanel(v) {
  const c = v.competition;
  if (v.me.role !== 'CFO' || !('puzzle' in c)) return '';
  if (!c.puzzle) {
    return `<section class="card puzzle"><h3>Puzzles</h3><p class="muted">Puzzles are optional. Solved puzzles earn coins.</p>${send('Start a puzzle', { type: 'puzzle_next' }, 'primary')}</section>`;
  }
  const p = c.puzzle;
  const skip = p.skipsFreeLeft > 0 ? `Free skips left: ${p.skipsFreeLeft}` : 'Skipping now costs 10 coins';
  return `<section class="card puzzle"><h3>${esc(p.name)} <small>level ${esc(p.level)}, ${esc(p.reward)} coins</small></h3>
  <div id="puzzle-slot" data-puzzle-id="${esc(p.id)}" data-kind="${esc(p.kind)}"></div>
  <button id="puzzle-submit" class="primary">Check answer</button>${send('Skip', { type: 'puzzle_skip' })}
  <p class="muted">${esc(skip)}</p></section>`;
}
```

and in `renderCompetition` insert `${renderPuzzlePanel(v)}` after `${shieldPanel(c)}` inside `<main>`.

In `public/app.js` add `import { UI } from './puzzles/ui.js';`, then:

```js
let puzzleState = null;
let puzzleKey = null;
let puzzleData = null;

export function mountPuzzle(view) {
  const slot = document.getElementById('puzzle-slot');
  const p = view && view.competition && view.competition.puzzle;
  if (!slot || !p) { puzzleState = null; puzzleKey = null; return; }
  if (puzzleKey !== p.id) { puzzleKey = p.id; puzzleData = p; puzzleState = UI[p.kind].initial(p.puzzle); }
  slot.innerHTML = UI[p.kind].render(p.puzzle, puzzleState);
}
```

Call `mountPuzzle(m.view)` right after `show(renderScreen(m.view))` in the `state` handler. In the click handler add (before the `data-send` branch):

```js
  const slot = e.target.closest('#puzzle-slot');
  if (slot && puzzleData) {
    const td = e.target.closest('[data-cell]');
    const card = e.target.closest('[data-card]');
    const tap = td ? { cell: td.dataset.cell.split(',').map(Number) } : card ? { card: Number(card.dataset.card) } : null;
    if (tap) {
      puzzleState = UI[puzzleData.kind].apply(puzzleData.puzzle, puzzleState, tap);
      slot.innerHTML = UI[puzzleData.kind].render(puzzleData.puzzle, puzzleState);
    }
    return;
  }
  if (e.target.id === 'puzzle-submit' && puzzleData && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'puzzle_submit', answer: UI[puzzleData.kind].answer(puzzleData.puzzle, puzzleState) }));
    return;
  }
```

and in `onmessage` add:

```js
    } else if (m.type === 'puzzle_result') {
      showToast(m.ok ? `Solved! +${m.coins} coins` : 'Not quite yet');
```

Add base styles to `public/styles.css`: `.puzzle-grid { border-collapse: collapse; margin: 8px 0; } .puzzle-grid td, .puzzle-grid th { width: 44px; height: 44px; text-align: center; border: 1px solid var(--line); cursor: pointer; user-select: none; } .puzzle-grid td.on { background: var(--accent); color: var(--accent-ink); } .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; } .card.picked { outline: 3px solid var(--accent); }` and eight region colours `.reg-0` to `.reg-7` as soft tints (use `color-mix` with the accent so the Plan 7 design can retheme them). Plan 7 restyles the puzzles in its own task.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check by hand**

Log in as a CFO during the Competition, start a puzzle of each kind (repeat until all seven have appeared, or temporarily force a kind by calling `startPuzzle` from the Node REPL), solve it by tapping, press Check answer, and confirm the toast, the wallet and the "Mini-game coins" number in the organizer view. Confirm that a very small phone (360 px wide) shows the largest puzzle (Tower 6 by 6, Shikaku 7 by 7) without sideways scrolling; if not, reduce the cell size to `min(44px, 12vw)` in the base styles.

- [ ] **Step 6: Commit**

```bash
git add public test/render-puzzle.test.js
git commit -m "feat: the CFO puzzle panel and tap handling"
```

---

## Self-review against the spec

**Spec coverage:** the seven puzzles; automatic difficulty; 20 and 40 coin rewards; two free skips then 10 coins, for the whole game; no per-puzzle timer; the CFO plays; Mini-Game Jam halving; everything logged (puzzle shown, solved, skipped, time, coins, wrong tries, no move-by-move data); the CFO's mini game coins feed the role-wise graph (`mini_coins` in `company_state` and in the Plan 3 samples).

**Verified code:** the files in Tasks 1 to 3 were run before this plan was written: 51 tests passed (every level of every puzzle solves with its stored solution, nonsense answers are refused, seeds repeat, damaged solutions are caught, and tapping the stored solution through the browser functions yields an accepted answer).

**Placeholder scan:** none. The two prose-described tests in Task 5 (message tests) say exactly what to assert and which helper pattern to reuse.

**Type consistency:** `puzzle_sessions` columns, `startPuzzle / submitPuzzle / skipPuzzle` signatures, the `competition.puzzle` view fields and the message names are the same in Tasks 4 to 6.
