import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { tickEconomy } from '../src/economy.js';
import { companyState } from '../src/state.js';

const wallet = (h, c = 'A') => companyState(h.db, h.gameId, c).wallet;
function run(h, fromSec, toSec) {
  for (let s = fromSec; s <= toSec; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
}

test('nothing happens before the competition starts', () => {
  const h = makeRunning();
  give(h, 'A', ['O01', 'O02', 'O03']);
  atSec(h, 500);
  tickEconomy(h.ctx, h.game());
  assert.equal(wallet(h), 1000);
});

test('sixty one-second ticks of a 27 coins per minute role add exactly 27 coins', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 860);
  assert.equal(wallet(h), 1027);
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').coo_coins - 27) < 1e-6);
});

test('fractions are kept, not lost', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']); // 13 per minute
  run(h, 800, 830);      // 30 s = 6.5 coins
  assert.equal(wallet(h), 1006);
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').frac - 0.5) < 1e-6);
});

test('a long gap counts at most five seconds', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  atSec(h, 800); tickEconomy(h.ctx, h.game());
  atSec(h, 900); tickEconomy(h.ctx, h.game()); // 100 s later, capped at 5 s: 2.25 coins
  assert.equal(wallet(h), 1002);
});

test('the same tick twice adds nothing the second time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 810);
  const before = wallet(h);
  tickEconomy(h.ctx, h.game());
  assert.equal(wallet(h), before);
});

test('coins stop at the end of the competition', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 1755, 1760);
  const w = wallet(h);
  run(h, 1761, 1770);
  assert.equal(wallet(h), w);
});

test('an attack credits the attacker with the sales the victim lost', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  h.db.prepare("INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover) VALUES (?, 'A', 'B', 'market_crash', 450, 'S0', 800000, 860000, 0, 'x')").run(h.gameId);
  run(h, 800, 860); // B earns 13.5/min instead of 27/min for 60 s
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').attack_coins - 13.5) < 0.3);
  assert.equal(companyState(h.db, h.gameId, 'B').attack_coins, 0);
  assert.equal(wallet(h, 'B'), 1000 + 13); // 13.5 coins earned, 13 whole coins
});

test('samples are written every five seconds for both companies', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 830);
  const rows = h.db.prepare("SELECT * FROM samples WHERE company='A' ORDER BY ts").all();
  assert.deepEqual(rows.map((r) => r.ts), [800000, 805000, 810000, 815000, 820000, 825000, 830000]);
  assert.equal(rows[0].wallet, 1000);
  assert.equal(rows[6].coo_rate, 27);
  assert.ok(rows[6].wallet > rows[0].wallet);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM samples WHERE company='B'").get().n, 7);
});

test('a restart gap and a repeated instant never double-credit', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 810);
  const w = wallet(h);
  atSec(h, 1000); tickEconomy(h.ctx, h.game()); tickEconomy(h.ctx, h.game()); // gap: 5 s only, once
  assert.equal(wallet(h), w + 2); // 2.25 coins plus carried fraction, floored
  const rows = h.db.prepare("SELECT ts FROM samples WHERE company='A' AND ts > 810000").all();
  assert.deepEqual(rows.map((r) => r.ts), [1000000]);
});

test('a clock that steps backwards adds nothing and does not rewind', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 820);
  const w = wallet(h);
  atSec(h, 810); tickEconomy(h.ctx, h.game());
  assert.equal(wallet(h), w);
  assert.equal(companyState(h.db, h.gameId, 'A').last_tick_at, 820000);
});

test('samples sit on the five-second grid even with ragged ticks, once each', () => {
  const h = toCompetition(makeRunning());
  for (const s of [800, 802, 806, 806.5, 811, 811, 819]) { h.clock.t = s * 1000; tickEconomy(h.ctx, h.game()); }
  const ts = h.db.prepare("SELECT ts FROM samples WHERE company='A' ORDER BY ts").all().map((r) => r.ts);
  assert.deepEqual(ts, [800000, 805000, 810000, 815000]);
});

test('1 s ticks and 5 s ticks agree within one coin over 16 minutes', () => {
  const set = ['F01-S', 'F02-S', 'F03-B', 'HC01', 'SC01', 'M01-M', 'M04-S', 'M02', 'M03', 'O01', 'O02', 'O03', 'O04-H', 'O05-B'];
  const a = toCompetition(makeRunning()); give(a, 'A', set); run(a, 800, 1760);
  const b = toCompetition(makeRunning()); give(b, 'A', set);
  for (let s = 800; s <= 1760; s += 5) { atSec(b, s); tickEconomy(b.ctx, b.game()); }
  assert.ok(Math.abs(wallet(a) - wallet(b)) <= 1, `${wallet(a)} vs ${wallet(b)}`);
});

test('a full 960 s competition at 1 s ticks earns the hand-computed total, near the guide', () => {
  // CTO: F01-S,F02-S,F03-B = 5/3 pts -> 13+7*(2/3)=17.667, +2 parts = 19.667
  // CMO: (2+1)/2=1.5 pts -> 16.5, +2 brand +2 tagline = 20.5
  // COO: 27 + 2 backup + 1 basic test = 30   => 70.1667 coins/min
  const h = toCompetition(makeRunning());
  give(h, 'A', ['F01-S', 'F02-S', 'F03-B', 'HC01', 'SC01', 'M01-M', 'M04-S', 'M02', 'M03', 'O01', 'O02', 'O03', 'O04-H', 'O05-B']);
  run(h, 800, 1760);
  const earned = wallet(h) - 1000;
  const expected = (19.6666667 + 20.5 + 30) * 16; // 1122.67
  assert.ok(Math.abs(earned - expected) <= 1, `${earned} vs ${expected}`);
  assert.ok(Math.abs(earned - 1140) / 1140 < 0.05);
  const s = h.db.prepare("SELECT COUNT(*) n FROM samples WHERE company='A'").get().n;
  assert.equal(s, 193); // 800..1760 every 5 s
});

test('sample and credit rows never name the rival or an attack', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  h.db.prepare("INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover) VALUES (?, 'A', 'B', 'market_crash', 450, 'S0', 800000, 860000, 0, 'x')").run(h.gameId);
  run(h, 800, 830);
  const dump = JSON.stringify(h.db.prepare("SELECT * FROM samples WHERE company='B'").all());
  assert.ok(!/attack|rival|company A/i.test(dump.replace(/attack_coins/g, '')));
});
