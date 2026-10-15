import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, KINDS } from '../src/puzzles/index.js';
import { mulberry32 } from '../src/puzzles/rng.js';
import { UI } from '../public/puzzles/ui.js';

// Turns the stored solution into the taps a player would make.
const taps = {
  queens: (p, sol) => sol.map((c, r) => ({ cell: [r, c], clicks: 2 })),
  pipes: (p, sol) => sol.flatMap((row, r) => row.flatMap((t, c) => Array(t).fill({ cell: [r, c] }))),
  lits: (p, sol) => sol.map(([r, c]) => ({ cell: [r, c], clicks: 2 })),
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
    assert.ok(html.includes('data-cell='));
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

test('render escapes markup in clues and region ids', () => {
  const evil = '<script>x</script>';
  const pq = { n: 1, regions: [[evil]] };
  assert.equal(UI.queens.render(pq, UI.queens.initial(pq)).includes('<script'), false);
  const pl = { n: 1, count: 1, regions: [[evil]] };
  assert.equal(UI.lits.render(pl, UI.lits.initial(pl)).includes('<script'), false);
});

test('queens: a single tap marks a dot, a double tap places a queen and a second double tap removes it', () => {
  const p = { n: 3, regions: [[0, 1, 2], [0, 1, 2], [0, 1, 2]] };
  let s = UI.queens.initial(p);
  s = UI.queens.apply(p, s, { cell: [2, 2], clicks: 1 });
  assert.deepEqual(s.dots, ['2,2']);
  s = UI.queens.apply(p, s, { cell: [2, 2], clicks: 2 });
  assert.deepEqual(s.cols, [null, null, 2]);
  assert.deepEqual(s.dots, [], 'placing the queen clears its dot');
  s = UI.queens.apply(p, s, { cell: [2, 2], clicks: 2 });
  assert.deepEqual(s.cols, [null, null, null]);
});

test('queens: a placed queen blocks its row, column, region and neighbours, and blocked squares take no queen or dot', () => {
  const p = { n: 4, regions: [[0, 0, 1, 1], [0, 0, 1, 1], [2, 2, 3, 3], [2, 2, 3, 3]] };
  let s = UI.queens.apply(p, UI.queens.initial(p), { cell: [0, 0], clicks: 2 });
  const html = UI.queens.render(p, s);
  assert.match(html, /<td class="reg reg-1 [^"]*blocked" data-cell="0,2">×<\/td>/, 'same row');
  assert.match(html, /data-cell="2,0">×<\/td>/, 'same column');
  assert.match(html, /data-cell="1,1">×<\/td>/, 'neighbour and same region');
  assert.match(html, /data-cell="3,3">/);
  assert.equal(/data-cell="3,3">×/.test(html), false, 'a square far away stays open');
  assert.deepEqual(UI.queens.apply(p, s, { cell: [0, 2], clicks: 2 }).cols, [0, null, null, null], 'no queen on a blocked square');
  assert.deepEqual(UI.queens.apply(p, s, { cell: [2, 0], clicks: 1 }).dots, [], 'no dot on a blocked square');
  assert.deepEqual(UI.queens.apply(p, s, { cell: [0, 0], clicks: 1 }).dots, [], 'no dot on the queen');
});

test('lits: a single tap marks a dot, a double tap shades, a second double tap unshades, and a blocked cell takes nothing', () => {
  const p = { n: 2, count: 1, regions: [[0, 0], [0, 0]] };
  let s = UI.lits.initial(p);
  s = UI.lits.apply(p, s, { cell: [0, 0], clicks: 1 });
  assert.deepEqual(s.dots, ['0,0']);
  s = UI.lits.apply(p, s, { cell: [0, 0], clicks: 2 });
  assert.deepEqual(s.shaded, ['0,0']);
  assert.deepEqual(s.dots, [], 'shading clears the dot');
  s = UI.lits.apply(p, s, { cell: [0, 0], clicks: 2 });
  assert.deepEqual(s.shaded, []);
});

test('lits: a cell that would make a 2 x 2 shaded block is blocked and shows a ×', () => {
  const p = { n: 2, count: 1, regions: [[0, 0], [0, 0]] };
  let s = UI.lits.initial(p);
  for (const c of [[0, 0], [0, 1], [1, 0]]) s = UI.lits.apply(p, s, { cell: c, clicks: 2 });
  assert.equal(s.shaded.length, 3);
  const html = UI.lits.render(p, s);
  assert.match(html, /data-cell="1,1"[^>]*>×<\/td>/);
  s = UI.lits.apply(p, s, { cell: [1, 1], clicks: 2 });
  assert.equal(s.shaded.length, 3, 'the 2 x 2 block is not allowed');
});

test('lits: a region that already has four shaded cells blocks its last cells', () => {
  // Region 0 has five cells; four of them shaded (no 2 x 2 block), so the fifth is blocked by the region rule alone.
  const p = { n: 3, count: 2, regions: [[0, 0, 0], [0, 0, 1], [1, 1, 1]] };
  let s = UI.lits.initial(p);
  for (const c of [[0, 0], [0, 1], [0, 2], [1, 0]]) s = UI.lits.apply(p, s, { cell: c, clicks: 2 });
  assert.equal(s.shaded.length, 4);
  assert.match(UI.lits.render(p, s), /data-cell="1,1"[^>]*>×<\/td>/);
  s = UI.lits.apply(p, s, { cell: [1, 1], clicks: 2 });
  assert.equal(s.shaded.length, 4, 'the fifth cell of a full region cannot be shaded');
  s = UI.lits.apply(p, s, { cell: [2, 2], clicks: 2 });
  assert.equal(s.shaded.length, 5, 'the other region still has room');
});
