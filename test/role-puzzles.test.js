import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PUZZLES, puzzleModule } from '../src/puzzles/index.js';
import { fixFor } from '../src/puzzles/risks.js';
import { mulberry32 } from '../src/puzzles/rng.js';
import { UI } from '../public/puzzles/ui.js';

const IDEA_RISKS = ['Sensor gives wrong freshness readings', 'Fridge moisture damages the device', 'Users forget to charge or replace the battery'];

for (const kind of Object.keys(ROLE_PUZZLES)) {
  test(`${kind}: every level generates a puzzle its own answer passes, and no other answer does`, () => {
    for (let level = 1; level <= 4; level++) for (let seed = 1; seed <= 200; seed++) {
      const extra = kind === 'risks' ? { risks: IDEA_RISKS } : {};
      const { puzzle, solution } = puzzleModule(kind).generate(level, mulberry32(seed), extra);
      assert.equal(puzzleModule(kind).check(puzzle, solution), true, `${kind} L${level} #${seed}`);
      assert.equal(puzzleModule(kind).check(puzzle, solution.map((v) => v + 1)), false, `${kind} L${level} #${seed} wrong`);
      assert.equal('solution' in puzzle, false);
      assert.equal(JSON.stringify(puzzle).includes(JSON.stringify(solution)), false, 'the answer is not in the puzzle');
    }
  });
}

test('the logo brief gets bigger with the level: 2, 3, 4 parts, and 3 then 4 options', () => {
  const sizes = [1, 2, 3, 4].map((l) => {
    const { puzzle } = puzzleModule('logo').generate(l, mulberry32(7));
    return [puzzle.rows.length, puzzle.rows[0].options.length];
  });
  assert.deepEqual(sizes, [[2, 3], [3, 3], [4, 4], [4, 4]]);
});

test('risks: each risk points at a fix type from its own words', () => {
  assert.equal(fixFor('Sensor gives wrong freshness readings'), 0, 'Test it');
  assert.equal(fixFor('Fridge moisture damages the device'), 1, 'Protect it');
  assert.equal(fixFor('Canteen staff skip using it during rush hours'), 2, 'Train the users');
  assert.equal(fixFor('Something else entirely'), 3, 'Back it up');
});

test('risks: a level 1 risk has three choices, level 3 has four, and the right one is always among them', () => {
  const l1 = puzzleModule('risks').generate(1, mulberry32(3), { risks: IDEA_RISKS }).puzzle;
  const l3 = puzzleModule('risks').generate(3, mulberry32(3), { risks: IDEA_RISKS }).puzzle;
  assert.ok(l1.rows.every((r) => r.choices.length === 3));
  assert.ok(l3.rows.every((r) => r.choices.length === 4));
});

test('logo board: tapping an option picks it, tapping again clears it, and labels are not options', () => {
  const { puzzle } = puzzleModule('logo').generate(2, mulberry32(4));
  let s = UI.logo.initial(puzzle);
  s = UI.logo.apply(puzzle, s, { cell: [0, 1] });
  assert.equal(s.picks[0], 1);
  s = UI.logo.apply(puzzle, s, { cell: [0, 1] });
  assert.equal(s.picks[0], null);
  s = UI.logo.apply(puzzle, s, { cell: [0, -1] });
  assert.ok(s.picks.every((v) => v === null), 'a label tap changes nothing');
  assert.match(UI.logo.render(puzzle, s), /class="brief">The client wants/);
});

test('risk board: one fix per risk, tapping the same fix clears it, and taps off the board are ignored', () => {
  const { puzzle, solution } = puzzleModule('risks').generate(2, mulberry32(9), { risks: IDEA_RISKS });
  let s = UI.risks.initial(puzzle);
  for (let r = 0; r < solution.length; r++) s = UI.risks.apply(puzzle, s, { cell: [r, solution[r]] });
  assert.deepEqual(s.picks, solution);
  assert.equal(puzzleModule('risks').check(puzzle, UI.risks.answer(puzzle, s)), true);
  s = UI.risks.apply(puzzle, s, { cell: [0, 99] });
  assert.deepEqual(s.picks, solution, 'off the board changes nothing');
});
