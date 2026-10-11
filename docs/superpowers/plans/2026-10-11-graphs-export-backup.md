# Startup Showdown: Plan 5 of 7, Graphs, Reveal, Excel Export and Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End the game properly: the three League of Legends style graphs, the organizer's reveal and Next Game, graph images saved to disk, Excel workbooks for each game and for the whole event, a full session log, and automatic database backups to a USB stick.

**Architecture:** The graphs are drawn from the 5-second `samples` rows (Plan 3) by pure functions that return **SVG text**. The same SVG is shown in the browser, saved as an `.svg` file, and turned into a `.png` by `@resvg/resvg-js`. Reveal and Next Game are two organizer messages that write to the `games` table, so a reload, a reconnect or a restart shows the same screen. Excel files are built on demand from the database by `exceljs`. Backups use SQLite's own online backup.

**Tech Stack:** adds `exceljs` and `@resvg/resvg-js` (both install once while online, and `@resvg/resvg-js` has a prebuilt Raspberry Pi binary). Everything else unchanged.

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`, Sections 2.0.2, 4, 10, 11. Plans 1 to 4 must be finished first. The look of the graphs follows `docs/design/ui-design-system.md`.

## Global Constraints

- Everything from the Global Constraints of Plans 1 to 4 still applies.
- **No winner or loser is shown.** Only the graphs.
- **Three graphs, top to bottom:** company against company; coin difference over time (a zero line, company A above it in gold, company B below it in teal); role-wise coins as mirrored bars with a number at the end of each bar.
- **Role bars:** the CTO, CMO and COO show coins earned from sales; the CFO shows coins from mini games; the CEO shows coins taken from the rival by attacks.
- **When the Competition timer ends,** every player sees only **"Thank you for playing"**. The organizer decides when to **reveal**. After the reveal everyone, players and organizers, sees the three graphs.
- **The graphs persist:** a player who disconnects and logs in again lands on the graphs again.
- **Next Game:** only the organizer clicks it. It marks the ten players **Game Completed** (never logs them out), reveals the graphs first if the organizer had not, saves the images, and frees the system for the next game. A Game Completed player who logs in sees **their own old game's graphs only**, read-only, even while a later game runs.
- **Images:** when a game is revealed (or on Next Game) its three graphs are saved as `.svg` and `.png` under `exports/game-<id>/`.
- **Excel:** one workbook per game and one workbook for the whole event, each sheet one kind of data, every row carrying the **game number** and the **Admission ID** where a person is involved. **Only the organizer** can download them.
- **Session log:** every login, disconnect, reconnect (a login after a disconnect) is recorded with its time.
- **Backups:** the database is copied **every 5 minutes while a game runs and once after each game** to a second folder (a USB stick), keeping the newest 50 files.

## Review Focus

1. **A player reconnecting after the reveal** must land on the graphs, not the thank-you screen (Task 3).
2. **Revealing twice,** or Next Game right after a reveal, must save the images once and not fail (Task 3).
3. **A game that never reached the Competition** (no samples) must still produce three valid graphs (Task 1, Task 2).
4. **A completed player seeing another game's graphs,** or the live game's data, must be impossible (Task 3).
5. **Downloading an Excel file without the organizer token** must be refused (Task 5).
6. **A name or text containing commas, quotes, or `=` at the start** must stay plain text in Excel (Task 4).
7. **A missing or full USB stick** must not stop the game: the backup failure is logged and shown to the organizer, and the game carries on (Task 6).

## File Structure

```
src/graphs/theme.js  svg.js  png.js  data.js     colours, SVG drawing, PNG, graph data from samples
src/results.js           graphsFor, revealGame, nextGame, saveGameImages
src/xlsx.js              buildWorkbook
src/exportData.js        gameSheets, eventSheets, exportGame, exportEvent
src/exportHttp.js        token and the /export routes
src/backup.js            backupDb, pruneBackups
src/db.js                (modify) games.revealed_at
src/views.js             (modify) results and graphs fields
src/server.js            (modify) reveal, next_game, disconnect log, export routes, backup after next_game
src/index.js             (modify) the 5-minute backup timer
public/render.js  render-organizer.js  app.js  organizer.js  (modify) results screen and organizer controls
test/graphs.test.js  graph-data.test.js  results.test.js  xlsx.test.js  export.test.js  export-http.test.js  backup.test.js  render-results.test.js
```

---

### Task 1: Graph data from the samples

**Files:**
- Create: `src/graphs/data.js`, `test/graph-data.test.js`

**Interfaces:**
- Consumes: `samples` and `company_state` (Plan 3)
- Produces: `graphData(db, gameId) -> { series: { t: number[], A: number[], B: number[] }, final: { A: { CEO, CTO, CFO, CMO, COO }, B: { ... } } }`
  - `t` is seconds since the first sample (the start of the Competition); `A` and `B` are wallets.
  - `final.X.CTO`, `CMO`, `COO` are the cumulative sales coins of the role; `CFO` is `mini_coins`; `CEO` is `attack_coins`.
  - With no samples: `series = { t: [0], A: [walletA], B: [walletB] }`.

- [ ] **Step 1: Write the failing tests**

`test/graph-data.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { tickEconomy } from '../src/economy.js';
import { graphData } from '../src/graphs/data.js';

function runCompetition(h, fromSec, toSec) {
  for (let s = fromSec; s <= toSec; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
}

test('a game that never reached the competition still gives a one-point series', () => {
  const h = makeRunning();
  const d = graphData(h.db, h.gameId);
  assert.deepEqual(d.series, { t: [0], A: [1000], B: [1000] });
  assert.deepEqual(d.final.A, { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 });
});

test('the series starts at zero seconds and follows the 5-second samples', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  runCompetition(h, 800, 830);
  const d = graphData(h.db, h.gameId);
  assert.deepEqual(d.series.t, [0, 5, 10, 15, 20, 25, 30]);
  assert.equal(d.series.A[0], 1000);
  assert.ok(d.series.A[6] > d.series.A[0]);
  assert.equal(d.series.B[6], 1000);
});

test('the final numbers per role come from the sales, mini games and attacks', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  runCompetition(h, 800, 860);
  h.db.prepare("UPDATE company_state SET mini_coins = 40, attack_coins = 100 WHERE company = 'A'").run();
  const f = graphData(h.db, h.gameId).final.A;
  assert.ok(Math.abs(f.COO - 27) < 0.01);
  assert.equal(f.CTO, 0);
  assert.equal(f.CFO, 40);
  assert.equal(f.CEO, 100);
});

test('two companies with different sample counts still line up', () => {
  const h = toCompetition(makeRunning());
  runCompetition(h, 800, 810);
  h.db.prepare("DELETE FROM samples WHERE company = 'B' AND ts = 805000").run();
  const d = graphData(h.db, h.gameId);
  assert.equal(d.series.t.length, d.series.A.length);
  assert.equal(d.series.t.length, d.series.B.length);
});

