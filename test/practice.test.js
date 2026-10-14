import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practicePuzzle, practiceCheck } from '../src/practice.js';
import { KINDS } from '../src/puzzles/index.js';

test('every puzzle comes back at every level, with no solution in it', () => {
  for (const kind of KINDS) for (const level of [1, 2, 3, 4]) {
    const p = practicePuzzle({ kind, level, seed: 42 });
    assert.equal(p.kind, kind);
    assert.equal(p.level, level);
    assert.ok(p.puzzle && typeof p.puzzle === 'object');
    assert.equal('solution' in p, false);
    assert.equal('solution' in p.puzzle, false);
  }
});

test('the same seed gives the same puzzle, and a bad kind or level is refused', () => {
  assert.deepEqual(practicePuzzle({ kind: 'pipes', level: 2, seed: 9 }).puzzle, practicePuzzle({ kind: 'pipes', level: 2, seed: 9 }).puzzle);
  assert.throws(() => practicePuzzle({ kind: 'nope', level: 1 }), /unknown puzzle/);
  assert.throws(() => practicePuzzle({ kind: 'queens', level: 9 }), /level/);
});

test('the check says yes to a solved board and no to anything else', () => {
  const puzzle = { n: 1, regions: [[0]] };
  assert.deepEqual(practiceCheck({ kind: 'queens', puzzle, answer: [0] }), { ok: true });
  assert.deepEqual(practiceCheck({ kind: 'queens', puzzle, answer: [] }), { ok: false });
  assert.deepEqual(practiceCheck({ kind: 'queens', puzzle, answer: 'junk' }), { ok: false });
});
