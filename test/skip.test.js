import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { skipToNextPhase } from '../src/skip.js';
import { phaseAt } from '../src/phases.js';
import { runDirector } from '../src/director.js';
import { tickEconomy } from '../src/economy.js';
import { fireWarnings } from '../src/warnings.js';

const skip = (h) => skipToNextPhase(h.db, h.game(), h.clock.t);
const phase = (h) => phaseAt(h.game(), h.clock.t).phase;

test('each phase skips to the next one exactly now', () => {
  const h = makeRunning();
  atSec(h, 50.4);
  for (const [from, to] of [['briefing', 'ideation'], ['ideation', 'shop'], ['shop', 'summary'], ['summary', 'competition']]) {
    assert.equal(phase(h), from);
    assert.deepEqual(skip(h), { from, to });
    assert.equal(phase(h), to);
    const g = h.game();
    assert.equal(phaseAt(g, h.clock.t).remainingSec, { ideation: 180, shop: 420, summary: 20, competition: 960 }[to]);
  }
  assert.equal(h.game().ideationSavedSec, 0);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM events WHERE type='organizer_action'").get().n, 0);
});

test('ideationSavedSec is untouched when skipping ideation after ending it early', () => {
  const h = makeRunning();
  atSec(h, 200);
  h.db.prepare('UPDATE games SET ideation_saved_sec = 100 WHERE id=?').run(h.gameId);
  assert.equal(phase(h), 'ideation');
  skip(h);
  assert.equal(phase(h), 'shop');
  assert.equal(h.game().ideationSavedSec, 100);
});

test('refuses inside the competition, after the end, and with no game', () => {
  const h = makeRunning();
  atSec(h, 800);
  assert.throws(() => skip(h), /competition/);
  atSec(h, 5000);
  assert.throws(() => skip(h), /ended|competition/);
  assert.throws(() => skipToNextPhase(h.db, null, 0), /no game/);
  h.db.prepare('UPDATE games SET ended_at=1 WHERE id=?').run(h.gameId);
  assert.throws(() => skipToNextPhase(h.db, { id: h.gameId }, 0), /no game/);
});

test('walking the whole way fires every end-of-phase hook once, no coins, no warnings', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = Object.fromEntries(['briefing', 'ideation', 'shop', 'summary'].map((p) => [p, () => calls.push(p)]));
  atSec(h, 10);
  for (let i = 0; i < 4; i++) {
    skip(h);
    runDirector(h.ctx, hooks);
    runDirector(h.ctx, hooks);
    tickEconomy(h.ctx, h.game());
    fireWarnings(h.ctx, h.game());
  }
  assert.deepEqual(calls, ['briefing', 'ideation', 'shop', 'summary']);
  assert.equal(phase(h), 'competition');
  assert.equal(h.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1000);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM warnings_sent').get().n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM notices').get().n, 0);
  // the economy then runs normally from the competition start
  h.clock.t += 5000;
  tickEconomy(h.ctx, h.game());
  tickEconomy(h.ctx, h.game());
  assert.ok(h.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet <= 1001);
});
