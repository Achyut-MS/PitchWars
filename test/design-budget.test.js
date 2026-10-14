import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';

const size = (dir, re) => readdirSync(dir).filter((f) => re.test(f)).reduce((n, f) => n + statSync(`${dir}/${f}`).size, 0);

test('the look stays light for phones on the Pi\'s Wi-Fi', () => {
  assert.ok(size('public/css', /\.css$/) < 60 * 1024, 'stylesheets');
  assert.ok(size('public/fonts', /\.woff2$/) < 80 * 1024, 'web fonts');
  assert.ok(statSync('public/img/icons.svg').size < 12 * 1024, 'icons');
  assert.ok(statSync('public/img/logo.png').size < 80 * 1024, 'logo');
});
