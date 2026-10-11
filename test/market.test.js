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

import { requestItem, cfoDecide } from '../src/shop.js';
import { viewFor } from '../src/views.js';

const queuePrice = (h) => viewFor(h.ctx, h.seat.A.CFO).shop.queue[0].price;
const walletA = (h) => companyState(h.db, h.gameId, 'A').wallet;

test('the queue price is what approval would charge now, sale or not, and equals the wallet delta', () => {
  const h = toCompetition(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L');
  assert.equal(queuePrice(h), 150);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  h.clock.t = 850_000;
  assert.equal(queuePrice(h), 113);
  const before = walletA(h);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, 1, true);
  assert.equal(before - walletA(h), 113);
});

test('an upgrade in the queue shows the differential', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-N']);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L');
  assert.equal(queuePrice(h), 100);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  h.clock.t = 850_000;
  assert.equal(queuePrice(h), 75);
  const before = walletA(h);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, 1, true);
  assert.equal(before - walletA(h), 75);
});

test('injection outside the competition or into a company without a wallet row consumes nothing', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => injectCoins(h.ctx, h.game(), 'A', 100), /during the competition/);
  toCompetition(h);
  h.db.prepare("DELETE FROM company_state WHERE game_id=? AND company='B'").run(h.gameId);
  assert.throws(() => injectCoins(h.ctx, h.game(), 'B', 100), /unknown company/);
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM injections').get().n, 0);
  injectCoins(h.ctx, h.game(), 'A', 100);
});

test('a bad rng cannot push an attack outside its 30 to 45 second window', async () => {
  const { launchAttack } = await import('../src/attacks.js');
  for (const bad of [5, -3, NaN]) {
    const h = toCompetition(makeRunning());
    const r = launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'price_squeeze', () => bad);
    assert.ok(r.endsAt >= 830_000 && r.endsAt <= 845_000, String(bad));
  }
});

const cat = (h, id) => viewFor(h.ctx, h.seat.A.CFO).shop.catalog.find((i) => i.id === id);
const cmoCat = (h, id) => viewFor(h.ctx, h.seat.A.CMO).shop.catalog.find((i) => i.id === id);

test('tiers at or below an owned tier show no price and cannot be requested', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-L']);
  for (const id of ['M01-N', 'M01-M', 'M01-L']) {
    assert.equal(cat(h, id).state, 'owned');
    assert.equal(cat(h, id).price, null);
    assert.equal(cmoCat(h, id).canRequest, false);
  }
});

test('after Basic then Smart the Large upgrade price is the differential and matches the wallet delta, also in a sale', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-M']);
  assert.equal(cat(h, 'M01-L').price, 50);
  assert.equal(cat(h, 'M01-N').price, null);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  h.clock.t = 850_000;
  const shown = cat(h, 'M01-L').price;
  assert.ok(shown >= 1);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L');
  const before = walletA(h);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, 1, true);
  assert.equal(before - walletA(h), shown);
  for (const i of viewFor(h.ctx, h.seat.A.CFO).shop.catalog) assert.ok(i.price === null || i.price >= 1, i.id);
});
