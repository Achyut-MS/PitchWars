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

test('render escapes markup in clues and region ids', () => {
  const evil = '<script>x</script>';
  const pm = { n: 1, clues: [[evil]] };
  assert.ok(UI.mosaic.render(pm, UI.mosaic.initial(pm)).includes('&lt;script'));
  assert.equal(UI.mosaic.render(pm, UI.mosaic.initial(pm)).includes('<script'), false);
  assert.equal(UI.shikaku.render(pm, UI.shikaku.initial(pm)).includes('<script'), false);
  const pq = { n: 1, regions: [[evil]] };
  assert.equal(UI.queens.render(pq, UI.queens.initial(pq)).includes('<script'), false);
  const pl = { n: 1, count: 1, regions: [[evil]] };
  assert.equal(UI.lits.render(pl, UI.lits.initial(pl)).includes('<script'), false);
  const pt = { n: 1, top: [evil], bottom: [evil], left: [evil], right: [evil] };
  assert.equal(UI.tower.render(pt, UI.tower.initial(pt)).includes('<script'), false);
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
