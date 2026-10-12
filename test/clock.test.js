import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/clock.js';

test('clock starts with offset 0 and follows the real clock', () => {
  let t = 1000;
  const c = createClock({ real: () => t });
  assert.equal(c.offset(), 0);
  assert.equal(c.now(), 1000);
  t = 1500;
  assert.equal(c.now(), 1500);
});

test('setOffset shifts now() and keeps counting in real time', () => {
  let t = 1000;
  const c = createClock({ real: () => t });
  c.setOffset(-400);
  assert.equal(c.offset(), -400);
  assert.equal(c.now(), 600);
  t = 1250;
  assert.equal(c.now(), 850);
});

test('default real source is Date.now', () => {
  const c = createClock();
  assert.ok(Math.abs(c.now() - Date.now()) < 50);
});

import { speedClock } from '../src/clock.js';

test('speedClock: speed 1 follows the real clock', () => {
  let t = 1000;
  const now = speedClock(1, () => t);
  t += 5000;
  assert.equal(now(), 6000);
});

test('speedClock: speed 10 runs ten times faster from the moment it was made', () => {
  let t = 1000;
  const now = speedClock(10, () => t);
  assert.equal(now(), 1000);
  t += 5000;
  assert.equal(now(), 51000);
});

test('speedClock under createClock: a restart at speed 10 resumes from the heartbeat', () => {
  let t = 7_000_000;
  const c = createClock({ real: speedClock(10, () => t) });
  c.setOffset(1_200_000 - c.now()); // what resumeActiveGame does
  assert.equal(c.now(), 1_200_000);
  t += 1000; // one real second is ten game seconds
  assert.equal(c.now(), 1_210_000);
});
