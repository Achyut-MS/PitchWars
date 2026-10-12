# Startup Showdown: Plan 7 of 7, The Look (UI Design Implementation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the frontend-design skill for any judgment call about the look, and always check it against the drafts first.

> **Rewritten 2026-10-12.** The earlier version of this plan described a navy and gold design built from `docs/design/ui-design-system.md` and `docs/design/mockup.html`. **Both files are superseded** by the approved drafts in `ui-drafts/` and are no longer used by any plan. This version is written against the code on branch `build/plan-2-screens` (commit `c056ea9` plus work in progress) and against the drafts.

**Goal:** Give every screen the approved cream and orange look from `ui-drafts/`: cream paper, bold orange (Company A) or blue (Company B), ink-black outlines, hard offset shadows, cut corners, slab and block headlines, monospace small text, halftone dots and simple SVG icons, all working offline, on a 390 px phone and a 1280 px laptop, without breaking a single behaviour or test from Plans 2 to 5.

**Architecture:** The drafts are static mock-ups with their own markup and fake data, so their CSS is **not copied**. It is **re-keyed** onto the class names the real render functions already emit, in five small stylesheets under `public/css/` (`tokens.css` holds every colour, `fonts.css` the offline fonts, `base.css` the shared parts, `player.css` and `organizer.css` the two apps). Render functions stay pure and keep every existing class, id, `data-send` message and `data-*` hook; this plan only **adds** markup (wrappers, icons, title blocks, a vote tally, meters). A recorded **hook inventory** (Task 1) proves nothing was dropped. A company's colour comes from one attribute, `data-company="A"|"B"`, set from the viewer's **own** company only. Icons are one SVG sprite (`public/img/icons.svg`, built from the drafts' own `<symbol>`s), the logo is one placeholder file behind one token. Screenshots, overflow, contrast and tap-size checks run in a dev-only Playwright script, outside `npm test`.

**Tech Stack:** unchanged for the game (Node.js 22+, plain HTML, CSS and JavaScript, `node:test`). Dev-only additions, never needed on the Pi (the installer runs `npm ci --omit=dev`): `wawoff2@2.0.1` (turns the four `.woff2` files into `.ttf` for the PNG graphs of Plan 5) and `@playwright/test@1.64.0` (screenshots and browser checks).

**Spec:** the drafts in `ui-drafts/` (`*.html`, `draft.css`, `shell.css`, `play.css`, `fonts/`; self-contained copies in `ui-drafts/standalone/`) and `CONTEXT_PACKET.md` section 6. Game rules: `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`. Plans 1 to 5 must be built first (this plan styles the Competition screens of Plan 3 Task 11, the CFO puzzle panel of Plan 4 Task 6 and the results screens of Plan 5 Task 3); run Task 16 again after Plan 6 on real phones.

## What was already checked while writing this plan

- The drafts were opened in headless Chromium at 390 px and 1280 px: none scrolls sideways.
- A prototype of Tasks 2 to 10 and 12 to 13 (the token, base, player and organizer stylesheets of this plan, the kit, and the markup edits) was run against copies of the real `public/render.js` and `public/render-organizer.js`: **all 38 existing render tests passed unchanged**, including the hostile-string tests. 24 fixture screens (login, waiting, briefing for both companies, ideation for three roles, the shop for all five roles and for Company B, summary, thank-you, Competition for CEO, COO and CFO with Plan 3 and Plan 4 markup, organizer login, lobby and running game) were screenshotted at 390 px and 1280 px: **no sideways scrolling on any of the 48 shots**, and they match the drafts' look.
- The token contrast test of Task 2 passes. Two draft colour choices failed it and are changed in this plan: white text on the green approve button (3.43:1, now ink on green, 5.50:1) and orange text on the black login tab when used on paper (orange on paper is 2.53:1; the CSS rule test of Task 4 now forces an ink outline or a dark background).
- White on Beta blue is **4.50:1** (just passes AA). Text on blue fills must stay bold and at least 16 px.
- The four `.woff2` fonts convert to TrueType with `wawoff2` and render in `@resvg/resvg-js` with system fonts off (the Plan 5 PNG path).
- Two traps found by the prototype and handled in this plan: an XML comment containing `--` makes the logo SVG invalid (it silently does not show), and `overflow-x: hidden` on `body` (as in the drafts) hides sideways scrolling from the overflow check, so it is not used.
- **The repository was changing while this plan was written** (other agents were adding Plan 3 and UX work to `public/render.js`, for example a `.price` span and a `<s class="list">` sale price). That is why every task edits functions in place and the hook inventory is recorded **from the code as it is when you start**, not from this document.

## Global Constraints

- Everything from the Global Constraints of Plans 1 to 6 still applies.
- **Keep every hook.** No existing class, id, `name`, `data-*` attribute or `data-send` message shape may be removed or renamed, and no existing test assertion may change (the one exception is Plan 5's graph colour test, Task 11). The hook inventory test (Task 1) enforces this.
- **Players only ever see their own company.** `data-company` on a player screen is the viewer's own `me.company`, nothing else. No player screen shows the rival's name, mark, colour, idea, wallet, purchases or attacks. The organizer pages are the only place both companies appear.
- **Offline:** fonts, icons, the logo and styles are served from the Pi. No CDN, no `http://` or `https://` URL in any file under `public/`.
- **All colours are tokens** in `public/css/tokens.css`. No hex, `rgb()` or `hsl()` value in any other stylesheet, and none in render functions or inline styles. (The icon sprite uses `currentColor` and `var(--team)`; the graph images use `src/graphs/theme.js`, which a test keeps equal to the tokens.)
- **Contrast:** normal text is at least 4.5:1 on its background, for both companies (Task 2 tests the token pairs; Task 15 measures the rendered pages). Orange, blue or team-coloured text on paper is allowed only with an ink outline (`-webkit-text-stroke`), which the drafts use for big headlines.
- **Phones first:** no sideways scrolling at 390 px (and 360 px); every button, link, field, select and puzzle cell is at least 44 by 44 px on a phone; body text at least 16 px, secondary text at least 12.8 px.
- **Accessibility basics:** `<html lang="en">`; every field has a label (visible or `.sr-only`); a visible focus ring (`4px` ink outline plus a team-colour halo) on everything focusable; decorative icons are `aria-hidden="true"`; colour is never the only signal (states keep their words: Owned, Requested, Shield ready).
- **Global `[hidden] { display: none !important; }`** in `base.css` (the drafts rely on it).
- **No draft-only code.** None of the drafts' `<script>` blocks, countdowns, fake data, "Draft only" control bars (`.ctl` with "Draft controls"), "Draft tool" buttons, the rupee icon, the readonly name field on the login, the organizer username field, the CMO logo style and colour pickers, the shopping-cart request list or its Submit button is copied. Screens show only what the view already contains.
- **No winner wording**, no scores, no trophies (the drafts' "Two companies. One victory." line is not used).
- **Motion:** only small press and hover moves, the pulsing waiting dot and meter width changes; all off with `prefers-reduced-motion: reduce`. There is no phase stinger (the drafts do not show one).
- **Weight budget:** the five stylesheets under 60 KB together, the four `.woff2` files under 80 KB together, `icons.svg` under 12 KB, `logo.svg` under 30 KB (Task 14 tests it).

## Review Focus

1. **The rival's company must never reach a player's screen** through the new markup: a `data-company`, a mark icon (`i-mark-a` / `i-mark-b`) or a name (Task 6 tests every player fixture).
2. **A hook dropped by a restyle** (a class a test or `app.js` relies on, an `id` that `organizer.js` reads such as `swap-a` or `inject-go`, or the exact text `id="clock">2:05<` and `<header class="bar compact">`) must fail the hook inventory test (Task 1), not be found on event day.
3. **Hostile text** (a player named `<script>`) must stay escaped in every new piece of markup, and new SVG markup must use only lower-case tags and plain attributes, because the Plan 2 safety test strips tags with a strict pattern (Task 3).
4. **Orange or blue text on cream** that is not outlined (2.53:1 and 3.98:1) and **white on blue** (4.50:1, the edge) (Tasks 2, 4 and 15).
5. **The cut corners use a pseudo-element trick** (`.card::before` and `::after`); the Sets puzzle cards are `<button class="card ...">` in Plan 4 and must not get the panel look (Task 10).
6. **A 7 by 7 Shikaku or 6 by 6 Tower puzzle on a 390 px phone** must fit with 44 px cells, or scroll inside its own box, never the page (Tasks 10 and 15).
7. **The logo slot** must be one file and one token; a broken logo file (for example an XML comment with `--`) must fail a test, not silently vanish (Task 3).

## File Structure

```
public/css/tokens.css  fonts.css  base.css  player.css  organizer.css   (new; replace public/styles.css)
public/fonts/*.woff2  *.ttf  LICENSES.txt                                (woff2 copied from ui-drafts/fonts; ttf made by scripts/fonts-ttf.mjs)
public/img/logo.svg                                                      (PLACEHOLDER logo, the one file to swap)
public/img/icons.svg                                                     (sprite, generated by scripts/build-icons.mjs)
public/kit.js                                                            (pure markup helpers: icon, logo, companyAttr, roleChips, ...)
public/render.js  render-organizer.js                                    (modify in place: add design markup, keep every hook)
public/index.html  organizer.html                                        (modify: link the new stylesheets)
src/graphs/theme.js  src/graphs/png.js  test/graphs.test.js              (modify, Plan 5 files: cream colours, TTF fonts)
scripts/hooks.js  record-hooks.mjs  contrast.js  build-icons.mjs  fonts-ttf.mjs
test/fixtures/views.js  render-all.js  hooks.json                         (design fixtures, the recorded hook inventory)
test/design-hooks.test.js  tokens.test.js  fonts.test.js  kit.test.js  css-rules.test.js
test/design-screens.test.js  design-organizer.test.js  css-coverage.test.js  design-budget.test.js
visual/playwright.config.mjs  visual/visual.spec.mjs  visual/checks.js  (dev-only browser checks, not in npm test)
test/visual/*.png                                                        (screenshot baselines, 390 px and 1280 px)
```

**Why five stylesheets and not one, and not the drafts' three:** the drafts' `draft.css`, `shell.css` and `play.css` cannot be used as they are: they style the drafts' own markup (`.icard`, `.qrow`, `.tab-b`), they redefine the same names twice (`.count`, `.notes`, `.side`, `.sub`, `.big` mean different things in different sections), and they mix in draft-only parts. So the rules are rewritten for the real class names. They are split by **who loads them**: `tokens.css` is alone so the contrast test reads exactly what the browser uses and so colour cannot drift; `fonts.css` is alone so the font paths are checked in one place; `base.css` is what both apps share (panels, buttons, fields, the header strip, the login card); `player.css` and `organizer.css` are loaded only by their own page, so a phone never downloads the organizer's monitor styles. Five small files over the Pi's own Wi-Fi cost nothing noticeable; one big file would make the player page carry the organizer's rules and would put colours next to layout.

## Edits this plan makes to files from earlier plans

| File | Edit |
| --- | --- |
| `public/styles.css` (Plan 2, extended by Plans 3 and 4) | deleted in Task 4; each of its rules is replaced by a rule in the new files (Tasks 4 to 13) |
| `public/index.html`, `public/organizer.html` | link the new stylesheets instead of `styles.css` (Task 4) |
| `public/render.js`, `public/render-organizer.js` | functions edited in place to add design markup (Tasks 5 to 13); no export removed, no hook removed |
| `src/graphs/theme.js`, `src/graphs/png.js` (Plan 5) | cream and orange and blue colours, the comment no longer points at `docs/design/` (Task 11) |
| `test/graphs.test.js` (Plan 5) | the three colour assertions follow the new `THEME` (Task 11); the only earlier test this plan edits |
| `public/puzzles/ui.js` (Plan 4) | **unchanged**: its Sets cards keep the class `card`; this plan scopes the panel look so it does not apply to them |
| `package.json` | dev dependencies and the scripts `icons`, `fonts:ttf`, `visual`, `visual:update` |

## How to restyle a screen (the method every screen task follows)

1. **Read the code first.** Open the render function named in the task and the test file that covers it. Other plans' agents may have changed them since this plan was written; the task's snippets show the **design additions**, and you merge them into whatever the function is now. If a class name in this plan's CSS differs from the one in the code (for example Plan 3 named the rates panel `.card.rates`), the code wins: change the CSS selector, not the markup.
2. **Open the draft** named in the task (`ui-drafts/<file>.html`, best the copy in `ui-drafts/standalone/`) next to the screen. Copy the look, not the markup and not the script.
3. **Add, never remove.** Add wrappers, icons and new classes; keep every existing class, id and attribute exactly. Strings that tests match exactly (`<header class="bar compact">`, `id="clock">`, `class="hint"`, `id="ev-demand_surge" disabled`, `id="puzzle-slot" data-puzzle-id="7" data-kind="queens"`) stay byte for byte.
4. **Only data the view has.** If a draft panel needs data the view does not carry (the briefing's team list with names, the CFO's transaction history, the CEO's team activity bars, the results' key moments), leave it out and list it in the task report. Do not change `src/views.js` in this plan.
5. **Escape everything from the view** with `esc()`. Anything that goes into an attribute from kit helpers is checked against a fixed list first.
6. Run `npm test`, then `npm run visual` (Task 15 onwards) and look at the screenshots.

## Draft to render function map

| Draft file | Render function (file) | Screen | Task |
| --- | --- | --- | --- |
| `login.html` | `renderLogin` (`render.js`) | Player login | 5 |
| `home.html` | `renderScreen` for `screen: 'lobby'` (`render.js`), and `renderConnecting`, `renderOffline` | Waiting screen | 5 |
| (all player drafts: `.hud`) | `header(v)` and the `renderScreen` wrapper (`render.js`) | Header strip, company theme | 6 |
| `briefing.html` | `briefing(v)` | Briefing and role reveal | 7 |
| `ideation.html` | `ideation(v)` | Idea vote and CEO pick | 7 |
| `workshop-cto.html`, `studio-cmo.html`, `workshop-coo.html`, `treasury-cfo.html`, `command-ceo.html` | `shop(v)` and its parts `catalogItem`, `queueList`, `awaitingList`, `ownedPanel` (after Plan 3: `shopBody(v)`) | Shop for each role | 8 |
| none (same style) | `summary(v)` | Summary card | 9 |
| none (same style; `.hud`, `.metrics`, `.decide` of `command-ceo.html` as reference) | `renderCompetition(v)`, `ratesPanel`, `attackPanel`, `shieldPanel`, `hintCard`, the banners (Plan 3 Task 11) | Competition | 9 |
| none (same style) | `renderPuzzlePanel(v)` (Plan 4 Task 6) and `public/puzzles/ui.js` output | CFO puzzle panel | 10 |
| `results.html` | `renderScreen` `ended` branch and `graphs` screen, `graphsHtml` (Plan 5 Task 3) | Thank you, then the three graphs | 11 |
| `organizer.html` | `renderOrganizerLogin` (`render-organizer.js`) | Organizer login | 12 |
| `organizer-lobby.html` | `renderOrganizer` with `game: null`: `lobby(v, ui)`, `seatSelect`, `importSummary` | Lobby and seats | 12 |
| `monitor-organizer.html` | `renderOrganizer` with a game: `panel`, `seatTools`, `confirmButton`, the Plan 3 `control(g)` and the Plan 5 reveal and download card | Running game and live monitor | 13 |

---

### Task 1: Design fixtures and the hook inventory (before any markup changes)

**Files:**
- Create: `test/fixtures/views.js`, `test/fixtures/render-all.js`, `scripts/hooks.js`, `scripts/record-hooks.mjs`, `test/fixtures/hooks.json` (generated), `test/design-hooks.test.js`

**Interfaces:**
- Produces: `PLAYER` and `ORGANIZER` (named fixture views for every screen), `renderAll() -> { [name]: html }`, `hooksOf(html) -> string[]` (sorted: `#id`, `.class`, `[data-x=value]`, `send:type(keys)`, `input[name=x]`).
- Consumes: `renderLogin`, `renderScreen` (`public/render.js`), `renderOrganizer`, `renderOrganizerLogin` (`public/render-organizer.js`), the view shapes of `src/views.js`.

This task changes no product code. It must be done first, because the inventory is recorded from the markup **as it is before the redesign**.

- [ ] **Step 1: Write the fixtures**

Build the views from the shapes in `src/views.js` and from the views the existing render tests already use (`test/render.test.js`, `test/render-competition.test.js`, `test/render-puzzle.test.js`, `test/render-results.test.js`, `test/render-organizer.test.js`; read them now, they show the exact fields Plans 3 to 5 added). Every screen and role gets one fixture; Company B gets at least a briefing, a shop and a Competition fixture.

`test/fixtures/views.js`:

```js
// Realistic views for every screen. Used by the design tests (npm test) and by visual/visual.spec.mjs.
// Keep them in the shapes src/views.js produces. When Plans 3 to 5 add fields, add them here too.
const me = (role, company = 'A') => ({ admissionId: 'S1', name: 'Asha Verma', status: 'in_game', company, role, gameId: 1 });
const problem = { id: 1, title: 'Food waste', statement: 'Homes, canteens and shops throw away huge amounts of good food every day.' };
const idea = { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A small sensor inside the fridge that tracks what is inside and how fresh it is.' };
const ideas = [
  { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A sensor that tracks freshness inside the fridge.', votes: 2, mine: true },
  { id: 'H2', type: 'hardware', name: 'Canteen Waste Scale', description: 'A bin scale that shows which dishes get wasted.', votes: 1, mine: false },
  { id: 'H3', type: 'hardware', name: 'Surplus Food Locker', description: 'A public locker for extra food, free to pick up.', votes: 0, mine: false },
  { id: 'S1', type: 'software', name: 'Expiry Reminder App', description: 'Scan groceries and get a warning before they expire.', votes: 1, mine: false },
  { id: 'S2', type: 'software', name: 'Leftover Recipe Finder', description: 'Suggests meals from what you already have.', votes: 1, mine: false },
  { id: 'S3', type: 'software', name: 'Food Share Network', description: 'Neighbours post surplus food and others claim it.', votes: 0, mine: false },
];
const item = (id, section, role, label, price, state, viewer, extra = {}) => ({
  id, name: label, label, option: '', section, role, cost: price, price: state === 'owned' ? null : price, state,
  note: state === 'wait' ? 'Ready again in 42 s' : '', canRequest: state === 'available' && viewer === role,
  canRecommend: state === 'available' && viewer === 'CEO', choices: null, ...extra,
});
const catalog = (viewer) => [
  item('F01-B', 'Core Features', 'CTO', 'Core Function (Basic)', 100, 'available', viewer),
  item('F02-B', 'Core Features', 'CTO', 'Connectivity (Basic)', 80, 'requested', viewer),
  item('F03-B', 'Core Features', 'CTO', 'User Interface (Basic)', 70, 'owned', viewer),
  item('HC02', 'Hardware Parts', 'CTO', 'Microcontroller Board', 120, 'available', viewer),
  item('M01-N', 'Target User', 'CMO', 'Target User (Small niche)', 50, 'available', viewer),
  item('M02', 'Brand', 'CMO', 'Brand name', 40, 'available', viewer, { choices: ['FreshSense', 'ChillWatch', 'KeepFresh'] }),
  item('M04-S', 'Ad Campaign', 'CMO', 'Ad Campaign (Social posts)', 80, 'wait', viewer),
  item('O01', 'Risk Fixes', 'COO', 'Fix: Sensor gives wrong freshness readings', 60, 'available', viewer),
  item('O06', 'Protection', 'COO', 'Attack Shield', 150, 'available', viewer),
];
const queue = [
  { id: 7, itemId: 'M01-N', label: 'Target User (Small niche)', price: 50, by: 'Mira', recommended: false, head: true },
  { id: 8, itemId: 'O01', label: 'Fix: Sensor gives wrong freshness readings', price: 60, by: 'Dev', recommended: true, head: false },
];
const owned = [{ itemId: 'F03-B', label: 'User Interface (Basic)', charged: 70 }, { itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }];
const base = (role, phase, remainingSec, over = {}) => ({ me: me(role), screen: 'game', clock: { phase, remainingSec }, problem, wallet: 1000, idea: null, ideation: null, shop: null, owned: [], summary: null, ...over });
const shop = (role, company = 'A', phase = 'shop', remainingSec = 300) => ({
  ...base(role, phase, remainingSec, { idea, wallet: 890, owned }), me: me(role, company),
  shop: {
    open: true, catalog: catalog(role),
    mine: role === 'CTO' ? [{ id: 2, itemId: 'F02-B', label: 'Connectivity (Basic)', status: 'awaiting_ceo' }] : [],
    ...(role === 'CFO' || role === 'CEO' ? { queue } : {}),
    ...(role === 'CEO' ? { awaitingCeo: [{ id: 2, itemId: 'F02-B', label: 'Connectivity (Basic)', price: 80, by: 'Asha', recommended: false, head: false }] } : {}),
  },
});
// Plan 3 Task 9 competition block. Add puzzle fields from Plan 4 Task 5 for the CFO.
const comp = (over = {}) => ({ rates: { CTO: 6.5, CMO: 16.5, COO: 27, total: 50 }, notices: [], hint: null, shield: null, attack: null, ...over });
const ATTACKS = [{ key: 'price_squeeze', name: 'Price Squeeze', cost: 120 }, { key: 'bank_freeze', name: 'Bank Freeze', cost: 200 }, { key: 'market_crash', name: 'Market Crash', cost: 450 }];

export const PLAYER = {
  lobby: { screen: 'lobby', me: { ...me('CTO'), status: 'lobby' } },
  'lobby-unseated': { screen: 'lobby', me: { ...me(null, null), status: 'lobby' } },
  'briefing-cto': base('CTO', 'briefing', 165),
  'briefing-b-ceo': { ...base('CEO', 'briefing', 165), me: me('CEO', 'B') },
  'ideation-cto': base('CTO', 'ideation', 92, { ideation: { ideas, picked: null, canPick: false } }),
  'ideation-ceo': base('CEO', 'ideation', 92, { ideation: { ideas, picked: null, canPick: true } }),
  'ideation-picked': base('CMO', 'ideation', 40, { ideation: { ideas, picked: 'H1', canPick: false } }),
  'shop-cto': shop('CTO'), 'shop-cmo': shop('CMO'), 'shop-coo': shop('COO'), 'shop-cfo': shop('CFO'), 'shop-ceo': shop('CEO'),
  'shop-b-cto': shop('CTO', 'B'),
  summary: base('CTO', 'summary', 14, { idea, wallet: 890, owned, summary: { idea, owned, wallet: 890 } }),
  'competition-cto': { ...shop('CTO', 'A', 'competition', 500), competition: comp({ hint: { text: 'Your product is behind: a better Core Function would help.' } }) },
  'competition-ceo': { ...shop('CEO', 'A', 'competition', 115), clock: { phase: 'competition', remainingSec: 115, warning: '2min' }, competition: comp({ notices: ['Stock market prices have fallen'], attack: { options: ATTACKS, cooldownLeftSec: 42, lockedReason: 'cooldown', launches: [] } }) },
  'competition-b-ceo': { ...shop('CEO', 'B', 'competition', 500), competition: comp({ attack: { options: ATTACKS, cooldownLeftSec: 0, lockedReason: null, launches: [] } }) },
  'competition-coo': { ...shop('COO', 'A', 'competition', 8), clock: { phase: 'competition', remainingSec: 8, warning: 'last10' }, competition: comp({ shield: { owned: true, used: false }, hint: { text: 'Your part of the sales is holding the company back.' } }) },
  'competition-cfo': { ...shop('CFO', 'A', 'competition', 500), competition: comp({ puzzle: null, puzzlesDone: { solved: 1, skipped: 0 } }) },
  ended: base('CTO', 'ended', 0),
  graphs: { screen: 'graphs', me: { ...me('CTO'), status: 'completed' }, gameId: 1 },
};

const ROLES5 = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
const NAMES = ['Aarav Sharma', 'Diya Nair', 'Rohan Mehta', 'Sneha Iyer', 'Karthik Rao', 'Ananya Gupta', 'Vivaan Singh', 'Ishita Verma', 'Aditya Kulkarni', 'Meera Reddy', 'Kabir Das', 'Zoya Khan'];
const people = (status) => NAMES.map((name, i) => ({
  admission_id: `DSA${String(i + 1).padStart(3, '0')}`, name, status: i < 10 ? status : 'lobby',
  company: i < 10 ? (i < 5 ? 'A' : 'B') : null, role: i < 10 ? ROLES5[i % 5] : null, game_id: i < 10 && status === 'in_game' ? 1 : null,
}));
const company = (wallet, ideaName) => ({ wallet, idea: ideaName ? { id: 'H1', name: ideaName } : null, pickSource: ideaName ? 'ceo' : null, votes: { H1: 3, S1: 2 }, owned, queue: [{ id: 7, label: 'Target User (Small niche)', price: 50, by: 'Mira' }], awaitingCeo: [] });
const game = (phase, remainingSec, over = {}) => ({ id: 3, problemId: 1, stuck: [], clock: { phase, remainingSec }, companies: { A: company(890, 'Smart Fridge Sensor'), B: company(760, 'Expiry Reminder App') }, attacks: [], eventUsed: null, injectionUsed: null, ...over });

export const ORGANIZER = {
  'org-lobby': { screen: 'organizer', problems: [{ id: 1, title: 'Food waste' }, { id: 2, title: 'Water shortage' }], participants: people('lobby'), game: null },
  'org-briefing': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('briefing', 150) },
  'org-running': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('shop', 245) },
  'org-competition': { screen: 'organizer', problems: [], participants: people('in_game'), game: game('competition', 400, {
    attacks: [{ id: 1, attacker: 'A', victim: 'B', name: 'Market Crash', cost: 450, at: 0, endsAt: 40000, blocked: false, by: 'S0' }], eventUsed: 'shop_sale' }) },
};
```

If Plan 4 or Plan 5 is built, also add `competition-cfo-puzzle` (copy the open-puzzle view from `test/render-puzzle.test.js`, with `puzzle` from `PUZZLES.queens.generate(2, mulberry32(7))` so the grid is real), `graphs-shown` (a `graphs` screen with `graphs` from `test/render-results.test.js`) and `org-ended` (`game.ended: true, revealed: false`). Missing plans: leave those fixtures out and note it in the task report.

`test/fixtures/render-all.js`:

```js
import { renderLogin, renderScreen } from '../../public/render.js';
import { renderOrganizer, renderOrganizerLogin } from '../../public/render-organizer.js';
import { PLAYER, ORGANIZER } from './views.js';

// Every fixture rendered to HTML, keyed by name. Organizer fixtures get the ui states that change markup.
export function renderAll() {
  const out = { login: renderLogin(''), 'login-error': renderLogin('That ID is not on the list.'), 'org-login': renderOrganizerLogin('Wrong password.') };
  for (const [k, v] of Object.entries(PLAYER)) out[k] = renderScreen(v);
  for (const [k, v] of Object.entries(ORGANIZER)) out[k] = renderOrganizer(v, {});
  out['org-lobby-import'] = renderOrganizer(ORGANIZER['org-lobby'], { importResult: { added: 12, skipped: 0, rejected: [{ line: 14, reason: 'blank admission id' }] } });
  out['org-confirm'] = renderOrganizer(ORGANIZER['org-running'], { confirm: 'end_game' });
  out['org-offline'] = renderOrganizer(ORGANIZER['org-running'], { offline: true });
  return out;
}
```

- [ ] **Step 2: Write the hook extractor and the recorder**

`scripts/hooks.js`:

```js
// The "hooks" in a piece of markup: every id, class, data-* attribute, data-send message shape and form field name.
// app.js, organizer.js and the tests of Plans 2 to 5 depend on these, so the redesign may add hooks but never drop one.
export function hooksOf(html) {
  const out = new Set();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) out.add(`#${id}`);
  for (const [, cls] of html.matchAll(/\sclass="([^"]*)"/g)) for (const c of cls.split(/\s+/).filter(Boolean)) out.add(`.${c}`);
  // data-* values are kept when they are words (data-confirm="end_game"), dropped when they are per-row ids.
  for (const [, name, val] of html.matchAll(/\s(data-(?!send)[\w-]+)(?:="([^"]*)")?/g)) {
    out.add(`[${name}${val !== undefined && /^[a-z_]+$/.test(val) ? `=${val}` : ''}]`);
  }
  for (const [, json] of html.matchAll(/data-send='([^']*)'/g)) {
    const m = JSON.parse(json.replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    out.add(`send:${m.type}(${Object.keys(m).filter((k) => k !== 'type').sort().join(',')})`);
  }
  for (const [, tag, name] of html.matchAll(/<(input|select|textarea)\b[^>]*\sname="([^"]+)"/g)) out.add(`${tag}[name=${name}]`);
  return [...out].sort();
}
```

`scripts/record-hooks.mjs`:

```js
// Run ONCE, before any markup change in this plan: node scripts/record-hooks.mjs > test/fixtures/hooks.json
import { hooksOf } from './hooks.js';
import { renderAll } from '../test/fixtures/render-all.js';

const out = {};
for (const [name, html] of Object.entries(renderAll())) out[name] = hooksOf(html);
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
```

- [ ] **Step 3: Write the test**

`test/design-hooks.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hooksOf } from '../scripts/hooks.js';
import { renderAll } from './fixtures/render-all.js';

const recorded = JSON.parse(readFileSync('test/fixtures/hooks.json', 'utf8'));
const now = renderAll();

test('the hook extractor finds ids, classes, data hooks, messages and field names', () => {
  const h = hooksOf(`<form id="login" class="card x"><input name="id"><button data-confirm="end_game" data-send='{"type":"vote","ideaId":"H1"}'>V</button></form>`);
  assert.deepEqual(h, ['#login', '.card', '.x', '[data-confirm=end_game]', 'input[name=id]', 'send:vote(ideaId)']);
});

for (const [name, hooks] of Object.entries(recorded)) {
  test(`${name}: the redesign keeps every id, class, data hook and message of the old markup`, () => {
    assert.ok(now[name], `fixture ${name} is missing`);
    const have = new Set(hooksOf(now[name]));
    assert.deepEqual(hooks.filter((h) => !have.has(h)), []);
  });
}
```

- [ ] **Step 4: Record and run**

Run: `node scripts/record-hooks.mjs > test/fixtures/hooks.json && npm test`
Expected: PASS. `test/fixtures/hooks.json` lists one array per fixture (for example `shop-ceo` contains `#clock`, `.bar`, `.compact`, `.hint`, `.req`, `.head`, `[data-key]`, `send:ceo_decide(approve,requestId)`, `send:recommend(itemId)`). Open it and check that every fixture rendered a real screen (no fixture whose only hooks are `.card` and `.muted` from "Something went wrong"); fix the fixture if so and record again.

From now on `test/fixtures/hooks.json` is **never regenerated in this plan**. If a later task makes a hook test fail, put the hook back.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures scripts/hooks.js scripts/record-hooks.mjs test/design-hooks.test.js
git commit -m "test: design fixtures and the recorded hook inventory"
```

---

### Task 2: Offline fonts and the colour tokens

**Files:**
- Create: `public/fonts/` (four `.woff2` copied from `ui-drafts/fonts/`, `LICENSES.txt`), `public/css/tokens.css`, `public/css/fonts.css`, `scripts/contrast.js`, `test/tokens.test.js`, `test/fonts.test.js`

**Interfaces:**
- Produces: the custom properties `--paper --field --ink --white --orange --blue --blue-hi --muted --stone --track --locked --placeholder --tint-a --tint-b --rail --good --good-fill --bad --alarm --slab --block --mono --line --line-thick --shadow --shadow-sm --chamfer --radius --tap --logo` and the company set `--team --team-ink --team-on-ink --team-soft` (default Company A; `[data-company="B"]` swaps it); `contrast(a, b)`, `luminance(hex)`, `readTokens(css) -> { root, A, B }`.

- [ ] **Step 1: Write the failing tests**

`test/tokens.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, readTokens } from '../scripts/contrast.js';

