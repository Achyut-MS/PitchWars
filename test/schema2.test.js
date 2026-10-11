import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { makeRunning } from './helpers.js';
import { companyState } from '../src/state.js';

test('the new tables exist', () => {
  const db = openDb();
  for (const t of ['company_state', 'votes', 'requests', 'owned', 'phase_done']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(t), t);
  }
});

test('starting a game creates a 1,000-coin wallet for each company', () => {
  const h = makeRunning();
  assert.equal(companyState(h.db, h.gameId, 'A').wallet, 1000);
  assert.equal(companyState(h.db, h.gameId, 'B').wallet, 1000);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, null);
});

test('the helper seats ten players and leaves two in the lobby', () => {
  const h = makeRunning();
  assert.equal(h.seat.A.CEO, 'S0');
  assert.equal(h.seat.B.COO, 'S9');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='lobby'").get().n, 2);
});
