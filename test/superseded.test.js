import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReconnect, humanError } from '../public/glue.js';
import { renderSuperseded } from '../public/render.js';

test('a superseded socket never auto-reconnects; a normal drop does', () => {
  assert.equal(shouldReconnect({ superseded: true }), false);
  assert.equal(shouldReconnect({ superseded: false }), true);
  assert.equal(shouldReconnect({}), true);
});

test('logged_in_elsewhere has plain words', () => {
  assert.match(humanError('logged_in_elsewhere'), /another device/i);
});

test('the superseded screen offers one deliberate button and no inline style', () => {
  const h = renderSuperseded();
  assert.match(h, /You logged in on another device\. Use this device instead\?/);
  assert.equal((h.match(/<button/g) || []).length, 1);
  assert.match(h, /id="use-here"/);
  assert.ok(!/style=/.test(h));
});