const t = readTokens(readFileSync('public/css/tokens.css', 'utf8'));

test('the contrast function matches known values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
});

test('the draft colours are the tokens, orange for Company A and blue for Company B', () => {
  assert.equal(t.root.paper, '#FBF0D9');
  assert.equal(t.root.orange, '#FF6A1F');
  assert.equal(t.root.ink, '#111111');
  assert.equal(t.root.blue, '#2E6BFF');
  assert.equal(t.A.team, '#FF6A1F');
  assert.equal(t.B.team, '#2E6BFF');
  assert.equal(t.root.team, t.A.team); // no data-company (login, waiting before a seat) looks like Company A
});

// [text, background] pairs the stylesheets use for normal-size text (WCAG AA, 4.5:1).
const PAIRS = [
  ['ink', 'paper'], ['ink', 'field'], ['ink', 'stone'], ['ink', 'track'], ['ink', 'locked'], ['ink', 'tint-a'], ['ink', 'tint-b'],
  ['ink', 'orange'], ['ink', 'good-fill'], ['paper', 'ink'], ['muted', 'paper'], ['muted', 'field'], ['muted', 'stone'],
  ['bad', 'paper'], ['good', 'paper'], ['white', 'bad'], ['alarm', 'ink'], ['placeholder', 'field'], ['stone', 'rail'], ['paper', 'rail'],
];
for (const co of ['A', 'B']) {
  test(`company ${co}: every text and background pair reads at 4.5:1 or better`, () => {
    const set = t[co];
    for (const [fg, bg] of [...PAIRS, ['team-ink', 'team'], ['team-on-ink', 'ink'], ['ink', 'team-soft']]) {
      const r = contrast(set[fg], set[bg]);
      assert.ok(r >= 4.5, `${co}: ${fg} on ${bg} is ${r.toFixed(2)}`);
    }
  });
}

test('orange and blue are too light for small text on paper (so the CSS outlines them, see css-rules.test.js)', () => {
  assert.ok(contrast(t.root.orange, t.root.paper) < 3);
  assert.ok(contrast(t.root.blue, t.root.paper) < 4.5);
});
```

`test/fonts.test.js`:

```js
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`ENOENT ... public/css/tokens.css`)

- [ ] **Step 3: Write the implementation**

Copy the fonts: `mkdir -p public/fonts public/css && cp ui-drafts/fonts/*.woff2 public/fonts/`.

`public/fonts/LICENSES.txt`: one paragraph per font with its name, its copyright line and "Licensed under the SIL Open Font License, Version 1.1", then the full OFL 1.1 text once at the end. Take the copyright lines and the licence text from the font packages while online (`npm pack @fontsource/alfa-slab-one @fontsource/archivo-black @fontsource/space-mono` in a temporary folder, each has a `LICENSE` file; do not add these packages to the project). The three fonts are by JM Solé (Alfa Slab One), Omnibus-Type (Archivo Black) and Colophon Foundry (Space Mono).

`public/css/tokens.css`:

```css
/* Design tokens. The ONLY file with colour values (test/css-rules.test.js enforces this).
   Source: ui-drafts/draft.css, shell.css, play.css. */
:root {
  --paper: #FBF0D9; --field: #FFF8E6; --ink: #111111; --white: #FFFFFF;
  --orange: #FF6A1F; --blue: #2E6BFF; --blue-hi: #6FA0FF;
  --muted: #555555; --stone: #D9D4C8; --track: #E6DFCF; --locked: #F1E5C9; --placeholder: #77706A;
  --tint-a: #FFE6D2; --tint-b: #DCE6FF; --rail: #2A2A2A;
  --good: #1E7B34; --good-fill: #2E9E4F; --bad: #B3261E; --alarm: #FF4B4B;
  --slab: "Alfa Slab One", Rockwell, Georgia, serif;
  --block: "Archivo Black", "Arial Black", Impact, sans-serif;
  --mono: "Space Mono", "Courier New", monospace;
  --line: 3px; --line-thick: 5px; --shadow: 6px; --shadow-sm: 3px; --chamfer: 22px; --radius: 8px; --tap: 44px;
  --logo: url("/img/logo.svg"); /* THE logo slot: swap public/img/logo.svg, or point this at the new file */
  /* Company theme. Company A (Alpha) is the default; [data-company="B"] (Beta) swaps it. */
  --team: var(--orange); --team-ink: var(--ink); --team-on-ink: var(--orange); --team-soft: var(--tint-a);
}
[data-company="A"] { --team: var(--orange); --team-ink: var(--ink); --team-on-ink: var(--orange); --team-soft: var(--tint-a); }
[data-company="B"] { --team: var(--blue); --team-ink: var(--white); --team-on-ink: var(--blue-hi); --team-soft: var(--tint-b); }
```

