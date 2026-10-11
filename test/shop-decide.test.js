import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { requestItem, recommendItem, ceoDecide, cfoDecide, autoRejectAll, queueHead, summaryCard } from '../src/shop.js';
import { companyState } from '../src/state.js';
import { runDirector, HOOKS } from '../src/director.js';

function toShop(h) {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  return h;
}
const wallet = (h, c = 'A') => companyState(h.db, h.gameId, c).wallet;
const status = (h, id) => h.db.prepare('SELECT status FROM requests WHERE id=?').get(id).status;

test('the CEO approves a CTO feature, which then joins the CFO queue', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.equal(queueHead(h.db, h.gameId, 'A'), undefined);
  ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true);
  assert.equal(queueHead(h.db, h.gameId, 'A').id, id);
});

test('the CEO can reject a feature, and only the CEO can decide', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /only the CEO can decide/);
  ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, false);
  assert.equal(status(h, id), 'rejected');
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true), /not waiting for the CEO/);
});

test('the CFO approves: the wallet is charged and the item is owned', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(status(h, id), 'approved');
  assert.equal(wallet(h), 900);
  assert.equal(h.db.prepare("SELECT item_id FROM owned WHERE company='A' AND family='M01'").get().item_id, 'M01-M');
});

test('only the CFO can decide, and a rejection costs nothing', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true), /only the CFO can decide/);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, false);
  assert.equal(status(h, id), 'rejected');
  assert.equal(wallet(h), 1000);
});

test('the CFO must decide the oldest request first', () => {
  const h = toShop(makeRunning());
  const first = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const second = requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, second, true), /decide the oldest request first/);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, first, true);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, second, true);
});

test('a purchase that would take the wallet below -200 cannot be approved', () => {
  const h = toShop(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -150 WHERE company='A'").run();
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L'); // 150 coins
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /below -200/);
  assert.equal(wallet(h), -150);
  assert.equal(status(h, id), 'pending');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, false); // the CFO can still reject it
});

test('exactly -200 is allowed', () => {
  const h = toShop(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -50 WHERE company='A'").run();
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(wallet(h), -200);
});

test('an upgrade charges only the difference', () => {
  const h = toShop(makeRunning());
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), true); // 50
  const up = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L'); // 150, difference 100
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, up, true);
  assert.equal(wallet(h), 850);
  assert.equal(h.db.prepare("SELECT item_id FROM owned WHERE company='A' AND family='M01'").get().item_id, 'M01-L');
});

test('a recommendation is decided by the CFO like any request', () => {
  const h = toShop(makeRunning());
  const id = recommendItem(h.ctx, h.game(), h.seat.A.CEO, 'M04-S');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(wallet(h), 920);
});

test('decisions are refused when the shop is closed', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  atSec(h, 790);
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /shop is closed/);
});

test('another company cannot touch this company request', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.B.CFO, id, true), /no such request/);
});

test('the director auto-rejects open requests when the shop phase ends, once', () => {
  Object.assign(HOOKS, { shop: autoRejectAll });
  const h = toShop(makeRunning());
  const a = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const b = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B'); // still waiting for the CEO
  atSec(h, 781);
  runDirector(h.ctx);
  runDirector(h.ctx);
  for (const id of [a, b]) {
    const r = h.db.prepare('SELECT status, reject_reason FROM requests WHERE id=?').get(id);
    assert.deepEqual(r, { status: 'rejected', reject_reason: 'auto' });
  }
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='shop_auto_reject'").get().n, 2);
});

test('the summary card lists the idea, what was bought and the coins left', () => {
  const h = toShop(makeRunning());
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 1), true);
  const card = summaryCard(h.ctx, h.game(), 'A');
  assert.equal(card.idea.id, 'H1');
  assert.equal(card.wallet, 960);
  assert.deepEqual(card.owned.map((o) => [o.itemId, o.charged]), [['M02', 40]]);
  assert.match(card.owned[0].label, /^Brand name: /);
});

test('a double click on approve charges once', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /already decided/);
  assert.equal(wallet(h), 900);
  assert.equal(h.db.prepare('SELECT charged FROM owned WHERE company=\'A\' AND family=\'M01\'').get().charged, 100);
});

test('a throw mid-approval leaves nothing half-written', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  h.db.exec("CREATE TRIGGER boom BEFORE INSERT ON events WHEN NEW.type='cfo_decision' BEGIN SELECT RAISE(ABORT,'boom'); END");
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /boom/);
  assert.equal(wallet(h), 1000);
  assert.equal(status(h, id), 'pending');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM owned').get().n, 0);
  assert.equal(h.db.inTransaction, false);
});

test('approval re-checks the family: a stale lower tier is refused', () => {
  const h = toShop(makeRunning());
  const ins = h.db.prepare("INSERT INTO requests (game_id, company, item_id, family, requested_by, status, phase, price, requested_at) VALUES (?, 'A', ?, 'M01', ?, 'pending', 'shop', ?, 1)");
  const big = Number(ins.run(h.gameId, 'M01-L', h.seat.A.CMO, 150).lastInsertRowid);
  const small = Number(ins.run(h.gameId, 'M01-N', h.seat.A.CMO, 50).lastInsertRowid);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, big, true);
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, small, true), /already owned/);
  assert.equal(wallet(h), 850);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, small, false);
});

test('the CEO of the other company cannot decide, and a double CEO click is refused', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.B.CEO, id, true), /no such request/);
  ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true);
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true), /not waiting for the CEO/);
});

test('the summary card only shows the asked company', () => {
  const h = toShop(makeRunning());
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M'), true);
  const b = summaryCard(h.ctx, h.game(), 'B');
  assert.deepEqual(b.owned, []);
  assert.equal(b.wallet, 1000);
  assert.equal(b.idea.id, 'S1');
});

test('a late shop hook leaves Competition-phase requests alone; competition hook takes only its own', () => {
  const h = toShop(makeRunning());
  const shopReq = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  atSec(h, 805); // competition has begun
  const compReq = requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01');
  autoRejectAll(h.ctx, h.game(), Math.random, 'shop');
  assert.equal(status(h, shopReq), 'rejected');
  assert.equal(status(h, compReq), 'pending');
  autoRejectAll(h.ctx, h.game(), Math.random, 'shop');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='shop_auto_reject'").get().n, 1);
  autoRejectAll(h.ctx, h.game(), Math.random, 'competition');
  assert.equal(status(h, compReq), 'rejected');
});
