import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame, endGame } from '../src/lobby.js';
import { phaseAt } from '../src/phases.js';
import { activeGame, heartbeat, resumeActiveGame } from '../src/persist.js';

function running(startMs) {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  const gameId = startGame(db, 1, startMs);
  return { db, gameId };
}

test('no game running means nothing to resume', () => {
  assert.equal(resumeActiveGame(openDb(), 1000), null);
  assert.equal(activeGame(openDb()), null);
});

test('after a restart the timer continues from the last heartbeat, not from the wall clock', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000); // 200 s in: Ideation, 160 s left
  // Pi was off for an hour; its clock now reads something unrelated:
  const g = resumeActiveGame(db, 9_000_000);
  assert.deepEqual(phaseAt(g, 9_000_000), { phase: 'ideation', remainingSec: 160 });
});

test('the timer still counts down normally after a resume', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000);
  const g = resumeActiveGame(db, 9_000_000);
  assert.deepEqual(phaseAt(g, 9_000_000 + 160_000), { phase: 'shop', remainingSec: 420 });
});

test('a clock that jumped BACKWARD on reboot does not push the game below zero elapsed', () => {
  const { db, gameId } = running(5_000_000);
  heartbeat(db, gameId, 5_000_000 + 30_000);
  const g = resumeActiveGame(db, 100); // clock reset to near zero
  assert.deepEqual(phaseAt(g, 100), { phase: 'briefing', remainingSec: 150 });
});

test('resuming twice in a row does not lose or gain time', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 50_000);
  resumeActiveGame(db, 7_000_000);
  const g = resumeActiveGame(db, 8_000_000); // second restart with no heartbeat in between
  assert.deepEqual(phaseAt(g, 8_000_000), { phase: 'briefing', remainingSec: 130 });
});

test('an ended game is never resumed', () => {
  const { db, gameId } = running(0);
  endGame(db, gameId, 10);
  assert.equal(resumeActiveGame(db, 20), null);
});
