import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { THEME } from '../src/graphs/theme.js';
import { readTokens } from '../scripts/contrast.js';
import { companyVsCompany, coinDifference, roleBars } from '../src/graphs/svg.js';
import { fontFiles } from '../src/graphs/png.js';

const t = readTokens(readFileSync('public/css/tokens.css', 'utf8')).root;

test('the graph images use the same colours as the screens', () => {
  assert.deepEqual(
    { stage: THEME.stage, panel: THEME.panel, line: THEME.line, text: THEME.text, muted: THEME.muted, A: THEME.A, B: THEME.B },
    { stage: t.paper, panel: t.paper, line: t.stone, text: t.ink, muted: t.muted, A: t.orange, B: t.blue },
  );
  assert.match(THEME.font, /Space Mono/);
});

test('text in the graph images is never orange or blue (too light on cream)', () => {
  const series = { t: [0, 480, 960], A: [1000, 1300, 1140], B: [1000, 900, 1200] };
  const final = { A: { CEO: 0, CTO: 300, CFO: 40, CMO: 400, COO: 300 }, B: { CEO: 100, CTO: 250, CFO: 0, CMO: 350, COO: 420 } };
  for (const svg of [companyVsCompany(series), coinDifference(series), roleBars(final)]) {
    for (const m of svg.matchAll(/<text\b[^>]*fill="([^"]+)"/g)) assert.ok([THEME.text, THEME.muted].includes(m[1]), m[0]);
  }
});

test('the PNG renderer finds the four game fonts as TrueType files', () => {
  const ttf = readdirSync('public/fonts').filter((f) => f.endsWith('.ttf')).sort();
  assert.deepEqual(ttf, ['alfa-slab-one-latin-400-normal.ttf', 'archivo-black-latin-400-normal.ttf', 'space-mono-latin-400-normal.ttf', 'space-mono-latin-700-normal.ttf']);
  for (const f of ttf) assert.equal(readFileSync(`public/fonts/${f}`).readUInt32BE(0), 0x00010000, f);
  assert.equal(fontFiles().length, 4);
});
