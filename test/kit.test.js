import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { icon, companyOf, roleOf, phaseOf, companyAttr, companyMark, logo, roleChips, ROLES, ROLE_ICON } from '../public/kit.js';
import { buildSprite } from '../scripts/build-icons.mjs';

// The same tag pattern as the Plan 2 safety test (test/render.test.js): lower-case tags, plain quoted attributes.
const STRICT = /<\/?[a-z0-9]+(?:\s+[\w-]+(?:=(?:"[^"<>]*"|'[^'<>]*'|[\w-]+))?)*\s*\/?>/g;
const strictOk = (html) => !/[<>]/.test(html.replace(STRICT, ''));
const sprite = readFileSync('public/img/icons.svg', 'utf8');

test('icon() points into the sprite, is hidden from screen readers and passes the strict tag pattern', () => {
  const h = icon('i-coins');
  assert.equal(h, '<svg class="i" aria-hidden="true" focusable="false"><use href="/img/icons.svg#i-coins"></use></svg>');
  assert.ok(strictOk(h));
  assert.equal(icon('"><script>'), '');
  assert.ok(strictOk(icon('i-coins', 'mark "x"')));
});

test('every icon the kit uses exists in the sprite, and the rupee symbol is gone', () => {
  for (const id of [...Object.values(ROLE_ICON), 'i-mark-a', 'i-mark-b', 'i-coins', 'i-lock', 'i-info', 'i-user', 'i-app', 'i-shield', 'i-bolt', 'i-bulb']) {
    assert.match(sprite, new RegExp(`<symbol id="${id}"`), id);
  }
  assert.equal(sprite.includes('i-rupee'), false);
  assert.equal(/#[0-9a-f]{3,6}\b/i.test(sprite), false, 'sprite colours are currentColor or tokens');
});

test('the committed sprite is exactly what the build script makes from the drafts', () => {
  assert.equal(sprite, buildSprite('ui-drafts'));
});

test('only A, B and the five roles and known phases reach the markup', () => {
  assert.equal(companyOf('A'), 'A'); assert.equal(companyOf('B'), 'B');
  for (const bad of [null, undefined, 'C', 'a', '"><x', 1]) assert.equal(companyOf(bad), '');
  assert.equal(roleOf('CFO'), 'CFO'); assert.equal(roleOf('<b>'), '');
  assert.equal(phaseOf('shop'), 'shop'); assert.equal(phaseOf('x"'), '');
  assert.equal(companyAttr('B'), ' data-company="B"');
  assert.equal(companyAttr('<x>'), '');
  assert.match(companyMark('B'), /#i-mark-b"/);
  assert.match(companyMark(null), /#i-mark-a"/);
});

test('role chips show all five roles with the viewer marked', () => {
  const h = roleChips('CMO');
  for (const r of ROLES) assert.match(h, new RegExp(r));
  assert.match(h, /<span class="on" title="CMO">/);
  assert.match(h, /CMO \(you\)/);
  assert.ok(strictOk(h));
});

test('the logo slot is a labelled span that the stylesheet fills from one file', () => {
  assert.equal(logo(), '<span class="logo" role="img" aria-label="Makerspace logo"></span>');
  // The real logo: a circular PNG cut at the outer gold ring (transparent outside), kept small.
  const png = readFileSync('public/img/logo.png');
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.ok(statSync('public/img/logo.png').size < 80 * 1024);
  assert.ok(statSync('public/img/icons.svg').size < 12 * 1024);
});
