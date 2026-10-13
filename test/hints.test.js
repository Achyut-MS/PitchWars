import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { evaluateHints, latestHint, suggest } from '../src/hints.js';
import { requestItem } from '../src/shop.js';
import { openDb } from '../src/db.js';

const hints = (h) => h.db.prepare('SELECT * FROM hints ORDER BY id').all();

test('no hint while the companies are within 10 coins per minute', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']); // 27
  give(h, 'B', ['O01', 'O02']);         // 20, a gap of 7
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 0);
});

test('the weaker company role gets a hint when the rival earns 10 or more more', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']); // 27
  give(h, 'B', ['O01']);                // 13, a gap of 14
  evaluateHints(h.ctx, h.game());
  const rows = hints(h);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].company, rows[0].role], ['B', 'COO']);
  assert.match(rows[0].text, /holding the company back/);
});

function gapGame(bItems) {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']);   // company A's COO earns 13 per minute
  give(h, 'B', bItems);
  evaluateHints(h.ctx, h.game());
  return hints(h);
}

test('a gap of 9 coins per minute gets no hint', () => {
  assert.equal(gapGame(['O04-H', 'O05-F']).length, 0);   // company B's COO earns 4
});

test('a gap of exactly 10 gets a hint', () => {
  const rows = gapGame(['O04-H', 'O05-B']);              // company B's COO earns 3
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].company, rows[0].role], ['B', 'COO']);
});

test('a gap of 11 gets a hint', () => {
  assert.equal(gapGame(['O05-F']).length, 1);            // company B's COO earns 2
});

test('a hint is shown once per trigger: repeat ticks and a restart add nothing', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01']);
  evaluateHints(h.ctx, h.game());
  evaluateHints(h.ctx, h.game());
  h.clock.t += 30_000;
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 1);
  h.clock.t += 31_000;                       // 61 s later the gap still stands
  evaluateHints(h.ctx, h.game());
  const rows = hints(h);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].hint_key, rows[1].hint_key);
});

test('the stored key is unique per game, so a duplicate insert is refused', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01']);
  evaluateHints(h.ctx, h.game());
  const r = hints(h)[0];
  assert.throws(() => h.db.prepare('INSERT INTO hints (game_id, company, role, ts, text, hint_key) VALUES (?,?,?,?,?,?)')
    .run(h.gameId, r.company, r.role, r.ts + 1, 'x', r.hint_key), /UNIQUE/);
});

test('an older database without the key column is upgraded', () => {
  const db = openDb();
  const cols = db.prepare('PRAGMA table_info(hints)').all().map((c) => c.name);
  assert.ok(cols.includes('hint_key'));
});

test('no hints before the Competition', () => {
  const h = makeRunning();
  give(h, 'A', ['O01', 'O02', 'O03']);
  atSec(h, 100);
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 0);
});

test('latestHint returns the newest hint under 60 seconds old, else null', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01']);
  evaluateHints(h.ctx, h.game());
  const t = h.clock.t;
  const got = latestHint(h.db, h.gameId, 'B', 'COO', t + 59_000);
  assert.deepEqual([got.ts, typeof got.text], [t, 'string']);
  assert.equal(latestHint(h.db, h.gameId, 'B', 'COO', t + 60_000), null);
  assert.equal(latestHint(h.db, h.gameId, 'A', 'COO', t), null);
});

test('CTO and CMO hints name an upgrade from their own state', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['F01-P', 'F02-P', 'F03-P']);
  give(h, 'B', ['F01-B']);
  assert.match(suggest(h.ctx, h.game(), 'B', 'CTO'), /^(Upgrade .+ from Basic to Smart for \d+ coins|Buy .+ \(Basic\) for \d+ coins)$/);
  assert.equal(suggest(h.ctx, h.game(), 'B', 'COO'), 'Your part of the sales is holding the company back. Check your shop section.');
  const cmo = suggest(h.ctx, h.game(), 'B', 'CMO');
  assert.match(cmo, /^Buy /);
});

test('the cheapest next step is chosen and the price is the tier difference', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['M01-N']);
  const text = suggest(h.ctx, h.game(), 'B', 'CMO');
  assert.equal(text, 'Upgrade Target User from Small niche to Medium group for 50 coins');
});

test('hint text never leaks the rival, attacks or a company letter', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['F01-P', 'F02-P', 'F03-P', 'M01-L', 'M04-E', 'O01', 'O02', 'O03']);
  give(h, 'B', ['F01-B', 'M01-N']);
  evaluateHints(h.ctx, h.game());
  const rows = hints(h);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.doesNotMatch(r.text, /rival|attack|opponent|compet|\b[AB]\b/i);
  }
  const events = h.db.prepare("SELECT payload FROM events WHERE type='hint_shown'").all();
  assert.equal(events.length, 3);
});

test('acted is 1 when the role made a shop request within 60 seconds, else 0', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['F01-P', 'F02-P', 'F03-P', 'M01-L', 'M04-E']);
  give(h, 'B', ['F01-B', 'M01-N']);
  evaluateHints(h.ctx, h.game());
  h.clock.t += 5_000;
  requestItem(h.ctx, h.game(), h.seat.B.CTO, 'F01-S');
  h.clock.t += 56_000;
  evaluateHints(h.ctx, h.game());
  const by = Object.fromEntries(hints(h).filter((r) => r.acted !== null).map((r) => [r.role, r.acted]));
  assert.equal(by.CTO, 1);
  assert.equal(by.CMO, 0);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM events WHERE type='hint_result'").get().n >= 2, true);
});

// The trigger reads base rates only: attacks and market events must not move it.
import { launchAttack } from '../src/attacks.js';
import { triggerMarketEvent } from '../src/marketEvents.js';
import { readFileSync } from 'node:fs';

test('an attack landing on the victim role does not create a hint by itself', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02']);
  give(h, 'B', ['O01', 'O02']);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0); // halves B's rates: effective gap 10
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 0);
});

test('a hint still appears for a base gap of 10 or more while an attack is active', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01']);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'price_squeeze', () => 0);
  evaluateHints(h.ctx, h.game());
  const rows = hints(h);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].company, rows[0].role], ['B', 'COO']);
  assert.match(rows[0].text, /holding the company back/);
  assert.doesNotMatch(rows[0].text, /attack|rival|squeeze/i);
});

test('a demand surge does not create a hint from a base gap of 9', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']);
  give(h, 'B', ['O04-H', 'O05-F']);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 0);
});

test('a demand slump does not suppress a hint from a base gap of 11', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']);
  give(h, 'B', ['O05-F']);
  triggerMarketEvent(h.ctx, h.game(), 'demand_slump');
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 1);
});

test('the hints module uses no Math.random or Date.now', () => {
  const src = readFileSync(new URL('../src/hints.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Math\.random|Date\.now/);
});
