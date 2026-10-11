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
