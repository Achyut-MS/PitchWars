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

for (const kind of KINDS) {
  test(`${kind}: oversized and oddly shaped answers are refused without throwing`, () => {
    const { puzzle } = PUZZLES[kind].generate(2, mulberry32(11));
    const big = Array(100000).fill(0);
    const bad = [
      big, [big], Array(500).fill(big.slice(0, 500)), [[NaN]], [[1.5, 2.5]], [[Infinity]],
      [{ r: 0, c: 0, h: 99, w: 99 }], [{ r: 'a' }], [[0, 0, 0, 0]], { length: 3 }, true, () => 1,
      [[-1, -1]], [['0', '1']], [[[]]], [undefined], Array(1000).fill([0, 0]),
    ];
    for (const b of bad) assert.equal(PUZZLES[kind].check(puzzle, b), false);
  });
}

test('tower: the all-hidden fallback reveals a clue that matches its own column', () => {
  const sol = [[1, 2, 3], [2, 3, 1], [3, 1, 2]];
  const p = { n: 3, top: [null, null, null], bottom: [null, null, null], left: [null, null, null], right: [null, null, null] };
  PUZZLES.tower.revealTop(p, sol, 1);
  assert.deepEqual(p.top, [null, 2, null]);
  assert.equal(PUZZLES.tower.check(p, sol), true);
});
test('tower: thousands of seeds all give a puzzle its own solution passes', () => {
  for (let level = 1; level <= 4; level++) for (let seed = 1; seed <= 2000; seed++) {
    const { puzzle, solution } = PUZZLES.tower.generate(level, mulberry32(seed));
    assert.equal(PUZZLES.tower.check(puzzle, solution), true, `level ${level} seed ${seed}`);
  }
});
