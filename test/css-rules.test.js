import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'public/css';
const files = readdirSync(DIR).filter((f) => f.endsWith('.css'));
const read = (f) => readFileSync(`${DIR}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
// Flat list of { selector, body }, media queries unwrapped one level.
const rules = (css) => [...css.replace(/@media[^{]*\{([\s\S]*?\})\s*\}/g, '$1').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, s, b]) => ({ selector: s.trim(), body: b }));
const html = (f) => readFileSync(`public/${f}`, 'utf8');

test('the five stylesheets exist and the old one is gone', () => {
  assert.deepEqual(files.sort(), ['base.css', 'fonts.css', 'organizer.css', 'player.css', 'tokens.css']);
  assert.equal(readdirSync('public').includes('styles.css'), false);
});

test('each page links its stylesheets in order, in English, with a viewport', () => {
  const links = (f) => [...html(f).matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(links('index.html'), ['/css/tokens.css', '/css/fonts.css', '/css/base.css', '/css/player.css']);
  assert.deepEqual(links('organizer.html'), ['/css/tokens.css', '/css/fonts.css', '/css/base.css', '/css/organizer.css']);
  for (const f of ['index.html', 'organizer.html']) {
    assert.match(html(f), /<html lang="en">/);
    assert.match(html(f), /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html(f), /<meta name="color-scheme" content="light">/);
  }
});

test('no colour value outside tokens.css (hex, rgb, hsl)', () => {
  for (const f of files.filter((x) => x !== 'tokens.css')) {
    const bad = read(f).match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi);
    assert.equal(bad, null, `${f}: ${bad}`);
  }
});

test('orange, blue or team-coloured text always has an ink outline (it is too light on paper)', () => {
  for (const f of files) {
    for (const r of rules(read(f))) {
      if (/(^|[;\s])color:\s*var\(--(team|orange|blue)\)/.test(r.body)) assert.match(r.body, /-webkit-text-stroke/, `${f}: ${r.selector}`);
    }
  }
});

test('nothing is loaded from another host', () => {
  for (const f of files) assert.equal(/url\(\s*["']?(https?:)?\/\//i.test(read(f)), false, f);
  for (const f of readdirSync('public').filter((x) => /\.(html|js)$/.test(x))) {
    assert.equal(/(src|href)=["']?(https?:)?\/\//i.test(html(f)), false, f);
  }
});

test('the global rules every screen relies on are present', () => {
  const base = read('base.css');
  assert.match(base, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  assert.match(base, /:focus-visible\s*\{[^}]*outline:\s*4px solid var\(--ink\)/);
  assert.match(base, /button\s*\{[^}]*min-height:\s*var\(--tap\)/);
  assert.match(base, /input, select, textarea\s*\{[^}]*min-height:\s*48px/);
  assert.match(read('tokens.css'), /--tap:\s*44px/);
  assert.match(base, /prefers-reduced-motion: reduce/);
  assert.equal(/body\s*\{[^}]*overflow-x:\s*hidden/.test(base), false, 'it would hide sideways scrolling from the checks');
});
