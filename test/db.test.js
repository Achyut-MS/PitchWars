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

test('events has an index on admission_id, added to an old database, and lookups use it', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'idx-'));
  try {
    const file = join(dir, 'old.db');
    const old = openDb(file);
    old.exec('DROP INDEX events_by_admission');
    old.close();
    const raw = new Database(file);
    assert.equal(raw.prepare("SELECT 1 FROM sqlite_master WHERE name='events_by_admission'").get(), undefined);
    raw.close();
    const db = openDb(file);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='events_by_admission'").get());
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name='events_by_game'").get());
    const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM events WHERE admission_id=?').all('S1').map((r) => r.detail).join(' ');
    assert.match(plan, /events_by_admission/);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
