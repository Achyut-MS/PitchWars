import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderAll } from './fixtures/render-all.js';

const css = readdirSync('public/css').map((f) => readFileSync(`public/css/${f}`, 'utf8')).join('\n');
const all = renderAll();

// Classes that are hooks for scripts or tests only, or are styled through their parent on purpose.
const UNSTYLED = new Set(['compact', 'one', 'two', 'available', 'requested', 'wait', 'landed', 'name', 'votes', 'n', 'v', 'track', 'tg', 'r', 'reg', 'num', 'pipe', 'c0', 'c1', 'c2', 'f0', 'f1', 'f2', 'g0', 'g1', 'g2', 'g3', 'competition', 'deck', 'launches']);

test('every class the screens emit has a rule (or is a known hook-only class)', () => {
  const missing = new Set();
  for (const html of Object.values(all)) {
    for (const [, list] of html.matchAll(/\sclass="([^"]*)"/g)) {
      for (const c of list.split(/\s+/).filter(Boolean)) {
        if (UNSTYLED.has(c) || /^\d/.test(c)) continue;
        if (!new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css)) missing.add(c);
      }
    }
  }
  assert.deepEqual([...missing].sort(), []);
});

test('every field has a label, every icon is hidden, every button has words', () => {
  for (const [name, html] of Object.entries(all)) {
    for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      if (/type="(hidden|submit)"/.test(m[2])) continue;
      const id = (m[2].match(/\sid="([^"]+)"/) || [])[1];
      const labelled = /aria-label="[^"]+"/.test(m[2]) || (id && html.includes(`for="${id}"`))
        || html.slice(0, m.index).lastIndexOf('<label') > html.slice(0, m.index).lastIndexOf('</label>');
      assert.ok(labelled, `${name}: ${m[0]}`);
    }
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
      if (/role="img"/.test(m[0])) continue;
      assert.match(m[0], /aria-hidden="true"/, `${name}: ${m[0]}`);
    }
    for (const m of html.matchAll(/<button\b[^>]*>([^]*?)<\/button>/g)) assert.ok(m[1].replace(/<[^>]+>/g, '').trim() || /aria-label=/.test(m[0]), `${name}: empty button`);
  }
});
