import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { runDirector } from '../src/director.js';

test('a hook runs when its phase has ended, and only once', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = { briefing: (ctx, g) => calls.push(['briefing', g.id]) };
  atSec(h, 100);
  assert.equal(runDirector(h.ctx, hooks), false);
  atSec(h, 181);
  assert.equal(runDirector(h.ctx, hooks), true);
  assert.equal(runDirector(h.ctx, hooks), false);
  assert.deepEqual(calls, [['briefing', h.gameId]]);
});

test('skipped phases all fire, in order, after a long gap', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = Object.fromEntries(['briefing', 'ideation', 'shop', 'summary']
    .map((p) => [p, () => calls.push(p)]));
  atSec(h, 790); // summary is still running at 780..800
  runDirector(h.ctx, hooks);
  assert.deepEqual(calls, ['briefing', 'ideation', 'shop']);
  atSec(h, 801);
  runDirector(h.ctx, hooks);
  assert.deepEqual(calls, ['briefing', 'ideation', 'shop', 'summary']);
});

test('after the competition ends its hook runs once', () => {
  const h = makeRunning();
  const calls = [];
  atSec(h, 1761);
  runDirector(h.ctx, { competition: () => calls.push('competition') });
  runDirector(h.ctx, { competition: () => calls.push('competition') });
  assert.deepEqual(calls, ['competition']);
});

test('with no game running the director does nothing', async () => {
  const { openDb } = await import('../src/db.js');
  assert.equal(runDirector({ db: openDb(), now: () => 0 }, {}), false);
});

test('two ticks in the same second fire each hook once', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = { briefing: () => calls.push('b'), ideation: () => calls.push('i') };
  atSec(h, 400);
  runDirector(h.ctx, hooks);
  runDirector(h.ctx, hooks);
  assert.deepEqual(calls, ['b', 'i']);
});

test('a restart (new ctx, same DB) does not re-fire hooks', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = { briefing: () => calls.push('b'), ideation: () => calls.push('i') };
  atSec(h, 400);
  runDirector(h.ctx, hooks);
  const restarted = { db: h.db, data: h.ctx.data, now: () => h.clock.t };
  assert.equal(runDirector(restarted, hooks), false);
  assert.deepEqual(calls, ['b', 'i']);
});

test('a phase with no hook is still marked done, so a late hook never fires retroactively', () => {
  const h = makeRunning();
  const calls = [];
  atSec(h, 181);
  runDirector(h.ctx, {});
  runDirector(h.ctx, { briefing: () => calls.push('b') });
  assert.deepEqual(calls, []);
});
