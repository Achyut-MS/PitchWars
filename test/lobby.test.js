import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, unassign, startGame, endGame } from '../src/lobby.js';

function seeded(n = 10) {
  const db = openDb();
  for (let i = 0; i < n; i++) addParticipant(db, `S${i}`, `Player ${i}`);
  return db;
}
function fillAll(db) {
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
}
const status = (db) => db.prepare('SELECT status FROM participants ORDER BY admission_id').all().map((r) => r.status);

test('a role already taken in a company is refused', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assert.throws(() => assign(db, 'S1', 'A', 'CEO'), /already has a CEO/);
});

test('the same role is allowed in the other company', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S1', 'B', 'CEO');
});

test('reassigning the same player moves them without clashing with themselves', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S0', 'B', 'CFO');
});

test('an invalid company or role is refused', () => {
  const db = seeded();
  assert.throws(() => assign(db, 'S0', 'C', 'CEO'));
  assert.throws(() => assign(db, 'S0', 'A', 'JANITOR'));
});

test('startGame refuses a half-filled lobby and changes nothing', () => {
  const db = seeded();
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) { if (i < 9) assign(db, `S${i}`, c, r); i++; }
  assert.throws(() => startGame(db, 1, 1000), /five roles/);
  assert.deepEqual(new Set(status(db)), new Set(['lobby']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0);
});

test('startGame puts all ten in_game and links them to the game', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 2, 1000);
  assert.deepEqual(new Set(status(db)), new Set(['in_game']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants WHERE game_id = ?').get(gid).n, 10);
  assert.equal(db.prepare('SELECT problem_id, started_at FROM games WHERE id = ?').get(gid).problem_id, 2);
});

test('a second startGame while a game runs is refused', () => {
  const db = seeded(20);
  fillAll(db);
  startGame(db, 1, 1000);
  assert.throws(() => startGame(db, 2, 2000), /already running/);
});

test('endGame marks the ten completed and keeps their game link', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.deepEqual(new Set(status(db)), new Set(['completed']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants WHERE game_id = ?').get(gid).n, 10);
  assert.equal(db.prepare('SELECT ended_at FROM games WHERE id = ?').get(gid).ended_at, 5000);
});

test('a completed participant cannot be assigned again', () => {
  const db = seeded(20);
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.throws(() => assign(db, 'S0', 'A', 'CEO'), /not in the lobby/);
});

test('start and end are logged against the admission ids', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='game_start'").get().n, 10);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='game_end'").get().n, 10);
});

test('a second endGame throws and changes nothing', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.throws(() => endGame(db, gid, 9000), /already ended/);
  assert.equal(db.prepare('SELECT ended_at FROM games WHERE id = ?').get(gid).ended_at, 5000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='game_end'").get().n, 10);
});

test('endGame on an unknown game id throws and the real game keeps running', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  assert.throws(() => endGame(db, gid + 99, 5000), /unknown game/);
  assert.equal(db.prepare('SELECT ended_at FROM games WHERE id = ?').get(gid).ended_at, null);
  assert.deepEqual(new Set(status(db)), new Set(['in_game']));
});

test('unassign frees the seat for another lobby participant and logs an event', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  unassign(db, 's0');
  const p = db.prepare("SELECT company, role FROM participants WHERE admission_id='S0'").get();
  assert.deepEqual(p, { company: null, role: null });
  assign(db, 'S1', 'A', 'CEO');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='unassign' AND admission_id='S0'").get().n, 1);
});

test('a half-seated lobby after unassign cannot start', () => {
  const db = seeded();
  fillAll(db);
  unassign(db, 'S3');
  assert.throws(() => startGame(db, 'p1', 1000), /all five roles/);
});

test('unassign of an in_game participant throws and changes nothing', () => {
  const db = seeded();
  fillAll(db);
  startGame(db, 'p1', 1000);
  const before = db.prepare('SELECT * FROM participants ORDER BY admission_id').all();
  const ev = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  assert.throws(() => unassign(db, 'S0'), /not in the lobby/);
  assert.deepEqual(db.prepare('SELECT * FROM participants ORDER BY admission_id').all(), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, ev);
});

test('unassign of an unknown id throws', () => {
  assert.throws(() => unassign(seeded(), 'NOPE'), /unknown participant/);
});
