import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { logEvent } from '../src/events.js';

test('participants default to the lobby status', () => {
  const db = openDb();
  db.prepare('INSERT INTO participants (admission_id, name) VALUES (?, ?)').run('A1', 'Asha');
  assert.equal(db.prepare('SELECT status FROM participants').get().status, 'lobby');
});

test('status only accepts the three known values', () => {
  const db = openDb();
  assert.throws(() =>
    db.prepare("INSERT INTO participants (admission_id, name, status) VALUES ('A1','Asha','banana')").run());
});

test('logEvent stores the payload as JSON against the admission id', () => {
  const db = openDb();
  logEvent(db, { ts: 5, gameId: 1, admissionId: 'A1', type: 'login', payload: { ok: true } });
  const row = db.prepare('SELECT * FROM events').get();
  assert.equal(row.admission_id, 'A1');
  assert.deepEqual(JSON.parse(row.payload), { ok: true });
});
