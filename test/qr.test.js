import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { encode, qrSvg, rsRemainder, dataCodewords, allCodewords } from '../src/qr.js';

test('Reed-Solomon matches a published vector (HELLO WORLD, version 1-M)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('byte-mode data codewords: mode, length, text, terminator, pad bytes', () => {
  // "Hi" at version 1: 0100 00000010 01001000 01101001 0000 -> 40 24 86 90 then EC 11 pads
  assert.deepEqual(dataCodewords('Hi', 1).slice(0, 6), [0x40, 0x24, 0x86, 0x90, 0xec, 0x11]);
  assert.equal(dataCodewords('Hi', 1).length, 16);
  assert.equal(allCodewords('Hi', 1).length, 26);
  assert.equal(allCodewords('x'.repeat(100), 6).length, 172);
});

test('sizes and version selection', () => {
  assert.equal(encode('http://10.42.0.1/').size, 25);
  assert.equal(encode('x'.repeat(14)).version, 1);
  assert.equal(encode('x'.repeat(15)).version, 2);
  assert.equal(encode('x'.repeat(213)).version, 10);
  assert.throws(() => encode('x'.repeat(214)), /too long/);
});

test('finder, timing and dark module are in place', () => {
  const { modules: m, size } = encode('http://10.42.0.1/');
  for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let i = 0; i < 7; i++) assert.ok(m[y][x + i] && m[y + 6][x + i] && m[y + i][x] && m[y + i][x + 6]);
    assert.equal(m[y + 3][x + 3], true);
    assert.equal(m[y + 1][x + 1], false);
  }
  for (let i = 8; i < size - 8; i++) assert.equal(m[6][i], i % 2 === 0);
  assert.equal(m[size - 8][8], true);
});

test('the svg is self-contained: no scripts, links or external references', () => {
  const svg = qrSvg('hello "<&>', { label: 'a "q" <b>' });
  assert.match(svg, /^<svg /);
  assert.equal(/<script|href|http:\/\/(?!www\.w3\.org)|https:\/\/|url\(/.test(svg), false);
  assert.equal(svg.includes('<b>'), false);
});

// An independent check: render to a PNG and decode it with zbar (a different codebase from this encoder).
const zbar = spawnSync('zbarimg', ['--version']);
const decode = (text) => {
  const dir = mkdtempSync(join(tmpdir(), 'qr-'));
  const file = join(dir, 'q.png');
  writeFileSync(file, new Resvg(qrSvg(text), { fitTo: { mode: 'width', value: 800 } }).render().asPng());
  const r = spawnSync('zbarimg', ['--quiet', '--raw', '-Sbinary', file], { encoding: 'utf8' });
  return r.stdout.replace(/\n$/, '');
};
test('zbar decodes our codes back to the exact text (every version 1-10, Wi-Fi and URL strings)', { skip: zbar.error ? 'zbarimg not installed' : false }, () => {
  const samples = [
    'http://10.42.0.1/',
    'WIFI:T:WPA;S:Showdown;P:pass1234;;',
    'WIFI:T:WPA;S:Show\;down;P:p\\"q\\\\r\\:s\\,t;;',
    ...[1, 14, 26, 42, 62, 84, 106, 122, 154, 180, 213].map((n) => Array.from({ length: n }, (_, i) => String.fromCharCode(33 + ((i * 7) % 90))).join('')),
  ];
  for (const s of samples) assert.equal(decode(s), s, `round trip failed for length ${s.length}`);
});