test('an unknown game id is an error, not an empty graph', () => {
  const h = makeRunning();
  assert.throws(() => graphData(h.db, 999), /no such game/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/graphs/data.js`

- [ ] **Step 3: Write the minimal implementation**

`src/graphs/data.js`:

```js
const ROLE_COLUMNS = (s) => ({ CEO: s.attack_coins, CTO: s.cto_coins, CFO: s.mini_coins, CMO: s.cmo_coins, COO: s.coo_coins });

export function graphData(db, gameId) {
  const state = (c) => db.prepare('SELECT * FROM company_state WHERE game_id = ? AND company = ?').get(gameId, c);
  const A = state('A');
  const B = state('B');
  if (!A || !B) throw new Error('no such game');

  const byTs = new Map();
  for (const r of db.prepare('SELECT ts, company, wallet FROM samples WHERE game_id = ? ORDER BY ts').all(gameId)) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, {});
    byTs.get(r.ts)[r.company] = r.wallet;
  }
  const times = [...byTs.keys()].sort((a, b) => a - b);
  let series;
  if (!times.length) {
    series = { t: [0], A: [A.wallet], B: [B.wallet] };
  } else {
    series = { t: [], A: [], B: [] };
    let lastA = 1000;
    let lastB = 1000;
    for (const ts of times) {
      const v = byTs.get(ts);
      lastA = v.A ?? lastA;
      lastB = v.B ?? lastB;
      series.t.push((ts - times[0]) / 1000);
      series.A.push(lastA);
      series.B.push(lastB);
    }
  }
  return { series, final: { A: ROLE_COLUMNS(A), B: ROLE_COLUMNS(B) } };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/graphs/data.js test/graph-data.test.js
git commit -m "feat: graph data from the 5-second samples"
```

---

### Task 2: The three graphs as SVG, and PNG output

**Files:**
- Create: `src/graphs/theme.js`, `src/graphs/svg.js`, `src/graphs/png.js`, `test/graphs.test.js`
- Run: `npm install @resvg/resvg-js exceljs` (while online)

**Interfaces:**
- Produces:
  - `THEME` (colours that match `docs/design/ui-design-system.md`, dark theme)
  - `companyVsCompany(series, maxSec = 960) -> svg`, `coinDifference(series, maxSec = 960) -> svg`, `roleBars(final) -> svg`, `ROLE_ORDER`
  - `pngOf(svg, files = fontFiles()) -> Buffer`, `fontFiles(dir = 'public/fonts') -> string[]`
- All SVGs are self-contained (explicit colours, no CSS variables), 720 px wide, with an `aria-label`.
- This code was run against real `@resvg/resvg-js` before this plan was written (6 tests passed).

- [ ] **Step 1: Write the failing tests**

`test/graphs.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { companyVsCompany, coinDifference, roleBars } from '../src/graphs/svg.js';

const series = (n = 20) => {
  const t = Array.from({ length: n }, (_, i) => (i * 960) / (n - 1));
  return { t, A: t.map((x, i) => 1000 + i * 12 + (i % 3) * 5), B: t.map((x, i) => 1000 + i * 15 - (i % 4) * 8) };
};
const final = { A: { CEO: 100, CTO: 210, CFO: 60, CMO: 300, COO: 240 }, B: { CEO: 0, CTO: 190, CFO: 120, CMO: 260, COO: 200 } };
const png = (svg) => new Resvg(svg).render().asPng();
const isPng = (b) => b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';

test('each graph is well-formed svg that renders to a png', () => {
  for (const svg of [companyVsCompany(series()), coinDifference(series()), roleBars(final)]) {
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.equal(isPng(png(svg)), true);
  }
});

test('graphs name both companies and carry an accessible label', () => {
  assert.match(companyVsCompany(series()), /aria-label="Coins of each company/);
  assert.match(coinDifference(series()), /A leads/);
  assert.match(coinDifference(series()), /B leads/);
});

test('the difference graph draws a zero line and fills in both team colours', () => {
  const svg = coinDifference(series());
  assert.match(svg, /fill="#F5B83D"/);
  assert.match(svg, /fill="#2BC4B8"/);
  assert.match(svg, /stroke="#E9ECF2" stroke-width="2"/);
});

test('role bars show every role with both numbers, and the longest bar fits the picture', () => {
  const svg = roleBars(final);
  for (const r of ['CEO', 'CTO', 'CFO', 'CMO', 'COO']) assert.ok(svg.includes(`>${r}<`));
  assert.ok(svg.includes('>300<'));
  const xs = [...svg.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (const [x, w] of xs.slice(1)) assert.ok(x >= 0 && x + w <= 720);
});

test('empty and tiny games do not break the graphs', () => {
  const one = { t: [0], A: [1000], B: [1000] };
  assert.equal(isPng(png(coinDifference(one))), true);
  assert.equal(isPng(png(companyVsCompany(one))), true);
  const zero = { A: { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 }, B: { CEO: 0, CTO: 0, CFO: 0, CMO: 0, COO: 0 } };
  assert.equal(isPng(png(roleBars(zero))), true);
});

test('a negative wallet is drawn inside the plot', () => {
  const s = { t: [0, 480, 960], A: [1000, -150, -300], B: [1000, 900, 1200] };
  const svg = companyVsCompany(s);
  const ys = [...svg.matchAll(/[ML]([\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
  for (const y of ys) assert.ok(y >= 0 && y <= 268);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/graphs/svg.js`

- [ ] **Step 3: Write the implementation**

`src/graphs/theme.js`:

```js
// Colours for the saved images. They match docs/design/ui-design-system.md (dark theme).
export const THEME = {
  stage: '#0A1424', panel: '#101E33', line: '#263C5C', text: '#E9ECF2', muted: '#9AAAC2',
  A: '#F5B83D', B: '#2BC4B8',
  font: "'Big Shoulders Display', 'Arial Narrow', Arial, sans-serif",
};
```

`src/graphs/svg.js`:

```js
import { THEME } from './theme.js';

const W = 720;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (v) => Math.round(v * 10) / 10;

function frame(height, title, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(label)}">
<rect width="${W}" height="${height}" fill="${THEME.panel}"/>
<text x="24" y="34" fill="${THEME.text}" font-family="${THEME.font}" font-size="24" font-weight="700">${esc(title)}</text>
${body}
</svg>`;
}

function axes(plot, maxSec, yTicks, yMap, fmt) {
  const { x0, x1, y0, y1 } = plot;
  let out = '';
  for (const v of yTicks) {
    const y = n1(yMap(v));
    out += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${THEME.line}" stroke-width="1"/>`;
    out += `<text x="${x0 - 8}" y="${y + 4}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="13" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  for (let m = 0; m * 60 <= maxSec; m += 2) {
    const x = n1(x0 + ((x1 - x0) * m * 60) / maxSec);
    out += `<text x="${x}" y="${y1 + 20}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="13" text-anchor="middle">${m}:00</text>`;
  }
  return out;
}

const pathOf = (pts) => 'M' + pts.map(([x, y]) => `${n1(x)},${n1(y)}`).join('L');

// series = { t: [seconds from the start of the competition], A: [coins], B: [coins] }
export function companyVsCompany(series, maxSec = 960) {
  const plot = { x0: 64, x1: 696, y0: 56, y1: 236 };
  const all = [...series.A, ...series.B, 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all, lo + 1);
  const pad = (hi - lo) * 0.08;
  const yMap = (v) => plot.y1 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (plot.y1 - plot.y0);
  const xMap = (t) => plot.x0 + ((plot.x1 - plot.x0) * Math.min(t, maxSec)) / maxSec;
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const line = (vals, colour) => `<path d="${pathOf(series.t.map((t, i) => [xMap(t), yMap(vals[i])]))}" fill="none" stroke="${colour}" stroke-width="3" stroke-linejoin="round"/>`;
  const last = series.t.length - 1;
  const body = axes(plot, maxSec, ticks, yMap, (v) => String(v))
    + line(series.A, THEME.A) + line(series.B, THEME.B)
    + `<text x="${plot.x1}" y="${n1(yMap(series.A[last]) - 8)}" fill="${THEME.A}" font-family="${THEME.font}" font-size="16" font-weight="700" text-anchor="end">A ${Math.round(series.A[last])}</text>`
    + `<text x="${plot.x1}" y="${n1(yMap(series.B[last]) + 20)}" fill="${THEME.B}" font-family="${THEME.font}" font-size="16" font-weight="700" text-anchor="end">B ${Math.round(series.B[last])}</text>`;
  return frame(268, 'Company A and Company B', body, 'Coins of each company over the competition');
}

// The coin difference, like a gold-difference graph: above zero A leads, below zero B leads.
export function coinDifference(series, maxSec = 960) {
  const plot = { x0: 64, x1: 696, y0: 56, y1: 236 };
  const diff = series.A.map((a, i) => a - series.B[i]);
  const range = Math.max(50, Math.ceil(Math.max(...diff.map(Math.abs)) / 50) * 50);
  const mid = (plot.y0 + plot.y1) / 2;
  const yMap = (v) => mid - (v / range) * ((plot.y1 - plot.y0) / 2);
  const xMap = (t) => plot.x0 + ((plot.x1 - plot.x0) * Math.min(t, maxSec)) / maxSec;
  const pts = series.t.map((t, i) => [xMap(t), yMap(diff[i])]);
  const line = pathOf(pts);
  const area = `${line}L${n1(pts[pts.length - 1][0])},${n1(mid)}L${n1(pts[0][0])},${n1(mid)}Z`;
  const body = axes(plot, maxSec, [-range, -range / 2, 0, range / 2, range], yMap, (v) => (v > 0 ? `+${v}` : String(v)))
    + `<defs><clipPath id="up"><rect x="${plot.x0}" y="${plot.y0}" width="${plot.x1 - plot.x0}" height="${n1(mid - plot.y0)}"/></clipPath>`
    + `<clipPath id="dn"><rect x="${plot.x0}" y="${n1(mid)}" width="${plot.x1 - plot.x0}" height="${n1(plot.y1 - mid)}"/></clipPath></defs>`
    + `<path d="${area}" fill="${THEME.A}" fill-opacity="0.85" clip-path="url(#up)"/>`
    + `<path d="${area}" fill="${THEME.B}" fill-opacity="0.85" clip-path="url(#dn)"/>`
    + `<line x1="${plot.x0}" x2="${plot.x1}" y1="${n1(mid)}" y2="${n1(mid)}" stroke="${THEME.text}" stroke-width="2"/>`
    + `<path d="${line}" fill="none" stroke="${THEME.text}" stroke-width="2"/>`
    + `<text x="${plot.x0 + 8}" y="${plot.y0 + 14}" fill="${THEME.A}" font-family="${THEME.font}" font-size="14" font-weight="700">A leads</text>`
    + `<text x="${plot.x0 + 8}" y="${plot.y1 - 6}" fill="${THEME.B}" font-family="${THEME.font}" font-size="14" font-weight="700">B leads</text>`;
  return frame(268, 'Coin difference', body, 'Coin difference between the companies over the competition');
}

export const ROLE_ORDER = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

// final = { A: { CEO, CTO, CFO, CMO, COO }, B: { ... } } in coins.
export function roleBars(final) {
  const top = Math.max(1, ...ROLE_ORDER.flatMap((r) => [final.A[r], final.B[r]]));
  const half = 270;
  const cx = W / 2;
  const rowH = 38;
  let body = '';
  ROLE_ORDER.forEach((role, i) => {
    const y = 58 + i * rowH;
    const wa = (final.A[role] / top) * half;
    const wb = (final.B[role] / top) * half;
    body += `<rect x="${n1(cx - 30 - wa)}" y="${y}" width="${n1(wa)}" height="22" fill="${THEME.A}"/>`;
    body += `<rect x="${cx + 30}" y="${y}" width="${n1(wb)}" height="22" fill="${THEME.B}"/>`;
    body += `<text x="${cx}" y="${y + 17}" fill="${THEME.text}" font-family="${THEME.font}" font-size="18" font-weight="700" text-anchor="middle">${role}</text>`;
    body += `<text x="${n1(cx - 36 - wa)}" y="${y + 17}" fill="${THEME.text}" font-family="${THEME.font}" font-size="16" text-anchor="end">${Math.round(final.A[role])}</text>`;
    body += `<text x="${n1(cx + 36 + wb)}" y="${y + 17}" fill="${THEME.text}" font-family="${THEME.font}" font-size="16">${Math.round(final.B[role])}</text>`;
  });
  body += `<text x="24" y="${58 + 5 * rowH + 14}" fill="${THEME.muted}" font-family="${THEME.font}" font-size="13">CTO, CMO and COO: sales. CFO: mini games. CEO: coins taken by attacks.</text>`;
  return frame(58 + 5 * rowH + 30, 'Where the coins came from', body, 'Coins earned by each role in each company');
}
```

`src/graphs/png.js`:

```js
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// resvg reads TrueType or OpenType files. The game fonts live in public/fonts (see Plan 7).
// System fonts are not loaded: that takes a second per image and differs between machines.
export function fontFiles(dir = 'public/fonts') {
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => join(dir, f)) : [];
}

export function pngOf(svg, files = fontFiles()) {
  return new Resvg(svg, { background: '#101E33', font: { loadSystemFonts: false, fontFiles: files } }).render().asPng();
}
```

In `test/graphs.test.js` the helper `png(svg)` uses `new Resvg(svg).render().asPng()` directly. Change it to `import { pngOf } from '../src/graphs/png.js'` and `const png = (svg) => pngOf(svg)`, so the tests exercise the same path as the game (no system fonts; text may be missing in tests when no font file is present, which is fine).

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. Rendering a PNG without system fonts takes about 10 ms.

- [ ] **Step 5: Commit**

```bash
git add src/graphs package.json package-lock.json test/graphs.test.js
git commit -m "feat: coin graphs as svg and png"
```

---

### Task 3: Reveal, Next Game, saved images, and the results screens

**Files:**
- Modify: `src/db.js` (add `revealed_at INTEGER` to `games`), `src/views.js`, `src/server.js`, `src/index.js`, `public/render.js`, `public/render-organizer.js`, `public/organizer.js`
- Create: `src/results.js`, `test/results.test.js`, `test/render-results.test.js`

**Interfaces:**
- Produces (`src/results.js`):
  - `graphsFor(ctx, gameId) -> { companyVsCompany, coinDifference, roleBars }` (three SVG strings)
  - `saveGameImages(ctx, gameId, dir) -> string[]` (the six files written: three `.svg`, three `.png`, under `dir/game-<id>/`; file stems `company-vs-company`, `coin-difference`, `role-bars`)
  - `revealGame(ctx, game) -> void`: allowed only when the Competition has ended (error `'the competition is still running'`); sets `games.revealed_at` once (a second call changes nothing); saves the images (a failure is logged as `image_save_failed` and does not stop the reveal); logs `graphs_revealed`.
  - `nextGame(ctx, game) -> void`: reveals first if needed (without requiring the timer to have ended), then calls `endGame` (Plan 1), then logs `next_game`.
  - `ctx.exportDir` (default `'exports'`).
- `viewFor` changes: an in-game player in the `ended` phase gets `results` (the three SVGs) once the game is revealed, otherwise nothing (the screen shows the thank-you text); a completed player's `graphs` screen now carries `graphs: graphsFor(ctx, p.game_id)` for **their own `game_id` only**. The organizer's `game` block gets `ended` (boolean) and `revealed` (boolean).
- Messages: organizer `reveal`, `next_game`. After `next_game` every session gets fresh state (the players are `completed`).
- Browser: the `graphs` screen and the revealed `ended` screen show the three SVGs stacked, with a small heading and no scores or winner text. Before the reveal the players see only "Thank you for playing".

- [ ] **Step 1: Write the failing tests**

`test/results.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { tickEconomy } from '../src/economy.js';
import { graphsFor, saveGameImages, revealGame, nextGame } from '../src/results.js';
import { viewFor, organizerView } from '../src/views.js';
import { participantLogin } from '../src/auth.js';

function finished() {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  for (let s = 800; s <= 830; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
  atSec(h, 1762);
  return h;
}
const withDir = (h) => { h.ctx.exportDir = mkdtempSync(join(tmpdir(), 'exp-')); return h; };
const cleanup = (h) => rmSync(h.ctx.exportDir, { recursive: true, force: true });

test('graphsFor returns the three svg graphs', () => {
  const h = finished();
  const g = graphsFor(h.ctx, h.gameId);
  assert.deepEqual(Object.keys(g), ['companyVsCompany', 'coinDifference', 'roleBars']);
  for (const svg of Object.values(g)) assert.match(svg, /^<svg /);
});

test('saveGameImages writes three svg and three png files in the game folder', () => {
  const h = withDir(finished());
  try {
    const files = saveGameImages(h.ctx, h.gameId, h.ctx.exportDir);
    assert.equal(files.length, 6);
    assert.deepEqual(readdirSync(join(h.ctx.exportDir, `game-${h.gameId}`)).sort(),
      ['coin-difference.png', 'coin-difference.svg', 'company-vs-company.png', 'company-vs-company.svg', 'role-bars.png', 'role-bars.svg']);
  } finally { cleanup(h); }
});

test('the reveal is refused while the competition is running', () => {
  const h = withDir(toCompetition(makeRunning()));
  try {
    atSec(h, 900);
    assert.throws(() => revealGame(h.ctx, h.game()), /still running/);
  } finally { cleanup(h); }
});

test('before the reveal a player sees no results; after it, the three graphs', () => {
  const h = withDir(finished());
  try {
    assert.equal(viewFor(h.ctx, h.seat.A.CEO).results, undefined);
    revealGame(h.ctx, h.game());
    const v = viewFor(h.ctx, h.seat.A.CEO);
    assert.equal(v.clock.phase, 'ended');
    assert.deepEqual(Object.keys(v.results), ['companyVsCompany', 'coinDifference', 'roleBars']);
    assert.equal(viewFor(h.ctx, h.seat.B.CTO).results !== undefined, true);
  } finally { cleanup(h); }
});

test('revealing twice saves once, logs once and does not fail', () => {
  const h = withDir(finished());
  try {
    revealGame(h.ctx, h.game());
    const first = h.db.prepare('SELECT revealed_at FROM games').get().revealed_at;
    atSec(h, 1800);
    revealGame(h.ctx, h.game());
    assert.equal(h.db.prepare('SELECT revealed_at FROM games').get().revealed_at, first);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='graphs_revealed'").get().n, 1);
  } finally { cleanup(h); }
});

test('a failure to save images does not stop the reveal and is logged', () => {
  const h = finished();
  h.ctx.exportDir = '/proc/definitely/not/writable';
  revealGame(h.ctx, h.game());
  assert.ok(h.db.prepare('SELECT revealed_at FROM games').get().revealed_at);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='image_save_failed'").get().n, 1);
});

test('Next Game marks the ten completed, keeps them logged in, and reveals first if needed', () => {
  const h = withDir(finished());
  try {
    nextGame(h.ctx, h.game());
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='completed'").get().n, 10);
    assert.ok(h.db.prepare('SELECT revealed_at FROM games').get().revealed_at);
    assert.equal(h.game(), null);
    assert.equal(readdirSync(h.ctx.exportDir).length, 1);
  } finally { cleanup(h); }
});

test('Next Game works even if the competition has not ended', () => {
  const h = withDir(toCompetition(makeRunning()));
  try {
    atSec(h, 900);
    nextGame(h.ctx, h.game());
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='completed'").get().n, 10);
  } finally { cleanup(h); }
});

test('a completed player sees the graphs of their own old game, never a later one', () => {
  const h = withDir(finished());
  try {
    nextGame(h.ctx, h.game());
    const v = viewFor(h.ctx, h.seat.A.CEO);
    assert.equal(v.screen, 'graphs');
    assert.equal(v.gameId, h.gameId);
    assert.deepEqual(Object.keys(v.graphs), ['companyVsCompany', 'coinDifference', 'roleBars']);
    assert.equal(participantLogin(h.db, h.seat.A.CEO).view, 'graphs');
  } finally { cleanup(h); }
});

test('the organizer view shows whether the game has ended and been revealed', () => {
  const h = withDir(finished());
  try {
    let g = organizerView(h.ctx).game;
    assert.deepEqual([g.ended, g.revealed], [true, false]);
    revealGame(h.ctx, h.game());
    g = organizerView(h.ctx).game;
    assert.deepEqual([g.ended, g.revealed], [true, true]);
  } finally { cleanup(h); }
});
```

`test/render-results.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from '../public/render.js';
import { renderOrganizer } from '../public/render-organizer.js';

const svgs = { companyVsCompany: '<svg id="a"></svg>', coinDifference: '<svg id="b"></svg>', roleBars: '<svg id="c"></svg>' };
const ended = (extra = {}) => ({
  me: { admissionId: 'S0', name: 'Asha', company: 'A', role: 'CEO', status: 'in_game' }, screen: 'game',
  clock: { phase: 'ended', remainingSec: 0 }, problem: { id: 1, title: 'x', statement: '' }, wallet: 1,
  idea: null, ideation: null, shop: null, owned: [], summary: null, ...extra,
});

test('before the reveal the player sees only a thank you', () => {
  const html = renderScreen(ended());
  assert.match(html, /Thank you for playing/);
  assert.equal(html.includes('<svg'), false);
});

test('after the reveal the three graphs show, and there is no winner text', () => {
  const html = renderScreen(ended({ results: svgs }));
  assert.equal((html.match(/<svg/g) || []).length, 3);
  assert.equal(/winner|loser|you won|you lost/i.test(html), false);
});

test('a completed player gets the graphs of their game', () => {
  const html = renderScreen({ screen: 'graphs', me: { name: 'Asha' }, gameId: 3, graphs: svgs });
  assert.equal((html.match(/<svg/g) || []).length, 3);
  assert.match(html, /Game 3/);
});

const orgGame = (g) => ({ screen: 'organizer', problems: [], participants: [], game: { id: 1, problemId: 1, clock: { phase: 'ended', remainingSec: 0 }, attacks: [], eventUsed: null, injectionUsed: null, puzzles: { A: { solved: 0, skipped: 0, coins: 0 }, B: { solved: 0, skipped: 0, coins: 0 } }, companies: { A: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] }, B: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] } }, ended: true, revealed: false, ...g } });

test('when the game has ended the organizer sees Reveal graphs, and after it Next Game and downloads', () => {
  const before = renderOrganizer(orgGame({}));
  assert.match(before, /id="reveal"/);
  assert.match(before, /id="next-game"/);
  const after = renderOrganizer(orgGame({ revealed: true }));
  assert.equal(after.includes('id="reveal" '), false);
  assert.match(after, /\/export\/game\/1\.xlsx/);
});

test('while the competition is still running there is no Reveal button, but Next Game is always there', () => {
  const html = renderOrganizer(orgGame({ ended: false, clock: { phase: 'competition', remainingSec: 300 } }));
  assert.equal(html.includes('id="reveal"'), false);
  assert.match(html, /id="next-game"/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/results.js`

- [ ] **Step 3: Write the minimal implementation**

In `src/db.js`, add `revealed_at INTEGER` as a column of the `games` table.

`src/results.js`:

```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { endGame } from './lobby.js';
import { graphData } from './graphs/data.js';
import { companyVsCompany, coinDifference, roleBars } from './graphs/svg.js';
import { pngOf } from './graphs/png.js';

export function graphsFor(ctx, gameId) {
  const { series, final } = graphData(ctx.db, gameId);
  return { companyVsCompany: companyVsCompany(series), coinDifference: coinDifference(series), roleBars: roleBars(final) };
}

const STEMS = { companyVsCompany: 'company-vs-company', coinDifference: 'coin-difference', roleBars: 'role-bars' };

export function saveGameImages(ctx, gameId, dir) {
  const folder = join(dir, `game-${gameId}`);
  mkdirSync(folder, { recursive: true });
  const files = [];
  for (const [key, svg] of Object.entries(graphsFor(ctx, gameId))) {
    const svgFile = join(folder, `${STEMS[key]}.svg`);
    const pngFile = join(folder, `${STEMS[key]}.png`);
    writeFileSync(svgFile, svg);
    writeFileSync(pngFile, pngOf(svg));
    files.push(svgFile, pngFile);
  }
  return files;
}

function markRevealed(ctx, game) {
  const info = ctx.db.prepare('UPDATE games SET revealed_at = ? WHERE id = ? AND revealed_at IS NULL').run(ctx.now(), game.id);
  if (info.changes === 0) return false;
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'graphs_revealed' });
  try {
    saveGameImages(ctx, game.id, ctx.exportDir ?? 'exports');
  } catch (e) {
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'image_save_failed', payload: { message: String(e.message) } });
  }
  return true;
}

export function revealGame(ctx, game) {
  if (phaseAt(game, ctx.now()).phase !== 'ended') throw new Error('the competition is still running');
  markRevealed(ctx, game);
}

export function nextGame(ctx, game) {
  markRevealed(ctx, game);
  endGame(ctx.db, game.id, ctx.now());
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'next_game' });
}
```

In `src/views.js`: import `graphsFor` from `./results.js`; in `viewFor`, change the completed branch to `return { me, screen: 'graphs', gameId: p.game_id, graphs: graphsFor(ctx, p.game_id) };`; in the in-game return add `...(clock.phase === 'ended' && revealed(ctx, game) ? { results: graphsFor(ctx, game.id) } : {})` where `const revealed = (ctx, game) => !!ctx.db.prepare('SELECT revealed_at FROM games WHERE id=?').get(game.id).revealed_at;`; in `organizerView`'s `game` block add `ended: clock.phase === 'ended'` and `revealed: revealed(ctx, game)`.

In `src/server.js`: import `{ revealGame, nextGame }` and add to `organizerActions`:

```js
    reveal: () => { const g = activeGame(db); if (!g) throw new Error('no game is running'); revealGame(ctx, g); },
    next_game: () => { const g = activeGame(db); if (!g) throw new Error('no game is running'); nextGame(ctx, g); },
```

Add `exportDir` to the `createApp` options (default `'exports'`) and set `ctx.exportDir`. (The `organizerActions` dispatcher already logs `organizer_action`.)

In `public/render.js`: add

```js
function graphsHtml(g) {
  return `<main class="results"><section class="card">${g.companyVsCompany}</section><section class="card">${g.coinDifference}</section><section class="card">${g.roleBars}</section></main>`;
}
```

SVG strings are produced by the server from numbers and fixed labels only (no player text), so they may be inserted as markup. In `renderScreen`: for `v.screen === 'graphs'` return `<main><h2>Game ${esc(v.gameId)}</h2></main>${graphsHtml(v.graphs)}` and keep "Thank you for playing" only when `v.graphs` is missing; in the `default:` (ended) branch return `graphsHtml(v.results)` when `v.results` exists, else the thank-you card.

In `public/render-organizer.js`, in the running-game branch add, when `v.game.ended`, a card with `<button id="reveal">Reveal graphs</button>` (only when `!v.game.revealed`); always `<button id="next-game">Next Game</button>`; and when `v.game.revealed`, download links `<a href="/export/game/${id}.xlsx" data-export>Download this game (Excel)</a>`, `<a href="/export/event.xlsx" data-export>Download the whole event (Excel)</a>` and the three PNG links. In `public/organizer.js` add `if (id === 'reveal') send({ type: 'reveal' }); if (id === 'next-game' && confirm('End this game and mark the players Game Completed?')) send({ type: 'next_game' });`. (The export links get their token in Task 5.)

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. (The test that sets `exportDir` to an unwritable path expects an `image_save_failed` event and a successful reveal.)

- [ ] **Step 5: Commit**

```bash
git add src public test/results.test.js test/render-results.test.js
git commit -m "feat: reveal, Next Game, saved graph images and the results screens"
```

---

### Task 4: Excel workbooks and the session log

**Files:**
- Create: `src/xlsx.js`, `src/exportData.js`, `test/xlsx.test.js`, `test/export.test.js`
- Modify: `src/server.js` (log disconnects)

**Interfaces:**
- Produces:
  - `buildWorkbook(sheets, meta = {}) -> Promise<Buffer>` where `sheets = [{ name, columns: string[], rows: any[][] }]` (names cut to 31 characters; text that starts with `=` or `@` stays text; the first row is bold and frozen). Run before this plan was written: 3 tests passed against real `exceljs`.
  - `gameSheets(db, data, gameId) -> sheets`; `eventSheets(db, data) -> sheets`; `exportGame(db, data, gameId) -> Promise<Buffer>`; `exportEvent(db, data) -> Promise<Buffer>`.
  - Sheets, in this order, with their first columns: **Players** (`game, admission_id, name, company, role, status`); **Sessions** (`game, admission_id, time, event`; login, disconnect, game_start, game_end, seat_swap, seat_replace); **Ideation** (`game, admission_id, time, company, idea_id, previous_idea`; every vote and change); **Idea picks** (`game, company, idea_id, source, picked_by, time`, plus the time saved by an early end); **Shop requests** (`game, request_id, company, item_id, item, choice, requested_by, recommended, status, phase, price, charged, requested_at, decided_at, decided_by, reject_reason`); **Wallets** (`game, company, idea, leftover_coins, mini_coins, attack_coins, cto_sales, cmo_sales, coo_sales`); **Samples** (`game, time, seconds, company, wallet, cto_rate, cmo_rate, coo_rate, cto_coins, cmo_coins, coo_coins, mini_coins, attack_coins`); **Attacks** (`game, attack_id, attacker_company, victim_company, ceo_admission_id, attack, cost, start, end, blocked_by_shield, cover_story`); **Events and shields** (`game, kind, company, detail, time`: the market event, the coin injection, each shield bought and used); **Hints** (`game, company, role, time, text, acted`); **Puzzles** (`game, company, admission_id, kind, level, shown_at, ended_at, result, coins, penalty, wrong_tries, seconds`); **Organizer actions** (`game, time, action, details`); **Events** (every row of the `events` table: `game, time, admission_id, type, payload`).
  - The whole-event workbook merges the same sheets across all games, adds a **Roster** sheet (`admission_id, name, status, game, company, role`) and fills **Events** with every event, including those with no game (roster imports, logins in the lobby).
  - Times are ISO text (`2026-10-11T09:30:00.000Z`) and the raw millisecond value is kept in a column named `ts_ms` in **Samples** and **Events**.
- `src/server.js`: when a participant's WebSocket closes, log `disconnect` (with the participant's current `game_id`). A later login is the reconnect.

- [ ] **Step 1: Write the failing tests**

`test/xlsx.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook, readWorkbook } from '../src/xlsx.js';

