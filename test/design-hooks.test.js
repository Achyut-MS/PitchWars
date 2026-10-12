import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hooksOf } from '../scripts/hooks.js';
import { renderAll } from './fixtures/render-all.js';

const recorded = JSON.parse(readFileSync('test/fixtures/hooks.json', 'utf8'));
const now = renderAll();

test('the hook extractor finds ids, classes, data hooks, messages and field names', () => {
  const h = hooksOf(`<form id="login" class="card x"><input name="id"><button data-confirm="end_game" data-send='{"type":"vote","ideaId":"H1"}'>V</button></form>`);
  assert.deepEqual(h, ['#login', '.card', '.x', '[data-confirm=end_game]', 'input[name=id]', 'send:vote(ideaId)']);
});

for (const [name, hooks] of Object.entries(recorded)) {
  test(`${name}: the redesign keeps every id, class, data hook and message of the old markup`, () => {
    assert.ok(now[name], `fixture ${name} is missing`);
    const have = new Set(hooksOf(now[name]));
    assert.deepEqual(hooks.filter((h) => !have.has(h)), []);
  });
}