What the four company tokens mean, so later tasks pick the right one: `--team` is the company fill (buttons, tabs, meters, halftone dots); `--team-ink` is text **on** that fill (ink on orange 6.59:1, white on blue 4.50:1); `--team-on-ink` is company-coloured text **on black** (the timer digits, tabs on ink: orange 6.59:1, light blue 7.33:1, because plain blue on black is only 4.19:1); `--team-soft` is a pale tint behind ink text (owned items, the chosen idea).

Note for later tasks: a custom property that **contains** `var(--team)` (for example a `--dots` gradient token) is resolved where it is declared, on `:root`, so it would stay orange inside Company B. Anything that must follow the company uses `var(--team)` directly in the rule (see the `.dots` rule in Task 4).

`public/css/fonts.css`:

```css
/* Offline fonts, served from the Pi. Files copied from ui-drafts/fonts (SIL Open Font License 1.1, see public/fonts/LICENSES.txt). */
@font-face { font-family: "Alfa Slab One"; font-weight: 400; src: url("../fonts/alfa-slab-one-latin-400-normal.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Archivo Black"; font-weight: 400; src: url("../fonts/archivo-black-latin-400-normal.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Space Mono"; font-weight: 400; src: url("../fonts/space-mono-latin-400-normal.woff2") format("woff2"); font-display: swap; }
@font-face { font-family: "Space Mono"; font-weight: 700; src: url("../fonts/space-mono-latin-700-normal.woff2") format("woff2"); font-display: swap; }
```

`scripts/contrast.js`:

