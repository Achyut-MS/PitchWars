import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition, atSec } from './helpers.js';
import { warningFor, shopOpenAt, fireWarnings } from '../src/warnings.js';
import { requestItem, cfoDecide, ceoDecide } from '../src/shop.js';
import { runDirector } from '../src/director.js';
import { viewFor } from '../src/views.js';

const c = (remainingSec, phase = 'competition') => ({ phase, remainingSec });

test('warnings appear at 5 minutes, 2 minutes, 30 seconds and the last 10 seconds', () => {
  assert.equal(warningFor(c(301)), null);
  assert.equal(warningFor(c(300)), '5min');
  assert.equal(warningFor(c(121)), '5min');
  assert.equal(warningFor(c(120)), '2min');
  assert.equal(warningFor(c(31)), '2min');
  assert.equal(warningFor(c(30)), '30s');
  assert.equal(warningFor(c(11)), '30s');
  assert.equal(warningFor(c(10)), 'last10');
  assert.equal(warningFor(c(0)), 'last10');
});

test('no warnings outside the competition', () => {
  assert.equal(warningFor(c(10, 'shop')), null);
  assert.equal(warningFor(c(5, 'ideation')), null);
});

test('the shop is open in the shop phase and until 30 seconds before the end of the competition', () => {
  const g = { startedAt: 0, ideationSavedSec: 0 };
  assert.equal(shopOpenAt(g, 400_000), true);
  assert.equal(shopOpenAt(g, 790_000), false); // summary card
  assert.equal(shopOpenAt(g, 900_000), true);
  assert.equal(shopOpenAt(g, 1_729_000), true);  // 31 s left
  assert.equal(shopOpenAt(g, 1_730_000), false); // 30 s left
  assert.equal(shopOpenAt(g, 1_729_999), true);  // 30.001 s left rounds up to 31
  assert.equal(shopOpenAt(g, 1_731_000), false); // 29 s left
  assert.equal(shopOpenAt(g, 1_761_000), false);
});

test('new requests are refused in the last 30 seconds; the CFO still finishes the queue and the end auto-rejects the rest', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1700);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const id2 = requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01');
  atSec(h, 1731);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'T01'), /shop is closed/);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, false); // guide: the CFO finishes the queue
  assert.equal(h.db.prepare('SELECT status FROM requests WHERE id=?').get(id).status, 'rejected');
  atSec(h, 1761);
  runDirector(h.ctx);
  const r = h.db.prepare('SELECT status, reject_reason FROM requests WHERE id=?').get(id2);
  assert.deepEqual({ ...r }, { status: 'rejected', reject_reason: 'auto' });
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM events WHERE type='shop_auto_reject'").get().n, 1);
});

test('the view reports the warning and the closed shop', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1735);
  const v = viewFor(h.ctx, h.seat.A.CMO);
  assert.equal(v.clock.warning, '30s');
  assert.equal(v.shop.open, false);
});

const notices = (h) => h.db.prepare('SELECT * FROM notices WHERE game_id=? ORDER BY id').all(h.gameId);

test('each warning is stored once, for both companies, however often it ticks or restarts', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 800 + 960 - 300);
  assert.equal(fireWarnings(h.ctx, h.game()), true);
  assert.equal(fireWarnings(h.ctx, h.game()), false);
  atSec(h, 800 + 960 - 299);
  assert.equal(fireWarnings(h.ctx, h.game()), false);
  const n = notices(h);
  assert.deepEqual(n.map((x) => x.company).sort(), ['A', 'B']);
  assert.ok(n.every((x) => x.role === null && /5 minutes/.test(x.text)));
  assert.ok(!n.some((x) => /rival|attack|wallet|coins/i.test(x.text)));
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM events WHERE type='countdown_warning'").get().n, 1);
});

test('after a long gap only the most recent applicable warning fires', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 800 + 960 - 25); // 5min, 2min and the 30 s mark all missed
  fireWarnings(h.ctx, h.game());
  assert.equal(notices(h).length, 2);
  assert.match(notices(h)[0].text, /30 seconds/);
  atSec(h, 800 + 960 - 5);
  fireWarnings(h.ctx, h.game());
  assert.equal(notices(h).length, 4);
});

test('no warning notices outside the competition', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.equal(fireWarnings(h.ctx, h.game()), false);
  assert.equal(notices(h).length, 0);
});

test('a warning is visible only until the next one; the view shows just the newest', () => {
  const h = toCompetition(makeRunning());
  const end = 800 + 960;
  const seen = () => viewFor(h.ctx, h.seat.A.CMO).competition.notices.filter((x) => /left|Last 10/.test(x));
  for (const left of [300, 120, 30, 10]) { atSec(h, end - left); fireWarnings(h.ctx, h.game()); }
  atSec(h, end - 20);
  assert.deepEqual(seen(), ['30 seconds left. The shop is now closed for new requests.']);
  atSec(h, end - 5);
  assert.deepEqual(seen(), ['Last 10 seconds!']);
  atSec(h, end - 270);
  assert.deepEqual(seen(), ['5 minutes left.']);
});

test('after a gap only the current warning is stored and visible', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 800 + 960 - 100);
  fireWarnings(h.ctx, h.game());
  fireWarnings(h.ctx, h.game());
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM warnings_sent').get().n, 1);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CTO).competition.notices, ['2 minutes left.']);
});
