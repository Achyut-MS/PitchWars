import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame, endGame } from '../src/lobby.js';
import { phaseAt } from '../src/phases.js';
import { createClock } from '../src/clock.js';
import { logEvent } from '../src/events.js';
import { activeGame, heartbeat, resumeActiveGame } from '../src/persist.js';

function running(startMs) {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  const gameId = startGame(db, 1, startMs);
  return { db, gameId };
}

// A clock whose real source is a settable wall clock.
function clockAt(wall) {
  const w = { t: wall };
  return { w, clock: createClock({ real: () => w.t }) };
}

test('no game running means nothing to resume and the offset stays 0', () => {
  const { clock } = clockAt(1000);
  assert.equal(resumeActiveGame(openDb(), clock), null);
  assert.equal(clock.offset(), 0);
  assert.equal(activeGame(openDb()), null);
});

test('after a restart server time continues from the last heartbeat, ignoring an hour of downtime', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000); // 200 s in: Ideation, 160 s left
  const { clock } = clockAt(9_000_000); // unrelated wall clock after the outage
  const g = resumeActiveGame(db, clock);
  assert.equal(clock.now(), 1_200_000);
  assert.equal(g.startedAt, 1_000_000); // started_at is not rebased
  assert.deepEqual(phaseAt(g, clock.now()), { phase: 'ideation', remainingSec: 160 });
});

test('the timer still counts down normally after a resume', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000);
  const { w, clock } = clockAt(9_000_000);
  const g = resumeActiveGame(db, clock);
  w.t += 160_000;
  assert.deepEqual(phaseAt(g, clock.now()), { phase: 'shop', remainingSec: 420 });
});

test('a boot clock EARLIER than the last heartbeat resumes correctly', () => {
  const { db, gameId } = running(5_000_000);
  heartbeat(db, gameId, 5_000_000 + 30_000);
  const { clock } = clockAt(100); // clock reset to near zero
  const g = resumeActiveGame(db, clock);
  assert.equal(clock.now(), 5_030_000);
  assert.deepEqual(phaseAt(g, clock.now()), { phase: 'briefing', remainingSec: 150 });
});

test('a game with no heartbeat yet resumes from started_at', () => {
  const { db, gameId } = running(2_000_000);
  db.prepare('UPDATE games SET heartbeat_at = NULL WHERE id = ?').run(gameId);
  const { clock } = clockAt(77);
  resumeActiveGame(db, clock);
  assert.equal(clock.now(), 2_000_000);
});

test('two quick restarts do not drift', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 50_000);
  resumeActiveGame(db, clockAt(7_000_000).clock);
  const { clock } = clockAt(8_000_000); // second restart, no heartbeat in between
  const g = resumeActiveGame(db, clock);
  assert.deepEqual(phaseAt(g, clock.now()), { phase: 'briefing', remainingSec: 130 });
});

test('ideationSavedSec is preserved across a resume', () => {
  const { db, gameId } = running(1_000_000);
  db.prepare('UPDATE games SET ideation_saved_sec = 42 WHERE id = ?').run(gameId);
  heartbeat(db, gameId, 1_100_000);
  const g = resumeActiveGame(db, clockAt(3).clock);
  assert.equal(g.ideationSavedSec, 42);
});

test('an ended game is never resumed', () => {
  const { db, gameId } = running(0);
  endGame(db, gameId, 10);
  const { clock } = clockAt(20);
  assert.equal(resumeActiveGame(db, clock), null);
  assert.equal(clock.offset(), 0);
});

test('an event logged right after resume is stamped in server time, not the wrong wall clock', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_200_000);
  const { clock } = clockAt(50); // wildly wrong wall clock
  resumeActiveGame(db, clock);
  logEvent(db, { ts: clock.now(), gameId, admissionId: 'S0', type: 'probe' });
  const { ts } = db.prepare("SELECT ts FROM events WHERE type='probe'").get();
  assert.ok(ts >= 1_200_000);
});
