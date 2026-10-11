import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline, phaseAt, endIdeationEarly } from '../src/phases.js';

const g = { startedAt: 0, ideationSavedSec: 0 };

test('the default timeline matches the spec', () => {
  assert.deepEqual(timeline(g), [
    ['briefing', 180], ['ideation', 180], ['shop', 420], ['summary', 20], ['competition', 960],
  ]);
});

test('phases change exactly on the boundary', () => {
  assert.deepEqual(phaseAt(g, 0), { phase: 'briefing', remainingSec: 180 });
  assert.deepEqual(phaseAt(g, 179_000), { phase: 'briefing', remainingSec: 1 });
  assert.deepEqual(phaseAt(g, 180_000), { phase: 'ideation', remainingSec: 180 });
  assert.deepEqual(phaseAt(g, 360_000), { phase: 'shop', remainingSec: 420 });
  assert.deepEqual(phaseAt(g, 780_000), { phase: 'summary', remainingSec: 20 });
  assert.deepEqual(phaseAt(g, 800_000), { phase: 'competition', remainingSec: 960 });
});

test('the game is ended after the competition and stays ended', () => {
  assert.deepEqual(phaseAt(g, 1_759_000), { phase: 'competition', remainingSec: 1 });
  assert.deepEqual(phaseAt(g, 1_760_000), { phase: 'ended', remainingSec: 0 });
  assert.deepEqual(phaseAt(g, 9_999_999), { phase: 'ended', remainingSec: 0 });
});

test('a clock reading before the start is treated as the start', () => {
  assert.deepEqual(phaseAt({ startedAt: 5000, ideationSavedSec: 0 }, 0), { phase: 'briefing', remainingSec: 180 });
});

test('ending Ideation early adds the saved time to the Shop', () => {
  const early = endIdeationEarly(g, 200_000); // 20 s into Ideation, 160 s left
  assert.equal(early.ideationSavedSec, 160);
  assert.deepEqual(phaseAt(early, 200_000), { phase: 'shop', remainingSec: 580 });
});

test('the total length does not change after an early end', () => {
  const early = endIdeationEarly(g, 200_000);
  assert.deepEqual(phaseAt(early, 1_759_000), { phase: 'competition', remainingSec: 1 });
});

test('ending Ideation early outside Ideation is refused', () => {
  assert.throws(() => endIdeationEarly(g, 10_000), /not in ideation/);
  assert.throws(() => endIdeationEarly(g, 400_000), /not in ideation/);
});
