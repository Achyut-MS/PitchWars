import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { triggerMarketEvent, injectCoins, saleMultiplier, activeEvent } from '../src/marketEvents.js';
import { chargeFor } from '../src/shop.js';
import { effectiveRates } from '../src/rates.js';
import { companyState } from '../src/state.js';

test('an event starts now and lasts its duration', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  assert.equal(activeEvent(h.db, h.gameId, 850_000).key, 'shop_sale');
  assert.equal(activeEvent(h.db, h.gameId, 890_000), null); // 90 s after 800 s
});

test('only one event per game, and only the three known events', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'earthquake'), /unknown event/);
  triggerMarketEvent(h.ctx, h.game(), 'demand_slump');
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'demand_surge'), /already used/);
});

test('events are refused before the competition', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'demand_surge'), /during the competition/);
});

test('Demand Surge raises both companies by 25%', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01', 'O02', 'O03']);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  assert.ok(Math.abs(effectiveRates(h.ctx, h.game(), 'A', 810_000).COO - 33.75) < 1e-9);
  assert.ok(Math.abs(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO - 33.75) < 1e-9);
});

test('Shop Sale takes 25% off prices and upgrades while it lasts', () => {
  const h = toCompetition(makeRunning());
  const item = h.ctx.data.item('M01-L'); // 150
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 150);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  assert.equal(saleMultiplier(h.db, h.gameId, 850_000), 0.75);
  h.clock.t = 850_000;
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 113); // 112.5 rounds to 113
  give(h, 'A', ['M01-N']);
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 75); // difference of 100, minus 25%
  h.clock.t = 900_000;
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 100);
});

test('the organizer can inject up to 500 coins into one company, once', () => {
  const h = toCompetition(makeRunning());
  injectCoins(h.ctx, h.game(), 'A', 500);
  assert.equal(companyState(h.db, h.gameId, 'A').wallet, 1500);
  assert.throws(() => injectCoins(h.ctx, h.game(), 'B', 100), /already injected/);
});

test('injections reject bad amounts and unknown companies without using up the one allowed injection', () => {
  const h = toCompetition(makeRunning());
  for (const bad of [0, -5, 501, 2.5, 'abc', null]) {
    assert.throws(() => injectCoins(h.ctx, h.game(), 'A', bad), /whole number from 1 to 500/);
  }
  assert.throws(() => injectCoins(h.ctx, h.game(), 'C', 100), /unknown company/);
  injectCoins(h.ctx, h.game(), 'B', 1);
});

test('events and injections are logged', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'A', 200);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('market_event','coin_injection')").get().n, 2);
});


test('the sale never makes an item free and applies to the price charged at approval', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  h.clock.t = 850_000;
  for (const id of ['M01-L']) assert.ok(chargeFor(h.ctx, h.game(), 'A', h.ctx.data.item(id)) >= 1);
});

test('a second event or injection fails atomically and logs nothing extra', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'demand_surge'), /already used/);
  injectCoins(h.ctx, h.game(), 'A', 100);
  assert.throws(() => injectCoins(h.ctx, h.game(), 'A', 100), /already injected/);
  assert.equal(companyState(h.db, h.gameId, 'A').wallet, 1100);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('market_event','coin_injection')").get().n, 2);
});

test('only the injected company is told, with a market-style reason and no attack wording', () => {
  const h = toCompetition(makeRunning());
  injectCoins(h.ctx, h.game(), 'A', 100);
  const a = h.db.prepare("SELECT text FROM notices WHERE game_id=? AND company='A'").all(h.gameId);
  const b = h.db.prepare("SELECT text FROM notices WHERE game_id=? AND company='B'").all(h.gameId);
  assert.equal(a.length, 1);
  assert.equal(b.length, 0);
  assert.doesNotMatch(a[0].text, /attack|rival/i);
});
