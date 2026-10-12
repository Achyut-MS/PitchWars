import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, readTokens } from '../scripts/contrast.js';

const t = readTokens(readFileSync('public/css/tokens.css', 'utf8'));

test('the contrast function matches known values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
});

test('the draft colours are the tokens, orange for Company A and blue for Company B', () => {
  assert.equal(t.root.paper, '#FBF0D9');
  assert.equal(t.root.orange, '#FF6A1F');
  assert.equal(t.root.ink, '#111111');
  assert.equal(t.root.blue, '#2E6BFF');
  assert.equal(t.A.team, '#FF6A1F');
  assert.equal(t.B.team, '#2E6BFF');
  assert.equal(t.root.team, t.A.team); // no data-company (login, waiting before a seat) looks like Company A
});

// [text, background] pairs the stylesheets use for normal-size text (WCAG AA, 4.5:1).
const PAIRS = [
  ['ink', 'paper'], ['ink', 'field'], ['ink', 'stone'], ['ink', 'track'], ['ink', 'locked'], ['ink', 'tint-a'], ['ink', 'tint-b'],
  ['ink', 'orange'], ['ink', 'good-fill'], ['paper', 'ink'], ['muted', 'paper'], ['muted', 'field'], ['muted', 'stone'],
  ['bad', 'paper'], ['good', 'paper'], ['white', 'bad'], ['alarm', 'ink'], ['placeholder', 'field'], ['stone', 'rail'], ['paper', 'rail'],
];
for (const co of ['A', 'B']) {
  test(`company ${co}: every text and background pair reads at 4.5:1 or better`, () => {
    const set = t[co];
    for (const [fg, bg] of [...PAIRS, ['team-ink', 'team'], ['team-on-ink', 'ink'], ['ink', 'team-soft']]) {
      const r = contrast(set[fg], set[bg]);
      assert.ok(r >= 4.5, `${co}: ${fg} on ${bg} is ${r.toFixed(2)}`);
    }
  });
}

test('orange and blue are too light for small text on paper (so the CSS outlines them, see css-rules.test.js)', () => {
  assert.ok(contrast(t.root.orange, t.root.paper) < 3);
  assert.ok(contrast(t.root.blue, t.root.paper) < 4.5);
});