```js
// WCAG contrast and a small reader for public/css/tokens.css. Used by test/tokens.test.js and visual/checks.js.
export function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The custom properties of :root, [data-company="A"] and [data-company="B"], with var(--x) references resolved.
export function readTokens(css) {
  const block = (sel) => {
    const m = css.match(new RegExp(`${sel.replace(/[[\]"=]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
    if (!m) throw new Error(`no ${sel} block in tokens.css`);
    return Object.fromEntries([...m[1].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
  };
  const root = block(':root');
  const resolve = (set) => {
    const out = { ...set };
    for (let n = 0; n < 5; n++) for (const k of Object.keys(out)) out[k] = out[k].replace(/var\(--([\w-]+)\)/g, (_, r) => out[r] ?? root[r] ?? `var(--${r})`);
    return out;
  };
  return { root: resolve(root), A: resolve({ ...root, ...block('[data-company="A"]') }), B: resolve({ ...root, ...block('[data-company="B"]') }) };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (all earlier tests too; nothing links the new files yet).

- [ ] **Step 5: Commit**

```bash
git add public/fonts public/css/tokens.css public/css/fonts.css scripts/contrast.js test/tokens.test.js test/fonts.test.js
git commit -m "feat: offline fonts and the cream, orange and blue colour tokens"
```

---

### Task 3: The logo slot, the icon sprite and the markup kit

**Files:**
- Create: `public/img/logo.svg`, `scripts/build-icons.mjs`, `public/img/icons.svg` (generated), `public/kit.js`, `test/kit.test.js`
- Modify: `package.json` (script `"icons": "node scripts/build-icons.mjs"`)

**Interfaces:**
- Produces (`public/kit.js`): `ROLES`, `ROLE_ICON`, `ROLE_TITLE`, `PHASES`, `icon(id, cls = 'i') -> html`, `companyOf(c) -> 'A'|'B'|''`, `roleOf(r) -> role|''`, `phaseOf(p) -> phase|''`, `companyAttr(c) -> ' data-company="A"'|''`, `companyMark(c) -> html`, `logo(cls = 'logo') -> html`, `roleChips(mine) -> html`.
- Produces: `public/img/icons.svg` with the symbols `i-adduser i-app i-bars i-bolt i-bulb i-chip i-clock i-coins i-crown i-doc i-docc i-edit i-gear i-half i-info i-lock i-mark-a i-mark-b i-mega i-play i-refresh i-shield i-target i-user i-users` (the drafts' own symbols, minus `i-rupee`, plus a few this game needs).
- The logo: one file, `public/img/logo.svg`, shown through the `--logo` token by the class `.logo` (Task 4). Render functions emit `logo()`, a `<span role="img" aria-label="Makerspace logo">`, never an `<img>` (the Plan 2 safety test forbids `<img` in player output).

- [ ] **Step 1: Write the failing tests**

`test/kit.test.js`:

```js
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
  const svg = readFileSync('public/img/logo.svg', 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /PLACEHOLDER/);
  // "--" inside an XML comment makes the whole file invalid and the logo silently disappears.
  for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.equal(body.includes('--'), false);
  assert.ok(statSync('public/img/logo.svg').size < 30 * 1024);
  assert.ok(statSync('public/img/icons.svg').size < 12 * 1024);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (cannot find `public/kit.js`)

- [ ] **Step 3: Write the implementation**

`public/img/logo.svg`: the Makerspace badge from `ui-drafts/login.html` (the first `<svg class="logo" ...>` in the topbar), with its opening tag replaced so it stands alone:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<!-- PLACEHOLDER Makerspace logo from ui-drafts/login.html. Replace this file with the real logo. Keep the file name, or point the logo token in public/css/tokens.css at the new file. -->
...the circles, the arc text and the tree from the draft, unchanged...
</svg>
```

(An SVG shown as a CSS background cannot load web fonts, so the arc text falls back to a system monospace font. That is fine for a placeholder.) **Swapping the logo later:** replace `public/img/logo.svg` with the real one (any size, square works best). If the real logo is a PNG, save it as `public/img/logo.png` and change the one line `--logo: url("/img/logo.png");` in `tokens.css`. Nothing else changes.

`scripts/build-icons.mjs`:

```js
// Builds public/img/icons.svg (one <symbol> per icon) from the symbols in ui-drafts/*.html plus a few extra icons.
// Run: npm run icons   (only needed again if the drafts change)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Icons the drafts do not define but the real screens need.
export const EXTRA = {
  'i-mark-a': '<symbol id="i-mark-a" viewBox="0 0 118 100"><path d="M2,98 L48,2 H66 L112,98 H90 L81,76 H44 L35,98 Z M50,58 H74 L62,28 Z" fill-rule="evenodd" style="fill:var(--team)" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></symbol>',
  'i-mark-b': '<symbol id="i-mark-b" viewBox="0 0 118 100"><path d="M14,2 H74 C98,2 106,18 104,32 C102,42 96,47 90,49 C102,52 110,62 108,76 C106,90 94,98 76,98 H14 Z M40,22 V40 H68 C76,40 79,36 79,31 C79,26 76,22 68,22 Z M40,60 V78 H72 C80,78 83,74 83,69 C83,64 80,60 72,60 Z" fill-rule="evenodd" style="fill:var(--team)" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></symbol>',
  'i-shield': '<symbol id="i-shield" viewBox="0 0 32 32"><path d="M16,2 L28,7 V15 C28,23 22,28 16,30 C10,28 4,23 4,15 V7 Z"/></symbol>',
  'i-bolt': '<symbol id="i-bolt" viewBox="0 0 32 32"><path d="M18,2 L5,18 H14 L12,30 L27,12 H17 Z"/></symbol>',
  'i-bulb': '<symbol id="i-bulb" viewBox="0 0 32 32"><path d="M16,2 C9,2 5,7 5,12 C5,16 7,18 10,21 V25 H22 V21 C25,18 27,16 27,12 C27,7 23,2 16,2 Z M11,27 H21 V30 H11 Z"/></symbol>',
  'i-lock': '<symbol id="i-lock" viewBox="0 0 32 32"><path d="M9,14 V10 A7,7 0 0 1 23,10 V14" fill="none" stroke="currentColor" stroke-width="3.4"/><rect x="5" y="14" width="22" height="16" rx="2"/></symbol>',
  'i-app': '<symbol id="i-app" viewBox="0 0 32 32"><rect x="8" y="2" width="16" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><rect x="12" y="7" width="8" height="12"/><circle cx="16" cy="25" r="2"/></symbol>',
};

// Draft colours become currentColor (ink) and tokens, so icons follow the theme.
const COLOURS = [[/#111111|#111\b/gi, 'currentColor'], [/#FBF0D9/gi, 'var(--paper)'], [/#FF6A1F/gi, 'var(--team)']];

export function buildSprite(draftsDir) {
  const symbols = new Map();
  for (const f of readdirSync(draftsDir).filter((n) => n.endsWith('.html')).sort()) {
    for (const m of readFileSync(join(draftsDir, f), 'utf8').matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)) {
      if (m[1] === 'i-rupee' || symbols.has(m[1])) continue; // the game's money is coins, never rupees
      // var() is not reliable in presentation attributes, so fill="var(--x,#y)" becomes a style.
      let s = m[0].replace(/fill="var\((--[\w-]+),([^)]*)\)"/g, 'style="fill:var($1,$2)"');
      for (const [re, to] of COLOURS) s = s.replace(re, to);
      symbols.set(m[1], s);
    }
  }
  for (const [id, s] of Object.entries(EXTRA)) symbols.set(id, s);
  const body = [...symbols.keys()].sort().map((k) => symbols.get(k)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- Generated by scripts/build-icons.mjs from ui-drafts/*.html. Do not edit by hand. -->\n${body}\n</svg>\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[3] || 'public/img/icons.svg';
  writeFileSync(out, buildSprite(process.argv[2] || 'ui-drafts'));
  console.log(`wrote ${out}`);
}
```

(The `COLOURS` replacement turns `var(--hole,#FBF0D9)` into `var(--hole,var(--paper))`, which is valid CSS. If the sprite test finds a leftover hex, extend `COLOURS`.)

Add `"icons": "node scripts/build-icons.mjs"` to `package.json` scripts and run `npm run icons`.

`public/kit.js`:

```js
// Shared markup pieces for the design (Plan 7). Pure functions: no DOM, tested in Node.
// Nothing here takes player text. Every input is checked against a fixed list, so nothing needs escaping.
export const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
export const PHASES = ['briefing', 'ideation', 'shop', 'summary', 'competition', 'ended'];
export const ROLE_ICON = { CEO: 'i-crown', CTO: 'i-chip', CFO: 'i-coins', CMO: 'i-mega', COO: 'i-gear' };
export const ROLE_TITLE = { CEO: 'Chief Executive Officer', CTO: 'Chief Technology Officer', CFO: 'Chief Financial Officer', CMO: 'Chief Marketing Officer', COO: 'Chief Operating Officer' };
const ICON_ID = /^i-[a-z0-9-]+$/;
const cleanClass = (c) => String(c).replace(/[^\w -]/g, '');

// <svg><use></svg> from the sprite. Lower-case tags and plain attributes only: the Plan 2 safety test strips tags with a strict pattern.
export function icon(id, cls = 'i') {
  if (!ICON_ID.test(id)) return '';
  return `<svg class="${cleanClass(cls)}" aria-hidden="true" focusable="false"><use href="/img/icons.svg#${id}"></use></svg>`;
}

// The only company letters, roles and phases that may reach the markup. Anything else gives ''.
export const companyOf = (c) => (c === 'A' || c === 'B' ? c : '');
export const roleOf = (r) => (ROLES.includes(r) ? r : '');
export const phaseOf = (p) => (PHASES.includes(p) ? p : '');

// data-company drives the theme (tokens.css). On player screens it is ALWAYS the viewer's own company.
export const companyAttr = (c) => (companyOf(c) ? ` data-company="${companyOf(c)}"` : '');
export const companyMark = (c) => icon(companyOf(c) === 'B' ? 'i-mark-b' : 'i-mark-a', 'mark');

// The logo slot. The picture is the --logo token in tokens.css (public/img/logo.svg). Not an <img>: see the Plan 2 safety test.
export const logo = (cls = 'logo') => `<span class="${cleanClass(cls)}" role="img" aria-label="Makerspace logo"></span>`;

// The five role chips of the drafts' header, the viewer's own one highlighted.
export function roleChips(mine) {
  return `<span class="roles">${ROLES.map((r) => `<span class="${r === mine ? 'on' : ''}" title="${r}">${icon(ROLE_ICON[r])}<span class="sr-only">${r}${r === mine ? ' (you)' : ''}</span></span>`).join('')}</span>`;
}
```

(The drafts use a rupee symbol for the CFO; this game's money is coins, so the CFO's icon is `i-coins`.)

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/img public/kit.js scripts/build-icons.mjs test/kit.test.js package.json
git commit -m "feat: placeholder logo slot, icon sprite from the drafts and the markup kit"
```

---
### Task 4: The shared stylesheet, the page shells and the CSS rule tests

**Files:**
- Create: `public/css/base.css`, `public/css/player.css` (header comment only for now), `public/css/organizer.css` (header comment only for now), `test/css-rules.test.js`
- Modify: `public/index.html`, `public/organizer.html`
- Delete: `public/styles.css` (first read it: every rule in it, including the ones Plans 3 and 4 added, must have a replacement in Tasks 4 to 13; write the list into your task report and tick it off as you go)

**Interfaces:**
- Produces (`base.css`): the global rules (`[hidden]`, focus ring, reduced motion), `.sr-only`, `.i` (icon size), `.logo` (the logo slot), `.dots` (halftone in the company colour), the panel look for `.card` on `section, details, form, aside, article, div` (thick outline, hard shadow, cut top-right corner, first heading as a black slanted tab), `button`, `button.primary`, `button.danger`, `button[disabled]`, fields, tables, `.muted`, `.error`, `.big`, `.warn`, `.offline`, `.confirm`, the header strip `header.bar` with `.who`, `.phase`, `.wallet`, `.pill` and `#clock` (`#clock.red` for the last 10 s), the login card (`.topbar`, `.title`, `.sub`, `form#login`, `.field`, `button.join`, `.info`, `.org-link`) and `#toast`.
- Page shells: `index.html` loads `tokens, fonts, base, player`; `organizer.html` loads `tokens, fonts, base, organizer`.

Why `.card` uses pseudo-elements: the drafts cut the corner with `clip-path` on an inner box and draw the shadow with `filter: drop-shadow` on an outer box. The render functions have one element per panel, so `base.css` paints the ink outline (`::before`) and the paper (`::after`) as two clipped layers behind the content, and puts the drop shadow on the panel itself. The selector names the element types on purpose: Plan 4's Sets puzzle cards are `<button class="card ...">` and must not get the panel look.

- [ ] **Step 1: Write the failing test**

`test/css-rules.test.js`:

```js
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`base.css` missing, `styles.css` still present)

- [ ] **Step 3: Write the implementation**

`public/index.html` (keep everything else that is in it now, for example extra scripts other plans added):

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Startup Showdown</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/fonts.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/player.css">
</head>
<body>
  <div id="app"></div>
  <div id="toast" role="alert"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

`public/organizer.html`: the same, with the title `Startup Showdown: Organizer`, `/css/organizer.css` as the last stylesheet and `/organizer.js` as the script.

`public/css/player.css` and `public/css/organizer.css` start as one comment line each (`/* Player screens. Built from ui-drafts/play.css and draft.css, keyed to the class names the render functions emit. */` and `/* Organizer pages. Built from ui-drafts/shell.css, organizer.html and the live monitor part of play.css. */`); Tasks 5 to 13 fill them.

`public/css/base.css`:

```css
/* Shared look for the player and organizer pages: reset, type, buttons, fields, panels, header strip, toast.
   Colours come only from tokens.css. Built from ui-drafts/draft.css (cut corners, hard shadows, focus ring). */
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
html, body { margin: 0; }
body { background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--mono); min-height: 100vh; }
img, svg { max-width: 100%; }
a { color: inherit; text-underline-offset: 4px; }
h1, h2, h3, h4 { margin: 0 0 .5rem; font-weight: 400; line-height: 1.1; }
h1 { font: 400 clamp(1.8rem, 5vw, 3rem)/1 var(--slab); text-transform: uppercase; }
h2, h3 { font-family: var(--block); text-transform: uppercase; }
h2 { font-size: clamp(1.15rem, 2.4vw, 1.6rem); }
h3 { font-size: clamp(1rem, 1.8vw, 1.2rem); }
p { margin: 0 0 .6rem; }
small { font-size: .8rem; }
ul { list-style: none; padding: 0; margin: 0; }
:focus-visible { outline: 4px solid var(--ink); outline-offset: 3px; box-shadow: 0 0 0 7px var(--team); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* icons from /img/icons.svg */
.i { width: 1.4em; height: 1.4em; fill: currentColor; flex: none; vertical-align: -.3em; }

/* the logo slot: one place to swap the logo (the --logo token) */
.logo { display: inline-block; width: 64px; height: 64px; flex: none; background: var(--logo) center / contain no-repeat; }

/* halftone dots in the company colour (a class, not a token, so it follows [data-company]) */
.dots { background: radial-gradient(circle at 2px 2px, var(--team) 1.6px, transparent 1.9px) 0 0 / 7px 7px; }

/* main column */
main { display: block; padding: 12px 16px 48px; max-width: 1180px; margin: 0 auto; }
main.two { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); }
main > * + * { margin-top: 16px; }
main.two > * + * { margin-top: 0; }

/* panels: thick outline, hard offset shadow, cut top-right corner (the draft's .cut technique on one element) */
:where(section, details, form, aside, article, div).card {
  position: relative; isolation: isolate; padding: 16px 18px; margin: 0 0 16px; min-width: 0;
  filter: drop-shadow(var(--shadow) var(--shadow) 0 var(--ink));
}
:where(section, details, form, aside, article, div).card::before,
:where(section, details, form, aside, article, div).card::after {
  content: ""; position: absolute; z-index: -1; pointer-events: none;
  clip-path: polygon(0 0, calc(100% - var(--chamfer)) 0, 100% var(--chamfer), 100% 100%, 0 100%);
}
:where(section, details, form, aside, article, div).card::before { inset: 0; background: var(--ink); }
:where(section, details, form, aside, article, div).card::after { inset: var(--line); background: var(--paper); }
/* the first heading of a panel is a black slanted tab */
.card > h2:first-child, .card > h3:first-child, details.card > summary {
  display: block; width: fit-content; max-width: calc(100% - 20px); margin: -16px 0 14px -18px; padding: 10px 44px 10px 18px;
  background: var(--ink); color: var(--paper); font: 400 1.05rem/1.1 var(--block); text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 26px) 100%, 0 100%);
}
details.card > summary { cursor: pointer; list-style: none; min-height: var(--tap); display: flex; align-items: center; gap: 10px; }
details.card > summary::-webkit-details-marker { display: none; }
details.card > summary::after { content: "+"; font: 700 1.2rem var(--mono); }
details.card[open] > summary::after { content: "–"; }
details.card:not([open]) { padding-bottom: 4px; }
details.card:not([open]) > summary { margin-bottom: 0; }

/* buttons: outlined, hard shadow, pressed state moves into the shadow */
button {
  font: 700 .95rem/1.15 var(--mono); color: var(--ink); background: var(--field); cursor: pointer;
  border: var(--line) solid var(--ink); border-radius: 6px; box-shadow: var(--shadow-sm) var(--shadow-sm) 0 var(--ink);
  min-height: var(--tap); min-width: var(--tap); padding: 8px 16px; margin: 4px 6px 4px 0; max-width: 100%;
  transition: transform .08s, box-shadow .08s; overflow-wrap: anywhere;
}
button:hover { transform: translate(1px, 1px); box-shadow: 2px 2px 0 var(--ink); }
button:active { transform: translate(var(--shadow-sm), var(--shadow-sm)); box-shadow: 0 0 0 var(--ink); }
button.primary { background: var(--team); color: var(--team-ink); font: 400 1rem/1.1 var(--block); text-transform: uppercase; }
button.danger { background: var(--bad); color: var(--white); }
button[disabled], button[disabled]:hover { background: var(--stone); color: var(--muted); box-shadow: none; transform: none; cursor: not-allowed; }

/* fields */
label { display: inline-flex; flex-direction: column; gap: 4px; font: 700 .85rem var(--mono); max-width: 100%; }
input, select, textarea {
  font: 400 1rem var(--mono); color: var(--ink); background: var(--field); border: var(--line) solid var(--ink); border-radius: 10px;
  min-height: 48px; padding: 8px 12px; max-width: 100%; box-shadow: inset 0 3px 0 color-mix(in srgb, var(--ink) 8%, transparent);
}
input::placeholder, textarea::placeholder { color: var(--placeholder); }
textarea { width: 100%; }
input[type="file"] { min-height: var(--tap); padding: 6px; }

/* tables (organizer) */
table { width: 100%; border-collapse: collapse; border: var(--line) solid var(--ink); background: var(--paper); font: 400 .88rem/1.3 var(--mono); }
th { background: var(--ink); color: var(--paper); text-align: left; font-weight: 400; padding: 8px 10px; white-space: nowrap; }
td { padding: 6px 10px; border-bottom: 1px solid var(--ink); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
:where(section, details, div).card:has(table) { overflow-x: auto; } /* wide tables scroll inside their panel, never the page */

/* text helpers used by every screen */
.muted { color: var(--muted); }
.error { color: var(--bad); font-weight: 700; }
.big { font: 700 clamp(1.5rem, 4vw, 2.2rem)/1.1 var(--mono); margin: 8px 0; }
.warn, .offline { display: block; border: var(--line) solid var(--ink); background: var(--team); color: var(--team-ink); padding: 10px 14px; font-weight: 700; box-shadow: var(--shadow-sm) var(--shadow-sm) 0 var(--ink); }
.offline { position: sticky; top: 0; z-index: 20; margin: 0; background: var(--ink); color: var(--paper); text-align: center; }
.confirm { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 700; }

/* the header strip (player HUD and organizer bar): own company only, timer in the middle */
header.bar {
  position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px;
  background: var(--paper); border-bottom: var(--line-thick) solid var(--ink); padding: 6px 16px; min-height: 64px;
}
header.bar > * { min-width: 0; }
header.bar .who { display: flex; align-items: center; gap: 10px; font: 400 1rem/1.1 var(--block); text-transform: uppercase; }
header.bar .who .mark { width: 44px; height: 38px; color: var(--ink); }
header.bar .who b { font: 400 clamp(1rem, 2.2vw, 1.5rem)/1 var(--slab); color: var(--team); -webkit-text-stroke: 1.5px var(--ink); paint-order: stroke fill; font-weight: 400; }
header.bar .phase { display: block; font: 700 .7rem/1.2 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
header.bar .wallet { justify-self: end; display: inline-flex; align-items: center; gap: 8px; font: 700 1.05rem var(--mono); white-space: nowrap; }
.pill { display: inline-block; background: var(--ink); color: var(--team-on-ink); padding: 6px 34px; clip-path: polygon(0 50%, 20px 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 20px 100%); }
#clock { display: inline-block; font: 700 clamp(1.6rem, 4vw, 2.4rem)/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: .04em; color: var(--team-on-ink); min-width: 4.2ch; text-align: center; }
#clock.red { color: var(--alarm); }
@media (max-width: 640px) {
  header.bar { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "who timer" "wallet wallet"; row-gap: 4px; padding: 6px 12px; }
  header.bar .who { grid-area: who; } header.bar .timer { grid-area: timer; } header.bar .wallet { grid-area: wallet; justify-self: start; }
  .pill { padding: 4px 24px; }
}

/* ---------- the login card (drafts: login.html, organizer.html), used by both apps ---------- */
.topbar { background: var(--orange); border-bottom: var(--line-thick) solid var(--ink); display: flex; align-items: center; gap: 16px; padding: 6px 16px; }
.topbar .logo { width: 64px; height: 64px; }
.topbar .brand { font: 700 clamp(1.4rem, 4.4vw, 3rem)/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; }
.topbar .tag { margin-left: auto; border-left: var(--line) solid var(--ink); padding-left: 14px; font: 700 .8rem/1.25 var(--mono); letter-spacing: .18em; text-transform: uppercase; }
.login-page main.page { max-width: 640px; }
.title { container-type: inline-size; border: var(--line-thick) solid var(--ink); background: var(--paper); padding: 8px 18px; box-shadow: 10px 10px 0 var(--ink); }
.title h1 { margin: 0; font: 400 min(19cqw, 8rem)/.9 var(--slab); }
.title h1 span { display: block; }
.title h1 .one { text-shadow: 3px 3px 0 var(--orange); }
.title h1 .two { color: var(--orange); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; text-shadow: 4px 4px 0 var(--ink); }
.sub { display: flex; align-items: center; gap: 14px; margin: 14px 0 18px; font: 400 clamp(.85rem, 2.6vw, 1.4rem)/1 var(--mono); letter-spacing: .3em; text-transform: uppercase; }
.sub::before, .sub::after { content: ""; height: 3px; background: var(--ink); flex: 1; }
form#login { display: grid; gap: 14px; }
form#login > h2:first-child b { color: var(--team-on-ink); font-weight: 400; }
.field { display: flex; flex-direction: row; align-items: center; gap: 14px; border: 4px solid var(--ink); border-radius: 12px; background: var(--field); padding: 0 16px; min-height: 58px; }
.field:focus-within { outline: 4px solid var(--orange); outline-offset: 2px; }
.field input { all: unset; flex: 1; min-width: 0; height: 54px; font: 400 1.15rem var(--mono); text-transform: uppercase; }
.field input::placeholder { color: var(--placeholder); text-transform: none; }
.field.pw input { text-transform: none; }
.field .i { width: 28px; height: 28px; }
button.join { min-height: 64px; width: 100%; margin: 0; background: var(--orange); border: 4px solid var(--ink); border-radius: 12px; box-shadow: 0 8px 0 var(--ink);
  font: 400 clamp(1.4rem, 5vw, 2rem)/1 var(--block); text-transform: uppercase; }
button.join:active { transform: translateY(8px); box-shadow: 0 0 0 var(--ink); }
.info { display: flex; align-items: center; gap: 14px; }
.info ul { list-style: disc; padding-left: 20px; font-size: .9rem; }
.i.big { width: 44px; height: 44px; }
.org-link { display: inline-flex; align-items: center; min-height: var(--tap); font-weight: 700; text-decoration: underline; }

/* toast */
#toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 30; max-width: calc(100vw - 32px); background: var(--ink); color: var(--paper); padding: 12px 20px; border-radius: 8px; font: 700 .95rem var(--mono); box-shadow: 4px 4px 0 var(--team); }
#toast:empty { display: none; }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
```

Delete `public/styles.css` (`git rm public/styles.css`).

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. The hook inventory test still passes (no markup changed). `test/static.test.js` writes its own `styles.css` into a temporary folder, so deleting the real one does not affect it.

- [ ] **Step 5: Check by hand**

Run `npm start`, open `http://localhost:<port>/` on a laptop and with the browser's phone view at 390 px. The screens are not finished yet, but every screen must already be cream with ink outlines and readable; no sideways scrolling. Open `/css/fonts.css` and `/img/icons.svg` in the browser to see they are served (`text/css`, `image/svg+xml`, `font/woff2` in the network panel).

- [ ] **Step 6: Commit**

```bash
git add public/css public/index.html public/organizer.html test/css-rules.test.js
git rm public/styles.css
git commit -m "feat: shared stylesheet (panels, buttons, fields, header strip, login card) replaces the base styles"
```

---

### Task 5: Player login and the waiting screen

**Files:**
- Modify: `public/render.js` (`renderLogin`, the `lobby` branch of `renderScreen`), `public/css/player.css`
- Create: `test/design-screens.test.js`

**Drafts:** `ui-drafts/login.html`, `ui-drafts/home.html`.

**Interfaces:**
- `renderLogin(error)` keeps `form#login` with the class `card`, the input `name="id"` with `autocomplete="off" autocapitalize="characters" autofocus`, the submit button and `<p class="error" role="alert">`; it adds the orange top bar with the logo slot, the "Future Makers" title block, a screen-reader label, the help card and a link to `/organizer.html`.
- The `lobby` screen becomes `renderHome(v)`: a `.screen` wrapper with the viewer's own `data-company` (only when seated), the hero, the waiting tile ("Waiting for the organizer to start the game." stays word for word), the five phase steps and a locked "My graphs" tile.
- Not built from the drafts on purpose: the readonly "name will appear automatically" field (the name is only known after login), the tiles that open dialogs (How to play, Role guide, Credits, Need help) with their script, and the draft control bar.

- [ ] **Step 1: Write the failing tests**

`test/design-screens.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLogin, renderScreen } from '../public/render.js';
import { PLAYER } from './fixtures/views.js';

const html = (name) => renderScreen(PLAYER[name]);

test('login: the draft layout with the logo slot, a labelled field and no game messages', () => {
  const h = renderLogin('');
  assert.match(h, /<header class="topbar"><span class="logo" role="img" aria-label="Makerspace logo"><\/span>/);
  assert.match(h, /<span class="one">Future<\/span> <span class="two">Makers<\/span>/);
  assert.match(h, /<form id="login" class="card">/);
  assert.match(h, /<label class="field">[^]*<span class="sr-only">Admission ID<\/span><input name="id"/);
  assert.match(h, /<button type="submit" class="join">Join game<\/button>/);
  assert.match(h, /href="\/organizer\.html"/);
  assert.equal(h.includes('data-send'), false);
  assert.equal(h.includes('name="name"'), false); // the draft's readonly name field is not built
});

test('waiting screen: own company theme only when seated, the wait text, a locked graphs tile', () => {
  const seated = html('lobby');
  assert.match(seated, /<div class="screen" data-company="A">/);
  assert.match(seated, /Waiting for the organizer to start the game\./);
  assert.match(seated, /You are the CTO of Company A\./);
  assert.match(seated, /My graphs <span class="sr-only">\(locked\)<\/span>/);
  const unseated = html('lobby-unseated');
  assert.match(unseated, /<div class="screen">/);
  assert.match(unseated, /The organizer will give you a company and a role\./);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `topbar` in the login markup)

- [ ] **Step 3: Write the implementation**

In `public/render.js` add `import { icon, companyAttr, companyMark, companyOf, roleOf, phaseOf, roleChips, logo, ROLE_ICON, ROLE_TITLE } from './kit.js';` at the top (the later tasks use the other names).

Replace `renderLogin` (keep any attribute the current version has that is not shown here):

```js
export function renderLogin(error) {
  return `<div class="login-page">
<header class="topbar">${logo()}<span class="brand">Makerspace</span><span class="tag">Create.<br>Ideate.<br>Innovate.</span></header>
<main class="page">
  <div class="title"><h1><span class="one">Future</span> <span class="two">Makers</span></h1></div>
  <p class="sub">Startup Showdown</p>
  <form id="login" class="card">
  <h2>Participant <b>Login</b></h2>
  <label class="field">${icon('i-user')}<span class="sr-only">Admission ID</span><input name="id" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Admission ID" autofocus></label>
  <button type="submit" class="join">Join game</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form>
  <aside class="card info">${icon('i-info', 'i big')}<ul><li>Use your registered Admission ID.</li><li>Only IDs from the official roster are allowed.</li></ul></aside>
  <a class="org-link" href="/organizer.html">Organizer login</a>
</main></div>`;
}
```

Add `renderHome` and use it for the lobby branch (`if (v.screen === 'lobby') return renderHome(v);`):

```js
function renderHome(v) {
  const me = v.me || {};
  const seat = roleOf(me.role) && companyOf(me.company) ? `You are the ${esc(me.role)} of Company ${esc(me.company)}.` : 'The organizer will give you a company and a role.';
  return `<div class="screen"${companyAttr(me.company)}><main class="home">
  <section class="hero"><h1>Startup <span>Showdown</span></h1><p class="flow">Ideas &rarr; Teams &rarr; Solutions &rarr; Impact</p></section>
  <section class="card tile main"><h2>Hello ${esc(me.name)}</h2><p><span class="status-dot"></span>Waiting for the organizer to start the game.</p><p>${seat}</p></section>
  <section class="card"><h2>How to play</h2><ol class="hsteps"><li>1. Briefing: meet your team and your role</li><li>2. Ideation: vote, then the CEO picks the idea</li><li>3. Shop: spend 1,000 shared coins together</li><li>4. Competition: 16 minutes against another company</li><li>5. Graphs: see how both companies played</li></ol></section>
  <section class="card tile locked"><h2>${icon('i-lock')} My graphs <span class="sr-only">(locked)</span></h2><p>Opens after the organizer shows the results.</p></section>
</main></div>`;
}
```

`renderConnecting` and `renderOffline` keep their markup; `base.css` already styles `.card` and `.offline`.

Append to `public/css/player.css`:

```css
/* ---------- shared page pieces ---------- */
.screen { position: relative; min-height: 100vh; }
.screen::before { content: ""; position: absolute; top: 0; right: 0; width: 200px; height: 220px; z-index: -1; pointer-events: none;
  background: radial-gradient(circle at 2px 2px, var(--team) 1.6px, transparent 1.9px) 0 0 / 7px 7px;
  -webkit-mask-image: linear-gradient(to bottom left, black 20%, transparent 80%); mask-image: linear-gradient(to bottom left, black 20%, transparent 80%); }
.title2 { margin: 6px 0 16px; }
.title2 h1 { display: inline-block; margin: 0; background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); border-bottom: 0;
  padding: 8px 48px 8px 18px; font: 400 clamp(1.25rem, 3.4vw, 2.1rem)/1.05 var(--block); clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 100%, 0 100%); }
.title2 .desc, .title2 .hint { margin: -3px 0 0; border: var(--line) solid var(--ink); background: var(--paper); padding: 10px 16px; border-radius: 0 0 12px 12px;
  box-shadow: 4px 4px 0 var(--ink); font: 400 .95rem/1.5 var(--mono); }
/* ---------- small phones ---------- */
@media (max-width: 420px) {
  main { padding: 10px 12px 40px; }
  :where(section, details, form, aside, article, div).card { padding: 14px 12px; }
  .card > h2:first-child, .card > h3:first-child, details.card > summary { margin: -14px 0 12px -12px; }
}
/* ---------- home / waiting (draft: home.html) ---------- */
main.home { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); gap: 18px; align-items: start; }
main.home > * + * { margin-top: 0; }
.hero { grid-column: 1 / -1; border: var(--line) solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: clamp(14px, 3vw, 32px); position: relative; overflow: hidden; }
.hero::after { content: ""; position: absolute; right: -40px; bottom: -40px; width: 240px; height: 240px; border-radius: 50%; background: var(--team); border: var(--line) solid var(--ink); z-index: -1; }
.hero { isolation: isolate; }
@media (max-width: 640px) { .hero::after { width: 150px; height: 150px; right: -70px; bottom: -80px; } }
.hero h1 { margin: 0; font: 400 clamp(2rem, 6vw, 4.4rem)/.95 var(--block); }
.hero h1 span { display: block; color: var(--team); -webkit-text-stroke: 2px var(--ink); paint-order: stroke fill; }
.hero .flow { margin: 12px 0 0; font-size: .9rem; text-transform: uppercase; }
.tile.main::after { background: var(--team-soft); }
.tile.locked { opacity: .7; }
.status-dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: var(--good); border: 2px solid var(--ink); margin-right: 8px; animation: pulse 1.4s infinite; }
@keyframes pulse { 50% { opacity: .3; } }
.hsteps { display: grid; gap: 8px; padding: 0; list-style: none; font-size: .92rem; }
@media (max-width: 900px) { main.home { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including the hook inventory (`#login`, `.card`, `.error`, `input[name=id]` are still there).

- [ ] **Step 5: Commit**

```bash
git add public/render.js public/css/player.css test/design-screens.test.js
git commit -m "feat: player login and waiting screen in the draft style"
```

---

### Task 6: The header strip, the screen wrapper and company theming

**Files:**
- Modify: `public/render.js` (`header(v)`, `renderScreen`), `public/css/player.css`
- Modify: `test/design-screens.test.js`

**Drafts:** the `.hud` at the top of `ideation.html`, `workshop-cto.html` and the other player drafts.

**Interfaces:**
- `header(v)` keeps `<header class="bar compact">` byte for byte, the `.who`, `.phase` and `.wallet` spans and `<span id="clock">` (with `class="red"` from Plan 3 when it exists); it adds the company mark, the company name in the slab font, a timer pill around the clock and the five role chips.
- `renderScreen` wraps every in-game screen in `<div class="screen" data-company="A|B" data-phase="...">` built only from `v.me.company` and `v.clock.phase` through the kit's whitelists. The rest of the switch moves into `gameScreen(v)`.
- This is the "scoreboard strip" idea, kept only as far as the drafts show it: **the viewer's own company only**. The rival is never shown to players, so there is no two-company scoreboard on player screens (it lives on the organizer's live monitor, Task 13). There is **no phase stinger**: the drafts have none.

- [ ] **Step 1: Write the failing tests**

Add to `test/design-screens.test.js`:

```js
import { PLAYER as P2 } from './fixtures/views.js';

const gameFixtures = Object.entries(P2).filter(([, v]) => v.screen === 'game');

test('every game screen is wrapped with the viewer\'s own company and the phase', () => {
  for (const [name, v] of gameFixtures) {
    const h = renderScreen(v);
    assert.ok(h.startsWith(`<div class="screen" data-company="${v.me.company}" data-phase="${v.clock.phase}">`), name);
  }
});

test('a player never gets the rival company in the markup: no data-company, mark or name of the other side', () => {
  for (const [name, v] of Object.entries(P2)) {
    const own = v.me && v.me.company;
    if (!own) continue;
    const other = own === 'A' ? 'B' : 'A';
    const h = renderScreen(v);
    assert.equal(h.includes(`data-company="${other}"`), false, name);
    assert.equal(h.includes(`#i-mark-${other.toLowerCase()}"`), false, name);
    assert.equal(h.includes(`Company ${other}`), false, name);
  }
});

