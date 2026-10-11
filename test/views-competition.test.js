import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { viewFor, organizerView } from '../src/views.js';
import { launchAttack } from '../src/attacks.js';
import { evaluateHints } from '../src/hints.js';
import { triggerMarketEvent, injectCoins } from '../src/marketEvents.js';

test('there is no competition block before the competition', () => {
  const h = makeRunning(); atSec(h, 10);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).competition, undefined);
});

test('a player sees their company rates rounded to one decimal', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'M01-L', 'HC01']);
  const c = viewFor(h.ctx, h.seat.A.CFO).competition;
  assert.deepEqual(c.rates, { CTO: 1, CMO: 16.5, COO: 13, total: 30.5 });
});

test('the CEO sees the nine attacks and the cooldown, the others see no attack panel', () => {
  const h = toCompetition(makeRunning());
  const ceo = viewFor(h.ctx, h.seat.A.CEO).competition.attack;
  assert.equal(ceo.options.length, 9);
  assert.equal(ceo.lockedReason, null);
  assert.equal(viewFor(h.ctx, h.seat.A.CTO).competition.attack, null);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'price_squeeze', () => 0);
  const after = viewFor(h.ctx, h.seat.A.CEO).competition.attack;
  assert.equal(after.lockedReason, 'cooldown');
  assert.equal(after.cooldownLeftSec, 90);
});

test('attacks show as a locked panel in the last minute', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1710);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).competition.attack.lockedReason, 'last minute');
});

test('the victim sees only the cover story, and the attacker sees nothing of it', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  const b = viewFor(h.ctx, h.seat.B.CTO).competition;
  assert.deepEqual(b.notices, ['Stock market prices have fallen']);
  const json = JSON.stringify(viewFor(h.ctx, h.seat.B.CFO), scrub);
  assert.equal(/market_crash|Market Crash|attack/i.test(json), false);
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CTO).competition.notices, []);
});

test('notices end with the effect', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  atSec(h, 831);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CTO).competition.notices, []);
});

test('the shield notice goes only to the COO', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.shield, { owned: true, used: false });
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.notices, ['Insurance claim used']);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CTO).competition.notices, []);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.shield, { owned: true, used: true });
  assert.equal(viewFor(h.ctx, h.seat.B.CTO).competition.shield, null);
});

test('a role sees its own hint, others do not', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  evaluateHints(h.ctx, h.game());
  assert.match(viewFor(h.ctx, h.seat.B.COO).competition.hint.text, /holding the company back/);
  assert.equal(viewFor(h.ctx, h.seat.B.CMO).competition.hint, null);
  assert.equal(viewFor(h.ctx, h.seat.B.CEO).competition.hint, null);
});

test('the organizer sees the real attacks, the event and the injection', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'bank_freeze', () => 0);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'B', 300);
  const g = organizerView(h.ctx).game;
  assert.equal(g.attacks[0].name, 'Bank Freeze');
  assert.deepEqual([g.attacks[0].attacker, g.attacks[0].victim, g.attacks[0].by], ['A', 'B', h.seat.A.CEO]);
  assert.equal(g.eventUsed, 'demand_surge');
  assert.deepEqual(g.injectionUsed, { company: 'B', coins: 300 });
});

// ---- hidden-products review focus ----
// The Attack Shield is a public shop product (spec), and a CEO owns an attack deck:
// scrub those before looking for leaks of the rival's actions.
const scrub = (k, v) => (k === 'attack' || (v && (v.id === 'O06' || v.itemId === 'O06')) ? undefined : v);
const ALL = ['CEO', 'CFO', 'CTO', 'CMO', 'COO'];
function busy() {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03', 'M01-L', 'HC01']);
  give(h, 'B', ['O06']);
  h.db.prepare("UPDATE participants SET name = ? WHERE admission_id = ?").run('Zed Rivalname', h.seat.A.CEO);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0); // blocked by B's shield
  atSec(h, 900);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'bank_freeze', () => 0);   // lands
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'B', 300);
  evaluateHints(h.ctx, h.game());
  return h;
}