test('a workbook round-trips sheets, headers, numbers and text', async () => {
  const buf = await buildWorkbook([
    { name: 'Players', columns: ['game', 'admission_id', 'name'], rows: [[1, 'A001', 'Asha'], [1, 'A002', 'Ben, Jr.']] },
    { name: 'Samples', columns: ['ts', 'wallet'], rows: [[800000, 1000.5]] },
  ]);
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const sheets = await readWorkbook(buf);
  assert.deepEqual(sheets.map((s) => s.name), ['Players', 'Samples']);
  assert.deepEqual(sheets[0].rows, [['game', 'admission_id', 'name'], [1, 'A001', 'Asha'], [1, 'A002', 'Ben, Jr.']]);
  assert.equal(sheets[1].rows[1][1], 1000.5);
});

test('long sheet names are cut to the 31 characters Excel allows, and empty sheets still exist', async () => {
  const buf = await buildWorkbook([{ name: 'A very long sheet name that goes past thirty one', columns: ['x'], rows: [] }]);
  const sheets = await readWorkbook(buf);
  assert.equal(sheets[0].name.length, 31);
  assert.deepEqual(sheets[0].rows, [['x']]);
});

test('a formula-looking text stays text', async () => {
  const buf = await buildWorkbook([{ name: 'T', columns: ['v'], rows: [['=1+1'], ['@cmd']] }]);
  const sheets = await readWorkbook(buf);
  assert.equal(typeof sheets[0].rows[1][0], 'string');
  assert.equal(sheets[0].rows[1][0], '=1+1');
});
```

`test/export.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec, data } from './helpers.js';
import { castVote, pickIdea } from '../src/ideation.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { launchAttack } from '../src/attacks.js';
import { triggerMarketEvent, injectCoins } from '../src/marketEvents.js';
import { tickEconomy } from '../src/economy.js';
import { startPuzzle, submitPuzzle, openPuzzle } from '../src/minigame.js';
import { participantLogin } from '../src/auth.js';
import { logEvent } from '../src/events.js';
import { readWorkbook } from '../src/xlsx.js';
import { exportGame, exportEvent, gameSheets } from '../src/exportData.js';
import { mulberry32 } from '../src/puzzles/rng.js';

