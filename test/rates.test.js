import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition } from './helpers.js';
import { effectiveRates } from '../src/rates.js';
import { ATTACKS, attackByKey, activeAttacks } from '../src/attacks.js';
import { EVENTS, activeEvent } from '../src/marketEvents.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
function attack(h, victim, key, startMs, endMs, blocked = 0) {
  h.db.prepare(
    'INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
  ).run(h.gameId, victim === 'A' ? 'B' : 'A', victim, key, 'S5', startMs, endMs, blocked, 'x');
}

test('there are nine attacks with the agreed costs', () => {
  assert.deepEqual(ATTACKS.map((a) => a.cost), [300, 450, 350, 450, 400, 300, 350, 350, 400]);
  assert.equal(attackByKey('surprise_tax').kind, 'tax');
  assert.equal(attackByKey('nope'), undefined);
});

test('no cover story names an attack or a rival', () => {
  for (const a of ATTACKS) assert.doesNotMatch(a.cover, /attack|rival|sabotage|opponent/i, a.key);
});

test('with no attacks the rates are the base levels and the total is their sum', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03', 'M01-L', 'M04-E']);
  const r = effectiveRates(h.ctx, h.game(), 'A', h.clock.t);
  near(r.COO, 27); near(r.CMO, 27); near(r.CTO, 0); near(r.total, 54);
});

test('Price Squeeze takes 25% off every role, Market Crash 50%, and they stop at the end time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'price_squeeze', 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 20.25);
  near(effectiveRates(h.ctx, h.game(), 'B', 840_000).COO, 27); // the end time is exclusive
  attack(h, 'B', 'market_crash', 900_000, 940_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 910_000).COO, 13.5);
});

test('attack boundaries: start-1 off, start on, end-1 on, end off, end+1 off', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'market_crash', 800_000, 840_000);
  const coo = (t) => effectiveRates(h.ctx, h.game(), 'B', t).COO;
  near(coo(799_999), 27); near(coo(800_000), 13.5); near(coo(839_999), 13.5);
  near(coo(840_000), 27); near(coo(840_001), 27);
  assert.equal(activeAttacks(h.db, h.gameId, 'B', 840_000).length, 0);
});

test('attacks stack and hit only the victim', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'price_squeeze', 800_000, 840_000);
  attack(h, 'B', 'market_crash', 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 27 * 0.75 * 0.5);
  near(effectiveRates(h.ctx, h.game(), 'A', 810_000).COO, 27);
});

test('a blocked attack has no effect', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'market_crash', 800_000, 840_000, 1);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 27);
});

test('lock, tax and mini-game attacks do not change rates; unknown keys are ignored', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  for (const k of ['minigame_jam', 'supplier_delay', 'bank_freeze', 'surprise_tax', 'bogus']) attack(h, 'B', k, 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 27);
});

test('Ad Blackout, Feature Recall and Safety Audit hit the role they target', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-L', 'M04-E', 'F01-P', 'F02-B', 'O01', 'O02', 'O03', 'O04-H']);
  attack(h, 'A', 'ad_blackout', 800_000, 840_000);
  attack(h, 'A', 'feature_recall', 800_000, 840_000);
  attack(h, 'A', 'safety_audit', 800_000, 840_000);
  const r = effectiveRates(h.ctx, h.game(), 'A', 810_000);
  near(r.CMO, 16.5);
  near(r.CTO, 13 / 3);
  near(r.COO, 2);
});

test('a market event changes both companies and ends on time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01', 'O02', 'O03']);
  h.db.prepare('INSERT INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)').run(h.gameId, 'demand_surge', 800_000, 845_000);
  near(effectiveRates(h.ctx, h.game(), 'A', 820_000).COO, 33.75);
  near(effectiveRates(h.ctx, h.game(), 'B', 820_000).COO, 33.75);
  near(effectiveRates(h.ctx, h.game(), 'A', 850_000).COO, 27);
  assert.equal(EVENTS.shop_sale.priceMult, 0.75);
});

test('market event boundaries and shop_sale does not change rates', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  h.db.prepare('INSERT INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)').run(h.gameId, 'demand_slump', 800_000, 845_000);
  const coo = (t) => effectiveRates(h.ctx, h.game(), 'A', t).COO;
  near(coo(799_999), 27); near(coo(800_000), 20.25); near(coo(844_999), 20.25); near(coo(845_000), 27); near(coo(845_001), 27);
  assert.equal(activeEvent(h.db, h.gameId, 845_000), null);
  assert.equal(activeEvent(h.db, h.gameId, 800_000).key, 'demand_slump');
  h.db.prepare('UPDATE market_events SET key=?').run('shop_sale');
  near(coo(810_000), 27);
});

test('attacks=false shows what the rates would be without attacks but with market events', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'market_crash', 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000, { attacks: false }).COO, 27);
  h.db.prepare('INSERT INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)').run(h.gameId, 'demand_surge', 800_000, 845_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000, { attacks: false }).COO, 33.75);
});

test('rates are never negative or NaN', () => {
  const h = toCompetition(makeRunning());
  const r = effectiveRates(h.ctx, h.game(), 'A', 810_000);
  for (const v of Object.values(r)) assert.ok(Number.isFinite(v) && v >= 0);
  attack(h, 'A', 'market_crash', 800_000, 840_000);
  const r2 = effectiveRates(h.ctx, h.game(), 'A', 810_000);
  for (const v of Object.values(r2)) assert.ok(Number.isFinite(v) && v >= 0);
});

test('Ad Blackout switches off brand, tagline and ad slot; target user still counts', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-L', 'M02', 'M03', 'M04-E', 'O01', 'O02', 'O03']);
  attack(h, 'A', 'ad_blackout', 800_000, 840_000);
  const at = (t) => effectiveRates(h.ctx, h.game(), 'A', t);
  near(at(799_999).CMO, 31);
  near(at(800_000).CMO, 16.5); near(at(839_999).CMO, 16.5);
  near(at(840_000).CMO, 31); near(at(840_001).CMO, 31);
  near(at(810_000).COO, 27); near(at(810_000).CTO, 0);
});
