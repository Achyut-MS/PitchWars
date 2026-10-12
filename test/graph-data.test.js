import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { tickEconomy } from '../src/economy.js';
import { graphData } from '../src/graphs/data.js';

function runCompetition(h, fromSec, toSec) {
  for (let s = fromSec; s <= toSec; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
}

test('a game that never reached the competition still gives a one-point series', () => {
  const h = makeRunning();
  const d = graphData(h.db, h.gameId);
  assert.deepEqual(d.series, { t: [0], A: [1000], B: [1000] });
  assert.deepEqual(d.final.A, { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 });
});

test('the series starts at zero seconds and follows the 5-second samples', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  runCompetition(h, 800, 830);
  const d = graphData(h.db, h.gameId);
  assert.deepEqual(d.series.t, [0, 5, 10, 15, 20, 25, 30]);
  assert.equal(d.series.A[0], 1000);
  assert.ok(d.series.A[6] > d.series.A[0]);
  assert.equal(d.series.B[6], 1000);
});

test('the final numbers per role come from the sales, mini games and attacks', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  runCompetition(h, 800, 860);
  h.db.prepare("UPDATE company_state SET mini_coins = 40, attack_coins = 100 WHERE company = 'A'").run();
  const f = graphData(h.db, h.gameId).final.A;
  assert.ok(Math.abs(f.COO - 27) < 0.01);
  assert.equal(f.CTO, 0);
  assert.equal(f.CFO, 40);
  assert.equal(f.CEO, 100);
});

test('two companies with different sample counts still line up', () => {
  const h = toCompetition(makeRunning());
  runCompetition(h, 800, 810);
  h.db.prepare("DELETE FROM samples WHERE company = 'B' AND ts = 805000").run();
  const d = graphData(h.db, h.gameId);
  assert.equal(d.series.t.length, d.series.A.length);
  assert.equal(d.series.t.length, d.series.B.length);
  for (const v of [...d.series.A, ...d.series.B, ...d.series.t]) assert.ok(Number.isFinite(v));
});

test('a missing sample carries the last known wallet forward', () => {
  const h = toCompetition(makeRunning());
  runCompetition(h, 800, 810);
  h.db.prepare("UPDATE samples SET wallet = 1234 WHERE company = 'B' AND ts = 800000").run();
  h.db.prepare("DELETE FROM samples WHERE company = 'B' AND ts = 805000").run();
  const d = graphData(h.db, h.gameId);
  assert.equal(d.series.B[1], 1234);
});

test('only the requested game is used', () => {
  const h = toCompetition(makeRunning());
  runCompetition(h, 800, 810);
  h.db.prepare("INSERT INTO samples SELECT 99, ts + 5000, company, 1, 0,0,0,0,0,0,0,0 FROM samples").run();
  const d = graphData(h.db, h.gameId);
  assert.deepEqual(d.series.t, [0, 5, 10]);
});

test('an unknown game id is an error, not an empty graph', () => {
  const h = makeRunning();
  assert.throws(() => graphData(h.db, 999), /no such game/);
});