function story() {
  const h = makeRunning();
  participantLogin(h.db, h.seat.A.CEO, 100);
  atSec(h, 190);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'S2');
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 2);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  requestItem(h.ctx, h.game(), h.seat.B.COO, 'O01');
  atSec(h, 800);
  give(h, 'A', ['O01', 'O02', 'O03']);
  for (let s = 800; s <= 820; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'price_squeeze', () => 0);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'B', 100);
  startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(1));
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution));
  return h;
}
const byName = (sheets) => Object.fromEntries(sheets.map((s) => [s.name, s]));

test('a game workbook has every sheet, in order', async () => {
  const h = story();
  const sheets = await readWorkbook(await exportGame(h.db, data, h.gameId));
  assert.deepEqual(sheets.map((s) => s.name), ['Players', 'Sessions', 'Ideation', 'Idea picks', 'Shop requests', 'Wallets', 'Samples', 'Attacks', 'Events and shields', 'Hints', 'Puzzles', 'Organizer actions', 'Events']);
});

test('the Players sheet has the ten players with their Admission IDs, company and role', () => {
  const h = story();
  const p = byName(gameSheets(h.db, data, h.gameId)).Players;
  assert.equal(p.rows.length, 10);
  assert.deepEqual(p.rows.find((r) => r[1] === 'S2'), [h.gameId, 'S2', 'Player 2', 'A', 'CFO', 'in_game']);
});

