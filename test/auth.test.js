import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { participantLogin, organizerLogin } from '../src/auth.js';

function setup() {
  const db = openDb();
  addParticipant(db, 'A001', 'Asha');
  return db;
}

test('an unknown admission id is refused', () => {
  assert.deepEqual(participantLogin(setup(), 'NOPE'), { ok: false, error: 'unknown_id' });
});

test('login accepts spaces and lower case', () => {
  const r = participantLogin(setup(), ' a001 ');
  assert.equal(r.ok, true);
  assert.equal(r.participant.admissionId, 'A001');
  assert.equal(r.participant.name, 'Asha');
});

test('a lobby participant gets the lobby view', () => {
  assert.equal(participantLogin(setup(), 'A001').view, 'lobby');
});

test('an in_game participant gets the game view, with company and role', () => {
  const db = setup();
  db.prepare("UPDATE participants SET status='in_game', game_id=3, company='A', role='CFO'").run();
  const r = participantLogin(db, 'A001');
  assert.equal(r.view, 'game');
  assert.equal(r.participant.role, 'CFO');
});

test('a completed participant gets the graphs of their OWN old game, even while game 4 runs', () => {
  const db = setup();
  db.prepare("UPDATE participants SET status='completed', game_id=3").run();
  db.prepare('INSERT INTO games (id, problem_id, started_at) VALUES (4, 1, 0)').run();
  const r = participantLogin(db, 'A001');
  assert.equal(r.view, 'graphs');
  assert.equal(r.participant.gameId, 3);
});

test('every login attempt that matches an id is logged against it', () => {
  const db = setup();
  participantLogin(db, 'A001', 99);
  const e = db.prepare("SELECT * FROM events WHERE type='login'").get();
  assert.equal(e.admission_id, 'A001');
  assert.equal(e.ts, 99);
});

test('organizer password must match and not be empty', () => {
  assert.equal(organizerLogin('secret', 'secret'), true);
  assert.equal(organizerLogin('wrong', 'secret'), false);
  assert.equal(organizerLogin('', ''), false);
  assert.equal(organizerLogin(undefined, 'secret'), false);
});
