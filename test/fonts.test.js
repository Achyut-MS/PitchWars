import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const css = readFileSync('public/css/fonts.css', 'utf8');
const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);

test('fonts.css declares the three families of the drafts, four files in all', () => {
  for (const f of ['Alfa Slab One', 'Archivo Black', 'Space Mono']) assert.match(css, new RegExp(`font-family: "${f}"`));
  assert.equal(urls.length, 4);
  assert.match(css, /font-display: swap/);
});

test('every font file exists, is a real woff2 and is the same file as in the drafts', () => {
  for (const u of urls) {
    const file = resolve('public/css', u);
    assert.ok(existsSync(file), u);
    const buf = readFileSync(file);
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', u);
    assert.deepEqual(buf, readFileSync(join('ui-drafts/fonts', file.split('/').pop())));
  }
});

test('the fonts are small and carry their licence', () => {
  const total = urls.reduce((n, u) => n + statSync(resolve('public/css', u)).size, 0);
  assert.ok(total < 80 * 1024, `${total} bytes`);
  const lic = readFileSync('public/fonts/LICENSES.txt', 'utf8');
  for (const f of ['Alfa Slab One', 'Archivo Black', 'Space Mono']) assert.match(lic, new RegExp(f));
  assert.match(lic, /SIL Open Font License/);
});