test('every vote and every change is in the Ideation sheet with the previous idea', () => {
  const h = story();
  const rows = byName(gameSheets(h.db, data, h.gameId)).Ideation.rows;
  assert.deepEqual(rows.map((r) => [r[1], r[4], r[5]]), [['S1', 'H1', null], ['S1', 'S2', 'H1']]);
});

test('the Shop sheet keeps approved, still-open and rejected requests, with the item name', () => {
  const h = story();
  const rows = byName(gameSheets(h.db, data, h.gameId))['Shop requests'].rows;
  assert.equal(rows.length, 2);
  const brand = rows.find((r) => r[2] === 'A');
  assert.deepEqual([brand[3], brand[4], brand[5], brand[8], brand[11]], ['M02', 'Brand Name Pack', 2, 'approved', 40]);
});

test('wallets show the leftover coins and the per-role sales of each company', () => {
  const h = story();
  const rows = byName(gameSheets(h.db, data, h.gameId)).Wallets.rows;
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r[1] === 'A');
  assert.equal(a[2], 'Smart Fridge Sensor');
  assert.ok(a[3] > 0);
  assert.ok(a[8] > 0); // coo sales
});

test('samples, attacks, events and puzzles are all there with the right people', () => {
  const h = story();
  const s = byName(gameSheets(h.db, data, h.gameId));
  assert.ok(s.Samples.rows.length >= 8);
  assert.equal(s.Attacks.rows.length, 1);
  assert.equal(s.Attacks.rows[0][4], h.seat.A.CEO);
  assert.equal(s.Attacks.rows[0][5], 'Price Squeeze');
  assert.deepEqual(s['Events and shields'].rows.map((r) => r[1]).sort(), ['coin_injection', 'market_event']);
  assert.equal(s.Puzzles.rows.length, 1);
  assert.equal(s.Puzzles.rows[0][2], h.seat.A.CFO);
});

test('the Sessions sheet shows the login', () => {
  const h = story();
  const rows = byName(gameSheets(h.db, data, h.gameId)).Sessions.rows;
  assert.ok(rows.some((r) => r[1] === h.seat.A.CEO && r[3] === 'login'));
});

