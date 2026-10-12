import test from 'node:test';
import assert from 'node:assert/strict';
import { companyVsCompany, coinDifference, roleBars } from '../src/graphs/svg.js';
import { pngOf, fontFiles } from '../src/graphs/png.js';
import { THEME } from '../src/graphs/theme.js';

const series = (n = 20) => {
  const t = Array.from({ length: n }, (_, i) => (i * 960) / (n - 1));
  return { t, A: t.map((x, i) => 1000 + i * 12 + (i % 3) * 5), B: t.map((x, i) => 1000 + i * 15 - (i % 4) * 8) };
};
const final = { A: { CEO: 100, CTO: 210, CFO: 60, CMO: 300, COO: 240 }, B: { CEO: 0, CTO: 190, CFO: 120, CMO: 260, COO: 200 } };
const png = (svg) => pngOf(svg);
const isPng = (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
const dims = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
const all = (s = series()) => [companyVsCompany(s), coinDifference(s), roleBars(final)];

test('each graph is well-formed svg that renders to a png', () => {
  for (const svg of all()) {
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.equal(isPng(png(svg)), true);
  }
});

test('png has the svg width and height', () => {
  for (const svg of all()) {
    const [w, h] = dims(png(svg));
    assert.equal(w, 720);
    assert.equal(h, Number(svg.match(/ height="(\d+)"/)[1]));
  }
});

test('graphs name both companies and carry an accessible label', () => {
  assert.match(companyVsCompany(series()), /aria-label="Coins of each company/);
  assert.match(coinDifference(series()), /A leads/);
  assert.match(coinDifference(series()), /B leads/);
  assert.match(companyVsCompany(series()), /Company A/);
  assert.match(roleBars(final), /Company B/);
});

test('the difference graph draws a zero line and fills in both team colours', () => {
  const svg = coinDifference(series());
  assert.match(svg, /fill="#FF6A1F"/);
  assert.match(svg, /fill="#2E6BFF"/);
  assert.match(svg, /stroke="#111111" stroke-width="2"/);
});

test('the two companies differ without colour: dashed line and a different marker', () => {
  const svg = companyVsCompany(series());
  assert.equal((svg.match(/stroke-dasharray/g) || []).length, 1);
  assert.match(svg, /<circle /);
  assert.match(roleBars(final), /stroke-dasharray/);
});

test('colours come from the one palette object', () => {
  const svg = all().join('');
  for (const c of svg.match(/#[0-9A-Fa-f]{6}/g)) assert.ok(Object.values(THEME).includes(c), c);
});

test('role bars show every role with both numbers, and the longest bar fits the picture', () => {
  const svg = roleBars(final);
  for (const r of ['CEO', 'CTO', 'CFO', 'CMO', 'COO']) assert.ok(svg.includes(`>${r}<`));
  assert.ok(svg.includes('>300<'));
  const xs = [...svg.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(xs.length >= 10);
  for (const [x, w] of xs) assert.ok(x >= 0 && x + w <= 720);
});

test('empty and tiny games do not break the graphs', () => {
  const one = { t: [0], A: [1000], B: [1000] };
  assert.equal(isPng(png(coinDifference(one))), true);
  assert.equal(isPng(png(companyVsCompany(one))), true);
  const zero = { A: { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 }, B: { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 } };
  assert.equal(isPng(png(roleBars(zero))), true);
});

test('no NaN, Infinity or undefined ever reaches the svg', () => {
  const bad = [
    { t: [], A: [], B: [] }, { t: [0], A: [1000], B: [1000] }, { t: [0, 480, 960], A: [0, 0, 0], B: [0, 0, 0] },
    { t: [0, 960], A: [0, 1e15], B: [-1e15, 5] }, { t: [0, NaN, 5], A: [NaN, Infinity, 1], B: [undefined, 2, -Infinity] },
    { t: [0, 2000], A: [1, 2], B: [3, 4] }, undefined,
  ];
  const finals = [undefined, {}, { A: { CEO: NaN, CTO: Infinity }, B: { CMO: -5 } }, { A: { CMO: 1e15 }, B: { CMO: 1 } }];
  const svgs = [...bad.flatMap((s) => [companyVsCompany(s), coinDifference(s)]), ...finals.map((f) => roleBars(f))];
  for (const svg of svgs) {
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|null/);
    assert.equal(isPng(png(svg)), true);
  }
});

test('a flat zero series still draws a sensible axis', () => {
  const svg = companyVsCompany({ t: [0, 960], A: [0, 0], B: [0, 0] });
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('company names are escaped everywhere', () => {
  const names = { A: '<script>"&\'', B: 'x</text><b>' };
  for (const svg of [companyVsCompany(series(), 960, names), coinDifference(series(), 960, names), roleBars(final, names)]) {
    assert.doesNotMatch(svg, /<script>|<b>|<\/text><b/);
    assert.match(svg, /&lt;script&gt;&quot;&amp;&#39;/);
    assert.equal(isPng(png(svg)), true);
  }
});

test('output is deterministic', () => {
  assert.equal(companyVsCompany(series()), companyVsCompany(series()));
  assert.equal(coinDifference(series()), coinDifference(series()));
  assert.equal(roleBars(final), roleBars(final));
  assert.ok(png(roleBars(final)).equals(png(roleBars(final))));
});

test('a negative wallet is drawn inside the plot', () => {
  const s = { t: [0, 480, 960], A: [1000, -150, -300], B: [1000, 900, 1200] };
  const svg = companyVsCompany(s);
  const ys = [...svg.matchAll(/[ML]([\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
  assert.ok(ys.length >= 6);
  for (const y of ys) assert.ok(y >= 0 && y <= 268);
});

test('png fonts are offline files and a png renders fast', () => {
  const files = fontFiles();
  assert.ok(files.length >= 1 && files.every((f) => /\.ttf$/.test(f)));
  png(roleBars(final));
  const t0 = process.hrtime.bigint();
  for (const svg of all()) png(svg);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 3;
  assert.ok(ms < 300, `${ms} ms per png`);
});

test('text is actually rendered with the bundled font', () => {
  assert.ok(png(roleBars(final)).length > png(roleBars(final).replace(/<text[^>]*>[^<]*<\/text>/g, '')).length);
});
