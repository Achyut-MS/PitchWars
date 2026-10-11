# Startup Showdown: Plan 7 of 7, The Look (UI Design Implementation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the frontend-design skill for any judgment call about the look.

**Goal:** Give every screen the final design: the broadcast-style scoreboard strip, the two company colours that re-theme the whole screen, the phase stinger, real fonts that work offline, and a stylesheet that makes every screen from Plans 2 to 5 look like the mockup, on phones and laptops, in dark and light.

**Architecture:** Three small stylesheets (`tokens.css` colours and font names, `fonts.css` the offline font files, `app.css` the look). All colours live in `tokens.css` and nowhere else; the graph colours and the contrast test read it, so the look cannot drift. A company sets `data-company="A"` or `"B"` on the page and every "team" colour follows. Screens stay pure `render` functions (tested in Node); this plan replaces `public/render.js` and `public/render-organizer.js` with versions that carry the design markup. A **gallery page** renders every screen from realistic fixtures, so the whole design can be looked at, tested and screenshotted without running a game.

**Tech Stack:** unchanged for the game. Dev-only additions: `@fontsource/big-shoulders-display`, `@fontsource/instrument-sans`, `@expo-google-fonts/big-shoulders-display`, `@expo-google-fonts/instrument-sans` (fonts, copied once into `public/fonts`), and, on a development machine only, `playwright` and `@axe-core/playwright` for screenshots and an accessibility check. None of the dev-only packages are needed on the Pi.

**Spec:** `docs/design/ui-design-system.md` (the rules) and `docs/design/mockup.html` (the picture). Plans 1 to 5 must be built first; run the final checks again after Plan 6 on real phones.

## What was already checked while writing this plan

- The colour tokens: contrast tested for both themes (all text, muted text, team colours and the danger colour are at least 4.5:1 on all three surfaces; button text on each team colour too). Two colours were adjusted after the first check (the gold in light mode and the red on raised panels in dark mode).
- The fonts install script and the tokens tests (11 tests, passing).
- The new `render.js` and `render-organizer.js` passed all 35 render tests from Plans 2 to 5, after two deliberate edits to old tests (the wallet now shows `1,234`).
- The mockup and a gallery of every screen were opened in a headless browser at 390 px and 1100 px wide in dark mode: no sideways scrolling and no script errors. The competition screen was reviewed by eye and looks right. **The remaining screens, light mode, and real phones have not been looked at yet;** Task 7 does that.

## Global Constraints

- Everything from the Global Constraints of Plans 1 to 6 still applies.
- **Offline:** fonts, styles and scripts are served from the Pi. No external fonts or images.
- **All colours are tokens** in `public/styles/tokens.css`. No hex colour anywhere else in the CSS, and none in the render functions. (The graph images are the one exception: they use `src/graphs/theme.js`, and a test keeps that file equal to the tokens.)
- **Contrast:** body text, muted text, both team colours and the danger colour are at least **4.5:1** on `--stage`, `--panel` and `--raised`, in dark and light; button text on a team colour is at least 4.5:1.
- **Phones first:** 360 px wide with no sideways scrolling; tap targets at least 44 px; text at least 16 px (secondary text 14 px).
- **Motion:** one orchestrated moment only (the phase stinger, about 1.1 seconds). With `prefers-reduced-motion: reduce` it does not animate.
- **Colour is never the only signal:** states also have words (Owned, Requested, Shield ready), and the companies also have letters.
- **Weight budget:** `app.css` under 40 KB; the four `.woff2` files under 100 KB together; `render.js` under 30 KB.
- **No winner or loser wording** anywhere on the results screens.

## Review Focus

1. **Light mode on a bright projector or a phone in sunlight:** gold and teal text on white must stay readable (Task 1 tests the numbers; Task 7 looks at it).
2. **A name or text with HTML in it** (a player named `<b>`) must stay escaped in every new piece of markup (Task 2).
3. **A very long name or item label** must wrap or cut with an ellipsis, never push the page sideways (Task 3, Task 7).
4. **A 6 by 6 Tower or 7 by 7 Shikaku puzzle on a 360 px phone** must fit, and a colour-blind player must still be able to tell the Queens and Lits regions apart by their borders (Task 3, Task 7).
5. **The stinger on a reconnect or a page reload** must not play (there is no earlier phase to compare with) (Task 4).
6. **A class name in the markup with no style** (a typo such as `shpe`) must be caught (Task 5).
7. **Focus ring, keyboard use and screen reader names** on every control (Task 8).

## File Structure

```
public/styles/tokens.css  fonts.css  app.css          (replace the base public/styles.css of Plan 2)
public/fonts/*.woff2 *.ttf LICENSES.txt               (copied by scripts/install-fonts.js)
public/render.js  render-organizer.js                 (replaced, same exports plus the new helpers)
public/puzzles/ui.js                                  (modify: set cards use the class "setcard")
public/dev/fixtures.js  gallery.html                  (the design gallery)
public/index.html  organizer.html  app.js  organizer.js  (modify)
src/views.js                                          (modify: tier and tierCount on shop items)
src/graphs/theme.js                                   (modify: read the same values as tokens.css)
scripts/contrast.js  install-fonts.js  screenshots.mjs  a11y.mjs
test/tokens.test.js  fonts.test.js  render-design.test.js  fixtures.test.js  css-coverage.test.js  graph-theme.test.js  budget.test.js  views-tier.test.js
```

## Edits this plan makes to files from earlier plans

| File | Edit |
| --- | --- |
| `test/render.test.js` (Plan 2) | `assert.match(cmo, /1000/)` becomes `/1,000/` |
| `test/render-competition.test.js` (Plan 3) | `assert.match(html, /1234/)` becomes `/1,234/` |
| `public/styles.css` (Plan 2) | deleted; `index.html` and `organizer.html` link the three new stylesheets |
| `public/puzzles/ui.js` (Plan 4) | the Sets card class `card` becomes `setcard` (so it does not clash with panels) |
| `src/views.js` (Plan 2) | shop catalog items also carry `tier` and `tierCount` (Task 2) |
| `public/render.js`, `public/render-organizer.js` | replaced by Task 2's files; their exports used by tests are unchanged |

---

### Task 1: Fonts and colour tokens

**Files:**
- Create: `public/styles/tokens.css`, `public/styles/fonts.css`, `scripts/contrast.js`, `scripts/install-fonts.js`, `test/tokens.test.js`, `test/fonts.test.js`
- Run: `npm install --save-dev @fontsource/big-shoulders-display @fontsource/instrument-sans @expo-google-fonts/big-shoulders-display @expo-google-fonts/instrument-sans` (once, while online), then `node scripts/install-fonts.js`