test('the event workbook merges games, adds the roster and keeps events with no game', async () => {
  const h = story();
  logEvent(h.db, { ts: 5, type: 'organizer_action', payload: { action: 'roster_import' } });
  const sheets = byName(await readWorkbook(await exportEvent(h.db, data)));
  assert.equal(sheets.Roster.rows.length, 13); // header plus twelve people
  assert.equal(sheets.Players.rows.length, 11);
  assert.ok(sheets.Events.rows.some((r) => r[0] == null && r[4] && String(r[4]).includes('roster_import')));
});

test('hostile text in a name stays text and the export does not fail', async () => {
  const h = story();
  h.db.prepare("UPDATE participants SET name = '=HYPERLINK(\"http://x\")' WHERE admission_id = 'S3'").run();
  const sheets = byName(await readWorkbook(await exportGame(h.db, data, h.gameId)));
  assert.equal(sheets.Players.rows.find((r) => r[1] === 'S3')[2], '=HYPERLINK("http://x")');
});
```

Add one test to `test/actions.test.js`-style (new `test/session-log.test.js`): log in as a participant over a WebSocket, close the socket, wait 100 ms, and assert one `disconnect` event exists for that Admission ID; then log in again and assert two `login` events.

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/exportData.js`

- [ ] **Step 3: Write the implementation**

`src/xlsx.js` (verified):

```js
import ExcelJS from 'exceljs';

// sheets: [{ name, columns: ['a', 'b'], rows: [[1, 2], ...] }]
export async function buildWorkbook(sheets, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Startup Showdown';
  wb.created = new Date(meta.createdAt ?? Date.now());
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(40, c.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of s.rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function readWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: ws.getSheetValues().slice(1).map((r) => r.slice(1)) }));
}
```

`src/exportData.js`:

```js
import { buildWorkbook } from './xlsx.js';
import { ATTACKS } from './attacks.js';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const json = (s) => { try { return JSON.parse(s); } catch { return {}; } };

export function gameSheets(db, data, gameId) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!g) throw new Error('no such game');
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const itemName = (id) => (data.item(id) || {}).name ?? id;
  const ideaOf = (company) => {
    const cs = db.prepare('SELECT idea_id FROM company_state WHERE game_id=? AND company=?').get(gameId, company);
    return cs && cs.idea_id ? (data.ideasFor(g.problem_id).find((i) => i.id === cs.idea_id) || {}).name ?? cs.idea_id : null;
  };
  const players = all('SELECT admission_id FROM participants WHERE game_id = ?', gameId).map((p) => p.admission_id);
  const sheet = (name, columns, rows) => ({ name, columns, rows });

  const sessionRows = all(
    `SELECT admission_id, ts, type FROM events
     WHERE type IN ('game_start','game_end','seat_swap','seat_replace','login','disconnect')
       AND (game_id = ? OR (type IN ('login','disconnect') AND ts >= ? AND ts <= ?))
     ORDER BY id`, gameId, g.started_at, g.ended_at ?? 8.64e15,
  ).filter((e) => e.admission_id && players.includes(e.admission_id) || e.type.startsWith('seat'));

  const pick = (type) => all('SELECT * FROM events WHERE game_id = ? AND type = ? ORDER BY id', gameId, type).map((e) => ({ ...e, p: json(e.payload) }));

  return [
    sheet('Players', ['game', 'admission_id', 'name', 'company', 'role', 'status'],
      all('SELECT * FROM participants WHERE game_id = ? ORDER BY company, role', gameId).map((p) => [gameId, p.admission_id, p.name, p.company, p.role, p.status])),
    sheet('Sessions', ['game', 'admission_id', 'time', 'event'],
      sessionRows.map((e) => [gameId, e.admission_id, iso(e.ts), e.type])),
    sheet('Ideation', ['game', 'admission_id', 'time', 'company', 'idea_id', 'previous_idea'],
      pick('vote').map((e) => [gameId, e.admission_id, iso(e.ts), e.p.company, e.p.ideaId, e.p.previous])),
    sheet('Idea picks', ['game', 'company', 'idea_id', 'source', 'picked_by', 'time', 'seconds_saved'],
      [...pick('idea_pick').map((e) => [gameId, e.p.company, e.p.ideaId, 'ceo', e.admission_id, iso(e.ts), null]),
        ...pick('idea_auto_pick').map((e) => [gameId, e.p.company, e.p.ideaId, e.p.tied ? 'auto (tie)' : 'auto', null, iso(e.ts), null]),
        ...pick('ideation_end_early').map((e) => [gameId, null, null, 'early end', null, iso(e.ts), e.p.savedSec])]),
    sheet('Shop requests', ['game', 'request_id', 'company', 'item_id', 'item', 'choice', 'requested_by', 'recommended', 'status', 'phase', 'price', 'charged', 'requested_at', 'decided_at', 'decided_by', 'reject_reason'],
      all('SELECT * FROM requests WHERE game_id = ? ORDER BY id', gameId).map((r) => [gameId, r.id, r.company, r.item_id, itemName(r.item_id), r.choice, r.requested_by, r.recommended, r.status, r.phase, r.price, r.charged, iso(r.requested_at), iso(r.decided_at), r.decided_by, r.reject_reason])),
    sheet('Wallets', ['game', 'company', 'idea', 'leftover_coins', 'mini_coins', 'attack_coins', 'cto_sales', 'cmo_sales', 'coo_sales'],
      all('SELECT * FROM company_state WHERE game_id = ? ORDER BY company', gameId).map((c) => [gameId, c.company, ideaOf(c.company), c.wallet, c.mini_coins, c.attack_coins, c.cto_coins, c.cmo_coins, c.coo_coins])),
    sheet('Samples', ['game', 'time', 'ts_ms', 'seconds', 'company', 'wallet', 'cto_rate', 'cmo_rate', 'coo_rate', 'cto_coins', 'cmo_coins', 'coo_coins', 'mini_coins', 'attack_coins'],
      (() => { const rows = all('SELECT * FROM samples WHERE game_id = ? ORDER BY ts, company', gameId); const t0 = rows.length ? rows[0].ts : 0;
        return rows.map((s) => [gameId, iso(s.ts), s.ts, (s.ts - t0) / 1000, s.company, s.wallet, s.cto_rate, s.cmo_rate, s.coo_rate, s.cto_coins, s.cmo_coins, s.coo_coins, s.mini_coins, s.attack_coins]); })()),
    sheet('Attacks', ['game', 'attack_id', 'attacker_company', 'victim_company', 'ceo_admission_id', 'attack', 'cost', 'start', 'end', 'blocked_by_shield', 'cover_story'],
      all('SELECT * FROM attacks WHERE game_id = ? ORDER BY id', gameId).map((a) => [gameId, a.id, a.attacker, a.victim, a.launched_by, (ATTACKS.find((x) => x.key === a.key) || {}).name ?? a.key, a.cost, iso(a.launched_at), iso(a.end_at), a.blocked ? 'yes' : 'no', a.cover])),
    sheet('Events and shields', ['game', 'kind', 'company', 'detail', 'time'],
      [...all('SELECT * FROM market_events WHERE game_id = ?', gameId).map((e) => [gameId, 'market_event', null, e.key, iso(e.started_at)]),
        ...all('SELECT * FROM injections WHERE game_id = ?', gameId).map((e) => [gameId, 'coin_injection', e.company, `${e.coins} coins`, iso(e.ts)]),
        ...all("SELECT * FROM owned WHERE game_id = ? AND family = 'O06'", gameId).map((o) => [gameId, 'shield_bought', o.company, `${o.charged} coins`, iso(o.bought_at)]),
        ...all('SELECT * FROM shield_use WHERE game_id = ?', gameId).map((s) => [gameId, 'shield_used', s.company, 'blocked an attack', iso(s.used_at)])]),
    sheet('Hints', ['game', 'company', 'role', 'time', 'text', 'acted'],
      all('SELECT * FROM hints WHERE game_id = ? ORDER BY id', gameId).map((h) => [gameId, h.company, h.role, iso(h.ts), h.text, h.acted == null ? null : h.acted ? 'yes' : 'no'])),
    sheet('Puzzles', ['game', 'company', 'admission_id', 'kind', 'level', 'shown_at', 'ended_at', 'result', 'coins', 'penalty', 'wrong_tries', 'seconds'],
      all('SELECT * FROM puzzle_sessions WHERE game_id = ? ORDER BY id', gameId).map((p) => [gameId, p.company, p.admission_id, p.kind, p.level, iso(p.shown_at), iso(p.ended_at), p.result, p.coins, p.penalty, p.wrong_tries, p.ended_at ? Math.round((p.ended_at - p.shown_at) / 1000) : null])),
    sheet('Organizer actions', ['game', 'time', 'action', 'details'],
      all("SELECT * FROM events WHERE type = 'organizer_action' AND ts >= ? AND ts <= ? ORDER BY id", g.started_at - 3_600_000, g.ended_at ?? 8.64e15)
        .map((e) => [gameId, iso(e.ts), json(e.payload).action, JSON.stringify(json(e.payload).args ?? {})])),
    sheet('Events', ['game', 'time', 'ts_ms', 'admission_id', 'type', 'payload'],
      all('SELECT * FROM events WHERE game_id = ? ORDER BY id', gameId).map((e) => [gameId, iso(e.ts), e.ts, e.admission_id, e.type, e.payload])),
  ];
}

export function eventSheets(db, data) {
  const ids = db.prepare('SELECT id FROM games ORDER BY id').all().map((g) => g.id);
  const merged = new Map();
  for (const id of ids) {
    for (const s of gameSheets(db, data, id)) {
      if (!merged.has(s.name)) merged.set(s.name, { name: s.name, columns: s.columns, rows: [] });
      merged.get(s.name).rows.push(...s.rows);
    }
  }
  const sheets = [...merged.values()];
  if (!sheets.length) return [];
  const events = sheets.find((s) => s.name === 'Events');
  events.rows = db.prepare('SELECT * FROM events ORDER BY id').all().map((e) => [e.game_id, iso(e.ts), e.ts, e.admission_id, e.type, e.payload]);
  const organizer = sheets.find((s) => s.name === 'Organizer actions');
  organizer.rows = db.prepare("SELECT * FROM events WHERE type = 'organizer_action' ORDER BY id").all()
    .map((e) => [e.game_id, iso(e.ts), json(e.payload).action, JSON.stringify(json(e.payload).args ?? {})]);
  sheets.splice(1, 0, { name: 'Roster', columns: ['admission_id', 'name', 'status', 'game', 'company', 'role'],
    rows: db.prepare('SELECT * FROM participants ORDER BY admission_id').all().map((p) => [p.admission_id, p.name, p.status, p.game_id, p.company, p.role]) });
  return sheets;
}

export const exportGame = (db, data, gameId) => buildWorkbook(gameSheets(db, data, gameId));
export const exportEvent = (db, data) => buildWorkbook(eventSheets(db, data));
```

