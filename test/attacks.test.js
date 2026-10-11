import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { launchAttack, attackCooldownUntil, isLocked, hasShield } from '../src/attacks.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { companyState } from '../src/state.js';

const wallet = (h, c) => companyState(h.db, h.gameId, c).wallet;
const go = (h, key, rng = () => 0, who = 'A') => launchAttack(h.ctx, h.game(), h.seat[who].CEO, key, rng);

test('only the CEO can attack, and only a known attack, and only in the competition', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => launchAttack(h.ctx, h.game(), h.seat.A.CTO, 'market_crash'), /only the CEO/);
  assert.throws(() => go(h, 'nope'), /unknown attack/);
  atSec(h, 500);
  assert.throws(() => go(h, 'market_crash'), /only possible during the competition/);
});

test('a launch costs the attack price and lasts between 30 and 45 seconds', () => {
  const h = toCompetition(makeRunning());
  const lo = go(h, 'price_squeeze', () => 0);
  assert.equal(lo.endsAt, 800_000 + 30_000);
  assert.equal(wallet(h, 'A'), 700);
  const h2 = toCompetition(makeRunning());
  assert.equal(go(h2, 'price_squeeze', () => 0.999999).endsAt, 800_000 + 45_000);
});

test('the victim gets the cover story and nothing names the attacker', () => {
  const h = toCompetition(makeRunning());
  go(h, 'market_crash');
  const n = h.db.prepare("SELECT * FROM notices WHERE company='B'").all();
  assert.equal(n.length, 1);
  assert.equal(n[0].role, null);
  assert.equal(n[0].text, 'Stock market prices have fallen');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM notices WHERE company='A'").get().n, 0);
});

test('the cooldown starts after the effect ends and lasts 60 seconds', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze', () => 0); // ends at 830 s
  assert.equal(attackCooldownUntil(h.db, h.gameId, 'A'), 890_000);
  atSec(h, 880);
  assert.throws(() => go(h, 'price_squeeze'), /attack on cooldown/);
  atSec(h, 891);
  go(h, 'price_squeeze');
});

test('two attacks in the same second charge the wallet once', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze');
  assert.throws(() => go(h, 'market_crash'), /cooldown/);
  assert.equal(wallet(h, 'A'), 700);
});

test('the rival can attack back while we are on cooldown', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze', () => 0, 'A');
  go(h, 'price_squeeze', () => 0, 'B');
});

test('attacks are locked in the last 60 seconds', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1700); // 60 s left exactly
  assert.throws(() => go(h, 'price_squeeze'), /locked in the last 60 seconds/);
  atSec(h, 1699);
  go(h, 'price_squeeze');
});

test('an attack may take the wallet below -200, and the CFO still cannot buy below -200', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -150 WHERE company='A'").run();
  go(h, 'market_crash'); // 450
  assert.equal(wallet(h, 'A'), -600);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /below -200/);
});

test('Surprise Tax moves 100 coins at once and has no lasting effect', () => {
  const h = toCompetition(makeRunning());
  const r = go(h, 'surprise_tax');
  assert.equal(r.endsAt, 800_000);
  assert.equal(wallet(h, 'A'), 1000 - 400 + 100);
  assert.equal(wallet(h, 'B'), 900);
  assert.equal(companyState(h.db, h.gameId, 'A').attack_coins, 100);
  assert.equal(attackCooldownUntil(h.db, h.gameId, 'A'), 860_000);
});

test('a shield blocks one attack: the attacker pays, the victim loses nothing, the COO gets a disguised notice', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  assert.equal(hasShield(h.db, h.gameId, 'B'), true);
  const r = go(h, 'surprise_tax');
  assert.equal(r.blocked, true);
  assert.equal(wallet(h, 'A'), 600);
  assert.equal(wallet(h, 'B'), 1000);
  assert.equal(hasShield(h.db, h.gameId, 'B'), false);
  const n = h.db.prepare("SELECT role, text FROM notices WHERE company='B'").get();
  assert.deepEqual(n, { role: 'COO', text: 'Insurance claim used' });
  assert.equal(h.db.prepare('SELECT blocked FROM attacks').get().blocked, 1);
});

test('after the shield is used the next attack lands, and the shield cannot be requested again', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  go(h, 'price_squeeze', () => 0);
  atSec(h, 900);
  const r = go(h, 'price_squeeze', () => 0);
  assert.equal(r.blocked, false);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.B.COO, 'O06'), /already owned/);
});

test('Supplier Delay locks the CTO with the cover story, Bank Freeze locks the CFO', () => {
  const h = toCompetition(makeRunning());
  go(h, 'supplier_delay', () => 0);
  assert.equal(isLocked(h.ctx, h.game(), 'B', 'cto_lock'), true);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.B.CTO, 'F01-B'), (e) => e.message === 'Supplier systems are down for maintenance');
  const id = requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N'); // other roles are not locked
  atSec(h, 900);
  assert.equal(isLocked(h.ctx, h.game(), 'B', 'cto_lock'), false);
  go(h, 'bank_freeze', () => 0, 'A');
  h.db.prepare("UPDATE attacks SET launched_at = 899000, end_at = 929000 WHERE key = 'bank_freeze'").run();
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.B.CFO, id, true), (e) => e.message === 'Bank systems are under maintenance');
});

test('every attack is logged with the real cause', () => {
  const h = toCompetition(makeRunning());
  go(h, 'market_crash');
  const e = h.db.prepare("SELECT * FROM events WHERE type='attack'").get();
  assert.equal(e.admission_id, h.seat.A.CEO);
  assert.equal(JSON.parse(e.payload).key, 'market_crash');
});

test('a blocked attack still costs the attacker and returns no attacker identity to the victim side', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  const r = go(h, 'market_crash');
  assert.deepEqual(Object.keys(r).sort(), ['blocked', 'endsAt']);
  assert.equal(r.endsAt, 800_000);
  assert.equal(wallet(h, 'A'), 550);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM notices WHERE company='B' AND role IS NULL").get().n, 0);
});

test('a failed launch leaves no partial state', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze');
  assert.throws(() => go(h, 'market_crash'), /cooldown/);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM attacks').get().n, 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='attack'").get().n, 1);
});