**Interfaces:**
- Produces: the CSS custom properties `--stage --panel --raised --line --text --muted --a --a-ink --b --b-ink --hot --team --team-ink --display --body`; `[data-company="A"|"B"]` sets `--team` and `--team-ink`; `contrast(a, b)`, `readThemes(css)`; `installFonts(root, modules, out)`; the font files `big-shoulders-display-600.woff2`, `-700.woff2`, `instrument-sans-400.woff2`, `-700.woff2` (browser) and `BigShouldersDisplay-Bold.ttf`, `InstrumentSans-Regular.ttf`, `InstrumentSans-Bold.ttf` (the PNG graphs, Plan 5's `fontFiles()` finds them in `public/fonts`).
- This task's code and tests were run while writing this plan (11 tests passing).

- [ ] **Step 1: Write the failing tests**

`test/tokens.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, readThemes } from '../scripts/contrast.js';

const css = readFileSync('public/styles/tokens.css', 'utf8');
const themes = readThemes(css);
const setFor = (name) => ({ ...themes.dark, ...(name === 'light' ? themes.lightExplicit : {}) });

test('the light theme is the same whether it comes from the device setting or from data-theme', () => {
  assert.deepEqual(themes.lightMedia, themes.lightExplicit);
});

test('the light theme overrides every colour that matters', () => {
  for (const name of ['stage', 'panel', 'raised', 'line', 'text', 'muted', 'a', 'a-ink', 'b', 'b-ink', 'hot']) assert.ok(name in themes.lightExplicit, name);
});

for (const theme of ['dark', 'light']) {
  test(`${theme} theme: text, muted text, both team colours and the danger colour read clearly on every surface`, () => {
    const set = setFor(theme);
    for (const surface of ['stage', 'panel', 'raised']) {
      for (const fg of ['text', 'muted', 'a', 'b', 'hot']) {
        const r = contrast(set[fg], set[surface]);
        assert.ok(r >= 4.5, `${theme}: ${fg} on ${surface} is ${r.toFixed(2)}`);
      }
    }
  });
  test(`${theme} theme: button text is readable on each team colour`, () => {
    const set = setFor(theme);
    assert.ok(contrast(set['a-ink'], set.a) >= 4.5);
    assert.ok(contrast(set['b-ink'], set.b) >= 4.5);
  });
}

test('the two company colours are different in both themes', () => {
  for (const set of [setFor('dark'), setFor('light')]) assert.notEqual(set.a, set.b);
});

test('the contrast function matches known values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
});
```

`test/fonts.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installFonts, FONT_FILES } from '../scripts/install-fonts.js';

test('the fonts are copied with the right file types and a licence file', () => {
  const out = mkdtempSync(join(tmpdir(), 'fonts-'));
  try {
    const files = installFonts('.', 'node_modules', out);
    assert.equal(files.length, FONT_FILES.length);
    for (const f of files) {
      const head = readFileSync(f).subarray(0, 4);
      if (f.endsWith('.woff2')) assert.equal(head.toString('latin1'), 'wOF2', f);
      else assert.ok(head.equals(Buffer.from([0, 1, 0, 0])) || ['OTTO', 'true'].includes(head.toString('latin1')), `${f} is not a ttf`);
    }
    assert.ok(readdirSync(out).includes('LICENSES.txt'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a missing font package gives a helpful message', () => {
  assert.throws(() => installFonts('.', '/nonexistent', mkdtempSync(join(tmpdir(), 'fonts-'))), /npm install --save-dev/);
});

test('every font file the stylesheet asks for is one the installer provides', () => {
  const css = readFileSync('public/styles/fonts.css', 'utf8');
  const provided = new Set(FONT_FILES.map(([, to]) => to));
  const asked = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(asked.length >= 4);
  for (const f of asked) assert.ok(provided.has(f), f);
  assert.equal(/font-display:\s*swap/.test(css), true);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../scripts/contrast.js'`

- [ ] **Step 3: Write the files**

`public/styles/tokens.css`:

```css
/* Colour and type tokens. One source of truth: the contrast test and the graph colours read this file. */
:root {
  color-scheme: dark light;
  --stage: #0A1424;
  --panel: #101E33;
  --raised: #172A45;
  --line: #263C5C;
  --text: #E9ECF2;
  --muted: #9AAAC2;
  --a: #F5B83D;
  --a-ink: #1A1200;
  --b: #2BC4B8;
  --b-ink: #00201E;
  --hot: #FF5A68;
  --team: var(--a);
  --team-ink: var(--a-ink);
  --display: "Big Shoulders Display", "Arial Narrow", Impact, sans-serif;
  --body: "Instrument Sans", "Segoe UI", system-ui, sans-serif;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --stage: #EEF2F8;
    --panel: #FFFFFF;
    --raised: #E3EAF4;
    --line: #C5D1E2;
    --text: #0F1B2E;
    --muted: #4B5D78;
    --a: #8A5A00;
    --a-ink: #FFFFFF;
    --b: #00756D;
    --b-ink: #FFFFFF;
    --hot: #C0182B;
  }
}
:root[data-theme="light"] {
  --stage: #EEF2F8;
  --panel: #FFFFFF;
  --raised: #E3EAF4;
  --line: #C5D1E2;
  --text: #0F1B2E;
  --muted: #4B5D78;
  --a: #8A5A00;
  --a-ink: #FFFFFF;
  --b: #00756D;
  --b-ink: #FFFFFF;
  --hot: #C0182B;
}
[data-company="A"] { --team: var(--a); --team-ink: var(--a-ink); }
[data-company="B"] { --team: var(--b); --team-ink: var(--b-ink); }
```

`public/styles/fonts.css`:

```css
/* The two game fonts, served from this device (the venue has no internet). */
@font-face { font-family: "Big Shoulders Display"; font-weight: 600; font-style: normal; font-display: swap; src: url("/fonts/big-shoulders-display-600.woff2") format("woff2"); }
@font-face { font-family: "Big Shoulders Display"; font-weight: 700; font-style: normal; font-display: swap; src: url("/fonts/big-shoulders-display-700.woff2") format("woff2"); }
@font-face { font-family: "Instrument Sans"; font-weight: 400; font-style: normal; font-display: swap; src: url("/fonts/instrument-sans-400.woff2") format("woff2"); }
@font-face { font-family: "Instrument Sans"; font-weight: 700; font-style: normal; font-display: swap; src: url("/fonts/instrument-sans-700.woff2") format("woff2"); }
```

`scripts/contrast.js`:

```js
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};

// WCAG contrast ratio between two #RRGGBB colours.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Reads the --name: #hex; lines of one css block.
export function vars(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2].toUpperCase()]));
}

// Pulls out the three token sets from tokens.css: dark (default), light by media query, and light by [data-theme].
export function readThemes(css) {
  const grab = (re) => { const m = css.match(re); if (!m) throw new Error(`no block for ${re}`); return vars(m[1]); };
  return {
    dark: grab(/:root \{([^}]*)\}/),
    lightMedia: grab(/:root:not\(\[data-theme="dark"\]\) \{([^}]*)\}/),
    lightExplicit: grab(/:root\[data-theme="light"\] \{([^}]*)\}/),
  };
}
```

`scripts/install-fonts.js`:

```js
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Copies the two game fonts out of node_modules into public/fonts.
// woff2 files are for the browser; ttf files are for the PNG graphs (resvg reads ttf, not woff2).
export const FONT_FILES = [
  ['@fontsource/big-shoulders-display/files/big-shoulders-display-latin-600-normal.woff2', 'big-shoulders-display-600.woff2'],
  ['@fontsource/big-shoulders-display/files/big-shoulders-display-latin-700-normal.woff2', 'big-shoulders-display-700.woff2'],
  ['@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2', 'instrument-sans-400.woff2'],
  ['@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff2', 'instrument-sans-700.woff2'],
  ['@expo-google-fonts/big-shoulders-display/BigShouldersDisplay_700Bold.ttf', 'BigShouldersDisplay-Bold.ttf'],
  ['@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf', 'InstrumentSans-Regular.ttf'],
  ['@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf', 'InstrumentSans-Bold.ttf'],
];

export function installFonts(root = '.', modules = join(root, 'node_modules'), out = join(root, 'public', 'fonts')) {
  mkdirSync(out, { recursive: true });
  for (const [from, to] of FONT_FILES) {
    const src = join(modules, from);
    if (!existsSync(src)) throw new Error(`missing ${from}; run: npm install --save-dev @fontsource/big-shoulders-display @fontsource/instrument-sans @expo-google-fonts/big-shoulders-display @expo-google-fonts/instrument-sans`);
    copyFileSync(src, join(out, to));
  }
  const licence = ['@fontsource/big-shoulders-display', '@fontsource/instrument-sans']
    .map((p) => `${p}: SIL Open Font License 1.1\n${readFileSync(join(modules, p, 'LICENSE'), 'utf8').slice(0, 2000)}`).join('\n\n----\n\n');
  writeFileSync(join(out, 'LICENSES.txt'), licence);
  return FONT_FILES.map(([, to]) => join(out, to));
}

if (process.argv[1] && process.argv[1].endsWith('install-fonts.js')) {
  for (const f of installFonts()) console.log(`${f} ${statSync(f).size} bytes`);
}
```

- [ ] **Step 4: Install the fonts and run the tests**

Run: `npm install --save-dev @fontsource/big-shoulders-display @fontsource/instrument-sans @expo-google-fonts/big-shoulders-display @expo-google-fonts/instrument-sans && node scripts/install-fonts.js && npm test`
Expected: PASS. The fonts are small (about 15 KB per woff2 file). Both fonts are under the SIL Open Font License; `public/fonts/LICENSES.txt` keeps the licence text with them.

- [ ] **Step 5: Commit**

```bash
git add public/styles public/fonts scripts/contrast.js scripts/install-fonts.js test/tokens.test.js test/fonts.test.js package.json package-lock.json
git commit -m "feat: colour tokens with a contrast test, and offline fonts"
```

---

### Task 2: The screens' markup (scoreboard, pips, meters, stinger)

**Files:**
- Replace: `public/render.js`, `public/render-organizer.js`
- Modify: `public/puzzles/ui.js` (class `setcard`), `src/views.js` (tier fields), `test/render.test.js`, `test/render-competition.test.js` (the two comma edits)
- Create: `test/render-design.test.js`, `test/views-tier.test.js`

**Interfaces:**
- Produces from `public/render.js` (all earlier exports are kept): `esc`, `fmtClock`, `renderLogin`, `renderScreen`, `shopBody`, plus new `fmtCoins(n)` (`1234` becomes `1,234`; negative keeps its minus; non-numbers become `0`), `pct(value, max)` (whole number 0 to 100), `companyOf(view) -> 'A' | 'B' | null`, `stingerFor(previousPhase, nextPhase) -> { title, line } | null`, `renderStinger(stinger) -> html`.
- Markup contract (the CSS in Task 3 depends on it): the scoreboard is `<header class="score">` with `.side.left` (`.who` and `.wallet`), `.clockbox` (`role="timer"`, `#clock`, a `small` phase name) and `.side.right`; panels are `.panel` (plus `.team` or `.command`); shop rows are `li.item.<state>` with `.name`, `.pips`, `.pill`, `.actions`, `.price`; ideas are `article.idea` with `.votebar > i` whose width is `pct(votes, 5)` percent; sales meters are `.meters > .meter` with `.v`, `.bar` (height `pct(rate, 31)` percent, at least 3) and `.n`; attack tiles are `button.tile` inside `.tiles`; the Competition page is `main.deck` with two `.stack` columns.
- `src/views.js`: each shop catalog item gets `tier` (the item's tier points, or `null`) and `tierCount` (how many items of the same family have tier points, or `null`).
- The two new render files were run against all 35 render tests of Plans 2 to 5 while writing this plan (all passing after the two comma edits listed above).

- [ ] **Step 1: Write the failing tests**

`test/render-design.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtCoins, pct, companyOf, renderScreen, stingerFor, renderStinger, esc } from '../public/render.js';
import { FIXTURES } from '../public/dev/fixtures.js';

const fx = (id) => FIXTURES.find((f) => f.id === id).view;

test('coins get a thousands separator and keep their minus sign', () => {
  assert.equal(fmtCoins(1234), '1,234');
  assert.equal(fmtCoins(1234567), '1,234,567');
  assert.equal(fmtCoins(0), '0');
  assert.equal(fmtCoins(-205), '-205');
  assert.equal(fmtCoins(-1500), '-1,500');
  assert.equal(fmtCoins('12.6'), '13');
  assert.equal(fmtCoins(NaN), '0');
  assert.equal(fmtCoins(undefined), '0');
});

test('pct is a whole percentage kept between 0 and 100', () => {
  assert.equal(pct(3, 5), 60);
  assert.equal(pct(0, 5), 0);
  assert.equal(pct(9, 5), 100);
  assert.equal(pct(-1, 5), 0);
  assert.equal(pct(1, 0), 0);
  assert.equal(pct(6.5, 31), 21);
});

test('only a player in a running game gives the page a company colour', () => {
  assert.equal(companyOf(fx('ideation-ceo')), 'A');
  assert.equal(companyOf(fx('ideation-cto')), 'B');
  assert.equal(companyOf(fx('lobby')), null);
  assert.equal(companyOf({ screen: 'graphs', me: { company: 'A' } }), null);
  assert.equal(companyOf(null), null);
  assert.equal(companyOf({ screen: 'game', me: { company: 'Z' } }), null);
});

test('the scoreboard shows company, role, a grouped wallet, the clock with an accessible name, and the phase', () => {
  const html = renderScreen(fx('competition-cmo-hint'));
  assert.match(html, /<header class="score">/);
  assert.match(html, /<b>Company A<\/b> CMO/);
  assert.match(html, /<b>1,214<\/b><i>coins<\/i>/);
  assert.match(html, /role="timer" aria-label="Time left"/);
  assert.match(html, /id="clock">10:12</);
  assert.match(html, /<small>Competition<\/small>/);
  assert.match(html, /Sales 57\.5 per minute/);
});

test('a negative wallet shows its minus sign', () => {
  const v = { ...fx('competition-cmo-hint'), wallet: -205 };
  assert.match(renderScreen(v), /<b>-205<\/b>/);
});

test('shop rows show tier dots: filled for the tier, empty for the rest, with a text label', () => {
  const html = renderScreen(fx('shop-cmo'));
  const medium = html.split('Target User (Medium group)')[1].split('</li>')[0];
  assert.match(medium, /aria-label="Tier 2 of 3"/);
  assert.equal((medium.match(/<s class="on">/g) || []).length, 2);
  assert.equal((medium.match(/<s class="">/g) || []).length, 1);
  const brand = html.split('Brand name')[1].split('</li>')[0];
  assert.equal(brand.includes('class="pips"'), false);
});

test('idea cards fill a vote bar by the share of five voters, and mark the player vote', () => {
  const html = renderScreen(fx('ideation-ceo'));
  assert.match(html, /<i style="width:60%"><\/i>/);
  assert.match(html, /article class="idea mine"/);
  assert.match(html, /3 votes, your vote/);
});

test('sales meters are as tall as the rate is high, and never vanish', () => {
  const html = renderScreen(fx('competition-cmo-hint'));
  assert.match(html, /<span class="v">31<\/span><div class="bar" style="height:100%">/);
  assert.match(html, /<span class="v">6\.5<\/span><div class="bar" style="height:21%">/);
  const zero = renderScreen({ ...fx('competition-cmo-hint'), competition: { ...fx('competition-cmo-hint').competition, rates: { CTO: 0, CMO: 0, COO: 0, total: 0 } } });
  assert.match(zero, /style="height:3%"/);
});

test('attack tiles are all disabled during the cooldown and enabled when ready', () => {
  const locked = renderScreen(fx('competition-ceo'));
  assert.equal((locked.match(/class="tile"/g) || []).length, 9);
  assert.equal((locked.match(/class="tile" data-send='[^']*' disabled/g) || []).length, 9);
  assert.match(locked, /Ready in 37 s/);
  const ready = renderScreen(fx('competition-ceo-ready'));
  assert.equal((ready.match(/class="tile" data-send='[^']*' disabled/g) || []).length, 0);
});

test('the last ten seconds turn the clock red and show the banner', () => {
  const html = renderScreen(fx('competition-last10'));
  assert.match(html, /id="clock" class="red">0:08</);
  assert.match(html, /class="banner last10"/);
});

test('hostile text is escaped in the new markup too', () => {
  const v = fx('shop-cmo');
  v.me = { ...v.me, name: '<img src=x onerror=alert(1)>' };
  v.shop = { ...v.shop, catalog: v.shop.catalog.map((i) => ({ ...i, label: '<b>x</b>' })) };
  const html = renderScreen(v);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('<b>x</b>'), false);
  assert.match(html, /&lt;img src=x/);
});

test('the stinger shows only when the phase really changes', () => {
  assert.deepEqual(stingerFor('shop', 'competition'), { title: 'Competition', line: '16 minutes. Build your lead.' });
  assert.deepEqual(stingerFor('briefing', 'ideation'), { title: 'Ideation', line: 'Pick your idea.' });
  assert.equal(stingerFor('shop', 'shop'), null);
  assert.equal(stingerFor(null, 'shop'), null);
  assert.equal(stingerFor(undefined, 'competition'), null);
  assert.equal(stingerFor('shop', 'nonsense'), null);
  assert.equal(stingerFor('shop', null), null);
});

test('the stinger markup is a status message, and nothing renders for null', () => {
  assert.match(renderStinger({ title: 'Shop', line: 'Build your product.' }), /^<div class="stinger" role="status"><b>Shop<\/b><small>Build your product\.<\/small><\/div>$/);
  assert.equal(renderStinger(null), '');
  assert.equal(esc('<'), '&lt;');
});

test('the results screens never say winner or loser', () => {
  const svg = { companyVsCompany: '<svg></svg>', coinDifference: '<svg></svg>', roleBars: '<svg></svg>' };
  for (const v of [{ screen: 'graphs', me: { name: 'A' }, gameId: 1, graphs: svg }, { ...fx('ended'), results: svg }]) {
    assert.equal(/winner|loser|won|lost|victory|defeat/i.test(renderScreen(v)), false);
  }
});
```

`test/views-tier.test.js` (uses the Plan 2 helpers):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { viewFor } from '../src/views.js';

function shopView(role) {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  return viewFor(h.ctx, h.seat.A[role]).shop.catalog;
}

test('tiered items carry their tier and how many tiers the family has', () => {
  const c = shopView('CMO');
  assert.deepEqual([c.find((i) => i.id === 'M01-M').tier, c.find((i) => i.id === 'M01-M').tierCount], [2, 3]);
  assert.deepEqual([c.find((i) => i.id === 'O05-F').tier, c.find((i) => i.id === 'O05-F').tierCount], [2, 2]);
});

test('items without tiers have none', () => {
  const c = shopView('CTO');
  assert.deepEqual([c.find((i) => i.id === 'HC01').tier, c.find((i) => i.id === 'HC01').tierCount], [null, null]);
  assert.deepEqual([c.find((i) => i.id === 'O01').tier, c.find((i) => i.id === 'O01').tierCount], [null, null]);
});
```

Edit `test/render.test.js` and `test/render-competition.test.js` as listed in the table above.

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL (`fmtCoins` is not exported; `../public/dev/fixtures.js` is missing; `tier` is undefined)

- [ ] **Step 3: Write the implementation**

Create `public/dev/fixtures.js` first (Task 5 explains it; the tests above need it): copy it from Task 5.

`public/render.js` (replaces the Plan 2 to 5 version):

```js
// Every screen the player sees, as pure functions that return HTML strings.
// Tested in Node (no browser needed). Styling lives in public/styles/app.css.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// 1234 becomes "1,234"; negatives keep their minus sign.
export const fmtCoins = (n) => {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// A share of a maximum as a whole percentage between 0 and 100.
export const pct = (value, max) => (max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0);

// Which company colours the page: 'A', 'B', or null for the login, the lobby and the organizer.
export const companyOf = (view) => (view && view.screen === 'game' && view.me && (view.me.company === 'A' || view.me.company === 'B') ? view.me.company : null);

// A button that sends one message. The JSON sits in a single-quoted attribute, so single quotes become &#39;.
const send = (label, msg, cls = '', extra = '') =>
  `<button class="${cls}" data-send='${JSON.stringify(msg).replace(/'/g, '&#39;')}'${extra}>${esc(label)}</button>`;

export function renderLogin(error) {
  return `<main class="login"><form id="login" class="panel">
  <h1>Startup Showdown</h1>
  <p class="muted">Type your Admission ID to join.</p>
  <label>Admission ID <input name="id" autocomplete="off" autocapitalize="characters" autofocus></label>
  <button type="submit" class="primary">Enter</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form></main>`;
}

const PHASE_NAMES = { briefing: 'Briefing', ideation: 'Ideation', shop: 'Shop', summary: 'Summary', competition: 'Competition', ended: 'Finished' };

// The scoreboard strip: company and wallet on the left, the clock in the middle, name and sales on the right.
function scoreboard(v) {
  const { me, clock, wallet } = v;
  const sales = v.competition ? `<span class="muted">Sales ${esc(v.competition.rates.total)} per minute</span>` : '';
  return `<header class="score">
  <div class="side left"><span class="who"><b>Company ${esc(me.company)}</b> ${esc(me.role)}</span>
    <span class="wallet"><b>${fmtCoins(wallet)}</b><i>coins</i></span></div>
  <div class="clockbox" role="timer" aria-label="Time left"><span id="clock"${clock.warning === 'last10' ? ' class="red"' : ''}>${fmtClock(clock.remainingSec)}</span><small>${esc(PHASE_NAMES[clock.phase] ?? clock.phase)}</small></div>
  <div class="side right"><span class="who">${esc(me.name)}</span>${sales}</div>
</header>`;
}

function ownedPanel(v) {
  if (!v.owned.length) return '<p class="muted">Nothing bought yet.</p>';
  return `<ul class="owned">${v.owned.map((o) => `<li><span>${esc(o.label)}</span><span class="price">${fmtCoins(o.charged)}</span></li>`).join('')}</ul>`;
}

function briefing(v) {
  return `${scoreboard(v)}<main class="narrow"><section class="panel team">
  <p class="muted">Your role</p><h2 class="role">${esc(v.me.role)}</h2>
  <h3>${esc(v.problem.title)}</h3><p>${esc(v.problem.statement)}</p>
  <p class="muted">The game starts when the countdown ends.</p></section></main>`;
}

function ideation(v) {
  const { ideas, picked, canPick } = v.ideation;
  const cards = ideas.map((i) => `<article class="idea${i.mine ? ' mine' : ''}">
    <h3>${esc(i.name)} <small>${esc(i.type)}</small></h3><p class="muted">${esc(i.description)}</p>
    <div class="votebar" aria-hidden="true"><i style="width:${pct(i.votes, 5)}%"></i></div>
    <p class="votes">${esc(i.votes)} votes${i.mine ? ', your vote' : ''}</p>
    ${picked ? '' : send(i.mine ? 'Your vote' : 'Vote', { type: 'vote', ideaId: i.id }, i.mine ? '' : 'ghost')}
    ${canPick ? send('Pick this idea', { type: 'pick', ideaId: i.id }, 'primary') : ''}
  </article>`).join('');
  return `${scoreboard(v)}<main><h2>${esc(v.problem.title)}</h2>
  ${picked ? `<p class="notice">Your company picked ${esc(ideas.find((i) => i.id === picked)?.name ?? picked)}. Waiting for the other company.</p>` : ''}
  <div class="ideas">${cards}</div></main>`;
}

function pips(it) {
  if (it.tier == null || !it.tierCount) return '';
  const dots = Array.from({ length: it.tierCount }, (_, k) => `<s class="${k < it.tier ? 'on' : ''}"></s>`).join('');
  return ` <span class="pips" aria-label="Tier ${esc(it.tier)} of ${esc(it.tierCount)}">${dots}</span>`;
}

function catalogItem(it) {
  const buy = [];
  if (it.canRequest) {
    if (it.choices) it.choices.forEach((c, n) => buy.push(send(c, { type: 'request', itemId: it.id, choice: n + 1 }, 'ghost')));
    else buy.push(send('Request', { type: 'request', itemId: it.id }, 'ghost'));
  }
  if (it.canRecommend) {
    if (it.choices) it.choices.forEach((c, n) => buy.push(send(`Recommend ${c}`, { type: 'recommend', itemId: it.id, choice: n + 1 }, 'ghost')));
    else buy.push(send('Recommend', { type: 'recommend', itemId: it.id }, 'ghost'));
  }
  const status = it.state === 'owned' ? '<em class="pill">Owned</em>' : it.state === 'requested' ? '<em class="pill">Requested</em>' : it.state === 'wait' ? `<em class="pill">${esc(it.note)}</em>` : '';
  return `<li class="item ${esc(it.state)}"><span class="name">${esc(it.label)}${pips(it)}</span>${status}
    <span class="actions">${buy.join('')}</span><span class="price">${fmtCoins(it.price)}</span></li>`;
}

function queueList(v) {
  const q = v.shop.queue;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req${r.head ? ' head' : ''}"><span class="name">${esc(r.label)}<small>from ${esc(r.by)}${r.recommended ? ', CEO recommends' : ''}</small></span>
    <span class="actions">${r.head && v.me.role === 'CFO' ? send('Approve', { type: 'cfo_decide', requestId: r.id, approve: true }, 'primary') + send('Reject', { type: 'cfo_decide', requestId: r.id, approve: false }, 'ghost') : ''}</span>
    <span class="price">${fmtCoins(r.price)}</span></li>`).join('');
  return `<section class="panel team"><h3>CFO queue</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">No requests waiting.</p>'}</section>`;
}

function awaitingList(v) {
  const q = v.shop.awaitingCeo;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req"><span class="name">${esc(r.label)}<small>suggested by ${esc(r.by)}</small></span>
    <span class="actions">${send('Approve feature', { type: 'ceo_decide', requestId: r.id, approve: true }, 'primary')}${send('Reject', { type: 'ceo_decide', requestId: r.id, approve: false }, 'ghost')}</span>
    <span class="price">${fmtCoins(r.price)}</span></li>`).join('');
  return `<section class="panel team"><h3>Features waiting for you</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">None.</p>'}</section>`;
}

// Everything below the scoreboard in the shop. The caller supplies the page container.
export function shopBody(v) {
  const sections = [...new Set(v.shop.catalog.map((i) => i.section))];
  const lists = sections.map((s) => `<section class="panel"><h3>${esc(s)}</h3><ul>${v.shop.catalog.filter((i) => i.section === s).map(catalogItem).join('')}</ul></section>`).join('');
  const mine = v.shop.mine.length ? `<section class="panel"><h3>My requests</h3><ul>${v.shop.mine.map((r) => `<li class="item"><span class="name">${esc(r.label)}</span><em class="pill">${esc(r.status)}</em></li>`).join('')}</ul></section>` : '';
  return `${v.idea ? `<p class="product">Product: <b>${esc(v.idea.name)}</b></p>` : ''}
  ${awaitingList(v)}${queueList(v)}${mine}${lists}
  <section class="panel"><h3>Our product</h3>${ownedPanel(v)}</section>`;
}

function shop(v) {
  return `${scoreboard(v)}<main class="narrow stack">${shopBody(v)}</main>`;
}

function summary(v) {
  const s = v.summary;
  return `${scoreboard(v)}<main class="narrow"><section class="panel team"><h2>${esc(s.idea?.name ?? 'No idea picked')}</h2>
  ${s.owned.length ? `<ul class="owned">${s.owned.map((o) => `<li><span>${esc(o.label)}</span><span class="price">${fmtCoins(o.charged)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing was bought.</p>'}
  <p class="big">${fmtCoins(s.wallet)} <small>coins left</small></p></section></main>`;
}

const BANNERS = {
  '5min': '5 minutes left',
  '2min': '2 minutes left',
  '30s': '30 seconds left: the shop is closed',
  last10: 'Last 10 seconds',
};

const METER_MAX = 31; // the highest a single role can earn per minute

function ratesPanel(c) {
  const r = c.rates;
  const meter = (name, value) => `<div class="meter"><span class="v">${esc(value)}</span><div class="bar" style="height:${Math.max(3, pct(value, METER_MAX))}%"></div><span class="n">${name}</span></div>`;
  return `<section class="panel team rates" aria-label="Sales per minute"><h3>Sales per minute</h3>
  <div class="meters">${meter('CTO', r.CTO)}${meter('CMO', r.CMO)}${meter('COO', r.COO)}</div>
  <p class="total"><span class="muted">Whole company</span><b>${esc(r.total)}</b> <small>coins per minute</small></p></section>`;
}

function attackPanel(c) {
  const a = c.attack;
  if (!a) return '';
  const lock = a.lockedReason === 'cooldown' ? `Ready in ${a.cooldownLeftSec} s` : a.lockedReason === 'last minute' ? 'Attacks are closed for the last minute' : '';
  const tiles = a.options.map((o) => `<button class="tile" data-send='${JSON.stringify({ type: 'attack', key: o.key }).replace(/'/g, '&#39;')}'${a.lockedReason ? ' disabled' : ''}><b>${esc(o.name)}</b><span>${esc(o.cost)}</span></button>`).join('');
  return `<section class="panel command attacks"><h3>Attacks</h3>${lock ? `<p class="muted">${esc(lock)}</p>` : ''}<div class="tiles">${tiles}</div></section>`;
}

function shieldPanel(c) {
  if (!c.shield) return '';
  const t = !c.shield.owned ? 'No shield' : c.shield.used ? 'Shield used' : 'Shield ready';
  return `<section class="panel shield${c.shield.owned && !c.shield.used ? ' ready' : ''}"><h3>${esc(t)}</h3></section>`;
}

function hintCard(c) {
  if (!c.hint) return '';
  return `<aside class="hint" aria-label="Hint"><details open><summary>Hint</summary><p>${esc(c.hint.text)}</p></details></aside>`;
}

function puzzlePanel(v) {
  const c = v.competition;
  if (v.me.role !== 'CFO' || !('puzzle' in c)) return '';
  if (!c.puzzle) {
    return `<section class="panel puzzle"><h3>Puzzles</h3><p class="muted">Puzzles are optional. Solved puzzles earn coins.</p>${send('Start a puzzle', { type: 'puzzle_next' }, 'primary')}</section>`;
  }
  const p = c.puzzle;
  const skip = p.skipsFreeLeft > 0 ? `Free skips left: ${p.skipsFreeLeft}` : 'Skipping now costs 10 coins';
  return `<section class="panel puzzle"><h3>${esc(p.name)} <small>level ${esc(p.level)}, ${esc(p.reward)} coins</small></h3>
  <div id="puzzle-slot" data-puzzle-id="${esc(p.id)}" data-kind="${esc(p.kind)}"></div>
  <div class="actions"><button id="puzzle-submit" class="primary">Check answer</button>${send('Skip', { type: 'puzzle_skip' }, 'ghost')}</div>
  <p class="muted">${esc(skip)}</p></section>`;
}

function competition(v) {
  const c = v.competition;
  const banner = v.clock.warning ? `<p class="banner ${esc(v.clock.warning)}" role="status">${esc(BANNERS[v.clock.warning])}</p>` : '';
  const notices = c.notices.map((n) => `<p class="notice" role="status">${esc(n)}</p>`).join('');
  return `${scoreboard(v)}${banner}${notices}<main class="deck">
  <div class="stack">${hintCard(c)}${ratesPanel(c)}${attackPanel(c)}${shieldPanel(c)}${puzzlePanel(v)}</div>
  <div class="stack">${shopBody(v)}</div></main>`;
}

function graphsHtml(g) {
  return `<main class="results"><section class="panel">${g.companyVsCompany}</section><section class="panel">${g.coinDifference}</section><section class="panel">${g.roleBars}</section></main>`;
}

const thanks = '<main class="narrow"><section class="panel thanks"><h2>Thank you for playing</h2></section></main>';

export function renderScreen(v) {
  if (v.screen === 'lobby') return `<main class="narrow"><section class="panel"><h2>Hello ${esc(v.me.name)}</h2><p>Waiting for the organizer to start the game.</p></section></main>`;
  if (v.screen === 'graphs') return v.graphs ? `<main class="narrow"><h2>Game ${esc(v.gameId)}</h2></main>${graphsHtml(v.graphs)}` : thanks;
  if (v.screen !== 'game') return '<main class="narrow"><section class="panel"><p>Something went wrong. Please reload.</p></section></main>';
  switch (v.clock.phase) {
    case 'briefing': return briefing(v);
    case 'ideation': return ideation(v);
    case 'shop': return shop(v);
    case 'competition': return competition(v);
    case 'summary': return summary(v);
    default: return v.results ? graphsHtml(v.results) : thanks;
  }
}

// The phase-change banner. stingerFor returns null when nothing should show.
const STINGERS = {
  briefing: ['Briefing', 'Meet your role.'],
  ideation: ['Ideation', 'Pick your idea.'],
  shop: ['Shop', 'Build your product.'],
  summary: ['Ready', 'Here is what you built.'],
  competition: ['Competition', '16 minutes. Build your lead.'],
  ended: ['Finished', 'Thank you for playing.'],
};
export function stingerFor(previous, next) {
  if (!previous || !next || previous === next || !STINGERS[next]) return null;
  return { title: STINGERS[next][0], line: STINGERS[next][1] };
}
export const renderStinger = (s) => (s ? `<div class="stinger" role="status"><b>${esc(s.title)}</b><small>${esc(s.line)}</small></div>` : '');
```

`public/render-organizer.js` (replaces the Plan 2 to 5 version):

```js
import { esc, fmtClock, fmtCoins } from './render.js';

const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

function seatSelect(p) {
  const co = ['A', 'B'].map((c) => `<option value="${c}"${p.company === c ? ' selected' : ''}>${c}</option>`).join('');
  const ro = ROLES.map((r) => `<option value="${r}"${p.role === r ? ' selected' : ''}>${r}</option>`).join('');
  return `<select data-assign="${esc(p.admission_id)}" data-field="company" aria-label="Company"><option value="">-</option>${co}</select>
          <select data-assign="${esc(p.admission_id)}" data-field="role" aria-label="Role"><option value="">-</option>${ro}</select>`;
}

function lobby(v) {
  const seated = v.participants.filter((p) => p.status === 'lobby' && p.company && p.role).length;
  const rows = v.participants.map((p) => `<tr><td>${esc(p.admission_id)}</td><td>${esc(p.name)}</td><td><span class="pill">${esc(p.status)}</span></td>
    <td>${p.status === 'lobby' ? seatSelect(p) : `${esc(p.company ?? '')} ${esc(p.role ?? '')}`}</td></tr>`).join('');
  const problems = v.problems.map((p) => `<option value="${esc(p.id)}">${esc(p.id)}. ${esc(p.title)}</option>`).join('');
  return `<section class="panel"><h2>Roster</h2>
  <textarea id="roster" rows="4" placeholder="admission_id,name (one per line)"></textarea>
  <div class="actions"><button id="import" class="ghost">Import roster</button></div>
  <p class="actions"><input id="add-id" placeholder="Admission ID"> <input id="add-name" placeholder="Name"> <button id="add" class="ghost">Add participant</button></p></section>
  <section class="panel"><h2>Lobby</h2><p class="big">${seated} of 10 seats filled</p>
  <div class="scroll"><table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Seat</th></tr></thead><tbody>${rows}</tbody></table></div></section>
  <section class="panel team"><h2>Start</h2><label>Problem statement <select id="problem">${problems}</select></label>
  <div class="actions"><button id="start" class="primary">Start game</button></div></section>`;
}

function panel(name, c, puzzles) {
  const votes = Object.entries(c.votes).map(([id, n]) => `${esc(id)}: ${esc(n)}`).join(', ');
  const items = c.owned.length ? c.owned.map((o) => `<li><span>${esc(o.label)}</span><span class="price">${fmtCoins(o.charged)}</span></li>`).join('') : '<li class="muted">Nothing bought</li>';
  const queue = c.queue.length ? c.queue.map((r) => `<li><span>${esc(r.label)} (${esc(r.by)})</span></li>`).join('') : '<li class="muted">Queue empty</li>';
  const pz = puzzles ? `<p class="muted">Puzzles: ${esc(puzzles.solved)} solved, ${esc(puzzles.skipped)} skipped, ${fmtCoins(puzzles.coins)} coins</p>` : '';
  return `<section class="panel team" data-company="${esc(name)}"><h2>Company ${esc(name)}</h2>
  <p class="big">${fmtCoins(c.wallet)} <small>coins</small></p>
  <p>Idea: ${c.idea ? `${esc(c.idea.name)} <span class="pill">${esc(c.pickSource ?? '')}</span>` : '<span class="muted">not picked</span>'}</p>
  ${votes ? `<p class="muted">Votes: ${votes}</p>` : ''}${pz}
  <h3>Bought</h3><ul class="owned">${items}</ul><h3>CFO queue</h3><ul>${queue}</ul></section>`;
}

function control(g) {
  const ev = (key, label) => `<button id="ev-${key}"${g.eventUsed ? ' disabled' : ''} class="ghost">${label}</button>`;
  const attacks = g.attacks ?? [];
  const log = attacks.length
    ? attacks.map((a) => `<li>Company ${esc(a.attacker)} attacked Company ${esc(a.victim)}: <b>${esc(a.name)}</b> (${esc(a.cost)} coins)${a.blocked ? ' <span class="pill">blocked by a shield</span>' : ''}<small>by ${esc(a.by)}</small></li>`).join('')
    : '<li class="muted">No attacks yet</li>';
  const ending = g.ended
    ? `<section class="panel team"><h2>The game has ended</h2><div class="actions">
        ${g.revealed ? '<span class="pill">Graphs revealed</span>' : '<button id="reveal" class="primary">Reveal graphs</button>'}</div></section>` : '';
  const downloads = g.revealed
    ? `<section class="panel"><h2>Downloads</h2><ul class="links">
        <li><a href="/export/game/${esc(g.id)}.xlsx" data-export>Download this game (Excel)</a></li>
        <li><a href="/export/event.xlsx" data-export>Download the whole event (Excel)</a></li>
        <li><a data-graph href="/export/game/${esc(g.id)}/company-vs-company.png">Graph: company against company (PNG)</a></li>
        <li><a data-graph href="/export/game/${esc(g.id)}/coin-difference.png">Graph: coin difference (PNG)</a></li>
        <li><a data-graph href="/export/game/${esc(g.id)}/role-bars.png">Graph: role bars (PNG)</a></li></ul></section>` : '';
  return `${ending}${downloads}
  <section class="panel command"><h2>Attacks (real cause)</h2><ul class="log">${log}</ul></section>
  <section class="panel"><h2>Market event (one per game)</h2><div class="actions">${ev('demand_surge', 'Demand Surge')}${ev('demand_slump', 'Demand Slump')}${ev('shop_sale', 'Shop Sale')}</div>
  ${g.eventUsed ? `<p class="muted">Used: ${esc(g.eventUsed)}</p>` : ''}</section>
  <section class="panel"><h2>Coin injection (once, up to 500)</h2><div class="actions">
  <select id="inject-company" aria-label="Company"><option>A</option><option>B</option></select>
  <input id="inject-coins" type="number" min="1" max="500" value="100" aria-label="Coins">
  <button id="inject-go"${g.injectionUsed ? ' disabled' : ''} class="ghost">Add coins</button></div>
  ${g.injectionUsed ? `<p class="muted">Added ${esc(g.injectionUsed.coins)} coins to Company ${esc(g.injectionUsed.company)}</p>` : ''}</section>
  <section class="panel"><h2>Next game</h2><div class="actions"><button id="next-game" class="ghost">Next Game</button></div></section>`;
}

export function renderOrganizer(v, backup = v.backup) {
  const status = backup ? `<p class="${backup.ok ? 'muted' : 'error'}" role="status">${backup.ok ? `Last backup ${new Date(backup.at).toISOString().slice(11, 16)}, ok` : `Backup failed: ${esc(backup.message)}`}</p>` : '';
  if (!v.game) return `<main class="wide">${lobby(v)}${status}</main>`;
  const { clock, companies, puzzles } = v.game;
  return `<header class="score organizer"><div class="side left"><span class="who"><b>Game ${esc(v.game.id)}</b></span></div>
  <div class="clockbox" role="timer" aria-label="Time left"><span id="clock">${fmtClock(clock.remainingSec)}</span><small>${esc(clock.phase)}</small></div>
  <div class="side right">${status}</div></header>
  <main class="wide two">${panel('A', companies.A, puzzles && puzzles.A)}${panel('B', companies.B, puzzles && puzzles.B)}<div class="stack full">${control(v.game)}</div></main>`;
}
```

In `public/puzzles/ui.js`, in the `sets` render, change the class string `card c${colour} f${fill}...` to `setcard c${colour} f${fill}...`.

In `src/views.js`, in the `shopView` catalog `map`, add two fields to the returned object:

```js
          tier: item.tierPoints,
          tierCount: item.tierPoints == null ? null : ctx.data.catalog.filter((i) => i.family === item.family && i.tierPoints != null).length,
```

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS, including all render tests from Plans 2 to 5 (with the two comma edits).

- [ ] **Step 5: Commit**

```bash
git add public src test
git commit -m "feat: design markup for every screen: scoreboard, pips, meters, stinger"
```

---

### Task 3: The stylesheet

**Files:**
- Create: `public/styles/app.css`
- Delete: `public/styles.css`
- Modify: `public/index.html`, `public/organizer.html` (link the three stylesheets, add `#stinger` and `#toast`)

**Interfaces:**
- Consumes: the markup contract of Task 2 and the tokens of Task 1.
- Produces: the look in `docs/design/ui-design-system.md`: the cut-corner scoreboard strip with the team-coloured rule, panels separated by a left rule (not identical rounded cards), square corners, the display font for numbers and headings, tabular numbers, 44 px tap targets, tier dots, vote bars, gradient sales meters, a dark red command deck, a 3 by 3 attack grid (2 columns on small phones), a sticky hint, puzzle grids that shrink to fit 360 px, the phase stinger, the results page, and the organizer tables.
- Phone rules: below 520 px the scoreboard's right column hides the "sales per minute" text so the company and the clock do not squeeze; below 820 px the two-column pages become one column.

- [ ] **Step 1: Write the failing test**

Task 5's `css-coverage.test.js` and `budget.test.js` are the tests for this task. Write them first (their text is in Task 5), run them, and see them fail because `app.css` does not exist.

- [ ] **Step 2: Write the stylesheet**

`public/styles/app.css`:

```css
/* Startup Showdown: the look. Colours come from tokens.css; see docs/design/ui-design-system.md. */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--stage); color: var(--text); font: 400 16px/1.5 var(--body); }
h1, h2, h3 { margin: 0 0 .4em; font-family: var(--display); font-weight: 700; line-height: 1.1; }
h1 { font-size: clamp(2.6rem, 9vw, 3.8rem); } h2 { font-size: 1.9rem; } h3 { font-size: 1.3rem; }
h3 small, h2 small { font: 400 .85rem var(--body); color: var(--muted); margin-left: .4em; }
p { margin: 0 0 .7em; }
small { color: var(--muted); }
.muted { color: var(--muted); }
.error { color: var(--hot); font-weight: 700; }
.big { font-family: var(--display); font-size: 2.2rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.big small { font: 400 1rem var(--body); }
:focus-visible { outline: 3px solid var(--text); outline-offset: 2px; }

/* The scoreboard strip: the one bold element */
.score { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: 1fr auto 1fr; background: var(--panel);
  border-bottom: 4px solid var(--team); clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 22px 100%, 0 calc(100% - 22px)); }
.score .side { display: flex; flex-direction: column; justify-content: center; padding: 10px 28px; min-width: 0; }
.score .side.right { align-items: flex-end; text-align: right; }
.who { color: var(--muted); font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.who b { color: var(--team); }
.wallet { font-family: var(--display); font-weight: 700; line-height: 1; white-space: nowrap; }
.wallet b { font-size: clamp(1.9rem, 6vw, 2.9rem); font-variant-numeric: tabular-nums; }
.wallet i { font: 600 .95rem var(--display); color: var(--team); margin-left: .35em; letter-spacing: .02em; }
.clockbox { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 28px; background: var(--raised); min-width: 8.5rem; }
#clock { font-family: var(--display); font-weight: 700; font-size: clamp(2.7rem, 10vw, 4.6rem); line-height: 1; font-variant-numeric: tabular-nums; }
#clock.red { color: var(--hot); }
.clockbox small { font: 600 .8rem/1.2 var(--body); }
.banner { margin: 0; padding: 8px 20px; background: var(--team); color: var(--team-ink); font-weight: 700; }
.banner.last10, .banner[class~="30s"] { background: var(--hot); color: var(--stage); }
.notice { margin: 0; padding: 10px 20px; background: var(--panel); border-left: 4px solid var(--hot); }
.score.organizer { --team: var(--text); }

/* Page containers */
main { max-width: 760px; margin: 0 auto; padding: 16px; display: block; }
main.narrow { max-width: 640px; }
main.wide { max-width: 1100px; }
main.deck { max-width: 1100px; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 20px; align-items: start; }
main.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.full { grid-column: 1 / -1; }
.stack > * + *, main.stack > * + * { margin-top: 16px; }
@media (max-width: 820px) { main.deck, main.two { grid-template-columns: 1fr; } }
@media (max-width: 520px) {
  .score .side { padding: 8px 12px; }
  .clockbox { padding: 4px 14px; min-width: 6.4rem; }
  .score .side.right .muted { display: none; }
  main { padding: 12px; }
}

/* Panels: separated by a left rule, not by identical cards */
.panel { background: var(--panel); padding: 16px 18px; border-left: 3px solid var(--line); }
.panel.team { border-left-color: var(--team); }
.panel.command { background: color-mix(in srgb, var(--hot) 9%, var(--panel)); border-left-color: var(--hot); }
.product { margin: 0 0 4px; color: var(--muted); } .product b { color: var(--text); font-family: var(--display); font-size: 1.25rem; }

/* Buttons and fields */
button { min-height: 44px; padding: 0 18px; border: 1px solid var(--line); background: var(--raised); color: var(--text); font: 700 1rem var(--body); cursor: pointer; margin: 4px 6px 4px 0; border-radius: 0; }
button.primary { background: var(--team); border-color: var(--team); color: var(--team-ink); }
button.ghost { background: transparent; }
button:disabled { opacity: .45; cursor: not-allowed; }
input, select, textarea { min-height: 44px; font: 400 1rem var(--body); padding: 6px 10px; border: 1px solid var(--line); background: var(--panel); color: var(--text); max-width: 100%; border-radius: 0; }
textarea { width: 100%; }
label { display: block; margin-bottom: .6em; color: var(--muted); }
label input, label select { display: block; width: 100%; margin-top: 4px; color: var(--text); }
.actions { display: flex; flex-wrap: wrap; align-items: center; }
.pill { display: inline-block; font: 400 .8rem/1.6 var(--body); font-style: normal; padding: 0 8px; background: var(--raised); color: var(--muted); }

/* Lists: shop rows, queue, owned */
ul { list-style: none; margin: 0; padding: 0; }
li.item, li.req, ul.owned li, ul.log li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
li:last-child { border-bottom: 0; }
.name { flex: 1 1 11rem; min-width: 0; overflow-wrap: anywhere; }
.name small { display: block; }
.price { font-family: var(--display); font-weight: 700; font-size: 1.35rem; font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
ul.owned li { justify-content: space-between; }
li.item.owned { opacity: .6; }
li.req.head { background: color-mix(in srgb, var(--team) 10%, transparent); margin: 0 -18px; padding-left: 18px; padding-right: 18px; }
.pips { display: inline-flex; gap: 4px; margin-left: 6px; vertical-align: middle; }
.pips s { display: block; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--muted); }
.pips s.on { background: var(--team); border-color: var(--team); }

/* Ideation */
.ideas { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.idea { background: var(--panel); padding: 14px 16px; border-top: 3px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
.idea.mine { border-top-color: var(--team); }
.idea h3 { margin: 0; font-size: 1.4rem; }
.idea p { margin: 0; }
.votebar { height: 8px; background: var(--raised); } .votebar i { display: block; height: 100%; background: var(--team); transition: width .15s; }
.votes { color: var(--muted); font-size: .9rem; }
.role { font-size: clamp(3.4rem, 14vw, 5.6rem); color: var(--team); margin: 0; }

/* Competition */
.meters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; align-items: end; height: 190px; margin: 8px 0; }
.meter { display: flex; flex-direction: column; justify-content: flex-end; height: 100%; min-height: 0; }
.meter .bar { background: linear-gradient(var(--team), color-mix(in srgb, var(--team) 55%, var(--stage))); }
.meter .v { font-family: var(--display); font-weight: 700; font-size: 1.7rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.meter .n { color: var(--muted); font-size: .85rem; }
.total { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--line); }
.total b { font-family: var(--display); font-size: 2rem; color: var(--team); margin-left: auto; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
button.tile { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; min-height: 66px; margin: 0; padding: 8px 12px; text-align: left; }
button.tile b { font-family: var(--display); font-size: 1.15rem; font-weight: 700; }
button.tile span { color: var(--hot); font-weight: 700; }
@media (max-width: 520px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
.shield.ready { border-left-color: var(--team); }
.shield h3 { margin: 0; }
.hint { position: sticky; top: 78px; z-index: 2; }
.hint details { background: var(--raised); border-top: 3px solid var(--team); padding: 10px 16px; }
.hint summary { cursor: pointer; font-weight: 700; }
.hint p { margin: .4em 0 0; }

/* Puzzles */
.puzzle-grid { border-collapse: collapse; margin: 8px 0; max-width: 100%; }
.puzzle-grid td, .puzzle-grid th { width: min(44px, 11vw); height: min(44px, 11vw); text-align: center; border: 1px solid var(--line); user-select: none; font-variant-numeric: tabular-nums; }
.puzzle-grid td { cursor: pointer; }
.puzzle-grid th { color: var(--muted); font-weight: 400; border: 0; }
.puzzle-grid td.on { background: var(--team); color: var(--team-ink); }
.puzzle-grid td.fill { font-weight: 700; }
.puzzle-grid td.pipe { font-size: 1.6rem; line-height: 1; }
.puzzle-grid td.first { outline: 3px solid var(--text); outline-offset: -3px; }
.puzzle-grid td.in { background: color-mix(in srgb, var(--team) 22%, var(--panel)); }
.puzzle-grid td.in.r1 { background: color-mix(in srgb, var(--text) 16%, var(--panel)); }
.puzzle-grid td.in.r2 { background: color-mix(in srgb, var(--team) 40%, var(--panel)); }
.puzzle-grid td.in.r3 { background: color-mix(in srgb, var(--muted) 30%, var(--panel)); }
.puzzle-grid td.in.r4 { background: color-mix(in srgb, var(--team) 12%, var(--panel)); }
.puzzle-grid td.in.r5 { background: color-mix(in srgb, var(--text) 28%, var(--panel)); }
:root { --h0: #E5484D; --h1: #F5A524; --h2: #46A758; --h3: #3E63DD; --h4: #8E4EC6; --h5: #12A594; --h6: #D6409F; --h7: #978365; }
.puzzle-grid td.reg-0 { background: color-mix(in srgb, var(--h0) 30%, var(--panel)); } .puzzle-grid td.reg-1 { background: color-mix(in srgb, var(--h1) 30%, var(--panel)); }
.puzzle-grid td.reg-2 { background: color-mix(in srgb, var(--h2) 30%, var(--panel)); } .puzzle-grid td.reg-3 { background: color-mix(in srgb, var(--h3) 30%, var(--panel)); }
.puzzle-grid td.reg-4 { background: color-mix(in srgb, var(--h4) 30%, var(--panel)); } .puzzle-grid td.reg-5 { background: color-mix(in srgb, var(--h5) 30%, var(--panel)); }
.puzzle-grid td.reg-6 { background: color-mix(in srgb, var(--h6) 30%, var(--panel)); } .puzzle-grid td.reg-7 { background: color-mix(in srgb, var(--h7) 30%, var(--panel)); }
.puzzle-grid td.reg.on { outline: 2px solid var(--text); outline-offset: -2px; font-weight: 700; color: var(--text); }
.puzzle-grid td.bt { border-top: 3px solid var(--text); } .puzzle-grid td.br { border-right: 3px solid var(--text); }
.puzzle-grid td.bb { border-bottom: 3px solid var(--text); } .puzzle-grid td.bl { border-left: 3px solid var(--text); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
button.setcard { margin: 0; min-height: 64px; font-size: 1.2rem; background: var(--raised); }
button.setcard.c0 { color: var(--h0); } button.setcard.c1 { color: var(--h2); } button.setcard.c2 { color: var(--h3); }
button.setcard.f1 { background: color-mix(in srgb, currentColor 14%, var(--raised)); } button.setcard.f2 { background: color-mix(in srgb, currentColor 30%, var(--raised)); }
button.setcard.picked { outline: 3px solid var(--text); }
button.setcard.group { border-color: var(--team); border-width: 2px; }

/* Results, login, tables, links, toast */
.results { max-width: 760px; } .results svg { width: 100%; height: auto; display: block; }
.results .panel { padding: 0; border-left-color: var(--line); }
.thanks { text-align: center; padding: 48px 16px; } .thanks h2 { font-size: clamp(2rem, 8vw, 3.2rem); }
main.login { max-width: 420px; min-height: 80vh; display: flex; align-items: center; }
.login form { width: 100%; padding: 24px; border-left-color: var(--a); }
.login button { width: 100%; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 400; font-size: .85rem; }
.links li { padding: 8px 0; } a { color: var(--text); text-underline-offset: 3px; }
ul.log small { display: block; flex-basis: 100%; }
#toast { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 20; max-width: 520px; margin: 0 auto; background: var(--text); color: var(--stage); padding: 12px 16px; font-weight: 700; }
#toast:empty { display: none; }

/* The one orchestrated moment: the phase stinger */
#stinger { position: fixed; inset: 0 0 auto 0; z-index: 30; pointer-events: none; }
.stinger { background: var(--team); color: var(--team-ink); padding: 18px 24px; display: flex; flex-direction: column; font-family: var(--display); font-size: clamp(2.2rem, 9vw, 3.8rem); line-height: 1.05; }
.stinger small { font: 600 1rem var(--body); color: inherit; }
@media (prefers-reduced-motion: no-preference) {
  .stinger { animation: wipe 1.15s ease-out both; }
  @keyframes wipe { 0% { clip-path: inset(0 100% 0 0); } 30%, 72% { clip-path: inset(0 0 0 0); } 100% { clip-path: inset(0 0 0 100%); } }
}
@media (prefers-reduced-motion: reduce) { .stinger { animation: none; } * { transition: none !important; } }
```

> **Puzzle regions never rely on colour alone:** Queens and Lits draw a thick border (`bt`, `br`, `bb`, `bl`) wherever two neighbouring cells belong to different regions (Plan 4's `edges` helper, tested there). The eight region hues (`--h0` to `--h7`) are only a tint on top of that and are not part of the contrast rules. **One rough edge to settle in Task 7 by looking:** `.hint` is `position: sticky` with `top: 78px`, which assumes the scoreboard is 78 px high on laptops; on phones the scoreboard is shorter, so check that the hint does not leave a gap.

`public/index.html` (replaces the Plan 2 version):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>Startup Showdown</title>
  <link rel="stylesheet" href="/styles/tokens.css">
  <link rel="stylesheet" href="/styles/fonts.css">
  <link rel="stylesheet" href="/styles/app.css">
  <link rel="preload" href="/fonts/big-shoulders-display-700.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/instrument-sans-400.woff2" as="font" type="font/woff2" crossorigin>
</head>
<body>
  <div id="stinger" aria-live="polite"></div>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

`public/organizer.html` is the same with the title `Startup Showdown: Organizer` and `<script type="module" src="/organizer.js">`. Delete `public/styles.css`.

- [ ] **Step 3: Run the Task 5 tests and see them pass**

Run: `npm test`
Expected: PASS for `css-coverage.test.js` and `budget.test.js`.

- [ ] **Step 4: Commit**

```bash
git rm public/styles.css
git add public/styles/app.css public/index.html public/organizer.html
git commit -m "feat: the stylesheet: scoreboard, panels, meters, deck, puzzles, stinger"
```

---

### Task 4: Company colour and the phase stinger in the browser

**Files:**
- Modify: `public/app.js`, `public/organizer.js`

**Interfaces:**
- Consumes: `companyOf`, `stingerFor`, `renderStinger` (Task 2); the `#stinger` element (Task 3).
- Behaviour: after every `state` message `app.js` sets `document.body.dataset.company` to `companyOf(view)` (or removes it); it remembers the last phase it saw and, when the phase **changes** (never on the first state after a load or a reconnect, because there is no earlier phase), puts `renderStinger(...)` into `#stinger` and clears it after 1,300 ms. The organizer page never shows a stinger and keeps `data-company` off the body.
- This is browser-only glue (the pure parts are tested in Task 2). It is checked by hand in Task 7.

- [ ] **Step 1: Write the glue**

In `public/app.js`, import the helpers and add:

```js
import { renderLogin, renderScreen, fmtClock, companyOf, stingerFor, renderStinger } from './render.js';

let lastPhase = null;
let stingerTimer = null;

function applyDesign(view) {
  const company = companyOf(view);
  if (company) document.body.dataset.company = company; else delete document.body.dataset.company;
  const phase = view && view.screen === 'game' && view.clock ? view.clock.phase : null;
  const s = stingerFor(lastPhase, phase);
  lastPhase = phase;
  const slot = document.getElementById('stinger');
  if (slot && s) {
    slot.innerHTML = renderStinger(s);
    clearTimeout(stingerTimer);
    stingerTimer = setTimeout(() => { slot.innerHTML = ''; }, 1300);
  }
}
```

and in the `state` handler call `applyDesign(m.view)` right after `show(renderScreen(m.view))`. On a disconnect and reconnect, set `lastPhase = null` in the `onclose` handler so a reconnect never plays a stinger.

- [ ] **Step 2: Check by hand**

Run the app with the rehearsal speed of Plan 6 (`SHOWDOWN_SPEED=10`), watch a game on a phone: the stinger plays once at each phase change and not on a page reload; the whole screen is gold for company A and teal for company B; the organizer page stays neutral. With the device's "reduce motion" setting on, the stinger appears and disappears without wiping.

- [ ] **Step 3: Commit**

```bash
git add public/app.js public/organizer.js
git commit -m "feat: company colour and the phase stinger in the browser"
```

---

### Task 5: The design gallery and the design tests

**Files:**
- Create: `public/dev/fixtures.js`, `public/dev/gallery.html`, `test/fixtures.test.js`, `test/css-coverage.test.js`, `test/budget.test.js`, `test/graph-theme.test.js`
- Modify: `src/graphs/theme.js`

**Interfaces:**
- Produces:
  - `FIXTURES`: an array of `{ id, title, company, view }` covering the login, the lobby, every phase, every role's most important screen, the attack deck (cooling down and ready), the shield, the last ten seconds, the CFO puzzle, and "thank you"; and `ORGANIZER.lobby` and `ORGANIZER.running(extra)`.
  - The gallery page `/dev/gallery.html?theme=dark|light&only=id1,id2` renders them all (and the stinger, the organizer screens and the results graphs) in one scrolling page.
- `src/graphs/theme.js` becomes: the same exported `THEME`, but its colour values are asserted equal to `tokens.css` by `graph-theme.test.js` (it keeps explicit hex values because it runs on the server without the browser).

- [ ] **Step 1: Write the failing tests**

`test/fixtures.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, ORGANIZER } from '../public/dev/fixtures.js';
import { renderScreen, renderLogin, companyOf } from '../public/render.js';
import { renderOrganizer } from '../public/render-organizer.js';

const html = (f) => (f.view.kind === 'login' ? renderLogin() : renderScreen(f.view));

test('every fixture renders without leftover template mistakes', () => {
  for (const f of FIXTURES) {
    const out = html(f);
    assert.ok(out.length > 50, f.id);
    for (const bad of ['undefined', 'NaN', '[object Object]', 'null</', '<script']) assert.equal(out.includes(bad), false, `${f.id} contains ${bad}`);
  }
});

test('the organizer fixtures render too', () => {
  for (const out of [renderOrganizer(ORGANIZER.lobby), renderOrganizer(ORGANIZER.running()), renderOrganizer(ORGANIZER.running({ ended: true, revealed: true, clock: { phase: 'ended', remainingSec: 0 } }))]) {
    for (const bad of ['undefined', 'NaN', '[object Object]']) assert.equal(out.includes(bad), false, bad);
  }
});

test('the gallery covers every phase and every role', () => {
  const phases = new Set(FIXTURES.filter((f) => f.view.clock).map((f) => f.view.clock.phase));
  for (const p of ['briefing', 'ideation', 'shop', 'summary', 'competition', 'ended']) assert.ok(phases.has(p), p);
  const roles = new Set(FIXTURES.filter((f) => f.view.me && f.view.me.role).map((f) => f.view.me.role));
  for (const r of ['CEO', 'CTO', 'CFO', 'CMO', 'COO']) assert.ok(roles.has(r), r);
});

test('a fixture\'s company matches the colour its page would take, and both companies appear', () => {
  for (const f of FIXTURES) assert.equal(companyOf(f.view), f.company, f.id);
  assert.ok(FIXTURES.some((f) => f.company === 'A'));
  assert.ok(FIXTURES.some((f) => f.company === 'B'));
});

test('every game screen has the clock and an accessible timer', () => {
  for (const f of FIXTURES.filter((x) => x.view.screen === 'game')) {
    const out = html(f);
    assert.match(out, /id="clock"/, f.id);
    assert.match(out, /role="timer"/, f.id);
  }
});

test('fixture ids are unique', () => {
  assert.equal(new Set(FIXTURES.map((f) => f.id)).size, FIXTURES.length);
});
```

`test/css-coverage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXTURES, ORGANIZER } from '../public/dev/fixtures.js';
import { renderScreen, renderLogin } from '../public/render.js';
import { renderOrganizer } from '../public/render-organizer.js';

const css = readFileSync('public/styles/app.css', 'utf8') + readFileSync('public/styles/tokens.css', 'utf8');

// Classes that are only hooks for scripts or states with no style of their own.
const NO_STYLE_NEEDED = new Set(['available', 'requested', 'wait', 'left', '5min', '2min', 'company-A', 'company-B']);

function classesIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => out.add(c));
  return out;
}

test('every class the screens use has a style, so a typo is caught', () => {
  const pages = [
    ...FIXTURES.map((f) => (f.view.kind === 'login' ? renderLogin('x') : renderScreen(f.view))),
    renderOrganizer(ORGANIZER.lobby), renderOrganizer(ORGANIZER.running()),
    renderOrganizer(ORGANIZER.running({ ended: true, revealed: true })),
  ];
  const used = new Set();
  pages.forEach((p) => classesIn(p).forEach((c) => used.add(c)));
  const missing = [...used].filter((c) => !NO_STYLE_NEEDED.has(c) && !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css));
  assert.deepEqual(missing, []);
});

test('no colour is written as a hex value outside the tokens and the fixed puzzle hues', () => {
  const app = readFileSync('public/styles/app.css', 'utf8').replace(/:root \{ --h0:[^}]*\}/, '');
  assert.deepEqual(app.match(/#[0-9A-Fa-f]{3,8}\b/g) || [], []);
});

test('the markup carries no inline colours', () => {
  const src = readFileSync('public/render.js', 'utf8') + readFileSync('public/render-organizer.js', 'utf8');
  assert.equal(/style="[^"]*(color|background)/.test(src), false);
});
```

`test/budget.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const size = (f) => statSync(f).size;

test('the stylesheet stays small enough for a phone on the hotspot', () => {
  assert.ok(size('public/styles/app.css') < 40_000, `app.css is ${size('public/styles/app.css')} bytes`);
  assert.ok(size('public/styles/tokens.css') < 4_000);
});

test('the four browser fonts together stay under 100 KB', () => {
  const total = readdirSync('public/fonts').filter((f) => f.endsWith('.woff2')).reduce((n, f) => n + size(`public/fonts/${f}`), 0);
  assert.ok(total > 10_000 && total < 100_000, `fonts are ${total} bytes`);
});

test('the render code stays under 30 KB', () => {
  assert.ok(size('public/render.js') < 30_000);
});

test('the page does not depend on any other site', () => {
  for (const f of ['public/index.html', 'public/organizer.html', 'public/styles/app.css', 'public/styles/fonts.css', 'public/render.js']) {
    assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(readFileSync(f, 'utf8')), false, f);
  }
});
```

`test/graph-theme.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readThemes } from '../scripts/contrast.js';
import { THEME } from '../src/graphs/theme.js';

const dark = readThemes(readFileSync('public/styles/tokens.css', 'utf8')).dark;

test('the graph images use the same colours as the screens', () => {
  assert.equal(THEME.A.toUpperCase(), dark.a);
  assert.equal(THEME.B.toUpperCase(), dark.b);
  assert.equal(THEME.panel.toUpperCase(), dark.panel);
  assert.equal(THEME.line.toUpperCase(), dark.line);
  assert.equal(THEME.text.toUpperCase(), dark.text);
  assert.equal(THEME.muted.toUpperCase(), dark.muted);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL, cannot find `../public/dev/fixtures.js`

- [ ] **Step 3: Write the fixtures and the gallery**

`public/dev/fixtures.js`:

```js
// Realistic views for every screen, so the whole design can be looked at without running a game.
// Used by public/dev/gallery.html and by the design tests.
const me = (company, role, name) => ({ admissionId: 'S1', name, company, role, status: 'in_game' });
const problem = { id: 1, title: 'Food waste', statement: 'Homes, canteens and shops throw away huge amounts of good food every day.' };
const idea = { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A small sensor inside the fridge.' };

const ideas = (mine, canPick) => ({
  picked: null, canPick,
  ideas: [
    { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A small sensor inside the fridge that tracks what is inside and how fresh it is.', votes: 3, mine: mine === 'H1' },
    { id: 'H2', type: 'hardware', name: 'Canteen Waste Scale', description: 'A smart bin scale that weighs the food thrown away and shows which dishes get wasted.', votes: 1, mine: mine === 'H2' },
    { id: 'H3', type: 'hardware', name: 'Surplus Food Locker', description: 'A public locker where shops and homes drop extra food for people to pick up for free.', votes: 0, mine: false },
    { id: 'S1', type: 'software', name: 'Expiry Reminder App', description: 'An app where you scan or enter groceries and it warns you before they expire.', votes: 1, mine: false },
    { id: 'S2', type: 'software', name: 'Leftover Recipe Finder', description: 'An app that suggests meals from whatever ingredients you already have.', votes: 0, mine: false },
    { id: 'S3', type: 'software', name: 'Food Share Network', description: 'An app where neighbours and shops post surplus food and others claim it.', votes: 0, mine: false },
  ],
});

const item = (id, label, section, role, price, state = 'available', over = {}) => ({ id, name: label, label, option: '', section, role, cost: price, price, state, note: '', canRequest: false, canRecommend: false, choices: null, ...over });
const catalog = (role) => [
  item('M01-N', 'Target User (Small niche)', 'Target User', 'CMO', 50, 'owned', { tier: 1, tierCount: 3 }),
  item('M01-M', 'Target User (Medium group)', 'Target User', 'CMO', 50, 'available', { tier: 2, tierCount: 3, canRequest: role === 'CMO', canRecommend: role === 'CEO' }),
  item('M01-L', 'Target User (Large market)', 'Target User', 'CMO', 100, 'available', { tier: 3, tierCount: 3, canRequest: role === 'CMO', canRecommend: role === 'CEO' }),
  item('M02', 'Brand name', 'Brand', 'CMO', 40, 'available', { choices: ['FreshSense', 'ChillWatch', 'KeepFresh'], canRequest: role === 'CMO', canRecommend: false }),
  item('M04-S', 'Ad Campaign (Social posts)', 'Ad Campaign', 'CMO', 80, 'requested', { tier: 1, tierCount: 3 }),
  item('F01-S', 'Core Function (Smart)', 'Core Features', 'CTO', 180, 'available', { tier: 2, tierCount: 3, canRequest: role === 'CTO' }),
  item('O01', 'Fix: Sensor gives wrong freshness readings', 'Risk Fixes', 'COO', 60, 'wait', { note: 'wait 60 seconds after a rejection', canRequest: false }),
];

const base = (company, role, name, phase, remainingSec, extra = {}) => ({
  me: me(company, role, name), screen: 'game', clock: { phase, remainingSec }, problem, wallet: 1214, idea,
  ideation: null, shop: null, owned: [{ itemId: 'M01-N', label: 'Target User (Small niche)', charged: 50 }, { itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }], summary: null, ...extra,
});

const shopFor = (role) => ({
  open: true, catalog: catalog(role), mine: [{ id: 1, itemId: 'M04-S', label: 'Ad Campaign (Social posts)', status: 'pending' }],
  ...(role === 'CFO' || role === 'CEO' ? { queue: [
    { id: 7, itemId: 'M01-M', label: 'Target User (Medium group)', price: 50, by: 'Mira Das', recommended: false, head: true },
    { id: 8, itemId: 'M04-S', label: 'Ad Campaign (Social posts)', price: 80, by: 'Dev Menon', recommended: true, head: false }] } : {}),
  ...(role === 'CEO' ? { awaitingCeo: [{ id: 3, itemId: 'F01-S', label: 'Core Function (Smart)', price: 180, by: 'Asha Rao', recommended: false, head: false }] } : {}),
});

const rates = { CTO: 6.5, CMO: 31, COO: 20, total: 57.5 };
const comp = (over = {}) => ({ rates, notices: [], hint: null, shield: null, attack: null, ...over });
const attackOptions = [['price_squeeze', 'Price Squeeze', 300], ['market_crash', 'Market Crash', 450], ['ad_blackout', 'Ad Blackout', 350], ['feature_recall', 'Feature Recall', 450], ['safety_audit', 'Safety Audit', 400], ['minigame_jam', 'Mini-Game Jam', 300], ['supplier_delay', 'Supplier Delay', 350], ['bank_freeze', 'Bank Freeze', 350], ['surprise_tax', 'Surprise Tax', 400]].map(([key, name, cost]) => ({ key, name, cost }));

export const FIXTURES = [
  { id: 'login', title: 'Login', company: null, view: { kind: 'login' } },
  { id: 'lobby', title: 'Lobby (waiting)', company: null, view: { screen: 'lobby', me: { name: 'Asha Rao' } } },
  { id: 'briefing', title: 'Briefing, CEO of company A', company: 'A', view: base('A', 'CEO', 'Asha Rao', 'briefing', 125, { wallet: 1000, owned: [] }) },
  { id: 'ideation-ceo', title: 'Ideation, CEO', company: 'A', view: base('A', 'CEO', 'Asha Rao', 'ideation', 134, { wallet: 1000, owned: [], ideation: ideas('H1', true) }) },
  { id: 'ideation-cto', title: 'Ideation, CTO of company B', company: 'B', view: base('B', 'CTO', 'Ben Joseph', 'ideation', 134, { wallet: 1000, owned: [], ideation: ideas('H2', false) }) },
  { id: 'shop-cmo', title: 'Shop, CMO', company: 'A', view: base('A', 'CMO', 'Mira Das', 'shop', 280, { shop: shopFor('CMO') }) },
  { id: 'shop-cfo', title: 'Shop, CFO with the queue', company: 'A', view: base('A', 'CFO', 'Ravi Nair', 'shop', 280, { shop: shopFor('CFO') }) },
  { id: 'shop-ceo', title: 'Shop, CEO', company: 'B', view: base('B', 'CEO', 'Dev Menon', 'shop', 280, { shop: shopFor('CEO') }) },
  { id: 'summary', title: 'Summary card', company: 'A', view: base('A', 'CTO', 'Asha Rao', 'summary', 12, { summary: { idea: { id: 'H1', name: 'Smart Fridge Sensor' }, owned: [{ itemId: 'M01-N', label: 'Target User (Small niche)', charged: 50 }, { itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }, { itemId: 'O01', label: 'Fix: Sensor gives wrong freshness readings', charged: 60 }], wallet: 850 } }) },
  { id: 'competition-cmo-hint', title: 'Competition, CMO with a hint', company: 'A', view: base('A', 'CMO', 'Mira Das', 'competition', 612, { shop: shopFor('CMO'), competition: comp({ hint: { text: 'Upgrade Target User from Small niche to Medium group for 50 coins' } }) }) },
  { id: 'competition-ceo', title: 'Competition, CEO attack deck (ready in 37 s)', company: 'B', view: base('B', 'CEO', 'Dev Menon', 'competition', 540, { wallet: 640, shop: shopFor('CEO'), competition: comp({ rates: { CTO: 13, CMO: 6.5, COO: 27, total: 46.5 }, notices: ['Stock market prices have fallen'], attack: { options: attackOptions, cooldownLeftSec: 37, lockedReason: 'cooldown' } }) }) },
  { id: 'competition-ceo-ready', title: 'Competition, CEO attack deck (ready)', company: 'A', view: base('A', 'CEO', 'Asha Rao', 'competition', 540, { shop: shopFor('CEO'), competition: comp({ attack: { options: attackOptions, cooldownLeftSec: 0, lockedReason: null } }) }) },
  { id: 'competition-coo', title: 'Competition, COO with a shield', company: 'B', view: base('B', 'COO', 'Kiran Pal', 'competition', 300, { shop: shopFor('COO'), competition: comp({ shield: { owned: true, used: false }, notices: ['Insurance claim used'] }), clock: { phase: 'competition', remainingSec: 300, warning: '5min' } }) },
  { id: 'competition-last10', title: 'Competition, last 10 seconds', company: 'A', view: base('A', 'CFO', 'Ravi Nair', 'competition', 8, { shop: { ...shopFor('CFO'), open: false }, competition: comp({ puzzle: null, puzzlesDone: { solved: 2, skipped: 1 } }), clock: { phase: 'competition', remainingSec: 8, warning: 'last10' } }) },
  { id: 'competition-cfo-puzzle', title: 'Competition, CFO with a puzzle', company: 'A', view: base('A', 'CFO', 'Ravi Nair', 'competition', 700, { shop: shopFor('CFO'), competition: comp({ puzzle: { id: 9, kind: 'queens', name: 'Queens', level: 2, reward: 20, puzzle: null, skipsFreeLeft: 1 }, puzzlesDone: { solved: 1, skipped: 1 } }) }) },
  { id: 'ended', title: 'Thank you for playing', company: 'A', view: base('A', 'CEO', 'Asha Rao', 'ended', 0) },
];

export const ORGANIZER = {
  lobby: {
    screen: 'organizer', problems: [{ id: 1, title: 'Food waste' }, { id: 2, title: 'Water shortage' }, { id: 3, title: 'Student stress' }],
    participants: Array.from({ length: 12 }, (_, i) => ({ admission_id: `S${i}`, name: ['Asha Rao', 'Ben Joseph', 'Mira Das', 'Dev Menon', 'Ravi Nair', 'Kiran Pal'][i % 6], status: 'lobby', company: i < 10 ? (i < 5 ? 'A' : 'B') : null, role: i < 10 ? ['CEO', 'CTO', 'CFO', 'CMO', 'COO'][i % 5] : null, game_id: null })),
    game: null,
    backup: { at: 1_700_000_000_000, ok: true, message: 'ok' },
  },
  running(extra = {}) {
    const panel = (wallet, ideaName, owned) => ({ wallet, idea: { id: 'H1', name: ideaName }, pickSource: 'ceo', votes: { H1: 3, H2: 1 }, owned, queue: [{ label: 'Ad Campaign (Social posts)', by: 'Dev Menon' }], awaitingCeo: [] });
    return { ...ORGANIZER.lobby, game: {
      id: 3, problemId: 1, clock: { phase: 'competition', remainingSec: 612 }, ended: false, revealed: false,
      companies: { A: panel(1214, 'Smart Fridge Sensor', [{ label: 'Target User (Small niche)', charged: 50 }, { label: 'Brand name: FreshSense', charged: 40 }]), B: panel(640, 'Expiry Reminder App', [{ label: 'Fix: Scans fail', charged: 60 }]) },
      attacks: [{ id: 1, attacker: 'A', victim: 'B', name: 'Market Crash', cost: 450, at: 0, endsAt: 40000, blocked: true, by: 'S0' }, { id: 2, attacker: 'B', victim: 'A', name: 'Price Squeeze', cost: 300, at: 0, endsAt: 40000, blocked: false, by: 'S5' }],
      eventUsed: 'demand_surge', injectionUsed: null, puzzles: { A: { solved: 2, skipped: 1, coins: 40 }, B: { solved: 0, skipped: 3, coins: 0 } }, ...extra } };
  },
};
```

`public/dev/gallery.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Startup Showdown design gallery</title>
  <link rel="stylesheet" href="../styles/tokens.css">
  <link rel="stylesheet" href="../styles/fonts.css">
  <link rel="stylesheet" href="../styles/app.css">
  <style>.shot { margin: 0 0 56px; } .shot > h4 { margin: 0; padding: 8px 16px; font: 400 .9rem var(--body); color: var(--muted); background: var(--stage); } .shot .screen { background: var(--stage); }</style>
</head>
<body>
<div id="gallery"></div>
<script type="module">
  import { FIXTURES, ORGANIZER } from './fixtures.js';
  import { renderScreen, renderLogin, renderStinger, stingerFor } from '../render.js';
  import { renderOrganizer } from '../render-organizer.js';
  import { UI } from '../puzzles/ui.js';
  const params = new URLSearchParams(location.search);
  if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');
  const root = document.getElementById('gallery');
  const only = params.get('only');
  const wanted = (id) => !only || only.split(',').includes(id);
  const frame = (id, title, company, html) => {
    const sec = document.createElement('section');
    sec.className = 'shot'; sec.id = id;
    if (company) sec.dataset.company = company;
    sec.innerHTML = `<h4>${title}</h4><div class="screen">${html}</div>`;
    root.appendChild(sec);
    return sec;
  };
  for (const f of FIXTURES) {
    if (!wanted(f.id)) continue;
    const sec = frame(f.id, f.title, f.company, f.view.kind === 'login' ? renderLogin() : renderScreen(f.view));
    const slot = sec.querySelector('#puzzle-slot');
    if (slot) {
      // A fixed 5 by 5 Queens board, so the gallery needs nothing from the server code.
      const regions = [[0,0,1,1,1],[0,2,2,1,1],[3,2,2,4,4],[3,3,2,4,4],[3,3,3,4,4]];
      const puzzle = { n: 5, regions };
      slot.innerHTML = UI.queens.render(puzzle, UI.queens.apply(puzzle, UI.queens.initial(puzzle), { cell: [0, 2] }));
    }
  }
  if (wanted('stinger')) frame('stinger', 'Phase stinger', 'A', `<div id="stinger" style="position:static">${renderStinger(stingerFor('shop', 'competition'))}</div>`);
  if (wanted('organizer-lobby')) frame('organizer-lobby', 'Organizer, lobby', null, renderOrganizer(ORGANIZER.lobby));
  if (wanted('organizer-running')) frame('organizer-running', 'Organizer, game running', null, renderOrganizer(ORGANIZER.running()));
  if (wanted('organizer-ended')) frame('organizer-ended', 'Organizer, game ended and revealed', null, renderOrganizer(ORGANIZER.running({ clock: { phase: 'ended', remainingSec: 0 }, ended: true, revealed: true })));
  document.body.dataset.ready = 'yes';
</script>
</body>
</html>
```

In `src/graphs/theme.js` keep the values from Plan 5 (they already equal the tokens: `A #F5B83D`, `B #2BC4B8`, `panel #101E33`, `line #263C5C`, `text #E9ECF2`, `muted #9AAAC2`); the new test only guards them against drift.

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS. If `css-coverage.test.js` names a class with no style, either add a style or, if it is only a state hook, add it to `NO_STYLE_NEEDED` in the same commit and say why.

- [ ] **Step 5: Commit**

```bash
git add public/dev test src/graphs/theme.js
git commit -m "feat: design gallery with fixtures, and tests that keep the look consistent"
```

---

### Task 6: Serving the gallery and the new files

**Files:**
- Modify: `src/static.js` (nothing to change in the code; this task is a check) and `test/static.test.js`

**Interfaces:**
- Produces: confirmation that the static server (Plan 2) serves the new file types: `.woff2` as `font/woff2`, `.ttf` as `font/ttf`, and `/dev/gallery.html`, with long-lived caching for fonts only.
- `src/static.js` `TYPES` gains `'.woff2': 'font/woff2'` and `'.ttf': 'font/ttf'`; files under `/fonts/` are sent with `cache-control: public, max-age=31536000, immutable` (the font files never change under the same name); everything else keeps `no-cache`.

- [ ] **Step 1: Write the failing tests**

Add to `test/static.test.js` (Plan 2): create `fonts/a.woff2` and `dev/gallery.html` in the temporary folder, and assert: `/fonts/a.woff2` returns `content-type` `font/woff2` and `cache-control` containing `immutable`; `/index.html` returns `no-cache`; `/dev/gallery.html` is served (200); the path-escape tests still pass.

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL (`application/octet-stream` and `no-cache` for the font)

- [ ] **Step 3: Write the minimal implementation**

In `src/static.js` add the two types and, where the headers are written, use `cache-control` `public, max-age=31536000, immutable` when the request path starts with `/fonts/`, otherwise `no-cache`.

- [ ] **Step 4: Run to see them pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/static.js test/static.test.js
git commit -m "feat: serve fonts with the right type and a long cache"
```

---

### Task 7: Look at it (screenshots and a careful review)

**Files:**
- Create: `scripts/screenshots.mjs`
- Run on a development machine only: `npm install --save-dev playwright` and `npx playwright install chromium`

**Interfaces:**
- Produces: `node scripts/screenshots.mjs [outDir]` starts a tiny static server over `public/`, opens `/dev/gallery.html` in a headless browser at **360, 768 and 1280 px** wide, in **dark and light** (six runs), saves a full-page PNG of each, and fails (exit code 1) if any run has sideways scrolling or a script or console error. It also saves one PNG per fixture at 360 px so a long page can be read screen by screen.

`scripts/screenshots.mjs`:

```js
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { FIXTURES } from '../public/dev/fixtures.js';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml' };
const out = process.argv[2] || 'screenshots';
await mkdir(out, { recursive: true });

const root = join(process.cwd(), 'public');
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let failed = false;
for (const scheme of ['dark', 'light']) {
  for (const width of [360, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${base}/dev/gallery.html?theme=${scheme}`);
    await page.waitForSelector('body[data-ready=yes]');
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: join(out, `gallery-${scheme}-${width}.png`), fullPage: true });
    if (width === 360) {
      for (const f of FIXTURES) {
        const el = await page.$(`#${f.id}`);
        if (el) await el.screenshot({ path: join(out, `${scheme}-360-${f.id}.png`) });
      }
    }
    console.log(`${scheme} ${width}px: overflow ${overflow}px, errors ${errors.length}`);
    if (overflow > 0 || errors.length) { failed = true; console.error(errors.join('\n')); }
    await page.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 1: Run it**

Run: `node scripts/screenshots.mjs screenshots` (add `screenshots/` to `.gitignore`).
Expected: six lines ending `overflow 0px, errors 0`, and PNG files.

- [ ] **Step 2: Look at every screenshot, with this checklist**

Open the pictures (or the gallery page itself in a real browser) and tick each item. Fix problems in `app.css` or the render markup, never by loosening a test.

- [ ] **Scoreboard (360 px):** the company, role, wallet and clock all fit, nothing wraps badly, the cut corners look deliberate. If the wallet and the clock crowd each other, reduce `.clockbox` padding further.
- [ ] **Scoreboard (1280 px):** the clock is the biggest number; the wallet is second.
- [ ] **Light mode:** gold and teal words are readable on white; `.banner` text is readable; the danger red is readable; the attack deck is clearly tinted.
- [ ] **Competition, CMO:** the three sales meters read like a team-fight bar; the hint sits above them and does not hide the shop; the shop rows align (name, dots, button, price).
- [ ] **Competition, CEO:** nine attack tiles in a 3 by 3 grid (2 columns at 360 px); disabled tiles are dim but their names are still readable; "Ready in 37 s" is visible.
- [ ] **Shop, CFO:** the head of the queue is clearly the one to act on; Approve and Reject are easy to hit.
- [ ] **Ideation:** the vote bars are visible, the player's idea has the team-coloured top rule, "Pick this idea" appears only for the CEO.
- [ ] **Summary and Thank you:** the coins left is the biggest number; there is no winner wording.
- [ ] **Puzzles:** the CFO puzzle fits at 360 px with no sideways scroll; regions are clearly separated by their borders (turn the colour off in the browser developer tools and confirm every region can still be told apart).
- [ ] **Results:** the three graphs fill the width and keep their colours in both themes.
- [ ] **Organizer:** the lobby table scrolls inside its panel on a phone; the company panels sit side by side on a laptop and stack on a phone; the real-cause attack log is readable.
- [ ] **Long text:** a 60-character idea name or item label wraps and never pushes the page sideways (temporarily edit a fixture to check, then restore it).

- [ ] **Step 3: Check on real devices**

After Plan 6's hotspot works, open the game on at least one iPhone-sized and one Android-sized phone and one laptop, in the venue's lighting. Note anything that looks wrong and fix it with the same checklist.

- [ ] **Step 4: Commit**

```bash
echo 'screenshots/' >> .gitignore
git add scripts/screenshots.mjs .gitignore package.json package-lock.json
git commit -m "chore: headless screenshots of the design gallery"
```

---

### Task 8: Accessibility check

**Files:**
- Create: `scripts/a11y.mjs`
- Run on a development machine only: `npm install --save-dev @axe-core/playwright`

**Interfaces:**
- Produces: `node scripts/a11y.mjs` opens the gallery in dark and light at 360 and 1280 px, runs the axe accessibility rules on each, prints every violation of impact `serious` or `critical`, and exits 1 if there are any.

`scripts/a11y.mjs`:

```js
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const root = join(process.cwd(), 'public');
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { const b = await readFile(join(root, path)); res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let bad = 0;
for (const scheme of ['dark', 'light']) {
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    await page.goto(`${base}/dev/gallery.html?theme=${scheme}`);
    await page.waitForSelector('body[data-ready=yes]');
    const { violations } = await new AxeBuilder({ page }).analyze();
    for (const v of violations.filter((x) => ['serious', 'critical'].includes(x.impact))) {
      bad++;
      console.error(`${scheme} ${width}px: ${v.id} (${v.impact}): ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.error(`   ${n.target.join(' ')}`);
    }
    await page.close();
  }
}
await browser.close();
server.close();
console.log(bad ? `${bad} serious accessibility problems` : 'No serious accessibility problems');
process.exit(bad ? 1 : 0);
```

- [ ] **Step 1: Run it and fix what it finds**

Run: `node scripts/a11y.mjs`
Expected: no serious or critical violations. Typical findings on this design and the usual fixes: a form field without a label (add `aria-label`); a duplicate `id` (the gallery repeats `#clock` and `#puzzle-slot` in many frames, which axe reports; ignore only those two in the gallery by passing `.exclude` for the gallery only, never in the real pages); low contrast in a puzzle region tint (darken the tint mix). Do not silence a rule to get a pass.

- [ ] **Step 2: Keyboard and screen reader pass (by hand)**

On the gallery and then on a real game page: press Tab through a whole screen and confirm every button and field is reachable in a sensible order with a visible focus ring; open the hint with the keyboard; read the competition screen with a screen reader (VoiceOver on a phone, or NVDA) and confirm the timer, the wallet, the banners and the notices are announced, and that the attack tiles read as "Price Squeeze, 300, button".

- [ ] **Step 3: Commit**

```bash
git add scripts/a11y.mjs package.json package-lock.json
git commit -m "chore: automated accessibility check of the design gallery"
```

---

## Self-review against the spec

**Coverage of `docs/design/ui-design-system.md`:** the idea (company colours re-theme the whole screen): Tasks 1, 2, 4; colour tokens and contrast rules: Task 1; type and offline fonts: Task 1 and Task 3; layout (scoreboard, panels by rule not cards, phone and laptop): Tasks 2, 3; every screen in the screens table: Task 2 markup, Task 3 styles, Task 5 fixtures; the one motion and reduced motion: Tasks 3, 4; accessibility (focus, words not just colour, timer name, `role="img"` graphs from Plan 5): Tasks 2, 8; the things to avoid: the stylesheet and the tests (no stray hex colours, no identical-card kit).

**Already verified while writing:** tokens and fonts (11 tests), the new render files against 35 earlier render tests, and a headless-browser look at the gallery and the mockup (no sideways scroll, no script errors, competition screen reviewed by eye). **Not yet run:** the new tests in Tasks 2, 5 and 6 and the two scripts in Tasks 7 and 8; they are written as starting points that their first run will check.

**Placeholder scan:** none. Two rough edges are named openly (puzzle region colours for colour-blind players, and the sticky hint offset) with how to settle them in Task 7.

**Type consistency:** `fmtCoins`, `pct`, `companyOf`, `stingerFor`, `renderStinger`, the `tier` and `tierCount` fields, the class names in the markup contract and the fixture ids are used the same way in Tasks 2 to 8.

**Interface changes to earlier plans:** listed in the table near the top (two test edits, the deleted base stylesheet, the `setcard` class, the tier fields, and the two replaced render files).
