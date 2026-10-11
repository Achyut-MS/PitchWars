import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { requestItem, recommendItem, chargeFor } from '../src/shop.js';
import { itemLabel } from '../src/labels.js';

// Both companies pick (A: hardware H1, B: software S1) and the game jumps to the shop.
function toShop(h) {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  return h;
}
const row = (h, id) => h.db.prepare('SELECT * FROM requests WHERE id = ?').get(id);

test('the CTO requests a feature, and it waits for the CEO first', () => {
  const h = toShop(makeRunning());
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B')).status, 'awaiting_ceo');
});

test('the CMO and COO requests go straight to the CFO queue', () => {
  const h = toShop(makeRunning());
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N')).status, 'pending');
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01')).status, 'pending');
});

test('the CEO and the CFO cannot add items', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CEO, 'F01-B'), /only the CTO, CMO and COO/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CFO, 'F01-B'), /only the CTO, CMO and COO/);
});

test('a role cannot request from another role section', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'F01-B'), /not in your section/);
});

test('hardware parts only for a hardware idea, software parts only for a software idea', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'SC01'), /not available for this idea/);
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'HC01');
  requestItem(h.ctx, h.game(), h.seat.B.CTO, 'SC01');
});

test('the CEO can recommend any item, and it goes straight to the CFO queue', () => {
  const h = toShop(makeRunning());
  const id = recommendItem(h.ctx, h.game(), h.seat.A.CEO, 'F01-B');
  assert.equal(row(h, id).status, 'pending');
  assert.equal(row(h, id).recommended, 1);
  assert.throws(() => recommendItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-S'), /only the CEO can recommend/);
});

test('the shop is closed during ideation and during the summary card', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /shop is closed/);
  toShop(h);
  atSec(h, 790);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /shop is closed/);
});

test('brand and tagline need one of the three options', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02'), /pick one of the three/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 4), /pick one of the three/);
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 2)).choice, 2);
});

test('the same item family cannot be requested twice while one is open', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-P'), /already requested/);
});

test('the other company can request the same item independently', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N');
});

test('an owned item cannot be requested again at the same or a lower tier, but can be upgraded', () => {
  const h = toShop(makeRunning());
  h.db.prepare("INSERT INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (?, 'A', 'F01', 'F01-S', 0, 180)").run(h.gameId);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B'), /already owned/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-S'), /already owned/);
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-P');
});

test('an upgrade costs the difference between the tiers', () => {
  const h = toShop(makeRunning());
  h.db.prepare("INSERT INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (?, 'A', 'F01', 'F01-B', 0, 100)").run(h.gameId);
  assert.equal(chargeFor(h.ctx, h.game(), 'A', h.ctx.data.item('F01-P')), 180);
  assert.equal(chargeFor(h.ctx, h.game(), 'B', h.ctx.data.item('F01-P')), 280);
});

test('a rejected item cannot come back in the same shop phase', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M'), /rejected in this phase/);
});

test('a shop-phase rejection can be requested again in the competition phase', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  atSec(h, 800);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
});

test('in the competition phase a rejected item needs a 60 second wait', () => {
  const h = toShop(makeRunning());
  atSec(h, 800);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  atSec(h, 850);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /wait 60 seconds/);
  atSec(h, 861);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
});

test('requests are logged against the requester', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const e = h.db.prepare("SELECT * FROM events WHERE type='shop_request'").get();
  assert.equal(e.admission_id, h.seat.A.CMO);
});

test('labels use the idea risks, brands and taglines', () => {
  const h = toShop(makeRunning());
  const idea = h.ctx.data.ideasFor(1).find((i) => i.id === 'H1');
  assert.equal(itemLabel(h.ctx.data.item('O02'), idea), 'Fix: ' + idea.risks[1]);
  assert.equal(itemLabel(h.ctx.data.item('M02'), idea, 3), 'Brand name: ' + idea.brands[2]);
  assert.equal(itemLabel(h.ctx.data.item('M03'), idea, 1), 'Tagline: ' + idea.taglines[0]);
  assert.equal(itemLabel(h.ctx.data.item('F01-S'), idea), 'Core Function (Smart)');
  assert.equal(itemLabel(h.ctx.data.item('HC01'), idea), 'Sensor');
});

test('a failing event log leaves no request behind', () => {
  const h = toShop(makeRunning());
  h.db.exec("CREATE TRIGGER boom BEFORE INSERT ON events WHEN NEW.type='shop_request' BEGIN SELECT RAISE(ABORT,'boom'); END");
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /boom/);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM requests').get().n, 0);
  assert.equal(h.db.inTransaction, false);
});

test('a recommendation cannot duplicate an open request for the same family', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  assert.throws(() => recommendItem(h.ctx, h.game(), h.seat.A.CEO, 'M01-L'), /already requested/);
});

test('players outside the game are refused', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), 'nobody', 'M01-N'), /not in this game/);
});
