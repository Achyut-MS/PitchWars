import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, KINDS } from '../src/puzzles/index.js';
import { mulberry32 } from '../src/puzzles/rng.js';

for (const kind of KINDS) {
  test(`${kind}: every level makes a puzzle whose own solution passes the checker`, () => {
    for (let level = 1; level <= 4; level++) {
      for (let seed = 1; seed <= 12; seed++) {
        let made;
        // Lits has a node budget and may report failure; the session engine then picks another kind.
        try { made = PUZZLES[kind].generate(level, mulberry32(seed * 101 + level)); } catch (e) { if (kind === 'lits') continue; throw e; }
        assert.equal(PUZZLES[kind].check(made.puzzle, made.solution), true, `${kind} level ${level} seed ${seed}`);
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