test('hostile company, role and phase values never reach an attribute', () => {
  const v = { ...P2['shop-cto'], me: { ...P2['shop-cto'].me, company: '"><b>', role: '<i>' }, clock: { phase: '"x', remainingSec: 5 } };
  const h = renderScreen(v);
  assert.equal(h.includes('data-company="&quot;'), false);
  assert.match(h, /<div class="screen" data-phase="">/);
});

test('the header strip keeps its hooks and adds the mark, the timer pill and the role chips', () => {
  const h = renderScreen(P2['shop-cmo']);
  assert.match(h, /<header class="bar compact">/);
  assert.match(h, /<span class="who"><svg class="mark"[^>]*><use href="\/img\/icons\.svg#i-mark-a"><\/use><\/svg>/);
  assert.match(h, /<span class="pill"><span id="clock">5:00<\/span><\/span>/);
  assert.match(h, /<span class="on" title="CMO">/);
  assert.match(h, /<span class="wallet">[^]*890 coins<\/span>/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `.screen` wrapper)

- [ ] **Step 3: Write the implementation**

Replace the body of `header(v)` with the following, keeping anything the current version has added since this plan was written (for example Plan 3's `class="red"` on the clock, written as `<span id="clock"${v.clock.warning === 'last10' ? ' class="red"' : ''}>`):

```js
function header(v) {
  const { me, clock, wallet } = v;
  return `<header class="bar compact">
  <span class="who">${companyMark(me.company)}<span><b>Company ${esc(me.company)}</b> ${esc(me.role)} <small class="phase">${esc(clock.phase)}</small></span></span>
  <span class="timer"><span class="pill"><span id="clock">${fmtClock(clock.remainingSec)}</span></span></span>
  <span class="wallet">${roleChips(roleOf(me.role))}${icon('i-coins')}${esc(plural(wallet, 'coin'))}</span>
</header>`;
}
```

In `renderScreen`, after the checks for `lobby`, `graphs` and an unknown screen, replace the `switch` with a wrapper and move the `switch` unchanged into `gameScreen(v)`:

```js
  return `<div class="screen"${companyAttr(v.me && v.me.company)} data-phase="${phaseOf(v.clock && v.clock.phase)}">${gameScreen(v)}</div>`;
}

function gameScreen(v) {
  switch (v.clock.phase) {
    // ...the cases exactly as they are now...
  }
}
```

(`app.js` writes `#clock` on every tick with `document.getElementById('clock')`, so the extra pill around it changes nothing there. Read `app.js` once to confirm no code reads `root.firstElementChild` or expects `<header>` to be first; if something does, point it at `.screen > header`.)

Append to `public/css/player.css`:

```css
/* ---------- header strip extras (drafts: the .hud of every player draft) ---------- */
header.bar .roles { display: inline-flex; gap: 6px; padding-right: 12px; margin-right: 6px; border-right: var(--line) solid var(--ink); }
header.bar .roles > span { width: 34px; height: 34px; border: var(--line) solid var(--ink); border-radius: 6px; display: grid; place-items: center; background: var(--paper); box-shadow: 2px 2px 0 var(--ink); }
header.bar .roles > span.on { background: var(--team); color: var(--team-ink); }
header.bar .roles .i { width: 20px; height: 20px; vertical-align: 0; }
@media (max-width: 900px) { header.bar .roles { display: none; } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. In particular `the briefing shows the role, the problem and a countdown only` (Plan 2) still finds `id="clock">2:05<`, and `the header is one compact row` still finds `<header class="bar compact">`.

- [ ] **Step 5: Commit**

```bash
git add public/render.js public/css/player.css test/design-screens.test.js
git commit -m "feat: header strip with the own company's mark, timer pill and role chips; data-company theming"
```

---

### Task 7: Briefing and ideation

**Files:**
- Modify: `public/render.js` (`briefing(v)`, `ideation(v)`), `public/css/player.css`, `test/design-screens.test.js`

**Drafts:** `ui-drafts/briefing.html`, `ui-drafts/ideation.html`.

**Interfaces:**
- `briefing(v)` shows three panels: the company card (own mark and name), the role card (role icon, the role code in the slab font, the full title from `ROLE_TITLE`, one sentence about the job), and the problem statement. It keeps "You are the <role>", the problem title and statement, and still has **no** `data-send` (Plan 2 test). Not built: the draft's team list with names (the player view has no teammates), the info cards with game format text, the "Continue" button (nothing to continue to; the phase moves on by itself).
- `ideation(v)` keeps `ul.ideas > li.idea(.mine)` with the `h3`, `small`, description, `.votes` and the vote and pick buttons exactly; adds the title block, a type picture (`i-chip` for hardware, `i-app` for software) on a halftone blob, the number badge (a CSS counter, no markup), the class `chosen` on the picked idea, and a "Live vote count" side panel built from the same `ideas` (the own company's votes only, which the view already has).

- [ ] **Step 1: Write the failing tests**

Add to `test/design-screens.test.js`:

```js
test('briefing: company card, role card with the full title, problem card, still no buttons', () => {
  const h = renderScreen(P2['briefing-cto']);
  assert.match(h, /<main class="brief">/);
  assert.match(h, /<span class="name">Company A<\/span>/);
  assert.match(h, /<span class="code">CTO<\/span>/);
  assert.match(h, /Chief Technology Officer/);
  assert.match(h, /Food waste/);
  assert.equal(h.includes('data-send'), false);
  assert.equal(h.includes('<button'), false);
});

test('ideation: idea cards keep their buttons, a type picture, the chosen mark and the live tally', () => {
  const h = renderScreen(P2['ideation-ceo']);
  assert.match(h, /<li class="idea mine">\s*<span class="pic dots"><svg class="i"[^>]*><use href="\/img\/icons\.svg#i-chip">/);
  assert.match(h, /#i-app"/);
  assert.match(h, /"type":"pick","ideaId":"S3"/);
  assert.match(h, /<aside class="card tally"><h2>Live vote count<\/h2>/);
  assert.match(h, /<span class="track"><i style="width:40%"><\/i><\/span><span class="v">2<\/span>/); // 2 of 5 votes
  assert.match(renderScreen(P2['ideation-picked']), /<li class="idea mine chosen">/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`<main class="brief">` not found)

- [ ] **Step 3: Write the implementation**

Replace `briefing(v)` (and add `ROLE_JOB` above it):

```js
const ROLE_JOB = {
  CEO: 'Lead the team. Make the final idea pick, approve the CTO\'s features and recommend items to the CFO.',
  CTO: 'Build the product. Request the features and parts that make it sell.',
  CFO: 'Guard the coins. Approve or reject each request, oldest first.',
  CMO: 'Build the brand. Pick who to sell to, the name, the tagline and the ads.',
  COO: 'Keep it running. Fix the idea\'s risks and buy protection.',
};

function briefing(v) {
  const role = roleOf(v.me.role);
  return `${header(v)}<main class="brief">
  <section class="card company-card">${companyMark(v.me.company)}<div><span class="words">Your company</span><span class="name">Company ${esc(v.me.company)}</span></div></section>
  <section class="card role-card"><h2>You are the ${esc(v.me.role)}</h2>
    <div class="head2">${icon(ROLE_ICON[role] || 'i-user', 'chip')}<span class="code">${esc(role)}</span></div>
    <p class="full">${esc(ROLE_TITLE[role] || '')}</p><p>${esc(ROLE_JOB[role] || '')}</p></section>
  <section class="card problem-card"><h2>Problem statement</h2>
  <h3>${esc(v.problem.title)}</h3><p>${esc(v.problem.statement)}</p>
  <p class="muted">The game starts when the countdown ends.</p></section></main>`;
}
```

(Check the role sentences against Section 2 of the guide; the guide wins if it says something different.)

In `ideation(v)`: change the card's opening to

```js
  const cards = ideas.map((i) => `<li class="idea${i.mine ? ' mine' : ''}${picked === i.id ? ' chosen' : ''}">
    <span class="pic dots">${icon(i.type === 'software' ? 'i-app' : 'i-chip')}</span>
    <h3>...the rest of the card exactly as it is now...`
```

then add the tally and the new frame around the list:

```js
  const total = ideas.reduce((n, i) => n + (Number(i.votes) || 0), 0) || 1;
  const tally = `<aside class="card tally"><h2>Live vote count</h2><ol>${ideas.map((i, n) => `<li><span class="n">${n + 1}</span><span class="track"><i style="width:${Math.round(100 * (Number(i.votes) || 0) / total)}%"></i></span><span class="v">${esc(i.votes)}</span></li>`).join('')}</ol></aside>`;
  return `${header(v)}<main class="ideation"><div class="title2"><h1>Base idea selection</h1><p class="desc">Vote for one idea. The CEO makes the final pick.</p></div><h2>${esc(v.problem.title)}</h2>
  ${/* the "Your company picked ..." notice exactly as it is now */ ''}
  <div class="idea-grid"><ul class="ideas">${cards}</ul>${tally}</div></main>`;
```

(The width is a whole number from the view's vote counts, so the inline `style` carries no player text.)

Append to `public/css/player.css`:

```css
/* ---------- briefing (draft: briefing.html) ---------- */
main.brief { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 18px; align-items: start; max-width: 1280px; }
main.brief > * + * { margin-top: 0; }
main.brief .problem-card { grid-column: 2; grid-row: 1 / span 2; }
.company-card { display: flex; align-items: center; gap: 16px; }
.company-card .mark { width: 96px; height: 84px; color: var(--ink); }
.company-card .words { display: block; font: 400 1rem/1 var(--mono); letter-spacing: .28em; text-transform: uppercase; }
.company-card .name { display: block; font: 400 clamp(1.8rem, 4vw, 2.8rem)/1 var(--slab); color: var(--team); -webkit-text-stroke: 2.5px var(--ink); paint-order: stroke fill; text-transform: uppercase; }
.role-card .head2 { display: flex; align-items: center; gap: 14px; }
.role-card .chip { width: 72px; height: 72px; }
.role-card .code { font: 400 clamp(2.6rem, 6vw, 4.4rem)/1 var(--slab); color: var(--team); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; text-shadow: 4px 4px 0 var(--ink); }
.role-card .full { margin: 6px 0 10px; padding-bottom: 10px; border-bottom: 2px solid var(--ink); font-size: .85rem; letter-spacing: .14em; text-transform: uppercase; }
.problem-card h3 { font-size: clamp(1.3rem, 3vw, 2rem); }
.problem-card p { font-size: clamp(1rem, 1.6vw, 1.2rem); }
@media (max-width: 900px) { main.brief { grid-template-columns: minmax(0, 1fr); } main.brief .problem-card { grid-column: auto; grid-row: auto; } }
/* ---------- ideation (draft: ideation.html) ---------- */
main.ideation { max-width: 1400px; }
.idea-grid { display: grid; grid-template-columns: minmax(0, 1fr) clamp(260px, 26vw, 380px); gap: 18px; align-items: start; }
ul.ideas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; counter-reset: idea; }
li.idea { counter-increment: idea; position: relative; display: flex; flex-direction: column; min-width: 0; border: var(--line) solid var(--ink); border-radius: 12px; background: var(--paper);
  box-shadow: 5px 5px 0 var(--ink); padding: 12px 14px; text-align: center; }
li.idea::before { content: counter(idea); position: absolute; top: 8px; left: 8px; width: 36px; height: 36px; background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); border-radius: 6px; font: 400 1.3rem/30px var(--block); }
li.idea .pic { display: grid; place-items: center; height: 96px; margin: 0 6%; -webkit-mask-image: radial-gradient(ellipse at center, black 35%, transparent 75%); mask-image: radial-gradient(ellipse at center, black 35%, transparent 75%); }
li.idea .pic .i { width: 64px; height: 64px; color: var(--ink); }
li.idea h3 { margin: 4px 0; } li.idea h3 small { display: block; margin-top: 6px; font: 400 .78rem var(--mono); text-transform: uppercase; }
li.idea p { font-size: .9rem; flex: 1; } li.idea .votes { flex: 0; font-weight: 700; }
li.idea.mine { outline: 5px solid var(--team); outline-offset: 2px; }
li.idea.chosen { background: var(--team-soft); }
.tally ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.tally li { display: grid; grid-template-columns: 40px minmax(0, 1fr) 28px; gap: 10px; align-items: center; }
.tally .n { background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); border-radius: 6px; font: 400 1.2rem/32px var(--block); text-align: center; }
.tally .track { height: 22px; border: var(--line) solid var(--ink); border-radius: 12px; background: var(--track); overflow: hidden; }
.tally .track i { display: block; height: 100%; background: var(--team); }
.notice { border: var(--line) solid var(--ink); background: var(--team-soft); padding: 10px 14px; font-weight: 700; box-shadow: var(--shadow-sm) var(--shadow-sm) 0 var(--ink); }
@media (max-width: 1180px) { .idea-grid { grid-template-columns: minmax(0, 1fr); } ul.ideas { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { ul.ideas { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/render.js public/css/player.css test/design-screens.test.js
git commit -m "feat: briefing role reveal and idea vote screens in the draft style"
```

---

### Task 8: The shop for each role (CTO, CMO, COO, CFO, CEO)

**Files:**
- Modify: `public/render.js` (`shop(v)`, or `shopBody(v)` once Plan 3 has split it), `public/css/player.css`, `test/design-screens.test.js`

**Drafts:** `workshop-cto.html` (CTO), `studio-cmo.html` (CMO), `workshop-coo.html` (COO), `treasury-cfo.html` (CFO), `command-ceo.html` (CEO).

**Interfaces:**
- One shop body for all five roles, as now. Each role gets the draft's title ("Product workshop", "Brand studio", "Risk & protection workshop", "Treasury & approval queue", "Command center") in a `.title2` block; the existing one-line `<p class="hint">` (exactly `class="hint"`, a Plan 2 test checks it) becomes the block's description; a "Team budget" box shows `v.wallet`.
- Everything else is styled where it is: the `<details class="card" data-key="sec-...">` catalog sections become the drafts' tabbed shelves, `li.item.<state>` becomes an item card (`.name`, `.cost` with Plan 3's `.price` and `<s class="list">` if present, the `em` state tag, the buttons), `li.req` and `li.req.head` become queue rows with the oldest one outlined, `ul.owned` becomes a receipt list.
- Not built, because the game does not have it: the shopping cart ("Request list" with a Submit button; a request is sent at once by its own button), the "Left after this request" preview, the CMO's logo style and colour pickers, the CFO's filters, donut, category bars and transaction history, the CEO's team progress, activity bars and recommend drop-down (the CEO recommends with the per-item buttons). List any of these the user asks for in the task report; each needs a view change in a separate task.
- During the Competition (Plan 3) the same body appears under the Competition panels, with the same title. That is intended: the shop is still open.

- [ ] **Step 1: Write the failing test**

Add to `test/design-screens.test.js`:

```js
test('each role sees its own workshop title, the hint line and the team budget', () => {
  const titles = { CTO: 'Product workshop', CMO: 'Brand studio', COO: 'Risk &amp; protection workshop', CFO: 'Treasury &amp; approval queue', CEO: 'Command center' };
  for (const [role, title] of Object.entries(titles)) {
    const h = renderScreen(P2[`shop-${role.toLowerCase()}`]);
    assert.match(h, new RegExp(`<div class="title2"><h1>${title}</h1>\\s*<p class="hint">`), role);
    assert.match(h, /<section class="budget"><span class="lab">Team budget<\/span><b class="amt"><svg[^]*?<\/svg>890<\/b><\/section>/, role);
  }
});

test('the CFO queue head and the shop item states keep their words', () => {
  const cfo = renderScreen(P2['shop-cfo']);
  assert.match(cfo, /<li class="req head">/);
  const cto = renderScreen(P2['shop-cto']);
  assert.match(cto, /<em>Owned<\/em>/);
  assert.match(cto, /<em>Requested<\/em>/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `title2` on the shop screen)

- [ ] **Step 3: Write the implementation**

Above `HINTS` add:

```js
const TITLES = { CTO: 'Product workshop', CMO: 'Brand studio', COO: 'Risk & protection workshop', CFO: 'Treasury & approval queue', CEO: 'Command center' };
```

In the shop body, replace the opening `<main>` and the hint line

```js
  <main>
  <p class="hint">${esc(HINTS[v.me.role] ?? '')}</p>
```

with

```js
  <main class="shop">
  <div class="ws-top"><div class="title2"><h1>${esc(TITLES[v.me.role] ?? 'Shop')}</h1>
  <p class="hint">${esc(HINTS[v.me.role] ?? '')}</p></div>
  <section class="budget"><span class="lab">Team budget</span><b class="amt">${icon('i-coins')}${esc(v.wallet)}</b></section></div>
```

and leave the rest of the body (product line, CEO and CFO lists, my requests, the catalog sections, "Our product") exactly as it is.

Append to `public/css/player.css` (if Plan 3 renamed or added classes inside items, for example the sale price, adjust the selectors here, not the markup):

```css
/* ---------- shop (drafts: workshop-cto, studio-cmo, workshop-coo, treasury-cfo, command-ceo) ---------- */
main.shop { max-width: 1400px; }
.ws-top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 280px); gap: 18px; align-items: stretch; }
.ws-top .title2 { margin: 0; }
.budget { border: var(--line) solid var(--ink); background: var(--paper); box-shadow: 5px 5px 0 var(--ink); border-radius: 8px; padding: 10px 14px; display: grid; gap: 6px; align-content: center; }
.budget .lab { font: 400 .95rem var(--block); text-transform: uppercase; text-align: center; }
.budget .amt { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); border-radius: 6px; padding: 8px 14px; font: 700 clamp(1.6rem, 3vw, 2.2rem)/1 var(--mono); }
.product { display: inline-block; border: var(--line) solid var(--ink); background: var(--team-soft); padding: 6px 12px; font-weight: 700; }
details.card > ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 12px; }
li.item { display: flex; flex-direction: column; gap: 6px; border: var(--line) solid var(--ink); border-radius: 8px; background: var(--paper); padding: 10px 12px; box-shadow: 3px 3px 0 var(--ink); min-width: 0; }
li.item .name { font: 700 1rem/1.2 var(--mono); }
li.item .cost:empty { display: none; }
li.item .cost { font: 700 1.1rem var(--mono); } li.item .cost::after { content: " coins"; font-weight: 400; font-size: .85rem; }
li.item .cost .list { margin-left: 6px; color: var(--muted); font-weight: 400; }
li.item em { align-self: flex-start; font: 400 .75rem/1 var(--mono); font-style: normal; background: var(--ink); color: var(--paper); padding: 4px 8px; border-radius: 3px; }
li.item.owned { background: var(--team-soft); }
li.item.owned em { background: var(--team); color: var(--team-ink); }
li.item button { width: 100%; margin: 0; }
li.item button:not(.primary) { background: var(--team); color: var(--team-ink); font: 400 .95rem/1.1 var(--block); text-transform: uppercase; }
li.req { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; border: var(--line) solid var(--ink); border-radius: 8px; background: var(--paper); padding: 8px 10px; margin-bottom: 8px; }
li.req.head { outline: 4px solid var(--team); outline-offset: 1px; background: var(--team-soft); }
li.req small { font-size: .8rem; }
li.req button { margin-right: 8px; }
ul.owned li { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px dashed var(--ink); padding: 6px 0; }
ul.owned li span { font-weight: 700; white-space: nowrap; }
@media (max-width: 760px) { .ws-top { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (the Plan 2 shop tests still find `"type":"request"`, `"choice":"2"`, `FreshSense`, `"type":"cfo_decide"`, `"type":"ceo_decide"`, `/1000/`, and the `<details ... open ... data-key="sec-Core Features">` order of attributes is unchanged).

- [ ] **Step 5: Commit**

```bash
git add public/render.js public/css/player.css test/design-screens.test.js
git commit -m "feat: shop screens for the five roles in the workshop, studio, treasury and command styles"
```

---

### Task 9: The summary card and the Competition screens

**Files:**
- Modify: `public/render.js` (`summary(v)` only), `public/css/player.css`, `test/design-screens.test.js`
- Read first: `test/render-competition.test.js` and `renderCompetition`, `ratesPanel`, `attackPanel`, `shieldPanel`, `hintCard` and `shopBody` in `public/render.js` as Plan 3 Task 11 actually built them.

**Drafts:** none for these screens (`CONTEXT_PACKET.md` section 6 lists them as missing). They are designed from the existing style: the receipt card, the `.metrics` and `.decide` boxes of `command-ceo.html`, the black tabs and the timer pill. If the user sends references later, redo the look then; the hooks stay.

**The Competition markup as built (checked 2026-10-12; re-check, the code wins):**
- after the header: `<p class="banner 5min|2min|30s|last10" role="status">`, then one `<p class="notice">` per cover-story notice;
- `<section class="competition">` holding `aside.hint` (`aria-label="Hint"`, a `<details open><summary>Hint</summary><p>`), `section.card.rates` (h3 "Sales per minute"; for CTO, CMO and COO a `div#sales-meter.meter[role=meter]` with a `div.fill` whose inline width is the own rate out of 27, then `b.my-rate` and `small.level`; a `ul` of the three role rates; `p.big` total), `section#attack-deck.card.attacks` for the CEO (h3 "Command centre", a `p.muted` lock reason, `ul.deck > li > button.attack-btn.danger` with `disabled` while locked, the class `armed` added by `app.js` on the first tap of a two-tap launch, `ul.launches > li.launch.landed|blocked`), `section.card.shield` for the COO;
- then `shopBody(v)`, which shows `p.sale-badge` (Shop Sale), `p.locked` (a lock message) and `p.shop-closed` (last 30 s) above the shop.
- `.fill` is also a Mosaic puzzle cell class (`td.fill`) and `.locked` is also the home screen's locked tile, so every rule here is scoped (`.rates .meter .fill`, `p.locked`).

**Interfaces:**
- `summary(v)` keeps the idea name, the `ul.owned` list and the `.big` "N coins left" line; adds `<main class="summary">`, a "Your product" tab, the idea name in the slab font (`.product-name`) and the class `receipt`.
- The Competition gets **no markup changes**; only CSS. The rates meter already exists with its number next to it, so colour is never the only signal.
- A rule that must hold: **the Competition screens show only the viewer's own company.** The notices are cover stories (never the word "attack" for the victim); the CEO's launch list shows only the CEO's own launches. Do not add the rival's numbers to make a "versus" view.

- [ ] **Step 1: Write the failing tests**

Add to `test/design-screens.test.js`:

```js
test('summary: the receipt with the idea in the slab font and the coins left', () => {
  const h = renderScreen(P2.summary);
  assert.match(h, /<main class="summary"><section class="card receipt"><h2>Your product<\/h2><p class="product-name">Smart Fridge Sensor<\/p>/);
  assert.match(h, /<p class="big">890 coins left<\/p>/);
});

test('competition: the own company only, even for the CEO with the attack deck', () => {
  for (const name of ['competition-cto', 'competition-ceo', 'competition-coo', 'competition-cfo']) {
    const h = renderScreen(P2[name]);
    assert.match(h, /<section class="competition">/, name);
    assert.equal(h.includes('Company B'), false, name);
    assert.equal(h.includes('data-company="B"'), false, name);
  }
  assert.match(renderScreen(P2['competition-ceo']), /id="attack-deck" class="card attacks"/);
});

test('the competition styles cover the classes Plan 3 emits, scoped where names are shared', () => {
  const css = rf('public/css/player.css', 'utf8');
  for (const sel of ['.banner[class~="2min"]', '.banner[class~="30s"]', '.banner.last10', 'header.bar ~ p.notice', 'aside.hint', '.rates .meter .fill', '.rates .my-rate', '.rates .level',
    'button.attack-btn', 'button.attack-btn.armed', 'button.attack-btn[disabled]', '.launch.blocked', '.card.shield', 'p.sale-badge', 'p.locked', 'p.shop-closed']) assert.ok(css.includes(sel), sel);
  assert.equal(/(^|[,}])\s*\.fill\s*[{,]/m.test(css), false, 'an unscoped .fill would also paint Mosaic cells');
});
```

(Add `import { readFileSync as rf } from 'node:fs';` to the imports at the top of the file; Task 10 uses it too.)

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`<main class="summary">` not found, the competition selectors missing)

- [ ] **Step 3: Write the implementation**

`summary(v)`: change its opening line to

```js
  return `${header(v)}<main class="summary"><section class="card receipt"><h2>Your product</h2><p class="product-name">${esc(s.idea?.name ?? 'No idea picked')}</p>
```

and keep the owned list and the `.big` line as they are.

Append to `public/css/player.css` (these replace the "Competition (plain)" rules of the old `styles.css`):

```css
/* ---------- summary card (no draft: the receipt in the same style) ---------- */
main.summary { max-width: 640px; }
.receipt .product-name { font: 400 clamp(1.6rem, 6vw, 2.6rem)/1.05 var(--slab); color: var(--team); -webkit-text-stroke: 2px var(--ink); paint-order: stroke fill; text-transform: uppercase; }
.receipt .big { display: inline-block; background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); padding: 8px 14px; box-shadow: 4px 4px 0 var(--ink); }
/* ---------- competition (Plan 3 Task 11 markup: .banner, .notice, aside.hint, section.competition, .card.rates with #sales-meter, #attack-deck, .card.shield) ---------- */
.banner { position: sticky; top: 64px; z-index: 9; margin: 0; padding: 10px 16px; text-align: center; font: 400 1.05rem/1.2 var(--block); text-transform: uppercase;
  background: var(--team); color: var(--team-ink); border-bottom: var(--line) solid var(--ink); }
.banner[class~="2min"] { background: var(--ink); color: var(--team-on-ink); }
.banner[class~="30s"], .banner.last10 { background: var(--ink); color: var(--alarm); }
header.bar ~ p.notice { margin: 0; border-width: 0 0 var(--line); box-shadow: none; }
section.competition { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 18px; align-items: start; padding: 12px 16px 0; max-width: 1180px; margin: 0 auto; }
section.competition > .card { margin: 0; }
aside.hint { grid-column: 1 / -1; position: sticky; top: 76px; z-index: 5; margin: 0; max-width: 520px; border: var(--line) solid var(--ink); background: var(--team-soft); box-shadow: 5px 5px 0 var(--ink); border-radius: 0 12px 12px 12px; }
aside.hint details { padding: 0 14px 10px; }
aside.hint summary { cursor: pointer; min-height: var(--tap); display: flex; align-items: center; gap: 8px; font: 400 1rem var(--block); text-transform: uppercase; }
aside.hint p { margin: 0; }
.rates .meter { height: 24px; border: var(--line) solid var(--ink); border-radius: 12px; background: var(--track); overflow: hidden; margin: 4px 0 8px; }
.rates .meter .fill { height: 100%; background: var(--team); border-right: var(--line) solid var(--ink); transition: width .4s; }
.rates .my-rate { font-size: 1.3rem; }
.rates .level { display: inline-block; margin-left: 6px; background: var(--ink); color: var(--paper); padding: 2px 8px; border-radius: 3px; }
.rates ul { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 8px 0; }
.rates ul li { border: var(--line) solid var(--ink); border-radius: 8px; padding: 6px 8px; text-align: center; font-weight: 700; }
.rates ul li b { display: block; font-size: 1.4rem; }
.rates .big { background: var(--ink); color: var(--team-on-ink); padding: 8px 14px; display: inline-block; }
:where(section).card.attacks::after { background: var(--ink); }
.card.attacks > h3:first-child { background: var(--team); color: var(--team-ink); }
.card.attacks, .card.attacks .muted, .card.attacks h4 { color: var(--paper); }
.card.attacks .deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px; }
.card.attacks button.attack-btn { width: 100%; margin: 0; min-height: 64px; background: var(--paper); color: var(--ink); border-color: var(--paper); box-shadow: 4px 4px 0 var(--team); text-align: left; }
.card.attacks button.attack-btn.armed { outline: 4px solid var(--alarm); outline-offset: 2px; }
.card.attacks button.attack-btn[disabled] { background: var(--rail); color: var(--stone); box-shadow: none; }
.card.attacks .launches li { border-bottom: 1px dashed var(--stone); padding: 4px 0; }
.card.attacks .launch.blocked { color: var(--stone); }
.card.shield > h3:first-child { display: flex; align-items: center; gap: 8px; }
p.sale-badge, p.locked, p.shop-closed { display: inline-block; margin: 0 0 12px; padding: 8px 14px; border: var(--line) solid var(--ink); font-weight: 700; box-shadow: var(--shadow-sm) var(--shadow-sm) 0 var(--ink); }
p.sale-badge { background: var(--team); color: var(--team-ink); }
p.locked, p.shop-closed { background: var(--ink); color: var(--paper); }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including all of `test/render-competition.test.js` (Plan 3): the wallet, the rates, `class="hint`, `aria-label="Hint"`, the `disabled` attack buttons, `Shield ready`, the banners and `id="clock" class="red"`.

- [ ] **Step 5: Check by hand**

Render the Competition fixtures (or play to the Competition with a short test timer) on a 390 px window: the 5-minute banner is in the company colour, the 2-minute banner black with orange or light-blue letters, the 30-second and last-10-second banners black with red letters, the clock red in the last 10 seconds; the hint card stays readable and never covers the shop buttons; the attack deck is dark, locked buttons are grey with the reason text above them, an armed button has a red ring.

- [ ] **Step 6: Commit**

```bash
git add public/render.js public/css/player.css test/design-screens.test.js
git commit -m "feat: summary receipt and competition styles (banners, sales meter, hint card, attack deck, sale and lock notes)"
```

---

### Task 10: The CFO puzzle panel

**Files:**
- Modify: `public/css/player.css`, `test/design-screens.test.js`
- Read first: `public/puzzles/ui.js` and `renderPuzzlePanel` in `public/render.js` (Plan 4 Tasks 3 and 6). No markup changes in this task.

**Drafts:** none (designed from the existing style).

**Interfaces:**
- Styles, by Plan 4's class names: `.card.puzzle`, `#puzzle-slot`, `table.puzzle-grid` with `td[data-cell]` cells, the region classes `reg-0` to `reg-7`, the thick region borders `bt br bb bl`, `td.on`, `td.num`, `td.fill`, `td.pipe`, the Sets cards `.cards > button[data-card]` with `c0..c2`, `f0..f2`, `picked`, `group`, `g0..g3`, `#puzzle-submit`.
- Cells are 44 by 44 px (tap size); Tower's clue cells (`th`) are 32 px wide because they are not tapped, so a 6 by 6 Tower is 6 × 44 + 2 × 32 = 328 px and a 7 by 7 Shikaku is 308 px, both inside a 390 px phone. On a 360 px phone the slot scrolls inside its own box (`overflow-x: auto`), never the page.
- Regions keep their **thick borders** (Plan 4 draws them) as the main signal; the eight region tints are only a second signal, so colour-blind players can still tell regions apart.
- The Sets cards are `<button class="card ...">`. The panel look in `base.css` only applies to `section, details, form, aside, article, div` with the class `card`, so the buttons are not turned into panels; this task styles them through `[data-card]`.

- [ ] **Step 1: Write the failing test**

Add to `test/design-screens.test.js` (the `rf` import was added in Task 9):

```js
test('the puzzle styles cover every class Plan 4 emits, with 44 px cells', () => {
  const css = rf('public/css/player.css', 'utf8');
  for (const sel of ['.puzzle-grid td', '.puzzle-grid td.on', '.puzzle-grid td.bt', '.puzzle-grid td.br', '.puzzle-grid td.bb', '.puzzle-grid td.bl', '[data-card].picked', '[data-card].group', '#puzzle-slot']) {
    assert.ok(css.includes(sel), sel);
  }
  for (let n = 0; n < 8; n++) assert.ok(css.includes(`.reg-${n}`), `reg-${n}`);
  assert.match(css, /\.puzzle-grid td, \.puzzle-grid th \{ width: 44px; height: 44px;/);
  assert.equal(/\.card\.(c\d|f\d|picked|group)/.test(css), false, 'Sets cards are styled through [data-card], not .card');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`.puzzle-grid td` not in `player.css`)

- [ ] **Step 3: Write the implementation**

Append to `public/css/player.css` (check the class names against `public/puzzles/ui.js`; Plan 4's base rules in the deleted `styles.css` are replaced by these):

```css
/* ---------- CFO puzzle panel (Plan 4 Task 6 markup: .card.puzzle, #puzzle-slot, table.puzzle-grid, .cards [data-card]) ---------- */
.puzzle #puzzle-slot { overflow-x: auto; margin: 8px 0 12px; }
table.puzzle-grid { display: table; width: auto; margin: 0 auto; border: var(--line-thick) solid var(--ink); border-collapse: collapse; background: var(--paper); }
.puzzle-grid td, .puzzle-grid th { width: 44px; height: 44px; padding: 0; text-align: center; font: 700 1.1rem var(--mono); border: 1px solid var(--ink); cursor: pointer; user-select: none; }
.puzzle-grid th { width: 32px; background: var(--field); color: var(--ink); cursor: default; }
.puzzle-grid td.on { background: var(--team); color: var(--team-ink); }
.puzzle-grid td.bt { border-top: var(--line-thick) solid var(--ink); } .puzzle-grid td.bb { border-bottom: var(--line-thick) solid var(--ink); }
.puzzle-grid td.bl { border-left: var(--line-thick) solid var(--ink); } .puzzle-grid td.br { border-right: var(--line-thick) solid var(--ink); }
.puzzle-grid .reg-0 { background: var(--paper); } .puzzle-grid .reg-1 { background: var(--track); } .puzzle-grid .reg-2 { background: var(--tint-a); } .puzzle-grid .reg-3 { background: var(--tint-b); }
.puzzle-grid .reg-4 { background: var(--locked); } .puzzle-grid .reg-5 { background: var(--field); } .puzzle-grid .reg-6 { background: var(--stone); } .puzzle-grid .reg-7 { background: var(--white); }
.puzzle .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; }
.puzzle .cards [data-card] { min-height: 64px; margin: 0; font-size: 1.3rem; letter-spacing: .1em; }
.puzzle .cards [data-card].picked { outline: 4px solid var(--team); outline-offset: 2px; }
.puzzle .cards [data-card].group { background: var(--team-soft); }
```

If `ui.js` uses classes not covered here (for example a Shikaku clue class), add a rule in the same style.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including `test/puzzle-ui.test.js` and `test/render-puzzle.test.js` (Plan 4), which this task does not touch.

- [ ] **Step 5: Check by hand**

As the CFO in a Competition on a 390 px phone view, start puzzles until all seven kinds have appeared (or force a kind from the Node REPL, as Plan 4 Task 6 Step 5 says). Each must fit or scroll inside its box, cells must be tappable with a thumb, the Queens and Lits regions must be clear in a greyscale screenshot (Chrome DevTools, Rendering, "Emulate vision deficiencies: Achromatopsia").

- [ ] **Step 6: Commit**

```bash
git add public/css/player.css test/design-screens.test.js
git commit -m "feat: CFO puzzle panel styles with 44 px cells and region borders"
```

---

### Task 11: Thank you, the results screens and the graph images

**Files:**
- Modify: `public/render.js` (the `ended` branch of `gameScreen` and the `graphs` screen, `graphsHtml` from Plan 5 Task 3), `public/css/player.css`, `src/graphs/theme.js`, `src/graphs/png.js`, `test/graphs.test.js` (Plan 5), `test/design-screens.test.js`, `package.json`
- Create: `scripts/fonts-ttf.mjs`, `public/fonts/*.ttf` (generated), `test/graph-theme.test.js`
- Run once while online: `npm install --save-dev wawoff2@2.0.1`

**Drafts:** `ui-drafts/results.html` (the "Thank you for playing!" card, then the three graphs).

**Interfaces:**
- Before the reveal the player sees `<main class="thanks"><section class="card"><h2>Thank you for playing</h2>` plus two lines ("The game is over. Please stay in your seat." and "The organizer will show the graphs in a moment."). The words "Thank you for playing" stay (Plan 2 and Plan 5 tests).
- After the reveal, and when logging in later (`screen: 'graphs'`), Plan 5's `<main class="results">` with three `section.card` graphs is laid out three across on a laptop and stacked on a phone, under a "Final results" title block that says there is no winner. The `graphs` screen is wrapped in `.screen` with the viewer's own `data-company`.
- `THEME` (Plan 5) becomes the cream palette, read from the same values as `tokens.css`: `stage` and `panel` paper, `line` stone, `text` ink, `muted` muted, `A` orange, `B` blue, `font` Space Mono. Text in the images is always ink; the company colours are used for lines, areas and bars only (orange and blue text on cream would fail contrast), and the labels keep their letters ("A 1140", "A leads"), so colour is never the only signal.
- `scripts/fonts-ttf.mjs` writes `public/fonts/*.ttf` from the `.woff2` files, so Plan 5's `fontFiles()` (it reads `.ttf` and `.otf` from `public/fonts`) finds real fonts for `@resvg/resvg-js`. The `.ttf` files are committed, so the Pi needs no conversion.
- Not built from the draft: the two company panels with both ideas, the "Key moments" list (it names real attacks, which players must never learn from the game), "Things to talk about" and the "Game completed" button (Next Game is the organizer's). Ask the user before adding any of them.

If Plan 5 is not built yet, do only the thank-you part now and come back to the rest after Plan 5.

- [ ] **Step 1: Write the failing tests**

Add to `test/design-screens.test.js`:

```js
test('ended before the reveal: the thank-you card only, in the own company theme', () => {
  const h = renderScreen(P2.ended);
  assert.match(h, /<div class="screen" data-company="A" data-phase="ended">/);
  assert.match(h, /<main class="thanks"><section class="card"><h2>Thank you for playing<\/h2>/);
  assert.match(h, /Please stay in your seat\./);
  assert.equal(/winner|won|lost|score/i.test(h), false);
});
```

`test/graph-theme.test.js`:

```js
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
```

(Adapt the `series` and `final` shapes to what Plan 5's `svg.js` takes; read its tests.)

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `.thanks`; `THEME.stage` is the old navy; no `.ttf` files)

- [ ] **Step 3: Write the implementation**

The thank-you markup, used in the `ended` branch when there are no results and in the `graphs` screen when there are no graphs:

```js
const THANKS = '<main class="thanks"><section class="card"><h2>Thank you for playing</h2><p>The game is over. Please stay in your seat.</p><p>The organizer will show the graphs in a moment.</p></section></main>';
```

Plan 5's `graphsHtml(g)` gets a title block in front of the three cards (keep the three `section.card` and the SVG strings exactly):

```js
const RESULTS_TITLE = '<div class="title2"><h1>Final results</h1><p class="desc">How both companies played. There is no winner: compare the graphs and talk about what you would do differently.</p></div>';
// return `<main class="results">${RESULTS_TITLE}<section class="card">...`
```

Wrap the `graphs` screen like the game screens: `<div class="screen"${companyAttr(v.me && v.me.company)} data-phase="ended">...</div>`.

`src/graphs/theme.js`:

```js
// Colours for the saved graph images. Same values as public/css/tokens.css (test/graph-theme.test.js checks it).
export const THEME = {
  stage: '#FBF0D9', panel: '#FBF0D9', line: '#D9D4C8', text: '#111111', muted: '#555555',
  A: '#FF6A1F', B: '#2E6BFF',
  font: "'Space Mono', 'Courier New', monospace",
};
```

`src/graphs/svg.js`: on every `<text>` that uses `THEME.A` or `THEME.B` as its `fill`, use `THEME.text` instead (the coloured lines, areas and bars stay). `src/graphs/png.js`: the Resvg `background` becomes `THEME.panel` (import it) instead of `'#101E33'`. `test/graphs.test.js`: the three colour assertions become `fill="#FF6A1F"`, `fill="#2E6BFF"` and `stroke="#111111" stroke-width="2"` (the zero line is drawn in `THEME.text`). These are the only earlier test lines this plan changes.

`scripts/fonts-ttf.mjs`:

```js
// Makes TrueType copies of the game fonts for the PNG graphs (@resvg/resvg-js cannot read woff2).
// Run once after changing the fonts: npm run fonts:ttf   (dev only; the .ttf files are committed)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decompress } from 'wawoff2';

for (const f of readdirSync('public/fonts').filter((n) => n.endsWith('.woff2'))) {
  const ttf = Buffer.from(await decompress(readFileSync(`public/fonts/${f}`)));
  writeFileSync(`public/fonts/${f.replace(/\.woff2$/, '.ttf')}`, ttf);
  console.log(`${f} -> ${ttf.length} bytes`);
}
```

Add `"fonts:ttf": "node scripts/fonts-ttf.mjs"` to `package.json` scripts and run it (about 45 KB per font). Update `public/fonts/LICENSES.txt`: the `.ttf` files are format conversions of the same fonts under the same licence.

Append to `public/css/player.css`:

```css
/* ---------- results (draft: results.html; Plan 5 markup: main.results, the thank-you card) ---------- */
.thanks, .screen[data-phase="ended"] main { max-width: 760px; text-align: center; }
main.results { display: grid; gap: 18px; max-width: 1500px; }
main.results > * + * { margin-top: 0; }
main.results .card svg { width: 100%; height: auto; display: block; }
@media (min-width: 1000px) { main.results { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including Plan 5's `test/graphs.test.js` and `test/render-results.test.js`.

- [ ] **Step 5: Check by hand**

Open one saved PNG from `exports/game-<id>/` (Plan 5 writes them on reveal): cream background, ink text in Space Mono, orange and blue lines. Open the results screen at 390 px and 1280 px.

- [ ] **Step 6: Commit**

```bash
git add public/render.js public/css/player.css public/fonts src/graphs test/graphs.test.js test/graph-theme.test.js test/design-screens.test.js scripts/fonts-ttf.mjs package.json package-lock.json
git commit -m "feat: thank-you and results screens, cream graph images with the game fonts"
```

---

### Task 12: Organizer login, the organizer frame and the lobby

**Files:**
- Modify: `public/render-organizer.js` (`renderOrganizerLogin`, `renderOrganizer`, `lobby`), `public/css/organizer.css`
- Create: `test/design-organizer.test.js`

**Drafts:** `ui-drafts/organizer.html` (login), `ui-drafts/organizer-lobby.html` (frame and lobby).

**Interfaces:**
- `renderOrganizerLogin(error)` keeps `form#login`, `input[name=pw][type=password]` and `.error[role=alert]`; uses the shared login card ("Organizer Login"), a lock icon, a screen-reader label, a note that all actions are recorded and a link back to `/`. Not built: the draft's username field (the console has one password) and the show-password eye button with its script.
- `renderOrganizer(v, ui)` returns `shell(inner)`: the draft frame (orange logo box, the "Future Makers" head, the black side navigation, the desk) around exactly what it returned before. The side navigation is a list of **in-page links** to the sections that are on the page (`#sec-roster`, `#sec-lobby`, `#sec-start`, `#sec-controls`, `#sec-companies`, and Plan 3 and 5 sections when present), so it needs no script. The draft's "Settings", "Records & Export" pages, "Session" rename, "Game duration" editor and "Reset session" do not exist in the game and are not built.
- New section ids on existing cards: `sec-roster`, `sec-lobby`, `sec-start` (on the three lobby cards). They must not clash with the existing field ids (`roster`, `problem`, `start`, ...).
- `seatBoards(v)`: the draft's two company tables under the lobby table: for each company the five roles with the seated participant's name and Admission ID, and "N / 5". Built only from `v.participants`, which the organizer view already has. Each board has its own `data-company`, so Company A is orange and Company B blue. (The organizer lobby draft colours Alpha blue and Beta orange; that contradicts every other draft and `CONTEXT_PACKET.md`, so this plan uses orange for A and blue for B everywhere.)

- [ ] **Step 1: Write the failing tests**

`test/design-organizer.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOrganizer, renderOrganizerLogin } from '../public/render-organizer.js';
import { ORGANIZER } from './fixtures/views.js';

test('organizer login: the shared login card with a labelled password field and no username', () => {
  const h = renderOrganizerLogin('Wrong password.');
  assert.match(h, /<form id="login" class="card"><h2>Organizer <b>Login<\/b><\/h2>/);
  assert.match(h, /<span class="sr-only">Password<\/span><input name="pw" type="password"/);
  assert.match(h, /<p class="error" role="alert">Wrong password\.<\/p>/);
  assert.equal(h.includes('name="username"'), false);
});

test('the frame links only to the sections on the page', () => {
  const lobby = renderOrganizer(ORGANIZER['org-lobby']);
  assert.match(lobby, /^<div class="frame"><div class="brandbox"><span class="logo" role="img" aria-label="Makerspace logo"><\/span><\/div>/);
  assert.match(lobby, /<nav class="side" aria-label="Organizer sections">[^]*href="#sec-roster"[^]*href="#sec-lobby"[^]*href="#sec-start"/);
  assert.equal(lobby.includes('href="#sec-controls"'), false);
  const running = renderOrganizer(ORGANIZER['org-running']);
  assert.match(running, /href="#sec-controls"[^]*href="#sec-companies"/);
  assert.equal(running.includes('href="#sec-roster"'), false);
});

test('the seat boards show each company\'s five roles with their own colour', () => {
  const h = renderOrganizer(ORGANIZER['org-lobby']);
  assert.match(h, /<section class="card company seats" data-company="A"><h3><svg class="mark"[^]*Company A <span class="count">5 \/ 5<\/span>/);
  assert.match(h, /data-company="B"[^]*Ananya Gupta[^]*DSA006/);
});

test('malformed views still do not throw inside the frame', () => {
  for (const v of [null, {}, { game: {} }]) assert.doesNotThrow(() => renderOrganizer(v));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `frame`)

- [ ] **Step 3: Write the implementation**

In `public/render-organizer.js` add `import { icon, logo, companyMark, ROLE_ICON } from './kit.js';`.

Replace `renderOrganizerLogin`:

```js
export function renderOrganizerLogin(error) {
  return `<div class="login-page">
<header class="topbar">${logo()}<span class="brand">Makerspace</span><span class="tag">Manage.<br>Monitor.<br>Run the game.</span></header>
<main class="page">
  <div class="title"><h1><span class="one">Future</span> <span class="two">Makers</span></h1></div>
  <p class="sub">Startup Showdown</p>
  <form id="login" class="card"><h2>Organizer <b>Login</b></h2>
  <label class="field pw">${icon('i-lock')}<span class="sr-only">Password</span><input name="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus></label>
  <button type="submit" class="join">Login</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}</form>
  <aside class="card info">${icon('i-info', 'i big')}<p>Authorized organizers only. All actions are recorded.</p></aside>
  <a class="org-link" href="/">Back to participant login</a>
</main></div>`;
}
```

Rename the current `renderOrganizer` to `renderOrganizerInner` (unchanged inside) and add:

```js
// In-page links; add Plan 3 and Plan 5 section ids here when their cards get one (Task 13).
const NAV = [['sec-roster', 'Roster'], ['sec-lobby', 'Lobby & roles'], ['sec-start', 'Start'], ['sec-controls', 'Game control'], ['sec-companies', 'Live monitor']];

function shell(inner) {
  const links = NAV.filter(([id]) => inner.includes(`id="${id}"`)).map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');
  return `<div class="frame"><div class="brandbox">${logo()}</div>
  <div class="head"><p class="h1">Future <b>Makers</b></p><p class="sub2">Startup Showdown</p></div>
  <nav class="side" aria-label="Organizer sections"><p class="side-who">Organizer panel</p>${links}</nav>
  <div class="desk">${inner}</div></div>`;
}

export function renderOrganizer(v, ui = {}) {
  return shell(renderOrganizerInner(v, ui));
}

function seatBoards(v) {
  const ps = arr(v.participants);
  const board = (co) => `<section class="card company seats" data-company="${co}"><h3>${companyMark(co)}Company ${co} <span class="count">${ps.filter((p) => p.company === co && p.role).length} / 5</span></h3>
  <table><thead><tr><th>Role</th><th>Participant</th><th>Admission ID</th></tr></thead><tbody>${ROLES.map((r) => {
    const p = ps.find((x) => x.company === co && x.role === r);
    return `<tr><td>${icon(ROLE_ICON[r])} ${r}</td><td>${p ? esc(p.name) : '<span class="muted">Not assigned</span>'}</td><td>${p ? esc(p.admission_id) : '-'}</td></tr>`;
  }).join('')}</tbody></table></section>`;
  return `<div class="boards">${board('A')}${board('B')}</div>`;
}
```

(The page heading is a `<p class="h1">`, not an `<h1>`, because each card's own `h2` is the heading a screen reader user jumps between; check with the user if they prefer an `<h1>`.)

In `lobby(v, ui)`: add `id="sec-roster"`, `id="sec-lobby"` and `id="sec-start"` to the three `<section class="card">` tags, and put `${seatBoards(v)}` right after the lobby card.

`organizer.js` reads fields by id and listens on `document`, so the frame changes nothing there; read it once to confirm (`draw()` restores the values of the `KEEP` ids, which are unchanged).

Replace `public/css/organizer.css` with its header comment plus:

```css
/* the frame (draft: organizer-lobby.html) */
.frame { display: grid; grid-template-columns: 240px minmax(0, 1fr); grid-template-rows: auto 1fr; min-height: 100vh; }
.frame > * { min-width: 0; }
.brandbox { background: var(--orange); border-right: var(--line-thick) solid var(--ink); border-bottom: var(--line-thick) solid var(--ink); display: grid; place-items: center; padding: 8px; }
.brandbox .logo { width: 96px; height: 96px; }
.head { border-bottom: var(--line-thick) solid var(--ink); padding: 8px 24px; display: flex; flex-direction: column; justify-content: center; }
.head .h1 { margin: 0; font: 400 clamp(1.8rem, 4.4vw, 3.6rem)/.95 var(--slab); text-transform: uppercase; }
.head .h1 b { color: var(--orange); font-weight: 400; -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill; }
.head .sub2 { margin: 4px 0 0; font-size: clamp(.8rem, 1.6vw, 1.2rem); letter-spacing: .3em; text-transform: uppercase; }
.side { background: var(--ink); color: var(--paper); display: flex; flex-direction: column; border-right: var(--line-thick) solid var(--ink); }
.side .side-who { margin: 0; background: var(--orange); color: var(--ink); font: 400 1.4rem/1.05 var(--block); text-transform: uppercase; padding: 14px 18px; border-bottom: var(--line-thick) solid var(--ink); }
.side a { display: flex; align-items: center; min-height: 52px; padding: 12px 20px; color: var(--paper); text-decoration: none; border-bottom: 2px solid var(--rail); }
.side a:hover { background: var(--rail); }
.side a:focus-visible { outline-color: var(--paper); }
.desk { padding: 0 0 32px; }
.desk > main { max-width: none; }
.desk header.bar { top: 0; }
.desk header.bar > span:first-child { font: 400 1.2rem var(--block); text-transform: uppercase; }
.desk header.bar .phase { justify-self: end; font: 700 .95rem var(--mono); color: var(--ink); }

/* lobby table and seat pickers */
#sec-lobby select { min-height: var(--tap); padding: 4px 8px; margin: 2px 4px 2px 0; }
#sec-lobby td button { min-height: var(--tap); padding: 4px 12px; }
.import-result { border: var(--line) dashed var(--ink); padding: 8px 12px; margin: 10px 0; }
.rejected li { color: var(--bad); font-weight: 700; }

@media (max-width: 1000px) {
  .frame { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
  .brandbox { display: none; }
  .side { flex-direction: row; overflow-x: auto; border-right: 0; }
  .side .side-who { display: none; }
  .side a { flex: none; border-bottom: 0; border-right: 2px solid var(--rail); }
}

/* seat boards under the lobby table (draft: organizer-lobby.html, the two company tables) */
.boards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 18px; }
.card.seats > h3:first-child { display: flex; align-items: center; gap: 10px; color: var(--team-on-ink); }
.card.seats .mark { width: 36px; height: 30px; color: var(--paper); }
.card.seats .count { margin-left: 8px; background: var(--team); color: var(--team-ink); padding: 2px 8px; font: 700 .85rem var(--mono); }
.card.seats td .i { width: 20px; height: 20px; }
#sec-lobby td:last-child { white-space: nowrap; }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including all of `test/render-organizer.test.js` (Plan 2 and 3) and the hook inventory.

- [ ] **Step 5: Commit**

```bash
git add public/render-organizer.js public/css/organizer.css test/design-organizer.test.js
git commit -m "feat: organizer login, frame with in-page navigation, lobby and seat boards"
```

---

### Task 13: The running game and the live monitor (organizer)

**Files:**
- Modify: `public/render-organizer.js` (running-game branch, `panel`), `public/css/organizer.css`, `test/design-organizer.test.js`
- Read first: the running-game part of `renderOrganizer` as Plans 3 and 5 left it: Plan 3's `control(g)` (attack log "Attacks (real cause)", the event buttons `ev-demand_surge`, `ev-demand_slump`, `ev-shop_sale`, the injection fields `inject-company`, `inject-coins`, `inject-go`) and Plan 5's reveal card (`reveal`, `next-game`, `a[data-export]`).

**Drafts:** `ui-drafts/monitor-organizer.html` (both companies side by side with a VS divider, real attack causes, controls), and the "Game Controls" box of `organizer-lobby.html`.

**Interfaces:**
- The organizer bar keeps `<header class="bar">`, `Game N`, `.phase` and `<span id="clock">`; the clock gets the timer pill (`<span class="timer"><span class="pill">...</span></span>`).
- Section ids: `sec-controls` on the Controls card, `sec-companies` on `main.two`; add `sec-attacks`, `sec-event`, `sec-inject`, `sec-results` to the Plan 3 and Plan 5 cards and to `NAV` (labels "Attacks", "Market event", "Coin injection", "Results").
- `panel(name, c)` keeps "Company A", the wallet in `.big`, the idea, the votes, "Bought", "CFO queue" and "Waiting for CEO"; gets `class="card company" data-company="A|B"` (the letter only from `name === 'B' ? 'B' : 'A'`) and the company mark in its tab. On a laptop the two panels sit side by side with the draft's orange and blue VS bar between them.
- This is the **only** place both companies are shown together. It must stay on `organizer.html`, which a player cannot open without the password (Plan 1). Never import `render-organizer.js` into `app.js`.
- No `role="alert"` may be added to the running view (a Plan 2 test requires that only the stuck-phase banner has it).
- Not built from the draft: the "Spend by role" donuts, "Team progress" checklists, the coins-over-time chart and the coin-difference box while the game runs (the organizer view has no time series; Plan 5's graphs come after the game), the speed and pause controls (draft only).

- [ ] **Step 1: Write the failing tests**

Add to `test/design-organizer.test.js`:

```js
test('the running game shows both companies in their own colours with the VS layout', () => {
  const h = renderOrganizer(ORGANIZER['org-running']);
  assert.match(h, /<main class="two" id="sec-companies"><section class="card company" data-company="A"><h2><svg class="mark"[^]*Company A<\/h2>/);
  assert.match(h, /<section class="card company" data-company="B">/);
  assert.match(h, /<span class="timer"><span class="pill"><span id="clock">4:05<\/span><\/span><\/span>/);
  assert.equal(h.includes('role="alert"'), false);
});

test('a hostile company key cannot reach data-company', () => {
  const v = structuredClone(ORGANIZER['org-running']);
  v.game.companies = { A: v.game.companies.A, '"><x': v.game.companies.B };
  assert.equal(renderOrganizer(v).includes('data-company="&quot;'), false);
});

test('every organizer control that Plans 3 and 5 added keeps its id', () => {
  const h = renderOrganizer(ORGANIZER['org-competition']);
  for (const id of ['ev-demand_surge', 'ev-demand_slump', 'ev-shop_sale', 'inject-company', 'inject-coins', 'inject-go']) assert.match(h, new RegExp(`id="${id}"`), id);
  assert.match(h, /href="#sec-attacks"/);
});
```

(If Plan 3's organizer controls are not built yet, the last test fails for that reason: build Plan 3 first.)

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (no `data-company` on the panels)

- [ ] **Step 3: Write the implementation**

In the running-game return: `<span id="clock">...</span>` becomes `<span class="timer"><span class="pill"><span id="clock">${fmtClock(clock.remainingSec)}</span></span></span>`; `<section class="card"><h2>Controls</h2>` becomes `<section class="card" id="sec-controls"><h2>Controls</h2>`; `<main class="two">` becomes `<main class="two" id="sec-companies">`. Add the ids `sec-attacks`, `sec-event`, `sec-inject`, `sec-results` to the Plan 3 and 5 cards (first `<section class="card"` of each) and extend `NAV`:

```js
const NAV = [['sec-roster', 'Roster'], ['sec-lobby', 'Lobby & roles'], ['sec-start', 'Start'], ['sec-controls', 'Game control'], ['sec-companies', 'Live monitor'],
  ['sec-attacks', 'Attacks'], ['sec-event', 'Market event'], ['sec-inject', 'Coin injection'], ['sec-results', 'Results']];
```

In `panel(name, c)` change the panel's opening (both the "No data" form and the full form) to

```js
`<section class="card company" data-company="${name === 'B' ? 'B' : 'A'}"><h2>${companyMark(name)}Company ${esc(name)}</h2>`
```

Append to `public/css/organizer.css`:

```css
/* two companies side by side (draft: monitor-organizer.html, the "duel") */
main.two { position: relative; }
.card.company > h2:first-child { display: flex; align-items: center; gap: 10px; color: var(--team-on-ink); }
.card.company > h2 .mark { width: 40px; height: 34px; color: var(--paper); }
.card.company .big { display: inline-block; background: var(--team); color: var(--team-ink); border: var(--line) solid var(--ink); padding: 6px 12px; }
.card.company h3 { margin-top: 12px; border-bottom: var(--line) solid var(--team); padding-bottom: 4px; }
.card.company ul li { border-bottom: 1px dashed var(--ink); padding: 4px 0; display: flex; justify-content: space-between; gap: 8px; }
@media (min-width: 1000px) {
  main.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 60px; }
  main.two::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 18px; transform: translateX(-50%);
    background: linear-gradient(90deg, var(--orange) 50%, var(--blue) 50%); }
  main.two::after { content: "VS"; position: absolute; left: 50%; top: 40px; transform: translateX(-50%); width: 56px; height: 62px; display: grid; place-items: center;
    background: var(--ink); color: var(--paper); font: 400 1.3rem var(--block); clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
}

/* running-game controls (Plan 3 control(g), Plan 5 reveal and downloads): the draft's .box and .big-btn look */
#sec-controls button, [id^="ev-"], #inject-go, #reveal, #next-game { min-height: 52px; }
[id^="ev-"]:not([disabled]) { background: var(--orange); }
#inject-company, #inject-coins { min-width: 6rem; }
a[data-export] { display: inline-flex; align-items: center; min-height: var(--tap); margin: 4px 12px 4px 0; padding: 8px 14px; border: var(--line) solid var(--ink); background: var(--field); font-weight: 700; text-decoration: none; box-shadow: var(--shadow-sm) var(--shadow-sm) 0 var(--ink); }
.attack-log li, #sec-attacks li { border-bottom: 1px dashed var(--ink); padding: 6px 0; }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS, including the Plan 3 organizer tests (`Company A attacked Company B`, `id="ev-demand_surge" disabled`, `500 coins to Company A`) and the end-game two-step confirm.

- [ ] **Step 5: Check by hand**

Run a game with two browser windows (organizer at 1280 px, a player at 390 px). In the organizer's running view use the side links (each jumps to its card), end ideation early and end the game through the two-step confirm, and in the Competition fire one market event and one injection. On the player window confirm nothing of Company B is visible at any point.

- [ ] **Step 6: Commit**

```bash
git add public/render-organizer.js public/css/organizer.css test/design-organizer.test.js
git commit -m "feat: organizer live monitor with both companies, VS layout and styled controls"
```

---

### Task 14: CSS coverage, weight budget and accessibility in markup

**Files:**
- Create: `test/css-coverage.test.js`, `test/design-budget.test.js`
- Modify: `public/css/*.css` only if the tests find a gap

**Interfaces:**
- Consumes: `renderAll()` (Task 1), the five stylesheets.

- [ ] **Step 1: Write the tests**

`test/css-coverage.test.js`:

```js
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
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/, `${name}: ${m[0]}`);
    for (const m of html.matchAll(/<button\b[^>]*>([^]*?)<\/button>/g)) assert.ok(m[1].replace(/<[^>]+>/g, '').trim() || /aria-label=/.test(m[0]), `${name}: empty button`);
  }
});
```

Plan 5's graph SVGs carry `role="img"` and `aria-label` instead of `aria-hidden`; if a `graphs-shown` fixture exists, skip `<svg` tags with `role="img"` in the icon check.

`test/design-budget.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';

const size = (dir, re) => readdirSync(dir).filter((f) => re.test(f)).reduce((n, f) => n + statSync(`${dir}/${f}`).size, 0);

test('the look stays light for phones on the Pi\'s Wi-Fi', () => {
  assert.ok(size('public/css', /\.css$/) < 60 * 1024, 'stylesheets');
  assert.ok(size('public/fonts', /\.woff2$/) < 80 * 1024, 'web fonts');
  assert.ok(statSync('public/img/icons.svg').size < 12 * 1024, 'icons');
  assert.ok(statSync('public/img/logo.svg').size < 30 * 1024, 'logo');
});
```

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: either PASS, or a list of classes without rules or fields without labels. For each class: add a rule in the file that owns the screen, or, if it is a pure hook, add it to `UNSTYLED` with a comment why. For each field: add a `<label for>` or a `.sr-only` label in the markup. Do not weaken a test to make it pass.

- [ ] **Step 3: Commit**

```bash
git add test/css-coverage.test.js test/design-budget.test.js public
git commit -m "test: every emitted class is styled, fields are labelled, the look stays within budget"
```

---

### Task 15: Screenshots and browser checks (dev only, not part of npm test)

**Files:**
- Create: `visual/playwright.config.mjs`, `visual/visual.spec.mjs`, `visual/checks.js`, `test/visual/*.png` (generated baselines)
- Modify: `package.json` (scripts `visual`, `visual:update`)
- Run once while online: `npm install --save-dev @playwright/test@1.64.0` and `npx playwright install chromium`

**Interfaces:**
- `npm run visual` renders every fixture of `renderAll()` into a page that loads the real stylesheets, fonts and icons from `public/` (no server, no game), at **390 by 844** and **1280 by 800**, and for each: fails on sideways scrolling, measures text contrast as rendered, measures tap targets on the phone size, and compares a full-page screenshot with `test/visual/<name>-<width>.png`. `npm run visual:update` rewrites the baselines after a deliberate change (look at every changed picture before committing it).
- The spec lives in `visual/`, not `test/`, so `npm test` (`node --test test/`) never loads Playwright. The PNG baselines live in `test/visual/` as required; `node --test` ignores `.png` files.

- [ ] **Step 1: Write the checks and the spec**

`visual/checks.js` (runs inside the page through `page.evaluate`, so it uses only browser APIs):

```js
// Browser-side checks. Each returns a list of problems (empty = fine).
export function overflow() {
  const w = window.innerWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  return sw > w ? [`page is ${sw}px wide in a ${w}px window`] : [];
}

export function tapTargets() {
  const bad = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, td[data-cell]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue; // inside a closed <details>
    if (r.width < 44 || r.height < 44) bad.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.name || '').trim().slice(0, 30)}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return bad;
}

export function textContrast() {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // The panel colour of a .card is painted by its ::after layer, so look there before the element's own background.
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      for (const pseudo of ['::after', '::before', null]) {
        const cs = getComputedStyle(e, pseudo);
        if (pseudo && (cs.content === 'none' || cs.position !== 'absolute' || cs.zIndex !== '-1')) continue;
        const c = rgb(cs.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c;
      }
    }
    return [255, 255, 255];
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('[aria-hidden="true"], .sr-only, svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.webkitTextStrokeWidth) >= 1.5) continue; // outlined display type
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(rgb(cs.color), bgOf(el));
    if (r < (large ? 3 : 4.5)) bad.push(`"${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}:1`);
  }
  return bad;
}
```

`visual/visual.spec.mjs`:

```js
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { renderAll } from '../test/fixtures/render-all.js';
import { overflow, tapTargets, textContrast } from './checks.js';

const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const shots = renderAll();
const page = (body, organizer) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${['tokens', 'fonts', 'base', organizer ? 'organizer' : 'player'].map((c) => `<link rel="stylesheet" href="/css/${c}.css">`).join('')}</head>
<body><div id="app">${body}</div><div id="toast" role="alert"></div></body></html>`;

test.beforeEach(async ({ page: p }) => {
  await p.route('http://gallery.test/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/g/')) {
      const name = decodeURIComponent(u.pathname.slice(3));
      return route.fulfill({ contentType: 'text/html', body: page(shots[name], name.startsWith('org')) });
    }
    const file = join('public', u.pathname);
    return existsSync(file) ? route.fulfill({ contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) }) : route.fulfill({ status: 404, body: '' });
  });
});

for (const width of [390, 1280]) {
  for (const name of Object.keys(shots)) {
    test(`${name} at ${width}px`, async ({ page: p }) => {
      await p.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await p.goto(`http://gallery.test/g/${encodeURIComponent(name)}`);
      await p.evaluate(() => document.fonts.ready);
      expect(await p.evaluate(overflow)).toEqual([]);
      expect(await p.evaluate(textContrast)).toEqual([]);
      if (width === 390) expect(await p.evaluate(tapTargets)).toEqual([]);
      await expect(p).toHaveScreenshot(`${name}-${width}.png`, { fullPage: true, maxDiffPixelRatio: 0.01, animations: 'disabled' });
    });
  }
}
```

(`page.evaluate(fn)` sends the function's source to the browser, so `checks.js` must not import anything.)

`visual/playwright.config.mjs`:

```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'visual.spec.mjs',
  snapshotPathTemplate: '../test/visual/{arg}{ext}',
  workers: 2,
  use: { browserName: 'chromium', deviceScaleFactor: 1 },
});
```

`package.json` scripts: `"visual": "playwright test -c visual/playwright.config.mjs"`, `"visual:update": "playwright test -c visual/playwright.config.mjs --update-snapshots"`.

- [ ] **Step 2: Make the first baselines and read the problems**

Run: `npm run visual:update`
Expected: every overflow, contrast and tap-size check passes; one PNG per fixture and width in `test/visual/`. A failed check prints the element and the number; fix the CSS (or the markup for a missing label) and run again. Known places to look first: small `.btn`-like buttons in table rows (`#sec-lobby td button` must be 44 px), the Sets cards, the timer pill on a 360 px phone, white on blue (4.50:1 needs bold text).

Also run once at 360 px wide (temporarily change 390 to 360 in the spec, do not commit) and fix any overflow.

- [ ] **Step 3: Run the regression check**

Run: `npm run visual`
Expected: PASS (same pictures). Then run `npm test`: PASS, and it does not start a browser.

- [ ] **Step 4: Commit**

```bash
git add visual test/visual package.json package-lock.json
git commit -m "test: dev-only screenshots at 390 and 1280 px with overflow, contrast and tap-size checks"
```

---

### Task 16: Look at it (side by side with the drafts) and on real phones

**Files:** none new. Fixes go into the files of the task that owns the screen, each with its own commit.

- [ ] **Step 1: Side by side**

For each row of the "Draft to render function map" open `ui-drafts/standalone/<draft>.html` and the matching `test/visual/<fixture>-1280.png` and `-390.png`. Check, and note anything that differs on purpose (from this plan's "not built" lists) or by mistake: cream paper and ink outlines everywhere; the black slanted tabs; hard shadows on panels and buttons; the cut top-right corner; slab and block headlines, monospace text; orange for Company A and blue for Company B (compare `briefing-cto` with `briefing-b-ceo` and `shop-b-cto`); halftone dots in the company colour; the timer pill; icons crisp; no draft-only control bar, countdown script, fake names or rupee symbol anywhere.

- [ ] **Step 2: Keyboard and screen reader**

On a laptop, sign in as a player and as the organizer using only the keyboard: every control is reachable with Tab, the focus ring is always visible (ink outline and team halo), `details` sections open with Enter and Space, the side navigation links move the focus to their card. With the browser's accessibility tree (Chrome DevTools, Accessibility pane) check that each icon is hidden, the logo reads "Makerspace logo", the role chips read "CMO (you)", the clock and wallet are plain text.

- [ ] **Step 3: Reduced motion and zoom**

Turn on "reduce motion" in the operating system: no press animation, the waiting dot does not pulse. Zoom the phone page to 200 %: text wraps, nothing overlaps the sticky header so badly that a button cannot be reached.

- [ ] **Step 4: Real phones (after Plan 6, on the Pi's hotspot)**

On at least one small Android phone and one iPhone, connected to the Pi: fonts load with no network outside the Pi (check in flight mode with Wi-Fi on), the logo and icons show, a whole game is playable with a thumb, the header stays on top while scrolling the shop, nothing scrolls sideways, colours read in daylight near a window. Write the results into the Plan 6 event checklist.

- [ ] **Step 5: Hand-off note**

Write a short note in the task report: what differs from the drafts on purpose, what the user still has to decide (see "Decisions for the user" below), and the one place to swap the logo (`public/img/logo.svg`, or the `--logo` line in `public/css/tokens.css`).

---

## Decisions for the user (ask before or while running this plan)

1. **Missing drafts:** the summary card, the Competition screens, the CFO puzzle panel and any extra organizer screens have no draft; this plan designs them from the existing style. Send references now if you want them to look a particular way.
2. **Company colours:** `organizer-lobby.html` shows Alpha in blue and Beta in orange, every other draft and the context packet say Alpha orange and Beta blue. This plan uses orange for A and blue for B everywhere.
3. **Company names:** the drafts say "Alpha" and "Beta"; the game's data only has the letters A and B, so screens say "Company A" and "Company B". Real names would need a small feature (organizer types names at pairing) in a separate plan.
4. **Data the drafts show but the views do not carry** (not built here; each needs a view change): the briefing's team list with names, the CFO's spending donut, category bars and transaction history, the CEO's team progress and activity bars, the results' company panels with both ideas. The results' "Key moments" list is **not recommended**: it would tell players the real attacks.
5. **The real logo:** the placeholder is the Makerspace badge from the drafts. Send the real file (SVG preferred, or a square PNG).
6. **The organizer page heading** is styled text, not an `<h1>` (see Task 12); say if you prefer a real heading.

## Self-review against the drafts and the brief

**Coverage:** tokens and offline fonts (Task 2); one stylesheet structure, decided and explained (File Structure, Task 4); company theming by `data-company` from the viewer's own company only, with tests (Tasks 2, 3, 6); every existing screen mapped to its draft and restyled with its hooks kept (map, Tasks 5 to 13, inventory in Task 1); the header strip as the drafts show it (Task 6), no phase stinger (none in the drafts); pure render functions tested in Node (all tasks), screenshots at 390 and 1280 px in `test/visual/` with overflow, contrast and tap checks (Task 15); accessibility basics (Tasks 4, 14, 16); the logo slot (Task 3); the risks below.

**Risks:**
- **A player sees the rival company.** Mitigated: `data-company` and the mark come only from `me.company` through `companyOf`; Task 6 and Task 9 tests scan every player fixture; the organizer renderer is never loaded by `app.js`; the results "Key moments" are not built.
- **Draft-only JS copied by mistake** (countdowns, fake data, "Draft only" bars, "Draft tool" buttons, dialog openers, cart logic). Mitigated: the plan copies no markup or script from the drafts; Task 4's test forbids any external URL, and Task 16 Step 1 checks the pictures for draft-only parts.
- **A CDN or online font sneaks in.** Mitigated: fonts, icons and the logo are local files; Task 4's test fails on any `http(s)://` in `public/`.
- **A dropped hook breaks a glue script or a later plan.** Mitigated: the recorded hook inventory (Task 1) and the unchanged Plan 2 to 5 tests.
- **Concurrent edits** to `public/render.js` by other plans. Mitigated: every task edits functions in place after reading them, CSS follows the code's class names, and the inventory is recorded from the code at the start.
- **White on blue is exactly 4.50:1.** Any change to the blue or to text weight on blue fills must re-run Task 2 and Task 15.
- **The cut-corner pseudo-elements** need `isolation: isolate` on the panel; a panel that also sets its own `z-index` or `overflow: hidden` may lose its paper layer. Task 15's screenshots catch it.

**Placeholder scan:** the only placeholder is the logo, on purpose, behind one file and one token. The Plan 3 to 5 class names are given as built or as planned, with an instruction to follow the code where it differs.

**Type consistency:** `icon`, `companyOf`, `roleOf`, `phaseOf`, `companyAttr`, `companyMark`, `logo`, `roleChips`, `ROLE_ICON`, `ROLE_TITLE`, the fixture names and `renderAll()` are the same in Tasks 1 to 16.
