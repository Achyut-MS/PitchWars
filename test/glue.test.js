import test from 'node:test';
import assert from 'node:assert/strict';
import { humanError, viewKey, createSendGuard, redrawDecision, shouldRequestNextPuzzle } from '../public/glue.js';

test('humanError turns server codes into sentences', () => {
  assert.equal(humanError('bad_password'), 'Wrong password');
  assert.equal(humanError('too_many_attempts'), 'Too many tries, wait a minute');
  assert.match(humanError('bad_message'), /Something went wrong/);
  assert.equal(humanError('your company has already picked'), 'your company has already picked');
  assert.match(humanError(undefined), /Something went wrong/);
  assert.match(humanError(42), /Something went wrong/);
});

test('viewKey ignores the ticking clock and key order but sees real changes', () => {
  const a = { wallet: 5, clock: { phase: 'shop', remainingSec: 10 }, x: [1, { b: 1, a: 2 }] };
  const b = { x: [1, { a: 2, b: 1 }], clock: { remainingSec: 9, phase: 'shop' }, wallet: 5 };
  assert.equal(viewKey(a), viewKey(b));
  assert.notEqual(viewKey(a), viewKey({ ...a, wallet: 6 }));
  assert.notEqual(viewKey(a), viewKey({ ...a, clock: { phase: 'summary', remainingSec: 10 } }));
  assert.doesNotThrow(() => viewKey(null));
  assert.equal(a.clock.remainingSec, 10); // input untouched
});

test('send guard: one send, then locked for 600 ms or until released', () => {
  const g = createSendGuard();
  assert.equal(g.allow('{"a":1}', 1000), true);
  assert.equal(g.allow('{"a":2}', 1100), false); // a different button, same screen
  assert.equal(g.allow('{"a":1}', 1599), false);
  assert.equal(g.allow('{"a":2}', 1601), true);
  g.release();
  assert.equal(g.allow('{"a":3}', 1602), true); // a new state arrived
});

test('send guard: the same message is never sent twice within 600 ms even after release', () => {
  const g = createSendGuard();
  assert.equal(g.allow('M', 0), true);
  g.release();
  assert.equal(g.allow('M', 300), false);
  assert.equal(g.allow('M', 601), true);
});

test('redraw decision: skip unchanged, defer while a pointer is down (max 400 ms), else draw', () => {
  assert.equal(redrawDecision({ changed: false, pointerDown: false, now: 0 }).action, 'skip');
  assert.equal(redrawDecision({ changed: true, pointerDown: false, now: 0 }).action, 'draw');
  const d = redrawDecision({ changed: true, pointerDown: true, downAt: 1000, now: 1100 });
  assert.equal(d.action, 'defer');
  assert.equal(d.wait, 300);
  assert.equal(redrawDecision({ changed: true, pointerDown: true, downAt: 1000, now: 1400 }).action, 'draw');
  assert.equal(redrawDecision({ changed: false, pointerDown: true, downAt: 1000, now: 1100 }).action, 'skip');
});

test('after a solve the CFO asks for the next puzzle only until one is open, in the competition', () => {
  const ask = { wanted: true, puzzleOpen: false, phase: 'competition', role: 'CFO' };
  assert.equal(shouldRequestNextPuzzle(ask), true);
  assert.equal(shouldRequestNextPuzzle({ ...ask, puzzleOpen: true }), false, 'a puzzle is open already');
  assert.equal(shouldRequestNextPuzzle({ ...ask, wanted: false }), false, 'no solve happened');
  assert.equal(shouldRequestNextPuzzle({ ...ask, role: 'CEO' }), false, 'only the CFO plays puzzles');
  assert.equal(shouldRequestNextPuzzle({ ...ask, phase: 'shop' }), false, 'only in the competition');
});