test('a victim never sees attack, rival, opponent, or the attacker identity', () => {
  const h = busy();
  for (const r of ALL) {
    const json = JSON.stringify(viewFor(h.ctx, h.seat.B[r]), scrub);
    assert.equal(/attack|rival|opponent|Zed Rivalname|Bank Freeze|Market Crash|bank_freeze|market_crash/i.test(json), false, `${r}: ${json.match(/.{30}(attack|rival|opponent|Zed|Bank Freeze|Market Crash).{30}/i)}`);
    assert.equal(json.includes(h.seat.A.CEO), false);
  }
  const n = viewFor(h.ctx, h.seat.B.CTO).competition.notices;
  assert.ok(n.includes('Bank systems are under maintenance'));
  assert.ok(n.includes('Market news: Demand Surge'));
  assert.ok(n.includes('Investor interest: bonus funding added to your wallet'));
});

test('only the CEO view carries the attack deck; only the attacker sees launch status', () => {
  const h = busy();
  for (const c of ['A', 'B']) for (const r of ALL) {
    const v = viewFor(h.ctx, h.seat[c][r]);
    if (r !== 'CEO') {
      assert.equal(v.competition.attack, null);
      assert.equal(/price_squeeze|Price Squeeze|cooldownLeftSec|lockedReason/.test(JSON.stringify(v)), false);
    }
  }
  const a = viewFor(h.ctx, h.seat.A.CEO).competition.attack;
  assert.deepEqual(a.launches.map((l) => [l.name, l.status]), [['Market Crash', 'blocked'], ['Bank Freeze', 'landed']]);
  const bj = JSON.stringify(a);
  assert.equal(/shield|Insurance|"B"|victim/i.test(bj), false);
});

test("a company's view never contains the other company's data", () => {
  const h = busy();
  const bView = JSON.stringify(viewFor(h.ctx, h.seat.B.CEO));
  assert.equal(bView.includes(h.seat.A.CFO), false);
  assert.equal(bView.includes('Player 0'), false);
  const a = viewFor(h.ctx, h.seat.A.CFO).competition;
  const b = viewFor(h.ctx, h.seat.B.CFO).competition;
  assert.notDeepEqual(a.rates, b.rates);
  assert.equal(a.rates.COO > 0, true);
  assert.equal(viewFor(h.ctx, h.seat.A.CFO).wallet === viewFor(h.ctx, h.seat.B.CFO).wallet, false);
});

test('the organizer sees both companies with the real causes', () => {
  const h = busy();
  const g = organizerView(h.ctx).game;
  assert.deepEqual(g.attacks.map((x) => [x.name, x.blocked]), [['Market Crash', true], ['Bank Freeze', false]]);
  assert.ok(g.companies.A && g.companies.B);
});

test('lobby and completed players get no competition data', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("UPDATE participants SET status='completed' WHERE admission_id=?").run(h.seat.A.CTO);
  assert.equal('competition' in viewFor(h.ctx, h.seat.A.CTO), false);
  h.db.prepare("UPDATE participants SET status='lobby', game_id=NULL WHERE admission_id=?").run(h.seat.A.CMO);
  assert.equal('competition' in viewFor(h.ctx, h.seat.A.CMO), false);
});

test('no crash without company_state rows or samples, and ordering is stable', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare('DELETE FROM company_state').run();
  assert.doesNotThrow(() => JSON.stringify(viewFor(h.ctx, h.seat.A.CEO)));
  const h2 = busy();
  assert.equal(JSON.stringify(viewFor(h2.ctx, h2.seat.A.CEO)), JSON.stringify(viewFor(h2.ctx, h2.seat.A.CEO)));
});

test('a Competition viewFor with a shared cache stays under 10 ms', () => {
  const h = busy();
  const cache = new Map();
  const ids = ALL.flatMap((r) => [h.seat.A[r], h.seat.B[r]]);
  for (const id of ids) viewFor(h.ctx, id, cache);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 80; i++) viewFor(h.ctx, ids[i % ids.length], new Map());
  const per = Number(process.hrtime.bigint() - t0) / 80 / 1e6;
  console.log(`viewFor ${per.toFixed(2)} ms`); assert.ok(per < 10, `${per} ms`);
});
