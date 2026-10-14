import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/clock.js';

function fakeReal(start = 1_000_000) {
  let t = start;
  return { real: () => t, advance: (ms) => { t += ms; } };
}

test('pausing freezes the clock and resuming carries on from where it stopped', () => {
  const r = fakeReal();
  const c = createClock({ real: r.real });
  r.advance(5000);
  assert.equal(c.now(), 1_005_000);
  c.pause();
  r.advance(60_000);
  assert.equal(c.now(), 1_005_000, 'frozen while paused');
  assert.equal(c.paused(), true);
  c.resume();
  assert.equal(c.now(), 1_005_000, 'no jump on resume');
  r.advance(2000);
  assert.equal(c.now(), 1_007_000, 'runs again after resume');
  assert.equal(c.pausedMs(), 60_000);
});

test('pause and resume are idempotent', () => {
  const r = fakeReal();
  const c = createClock({ real: r.real });
  c.resume();
  assert.equal(c.paused(), false);
  c.pause(); c.pause();
  r.advance(1000);
  c.resume(); c.resume();
  assert.equal(c.pausedMs(), 1000);
});

test('restore continues from a saved time, with or without a pause running', () => {
  const r = fakeReal();
  const a = createClock({ real: r.real });
  a.restore(500_000, 0, false);
  assert.equal(a.now(), 500_000);
  r.advance(3000);
  assert.equal(a.now(), 503_000);

  const b = createClock({ real: r.real });
  b.restore(500_000, 4000, true);
  assert.equal(b.now(), 500_000, 'a restart during a pause stays paused');
  r.advance(10_000);
  assert.equal(b.now(), 500_000);
  b.resume();
  assert.equal(b.now(), 500_000);
  assert.equal(b.pausedMs(), 14_000);
});
