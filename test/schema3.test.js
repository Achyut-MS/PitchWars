import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { phaseWindow } from '../src/phases.js';
import { makeRunning, give, toCompetition } from './helpers.js';
import { companyState } from '../src/state.js';

test('the new tables exist', () => {
  const db = openDb();
  for (const t of ['attacks', 'notices', 'market_events', 'injections', 'shield_use', 'samples', 'hints']) {
    assert.ok(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t), t);
  }
});

test('company_state has the economy columns with zero defaults', () => {
  const h = makeRunning();
  const cs = companyState(h.db, h.gameId, 'A');
  assert.deepEqual([cs.frac, cs.mini_coins, cs.attack_coins, cs.cto_coins, cs.last_tick_at], [0, 0, 0, 0, null]);
});

test('phaseWindow gives the start and end of each phase in milliseconds', () => {
  const g = { startedAt: 1000, ideationSavedSec: 0 };
  assert.deepEqual(phaseWindow(g, 'briefing'), { start: 1000, end: 181_000 });
  assert.deepEqual(phaseWindow(g, 'competition'), { start: 801_000, end: 1_761_000 });
  assert.throws(() => phaseWindow(g, 'nope'));
});

test('phaseWindow follows an early end of ideation', () => {
  const g = { startedAt: 0, ideationSavedSec: 160 };
  assert.deepEqual(phaseWindow(g, 'shop'), { start: 200_000, end: 780_000 });
  assert.deepEqual(phaseWindow(g, 'competition'), { start: 800_000, end: 1_760_000 });
});

test('give and toCompetition set up a competing game quickly', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'M02']);
  assert.equal(h.clock.t, 800_000);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM owned WHERE company='A'").get().n, 2);
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S1');
});

test('opening an existing v2 database file migrates it to v3, idempotently', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fm-')), 'v2.db');
  const old = new Database(file);
  old.exec(`CREATE TABLE company_state (
    game_id INTEGER NOT NULL, company TEXT NOT NULL, idea_id TEXT, picked_by TEXT,
    picked_at INTEGER, pick_source TEXT, wallet INTEGER NOT NULL DEFAULT 1000,
    PRIMARY KEY (game_id, company));
    INSERT INTO company_state (game_id, company, wallet) VALUES (1, 'A', 640);`);
  old.close();
  for (let i = 0; i < 2; i++) {
    const db = openDb(file);
    const row = db.prepare('SELECT * FROM company_state').get();
    assert.equal(row.wallet, 640);
    assert.deepEqual(
      [row.frac, row.mini_coins, row.attack_coins, row.cto_coins, row.cmo_coins, row.coo_coins, row.last_tick_at, row.last_sample_at],
      [0, 0, 0, 0, 0, 0, null, null]);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='attacks'").get());
    db.close();
  }
});
