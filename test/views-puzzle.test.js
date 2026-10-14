import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition, atSec } from './helpers.js';
import { viewFor, organizerView } from '../src/views.js';
import { startPuzzle, submitPuzzle, skipPuzzle, openPuzzle } from '../src/minigame.js';
import { launchAttack } from '../src/attacks.js';
import { mulberry32 } from '../src/puzzles/rng.js';

test('the CFO sees no puzzle until one is started, then the puzzle without the solution', () => {
  const h = toCompetition(makeRunning());
  assert.equal(viewFor(h.ctx, h.seat.A.CFO).competition.puzzle, null);
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(3));
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(v.competition.puzzle.level, 1);
  assert.equal(v.competition.puzzle.skipsFreeLeft, 2);
  const row = openPuzzle(h.db, h.gameId, 'A');
  assert.equal(JSON.stringify(v).includes(row.solution), false);
  assert.equal('solution' in v.competition.puzzle, false);
  assert.equal('seed' in v.competition.puzzle, false);
  assert.ok(v.competition.puzzle.puzzle !== undefined);
});

test('the organizer view and every other view carry no solution or seed', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(3));
  const row = openPuzzle(h.db, h.gameId, 'A');
  const everyone = Object.values(h.seat.A).concat(Object.values(h.seat.B)).map((id) => JSON.stringify(viewFor(h.ctx, id)));
  everyone.push(JSON.stringify(organizerView(h.ctx)));
  for (const s of everyone) {
    assert.equal(s.includes(row.solution) && row.solution.length > 6, false);
    assert.equal(/"solution"|"seed"/.test(s), false);
  }
  const mine = JSON.stringify(viewFor(h.ctx, h.seat.A.CFO).competition.puzzle.puzzle);
  for (const id of [...Object.values(h.seat.A), ...Object.values(h.seat.B)].filter((x) => x !== h.seat.A.CFO)) {
    assert.equal(JSON.stringify(viewFor(h.ctx, id)).includes(mine), false, id);
  }
});

test('the CEO and CTO never see a puzzle, and no role sees another role\'s or the other company\'s puzzle', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(3));
  for (const r of ['CEO', 'CTO']) {
    const c = viewFor(h.ctx, h.seat.A[r]).competition;
    assert.equal('puzzle' in c, false, r);
    assert.equal('puzzlesDone' in c, false, r);
    assert.equal('puzzlePanel' in c, false, r);
  }
  // The CMO and COO have their own puzzle slots: none is open for them yet, and the CFO's is not theirs.
  for (const r of ['CMO', 'COO']) assert.equal(viewFor(h.ctx, h.seat.A[r]).competition.puzzle, null, r);
  assert.equal(viewFor(h.ctx, h.seat.B.CFO).competition.puzzle, null);
  assert.equal(viewFor(h.ctx, h.seat.B.CMO).competition.puzzle, null);
});

test('the CFO view counts puzzles solved and skipped', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(2));
  skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CFO).competition.puzzlesDone, { solved: 1, skipped: 1 });
});

test('the panel carries level, solved, free skips, next reward and mini coins', () => {
  const h = toCompetition(makeRunning());
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CFO).competition.puzzlePanel, { level: 1, solved: 0, skipsFreeLeft: 2, nextReward: 20, miniCoins: 0 });
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CFO).competition.puzzlePanel, { level: 1, solved: 1, skipsFreeLeft: 2, nextReward: 20, miniCoins: 20 });
});

test('an active Mini-Game Jam shows only the reduced reward, never the attack', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.B.CEO, 'minigame_jam', () => 0);
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(v.competition.puzzlePanel.nextReward, 10);
  assert.equal(v.competition.puzzle.reward, 10);
  assert.equal(/minigame|Mini-Game/i.test(JSON.stringify(v)), false);
  atSec(h, 840);
  assert.equal(viewFor(h.ctx, h.seat.A.CFO).competition.puzzlePanel.nextReward, 20);
});

test('no puzzle fields outside the competition', () => {
  const h = makeRunning();
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(JSON.stringify(v).includes('puzzle'), false);
});

test('the organizer sees puzzle totals for both companies', () => {
  const h = toCompetition(makeRunning());
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  assert.deepEqual(organizerView(h.ctx).game.puzzles, { A: { solved: 1, skipped: 0, coins: 20 }, B: { solved: 0, skipped: 0, coins: 0 } });
});