> **Notes for the implementer:** (1) In the event workbook test, the **Roster** sheet is inserted at position 2, after **Players**; keep the order stated in the test (`Players` first for the game workbook). (2) `eventSheets` returns `[]` when there are no games, and `buildWorkbook([])` makes an empty workbook; make `exportEvent` add a single sheet named `Empty` in that case so Excel can open the file. (3) The **Events** sheet of the whole-event workbook has more rows than the per-game one because it includes the events with no game.

In `src/server.js`, change the close handler to:

```js
    ws.on('close', () => {
      const s = sessions.get(ws);
      if (s && s.kind === 'participant') {
        const p = db.prepare('SELECT game_id FROM participants WHERE admission_id = ?').get(s.admissionId);
        logEvent(db, { ts: now(), gameId: p ? p.game_id : null, admissionId: s.admissionId, type: 'disconnect' });
      }
      sessions.delete(ws);
    });
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. If a column index in a test is off by one, fix the test to match the column list in this task; the column order is the contract.

- [ ] **Step 5: Commit**

```bash
git add src/xlsx.js src/exportData.js src/server.js test/xlsx.test.js test/export.test.js test/session-log.test.js
git commit -m "feat: Excel workbooks per game and for the whole event, and the session log"
```

---

### Task 5: Organizer-only downloads

**Files:**
- Create: `src/exportHttp.js`, `test/export-http.test.js`
- Modify: `src/server.js`, `public/organizer.js`, `public/render-organizer.js`

**Interfaces:**
- Produces:
  - `createExportHandler({ db, data, ctx, tokens }) -> async (req, res) => boolean`: serves `GET /export/game/<id>.xlsx`, `GET /export/event.xlsx`, and `GET /export/game/<id>/<stem>.png|svg` (stems `company-vs-company`, `coin-difference`, `role-bars`). Returns `true` when it handled the request. A missing or wrong `?token=` gives **403**; an unknown game gives **404**.
  - `createApp` creates `tokens = new Set()`, adds a fresh random token (`crypto.randomUUID()`) to it **on each organizer login**, and returns it in the welcome message: `{ type: 'welcome', view: 'organizer', token }`. The request handler tries the export handler first, then the static files.
  - Download headers: `content-type` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `content-disposition: attachment; filename="showdown-game-<id>.xlsx"` (or `showdown-event.xlsx`).
- Browser: `organizer.js` keeps the token and adds `?token=...` to every link with `data-export` (and the PNG links) right before the click.

- [ ] **Step 1: Write the failing tests**

`test/export-http.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { readWorkbook } from '../src/xlsx.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  startGame(db, 1, 0);
  const app = createApp({ db, organizerPassword: 'pw', now: () => 5000, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { app, port: app.server.address().port };
}
const connect = (port) => new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
const get = (port, path) => new Promise((resolve) => {
  http.get({ port, path }, (res) => { const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
});
async function organizerToken(port) {
  const ws = await connect(port);
  const p = next(ws);
  ws.send(JSON.stringify({ type: 'organizer', password: 'pw' }));
  const m = await p;
  ws.terminate();
  return m.token;
}
const done = async (app) => { app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

test('the organizer welcome carries a token, and a wrong password gets none', async () => {
  const { app, port } = await boot();
  assert.match(await organizerToken(port), /^[0-9a-f-]{36}$/);
  await done(app);
});

test('without the token every export is refused', async () => {
  const { app, port } = await boot();
  for (const path of ['/export/game/1.xlsx', '/export/event.xlsx', '/export/game/1/role-bars.png', '/export/game/1.xlsx?token=nope']) {
    assert.equal((await get(port, path)).status, 403, path);
  }
  await done(app);
});

test('with the token the game workbook downloads as an attachment and opens', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  const r = await get(port, `/export/game/1.xlsx?token=${token}`);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-disposition'], /attachment; filename="showdown-game-1\.xlsx"/);
  assert.equal((await readWorkbook(r.body)).some((s) => s.name === 'Players'), true);
  await done(app);
});

test('the event workbook and the graph images download too', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  assert.equal((await get(port, `/export/event.xlsx?token=${token}`)).status, 200);
  const png = await get(port, `/export/game/1/coin-difference.png?token=${token}`);
  assert.equal(png.status, 200);
  assert.equal(png.body.slice(0, 4).toString('hex'), '89504e47');
  const svg = await get(port, `/export/game/1/role-bars.svg?token=${token}`);
  assert.match(svg.headers['content-type'], /image\/svg\+xml/);
  await done(app);
});

test('an unknown game or graph is a 404, not a crash', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  assert.equal((await get(port, `/export/game/99.xlsx?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/1/nope.png?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/abc.xlsx?token=${token}`)).status, 404);
  await done(app);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (the welcome has no `token` and `/export/...` returns 404 or the static handler's answer)

- [ ] **Step 3: Write the minimal implementation**

`src/exportHttp.js`:

```js
import { exportGame, exportEvent } from './exportData.js';
import { graphsFor } from './results.js';
import { pngOf } from './graphs/png.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STEMS = { 'company-vs-company': 'companyVsCompany', 'coin-difference': 'coinDifference', 'role-bars': 'roleBars' };

export function createExportHandler({ db, data, ctx, tokens }) {
  return async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/export/')) return false;
    if (!tokens.has(url.searchParams.get('token'))) { res.writeHead(403); res.end(); return true; }
    const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'content-type': type, ...extra }); res.end(body); return true; };
    const gameExists = (id) => Number.isInteger(id) && db.prepare('SELECT 1 FROM games WHERE id = ?').get(id);
    try {
      if (url.pathname === '/export/event.xlsx') {
        return send(200, XLSX, await exportEvent(db, data), { 'content-disposition': 'attachment; filename="showdown-event.xlsx"' });
      }
      let m = url.pathname.match(/^\/export\/game\/(\d+)\.xlsx$/);
      if (m) {
        const id = Number(m[1]);
        if (!gameExists(id)) return send(404, 'text/plain', 'not found');
        return send(200, XLSX, await exportGame(db, data, id), { 'content-disposition': `attachment; filename="showdown-game-${id}.xlsx"` });
      }
      m = url.pathname.match(/^\/export\/game\/(\d+)\/([a-z-]+)\.(png|svg)$/);
      if (m && STEMS[m[2]]) {
        const id = Number(m[1]);
        if (!gameExists(id)) return send(404, 'text/plain', 'not found');
        const svg = graphsFor(ctx, id)[STEMS[m[2]]];
        return m[3] === 'svg'
          ? send(200, 'image/svg+xml', svg, { 'content-disposition': `attachment; filename="${m[2]}-game-${id}.svg"` })
          : send(200, 'image/png', pngOf(svg), { 'content-disposition': `attachment; filename="${m[2]}-game-${id}.png"` });
      }
      return send(404, 'text/plain', 'not found');
    } catch (e) {
      return send(500, 'text/plain', 'export failed');
    }
  };
}
```

In `src/server.js`: `import { randomUUID } from 'node:crypto';` and `import { createExportHandler } from './exportHttp.js';`; create `const tokens = new Set();` and `const exporter = createExportHandler({ db, data, ctx, tokens });`; make the HTTP handler `async (req, res) => { if (await exporter(req, res)) return; return staticHandlerOrNotFound(req, res); }`; on successful organizer login do `const token = randomUUID(); tokens.add(token);` and send `{ type: 'welcome', view: 'organizer', token }`.

> **Plan 2 test compatibility:** Plan 2's tests expect the organizer welcome to equal `{ type: 'welcome', view: 'organizer' }` exactly. Change those assertions to `assert.equal(m.type, 'welcome'); assert.equal(m.view, 'organizer');` in the same commit.

In `public/organizer.js` keep `let token = null;`, set it from the `welcome` message, and add a click handler that, for `a[data-export]` and `a[data-graph]`, sets `a.href = a.getAttribute('href').split('?')[0] + '?token=' + token` before the browser follows it. In `renderOrganizer` add the links `<a data-graph href="/export/game/${id}/company-vs-company.png">`, `.../coin-difference.png`, `.../role-bars.png`.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src public test/export-http.test.js
git commit -m "feat: organizer-only downloads of Excel files and graph images"
```

---

### Task 6: Automatic backups

**Files:**
- Create: `src/backup.js`, `test/backup.test.js`
- Modify: `src/server.js` (backup after Next Game), `src/index.js` (the 5-minute timer), `src/views.js` (organizer backup status)

**Interfaces:**
- Produces (`src/backup.js`, verified before this plan was written: 3 tests passed against real `better-sqlite3`):
  - `backupDb(db, dir, label, now = Date.now()) -> Promise<string>`: copies the live database to `dir/showdown-<label>-<time>.db` with SQLite's online backup; creates the folder; rejects on failure.
  - `pruneBackups(dir, keep = 50) -> number`: deletes older backup files, keeps the newest `keep`.
- `src/index.js`: the environment variable `BACKUP_DIR` (default `backups`; on the Pi, the USB stick, for example `/media/pi/SHOWDOWN`). Every **5 minutes while a game runs**, `backupDb(db, BACKUP_DIR, 'during')` then `pruneBackups`. The result (time, file or error text) is stored in `app.backupStatus = { at, ok, message }`.
- `src/server.js`: after `next_game`, run one backup labelled `after` (a failure is stored in `backupStatus`, never thrown to the organizer's action).
- The organizer view (`organizerView`) includes `backup: { at, ok, message } | null`, and the console shows a small line "Last backup 09:35, ok" (red text and "Backup failed: ..." when `ok` is false).

- [ ] **Step 1: Write the failing tests**

`test/backup.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDb, pruneBackups } from '../src/backup.js';

test('a backup opens as a database with the same rows', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  try {
    const db = new Database(join(dir, 'live.db'));
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (x INTEGER)');
    db.prepare('INSERT INTO t VALUES (?)').run(42);
    const file = await backupDb(db, join(dir, 'usb'), 'during', 1_700_000_000_000);
    assert.match(file, /showdown-during-2023-11-14T22-13-20-000Z\.db$/);
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.prepare('SELECT x FROM t').get().x, 42);
    copy.close();
    db.prepare('INSERT INTO t VALUES (?)').run(43);
    assert.equal(new Database(file, { readonly: true }).prepare('SELECT COUNT(*) AS n FROM t').get().n, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unwritable folder fails loudly instead of silently', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  try {
    writeFileSync(join(dir, 'a-file'), 'x');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    await assert.rejects(() => backupDb(db, join(dir, 'a-file', 'usb'), 'x'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pruning keeps the newest files only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  try {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    for (let i = 0; i < 5; i++) {
      const f = await backupDb(db, dir, `n${i}`, 1_700_000_000_000 + i * 1000);
      utimesSync(f, new Date(1_700_000_000_000 + i * 1000), new Date(1_700_000_000_000 + i * 1000));
    }
    assert.equal(pruneBackups(dir, 2), 2);
    assert.deepEqual(readdirSync(dir).sort().map((f) => f.split('-')[1]), ['n3', 'n4']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

Add `test/backup-status.test.js` (uses the helpers of Plan 2): with a `createApp` over a database whose `BACKUP_DIR` is a temp folder, run `app.runBackup('after')` and assert `app.backupStatus.ok === true` and a file exists; then point the folder at a path under a regular file and assert `app.backupStatus.ok === false` and that `runBackup` resolved (did not throw). Assert `organizerView` returns the same status in `backup`.

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/backup.js`

- [ ] **Step 3: Write the implementation**

`src/backup.js`:

```js
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const stamp = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');

// Copies the live database into dir as showdown-<label>-<time>.db using SQLite's own online backup.
export async function backupDb(db, dir, label, now = Date.now()) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `showdown-${label}-${stamp(now)}.db`);
  await db.backup(file);
  return file;
}

// Keeps only the newest `keep` files so a USB stick does not fill up.
export function pruneBackups(dir, keep = 50) {
  const files = readdirSync(dir).filter((f) => f.startsWith('showdown-') && f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) rmSync(join(dir, f));
  return files.slice(0, keep).length;
}
```

In `createApp` accept `backupDir = 'backups'`, keep `let backupStatus = null`, and expose:

```js
  async function runBackup(label) {
    try {
      const file = await backupDb(db, backupDir, label, now());
      pruneBackups(backupDir);
      backupStatus = { at: now(), ok: true, message: file };
    } catch (e) {
      backupStatus = { at: now(), ok: false, message: String(e.message) };
      logEvent(db, { ts: now(), type: 'backup_failed', payload: { message: String(e.message) } });
    }
    return backupStatus;
  }
```

Return `runBackup` and a getter `get backupStatus() { return backupStatus; }` from `createApp`, put `ctx.backupStatus = () => backupStatus` so `organizerView` can read it, and call `runBackup('after')` (not awaited, errors already caught) after a successful `next_game`. In `src/index.js` read `BACKUP_DIR`, pass it to `createApp`, and add `const backup = setInterval(() => { if (activeGame(db)) app.runBackup('during'); }, 5 * 60_000);`, clearing it in `stop()`.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check by hand**

Start a game with `BACKUP_DIR` pointing to a real folder, wait 5 minutes (or temporarily shorten the interval with an environment variable `BACKUP_EVERY_MS`, which the plan allows because `index.js` reads it with a default of 300000), and confirm a `.db` file appears, opens with `sqlite3 file.db 'select count(*) from events'`, and that unplugging the folder (rename it) shows "Backup failed" in the organizer console without stopping the game.

- [ ] **Step 6: Commit**

```bash
git add src test/backup.test.js test/backup-status.test.js
git commit -m "feat: automatic database backups every five minutes and after each game"
```

---

## Self-review against the spec

**Spec coverage:** three graphs in the League of Legends style with the zero-line difference graph and mirrored role bars (Task 2); role sources CTO/CMO/COO sales, CFO mini games, CEO attack coins (Tasks 1, 2); thank-you before the reveal, organizer reveal, graphs persist across reconnects (Task 3); Next Game marks Game Completed without logging out, completed players see only their own game's graphs (Task 3); saved images (Task 3); Excel per game and per event with Admission IDs and every recorded item: players and sessions, votes and changes, picks, shop requests including rejected and auto-rejected with CEO recommendations, leftover coins, 5-second samples, attacks with the real cause and shield result, events and injection, hints with acted flag, puzzles, organizer actions, all events (Task 4); organizer-only download (Task 5); automatic backups every 5 minutes and after each game to a USB stick (Task 6).

**Verified code:** the SVG graphs, the PNG output, the Excel builder and the backup functions were run against the real libraries before this plan was written (SVG and PNG 6 tests, Excel 3 tests, backup 3 tests, all passing).

**Placeholder scan:** two notes for the implementer are explicit: the shape-only test in Task 1 and the empty-event-workbook case in Task 4 (both with the exact replacement stated).

**Type consistency:** `graphData`, `graphsFor`, `revealGame`, `nextGame`, `saveGameImages`, `exportGame`, `exportEvent`, `createExportHandler`, `backupDb`, `pruneBackups`, `runBackup` and the message names are used the same way in Tasks 1 to 6.

**Interface changes to earlier plans:** `createApp` gains `exportDir` and `backupDir`; the organizer welcome carries a `token`; `viewFor` gains `results` and the completed `graphs`; `games` gains `revealed_at`; the close handler logs `disconnect`.
