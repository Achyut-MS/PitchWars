# Startup Showdown: Plan 2 of 7, Screens, Ideation and Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players log in from a browser, let the organizer run the lobby from a console, and play the first three phases: Briefing, Ideation (voting and the CEO's pick) and the Shop (requests, CEO and CFO approvals, the shared wallet, the summary card).

**Architecture:** Game rules live in small server modules (`ideation.js`, `shop.js`, `views.js`) that are tested without a network. A `director` runs once per second and fires an "end of phase" hook exactly once (resolve the idea pick, auto-reject open requests). The server sends each browser a **view**, a filtered snapshot of only what that player may see (a company never sees the rival's product). Browser screens are pure `render` functions that return HTML strings, tested in Node.

**Tech Stack:** Node.js 20+ ES modules, `ws`, `better-sqlite3`, `node:test`. Browser: plain HTML, CSS and JavaScript.

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`, Sections 0.1, 2, 3, 4, 6, 7, 9. Plan 1 (`2026-10-11-core-server.md`) must be finished first.

## Global Constraints

- Everything from Plan 1's Global Constraints still applies.
- **Hidden products:** a player's view contains only their own company's idea, votes, wallet, owned items and requests. Only the organizer's view contains both companies.
- **Ideation:** all five roles vote live; the **CEO's pick is final** (no second pick); if the CEO has not picked when the timer ends, the **most-voted idea is auto-picked**, ties broken at random, and an idea with no votes at all is picked at random from the six. If both companies have picked, Ideation **ends early** and the saved seconds are added to the Shop.
- **Wallet:** 1,000 coins per company at game start, shared by all five roles. The CFO cannot approve a purchase that would take the wallet **below -200**.
- **Shop rules:** the CTO, CMO and COO each request items from their **own sections only**. The CEO and CFO cannot add items. **The CTO's features go to the CEO first**, and then to the CFO's queue. The **CEO can recommend any item**, and a recommendation goes **straight to the CFO's queue**. The CFO decides **one request at a time, oldest first**, and can approve or reject. Upgrades move up a tier and cost the **difference**.
- **Rejected items:** rejected during the Shop phase, an item cannot be requested again in that phase, but can in a later phase. In the Competition phase, an item can be requested again **60 seconds** after its rejection.
- **Auto-reject:** every request still open when the Shop phase ends (and when the Competition phase ends) is auto-rejected.
- **The shop is open** in the Shop and Competition phases only.
- **Brand name and tagline:** the CMO picks 1 of the 3 offered options for the idea.
- **Risk fixes:** the three risk fixes take their text from the chosen idea's three risks.
- **Summary card:** 20 seconds after the Shop: the idea, everything bought, and the coins left.
- **Static files** are served from `public/` with no directory escape.

## Review Focus

1. **A path like `/../../etc/passwd` or `%2e%2e/`** must never read a file outside `public/` (Task 8).
2. **Both companies picking in the same second,** or a CEO clicking pick twice: the second click is refused, and Ideation ends early exactly once (Task 4).
3. **Two requests for the same item family at once** (for example Basic and Premium of one feature) must not both be approved (Task 5).
4. **The CFO approving out of order** must be refused, so the queue stays fair (Task 6).
5. **A hostile name or tagline** (`<script>`) must be escaped in every screen (Task 9).
6. **The director firing twice for the same phase** (two ticks in one second, or a restart) must not auto-pick or auto-reject twice (Task 3).

## File Structure

```
src/
  csv.js        parseCsv
  data.js       loadData: problems, ideas, shop catalog
  state.js      companyState, ideaOf, playerIn, ownedRows
  labels.js     itemLabel
  director.js   runDirector: once-only end-of-phase hooks
  ideation.js   castVote, pickIdea, resolveIdeation, tally
  shop.js       requestItem, recommendItem, ceoDecide, cfoDecide, autoRejectAll
  views.js      viewFor (player), organizerView
  static.js     staticHandler
  server.js     (modify) actions, state push, static files
  db.js         (modify) schema v2
  lobby.js      (modify) startGame creates wallets
public/
  index.html  organizer.html  styles.css
  render.js   render-organizer.js   (pure, tested)
  app.js      organizer.js          (browser glue)
test/helpers.js and one test file per module
```

---

### Task 1: CSV parser and data loader

**Files:**
- Create: `src/csv.js`, `src/data.js`, `test/data.test.js`
- Existing data (already in the project): `data/problems.json`, `data/idea_options.csv`, `data/shop_catalog.csv`

**Interfaces:**
- Produces:
  - `parseCsv(text) -> object[]` (first line is the header; handles quoted fields with commas and `""`)
  - `loadData(dir = 'data') -> { problems, ideasFor(problemId), item(id), catalog }`
  - `idea = { id: 'H1', type: 'hardware'|'software', name, description, risks: [3], brands: [3], taglines: [3] }`
  - `item = { id, role, section, name, option, appliesTo, cost, tierPoints (number|null), family, effect }` where `family` is the id before the first `-` (`F01-B` becomes `F01`; `HC01` stays `HC01`).

- [ ] **Step 1: Write the failing tests**

`test/data.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
import { loadData } from '../src/data.js';

test('parseCsv handles quotes, commas inside quotes and doubled quotes', () => {
  const rows = parseCsv('a,b\n1,"x, y"\n2,"say ""hi"""\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y' }, { a: '2', b: 'say "hi"' }]);
});

test('parseCsv copes with Windows line endings and a missing final newline', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [{ a: '1', b: '2' }]);
});

const data = loadData('data');

test('there are 8 problem statements', () => {
  assert.equal(data.problems.length, 8);
  assert.equal(data.problems[0].title, 'Food waste');
});

test('every problem has 6 ideas: 3 hardware and 3 software, each with 3 risks, brands and taglines', () => {
  for (const p of data.problems) {
    const ideas = data.ideasFor(p.id);
    assert.equal(ideas.length, 6, `problem ${p.id}`);
    assert.equal(ideas.filter((i) => i.type === 'hardware').length, 3);
    assert.equal(ideas.filter((i) => i.type === 'software').length, 3);
    for (const i of ideas) {
      assert.equal(i.risks.length, 3);
      assert.equal(i.brands.length, 3);
      assert.equal(i.taglines.length, 3);
      assert.ok(i.description.length > 10);
    }
  }
});

test('the catalog has 50 items with tiers and families', () => {
  assert.equal(data.catalog.length, 50);
  const f01 = data.catalog.filter((i) => i.family === 'F01');
  assert.deepEqual(f01.map((i) => i.tierPoints), [1, 2, 3]);
  assert.equal(data.item('O06').cost, 150);
  assert.equal(data.item('HC01').tierPoints, null);
  assert.equal(data.item('O05-F').tierPoints, 2);
});

test('unknown ids are undefined, not an error', () => {
  assert.equal(data.item('NOPE'), undefined);
  assert.deepEqual(data.ideasFor(99), []);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/csv.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/csv.js`:

```js
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
```

`src/data.js`:

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.js';

export function loadData(dir = 'data') {
  const problems = JSON.parse(readFileSync(join(dir, 'problems.json'), 'utf8'));
  const ideasByProblem = new Map();
  for (const r of parseCsv(readFileSync(join(dir, 'idea_options.csv'), 'utf8'))) {
    const idea = {
      id: r.idea_id,
      type: r.idea_id.startsWith('H') ? 'hardware' : 'software',
      name: r.idea,
      description: r.description,
      risks: [r.risk_1, r.risk_2, r.risk_3],
      brands: [r.brand_1, r.brand_2, r.brand_3],
      taglines: [r.tagline_1, r.tagline_2, r.tagline_3],
    };
    const k = Number(r.game);
    if (!ideasByProblem.has(k)) ideasByProblem.set(k, []);
    ideasByProblem.get(k).push(idea);
  }
  const catalog = parseCsv(readFileSync(join(dir, 'shop_catalog.csv'), 'utf8')).map((r) => ({
    id: r.item_id,
    role: r.role,
    section: r.section,
    name: r.item_name,
    option: r.option_or_tier,
    appliesTo: r.applies_to,
    cost: Number(r.cost_coins),
    tierPoints: r.tier_points === '' ? null : Number(r.tier_points),
    family: r.item_id.split('-')[0],
    effect: r.effect_on_sales,
  }));
  return {
    problems,
    ideasFor: (problemId) => ideasByProblem.get(problemId) ?? [],
    item: (id) => catalog.find((i) => i.id === id),
    catalog,
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/csv.js src/data.js test/data.test.js data
git commit -m "feat: csv parser and data loader for problems, ideas and the shop catalog"
```

---

### Task 2: Schema v2, wallets, and a shared test helper

**Files:**
- Modify: `src/db.js` (append tables to `SCHEMA`), `src/lobby.js` (`startGame` creates wallets)
- Create: `src/state.js`, `test/helpers.js`, `test/schema2.test.js`

**Interfaces:**
- Produces:
  - Tables `company_state(game_id, company, idea_id, picked_by, picked_at, pick_source, wallet DEFAULT 1000)`, `votes(game_id, admission_id PK pair, company, idea_id, ts)`, `requests(id, game_id, company, item_id, family, choice, requested_by, recommended, status, phase, price, charged, requested_at, decided_at, decided_by, reject_reason)`, `owned(game_id, company, family PK triple, item_id, choice, bought_at, charged)`, `phase_done(game_id, phase PK pair)`.
  - `startGame` also inserts two `company_state` rows with wallet 1000.
  - `state.js`: `companyState(db, gameId, company)`, `ideaOf(ctx, game, company) -> idea|null`, `playerIn(db, gameId, admissionId) -> row|undefined`, `ownedRows(db, gameId, company)`.
  - `test/helpers.js`: `data`, `makeRunning({ problemId = 1, startAt = 0 }) -> { db, ctx, clock, gameId, seat, game() }`, `atSec(h, seconds)`. `ctx = { db, data, now }`. `seat = { A: { CEO: 'S0', CTO: 'S1', CFO: 'S2', CMO: 'S3', COO: 'S4' }, B: { CEO: 'S5', ... COO: 'S9' } }`. Players `S10` and `S11` stay in the lobby.

- [ ] **Step 1: Write the failing tests**

`test/schema2.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { makeRunning } from './helpers.js';
import { companyState } from '../src/state.js';

test('the new tables exist', () => {
  const db = openDb();
  for (const t of ['company_state', 'votes', 'requests', 'owned', 'phase_done']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(t), t);
  }
});

test('starting a game creates a 1,000-coin wallet for each company', () => {
  const h = makeRunning();
  assert.equal(companyState(h.db, h.gameId, 'A').wallet, 1000);
  assert.equal(companyState(h.db, h.gameId, 'B').wallet, 1000);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, null);
});

test('the helper seats ten players and leaves two in the lobby', () => {
  const h = makeRunning();
  assert.equal(h.seat.A.CEO, 'S0');
  assert.equal(h.seat.B.COO, 'S9');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='lobby'").get().n, 2);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `./helpers.js`

- [ ] **Step 3: Write the minimal implementation**

Append inside the `SCHEMA` template string in `src/db.js` (before the closing backtick):

```sql
CREATE TABLE IF NOT EXISTS company_state (
  game_id     INTEGER NOT NULL,
  company     TEXT NOT NULL,
  idea_id     TEXT,
  picked_by   TEXT,
  picked_at   INTEGER,
  pick_source TEXT,
  wallet      INTEGER NOT NULL DEFAULT 1000,
  PRIMARY KEY (game_id, company)
);
CREATE TABLE IF NOT EXISTS votes (
  game_id      INTEGER NOT NULL,
  admission_id TEXT NOT NULL,
  company      TEXT NOT NULL,
  idea_id      TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  PRIMARY KEY (game_id, admission_id)
);
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      INTEGER NOT NULL,
  company      TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  family       TEXT NOT NULL,
  choice       INTEGER,
  requested_by TEXT NOT NULL,
  recommended  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('awaiting_ceo','pending','approved','rejected')),
  phase        TEXT NOT NULL,
  price        INTEGER NOT NULL,
  charged      INTEGER,
  requested_at INTEGER NOT NULL,
  decided_at   INTEGER,
  decided_by   TEXT,
  reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS requests_by_company ON requests (game_id, company, status);
CREATE TABLE IF NOT EXISTS owned (
  game_id   INTEGER NOT NULL,
  company   TEXT NOT NULL,
  family    TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  choice    INTEGER,
  bought_at INTEGER NOT NULL,
  charged   INTEGER NOT NULL,
  PRIMARY KEY (game_id, company, family)
);
CREATE TABLE IF NOT EXISTS phase_done (
  game_id INTEGER NOT NULL,
  phase   TEXT NOT NULL,
  PRIMARY KEY (game_id, phase)
);
```

In `src/lobby.js`, inside the transaction in `startGame`, right after the `gameId` is created and before the participant loop, add:

```js
    const wallet = db.prepare('INSERT INTO company_state (game_id, company, wallet) VALUES (?, ?, 1000)');
    wallet.run(gameId, 'A');
    wallet.run(gameId, 'B');
```

`src/state.js`:

```js
export const companyState = (db, gameId, company) =>
  db.prepare('SELECT * FROM company_state WHERE game_id = ? AND company = ?').get(gameId, company);

export function ideaOf(ctx, game, company) {
  const cs = companyState(ctx.db, game.id, company);
  if (!cs || !cs.idea_id) return null;
  return ctx.data.ideasFor(game.problemId).find((i) => i.id === cs.idea_id) ?? null;
}

export const playerIn = (db, gameId, admissionId) =>
  db.prepare("SELECT * FROM participants WHERE admission_id = ? AND game_id = ? AND status = 'in_game'")
    .get(admissionId, gameId);

export const ownedRows = (db, gameId, company) =>
  db.prepare('SELECT * FROM owned WHERE game_id = ? AND company = ?').all(gameId, company);
```

`test/helpers.js`:

```js
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { activeGame } from '../src/persist.js';
import { loadData } from '../src/data.js';

export const data = loadData('data');

export function makeRunning({ problemId = 1, startAt = 0 } = {}) {
  const db = openDb();
  for (let i = 0; i < 12; i++) addParticipant(db, `S${i}`, `Player ${i}`);
  const seat = { A: {}, B: {} };
  let i = 0;
  for (const c of ['A', 'B']) {
    for (const r of ROLES) {
      assign(db, `S${i}`, c, r);
      seat[c][r] = `S${i}`;
      i++;
    }
  }
  const clock = { t: startAt };
  const ctx = { db, data, now: () => clock.t };
  const gameId = startGame(db, problemId, startAt);
  return { db, ctx, clock, gameId, seat, game: () => activeGame(db) };
}

export const atSec = (h, seconds) => { h.clock.t = seconds * 1000; };
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (Plan 1's tests must still pass too)

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/lobby.js src/state.js test/helpers.js test/schema2.test.js
git commit -m "feat: schema v2, wallets at game start, shared test helper"
```

---

### Task 3: The director (once-only end-of-phase hooks)

**Files:**
- Create: `src/director.js`, `test/director.test.js`

**Interfaces:**
- Consumes: `activeGame` (Plan 1), `phaseAt` (Plan 1)
- Produces: `runDirector(ctx, hooks = HOOKS, rng = Math.random) -> boolean` (true if any hook ran). `ORDER = ['briefing','ideation','shop','summary','competition']`. `HOOKS` is a mutable object `{ phaseName: (ctx, game, rng) => void }` that later tasks fill: `HOOKS.ideation = resolveIdeation`, `HOOKS.shop = autoRejectAll`, `HOOKS.competition = autoRejectAll`. A hook runs **once per game and phase**, when that phase has ended, even if the Pi was off or several ticks were skipped.

- [ ] **Step 1: Write the failing tests**

`test/director.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { runDirector } from '../src/director.js';

test('a hook runs when its phase has ended, and only once', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = { briefing: (ctx, g) => calls.push(['briefing', g.id]) };
  atSec(h, 100);
  assert.equal(runDirector(h.ctx, hooks), false);
  atSec(h, 181);
  assert.equal(runDirector(h.ctx, hooks), true);
  assert.equal(runDirector(h.ctx, hooks), false);
  assert.deepEqual(calls, [['briefing', h.gameId]]);
});

test('skipped phases all fire, in order, after a long gap', () => {
  const h = makeRunning();
  const calls = [];
  const hooks = Object.fromEntries(['briefing', 'ideation', 'shop', 'summary']
    .map((p) => [p, () => calls.push(p)]));
  atSec(h, 790); // summary is still running at 780..800
  runDirector(h.ctx, hooks);
  assert.deepEqual(calls, ['briefing', 'ideation', 'shop']);
  atSec(h, 801);
  runDirector(h.ctx, hooks);
  assert.deepEqual(calls, ['briefing', 'ideation', 'shop', 'summary']);
});

test('after the competition ends its hook runs once', () => {
  const h = makeRunning();
  const calls = [];
  atSec(h, 1761);
  runDirector(h.ctx, { competition: () => calls.push('competition') });
  runDirector(h.ctx, { competition: () => calls.push('competition') });
  assert.deepEqual(calls, ['competition']);
});

test('with no game running the director does nothing', async () => {
  const { openDb } = await import('../src/db.js');
  assert.equal(runDirector({ db: openDb(), now: () => 0 }, {}), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/director.js`

- [ ] **Step 3: Write the minimal implementation**

`src/director.js`:

```js
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';

export const ORDER = ['briefing', 'ideation', 'shop', 'summary', 'competition'];
export const HOOKS = {};

export function runDirector(ctx, hooks = HOOKS, rng = Math.random) {
  const game = activeGame(ctx.db);
  if (!game) return false;
  const current = phaseAt(game, ctx.now()).phase;
  const upTo = current === 'ended' ? ORDER.length : ORDER.indexOf(current);
  let ran = false;
  for (let i = 0; i < upTo; i++) {
    const phase = ORDER[i];
    const fresh = ctx.db
      .prepare('INSERT OR IGNORE INTO phase_done (game_id, phase) VALUES (?, ?)')
      .run(game.id, phase).changes === 1;
    if (fresh && hooks[phase]) {
      hooks[phase](ctx, activeGame(ctx.db), rng);
      ran = true;
    }
  }
  return ran;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/director.js test/director.test.js
git commit -m "feat: director fires end-of-phase hooks exactly once"
```

---

### Task 4: Ideation (votes, the CEO's pick, auto-pick, early end)

**Files:**
- Create: `src/ideation.js`, `test/ideation.test.js`

**Interfaces:**
- Consumes: `ctx = { db, data, now }`, `game = { id, problemId, startedAt, ideationSavedSec }`, `endIdeationEarly`, `phaseAt` (Plan 1), `playerIn`, `companyState` (Task 2), `logEvent` (Plan 1)
- Produces:
  - `castVote(ctx, game, admissionId, ideaId) -> void`
  - `pickIdea(ctx, game, admissionId, ideaId) -> { endedEarly: boolean }` (CEO only, once)
  - `tally(db, gameId, company) -> { [ideaId]: count }`
  - `resolveIdeation(ctx, game, rng = Math.random) -> void` (picks for companies that have not picked)
- Errors (messages are shown to players): `'ideation is not open'`, `'unknown idea'`, `'not in this game'`, `'your company has already picked'`, `'only the CEO can pick'`.

- [ ] **Step 1: Write the failing tests**

`test/ideation.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { castVote, pickIdea, tally, resolveIdeation } from '../src/ideation.js';
import { companyState } from '../src/state.js';
import { phaseAt } from '../src/phases.js';

test('everyone can vote during ideation, and a changed vote replaces the old one', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'S2');
  assert.deepEqual(tally(h.db, h.gameId, 'A'), { H1: 1, S2: 1 });
});

test('votes are refused before ideation and after it', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /ideation is not open/);
  atSec(h, 400);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /ideation is not open/);
});

test('an unknown idea and a player from outside the game are refused', () => {
  const h = makeRunning(); atSec(h, 200);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'ZZ'), /unknown idea/);
  assert.throws(() => castVote(h.ctx, h.game(), 'S10', 'H1'), /not in this game/);
});

test('every vote and change is logged', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'S2');
  const rows = h.db.prepare("SELECT payload FROM events WHERE type='vote' ORDER BY id").all().map((r) => JSON.parse(r.payload));
  assert.deepEqual(rows.map((r) => [r.ideaId, r.previous]), [['H1', null], ['S2', 'H1']]);
});

test('only the CEO can pick, and the pick is final', () => {
  const h = makeRunning(); atSec(h, 200);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /only the CEO can pick/);
  assert.equal(pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H2').endedEarly, false);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H3'), /already picked/);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H2');
  assert.equal(companyState(h.db, h.gameId, 'A').pick_source, 'ceo');
});

test('voting closes for a company once its CEO has picked', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H2');
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /already picked/);
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'H1'); // the other company can still vote
});

test('when both CEOs have picked, ideation ends early and the saved time goes to the shop', () => {
  const h = makeRunning(); atSec(h, 200); // 20 s into ideation
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  const r = pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  assert.equal(r.endedEarly, true);
  assert.deepEqual(phaseAt(h.game(), h.clock.t), { phase: 'shop', remainingSec: 580 });
  assert.equal(h.game().ideationSavedSec, 160);
});

test('auto-pick takes the most voted idea, and leaves a CEO pick alone', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H2');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'H2');
  castVote(h.ctx, h.game(), h.seat.A.CMO, 'S1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S3');
  atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H2');
  assert.equal(companyState(h.db, h.gameId, 'A').pick_source, 'auto');
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S3');
});

test('a tie is broken by the random number, and no votes at all picks one of the six', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'S2');
  atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0.99); // last of the tied ideas
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'S2');
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S3'); // 0.99 of 6 ideas
});

test('resolving twice does not change a pick', () => {
  const h = makeRunning(); atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0);
  resolveIdeation(h.ctx, h.game(), () => 0.99);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H1');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/ideation.js`

- [ ] **Step 3: Write the minimal implementation**

`src/ideation.js`:

```js
import { logEvent } from './events.js';
import { phaseAt, endIdeationEarly } from './phases.js';
import { companyState, playerIn } from './state.js';

function requireIdeation(ctx, game) {
  if (phaseAt(game, ctx.now()).phase !== 'ideation') throw new Error('ideation is not open');
}

function requireIdea(ctx, game, ideaId) {
  if (!ctx.data.ideasFor(game.problemId).some((i) => i.id === ideaId)) throw new Error('unknown idea');
}

function requirePlayer(ctx, game, admissionId) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  return p;
}

export function tally(db, gameId, company) {
  const out = {};
  for (const r of db.prepare('SELECT idea_id, COUNT(*) AS n FROM votes WHERE game_id = ? AND company = ? GROUP BY idea_id').all(gameId, company)) {
    out[r.idea_id] = r.n;
  }
  return out;
}

export function castVote(ctx, game, admissionId, ideaId) {
  const p = requirePlayer(ctx, game, admissionId);
  requireIdeation(ctx, game);
  requireIdea(ctx, game, ideaId);
  if (companyState(ctx.db, game.id, p.company).idea_id) throw new Error('your company has already picked');
  const prev = ctx.db.prepare('SELECT idea_id FROM votes WHERE game_id = ? AND admission_id = ?').get(game.id, admissionId);
  ctx.db.prepare(
    `INSERT INTO votes (game_id, admission_id, company, idea_id, ts) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (game_id, admission_id) DO UPDATE SET idea_id = excluded.idea_id, ts = excluded.ts`
  ).run(game.id, admissionId, p.company, ideaId, ctx.now());
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'vote',
    payload: { ideaId, previous: prev ? prev.idea_id : null, company: p.company } });
}

export function pickIdea(ctx, game, admissionId, ideaId) {
  const p = requirePlayer(ctx, game, admissionId);
  if (p.role !== 'CEO') throw new Error('only the CEO can pick');
  requireIdeation(ctx, game);
  requireIdea(ctx, game, ideaId);
  if (companyState(ctx.db, game.id, p.company).idea_id) throw new Error('your company has already picked');
  ctx.db.prepare(
    "UPDATE company_state SET idea_id=?, picked_by=?, picked_at=?, pick_source='ceo' WHERE game_id=? AND company=?"
  ).run(ideaId, admissionId, ctx.now(), game.id, p.company);
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'idea_pick', payload: { ideaId, company: p.company } });
  return { endedEarly: maybeEndEarly(ctx, game) };
}

function maybeEndEarly(ctx, game) {
  const both = ['A', 'B'].every((c) => companyState(ctx.db, game.id, c).idea_id);
  if (!both) return false;
  const before = game.ideationSavedSec || 0;
  const next = endIdeationEarly(game, ctx.now());
  ctx.db.prepare('UPDATE games SET ideation_saved_sec = ? WHERE id = ?').run(next.ideationSavedSec, game.id);
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'ideation_end_early', payload: { savedSec: next.ideationSavedSec - before } });
  return true;
}

export function resolveIdeation(ctx, game, rng = Math.random) {
  const ideas = ctx.data.ideasFor(game.problemId).map((i) => i.id);
  for (const company of ['A', 'B']) {
    if (companyState(ctx.db, game.id, company).idea_id) continue;
    const counts = tally(ctx.db, game.id, company);
    const best = Math.max(0, ...Object.values(counts));
    const candidates = best === 0 ? ideas : ideas.filter((id) => counts[id] === best);
    const chosen = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    ctx.db.prepare(
      "UPDATE company_state SET idea_id=?, picked_at=?, pick_source='auto' WHERE game_id=? AND company=?"
    ).run(chosen, ctx.now(), game.id, company);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'idea_auto_pick',
      payload: { company, ideaId: chosen, tied: candidates.length > 1, votes: counts } });
  }
}
```

Then register the hook. Append to the end of `src/director.js`:

```js
import { resolveIdeation } from './ideation.js';
HOOKS.ideation = resolveIdeation;
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ideation.js src/director.js test/ideation.test.js
git commit -m "feat: ideation votes, CEO pick, auto-pick and early end"
```

---

### Task 5: Shop requests and recommendations

**Files:**
- Create: `src/labels.js`, `src/shop.js`, `test/shop-request.test.js`

**Interfaces:**
- Consumes: Task 2 and Task 4 interfaces, `data.item`, `data.catalog`
- Produces (`src/shop.js`):
  - `WALLET_FLOOR = -200`, `RETRY_AFTER_MS = 60000`
  - `isShopOpen(phase) -> boolean` (`shop` or `competition`)
  - `applicable(item, idea) -> boolean`
  - `rejectionBlock(ctx, game, company, family, phase) -> string | null`
  - `requestItem(ctx, game, admissionId, itemId, choice = null) -> requestId`
  - `recommendItem(ctx, game, admissionId, itemId, choice = null) -> requestId` (CEO only, status `pending`)
  - `chargeFor(ctx, game, company, item) -> coins` (full price, or the difference when upgrading)
- `src/labels.js`: `itemLabel(item, idea, choice) -> string`.
- Errors (shown to players): `'the shop is closed'`, `'pick an idea first'`, `'that item is not available for this idea'`, `'pick one of the three options'`, `'already owned'`, `'already requested'`, `'rejected in this phase; you can ask again in the next phase'`, `'wait 60 seconds after a rejection'`, `'only the CTO, CMO and COO can add items; the CEO can recommend'`, `'that item is not in your section'`, `'only the CEO can recommend'`, `'not in this game'`.

- [ ] **Step 1: Write the failing tests**

`test/shop-request.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { requestItem, recommendItem, chargeFor } from '../src/shop.js';
import { itemLabel } from '../src/labels.js';

// Both companies pick (A: hardware H1, B: software S1) and the game jumps to the shop.
function toShop(h) {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  return h;
}
const row = (h, id) => h.db.prepare('SELECT * FROM requests WHERE id = ?').get(id);

test('the CTO requests a feature, and it waits for the CEO first', () => {
  const h = toShop(makeRunning());
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B')).status, 'awaiting_ceo');
});

test('the CMO and COO requests go straight to the CFO queue', () => {
  const h = toShop(makeRunning());
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N')).status, 'pending');
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01')).status, 'pending');
});

test('the CEO and the CFO cannot add items', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CEO, 'F01-B'), /only the CTO, CMO and COO/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CFO, 'F01-B'), /only the CTO, CMO and COO/);
});

test('a role cannot request from another role section', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'F01-B'), /not in your section/);
});

test('hardware parts only for a hardware idea, software parts only for a software idea', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'SC01'), /not available for this idea/);
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'HC01');
  requestItem(h.ctx, h.game(), h.seat.B.CTO, 'SC01');
});

test('the CEO can recommend any item, and it goes straight to the CFO queue', () => {
  const h = toShop(makeRunning());
  const id = recommendItem(h.ctx, h.game(), h.seat.A.CEO, 'F01-B');
  assert.equal(row(h, id).status, 'pending');
  assert.equal(row(h, id).recommended, 1);
  assert.throws(() => recommendItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-S'), /only the CEO can recommend/);
});

test('the shop is closed during ideation and during the summary card', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /shop is closed/);
  toShop(h);
  atSec(h, 790);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /shop is closed/);
});

test('brand and tagline need one of the three options', () => {
  const h = toShop(makeRunning());
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02'), /pick one of the three/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 4), /pick one of the three/);
  assert.equal(row(h, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 2)).choice, 2);
});

test('the same item family cannot be requested twice while one is open', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-P'), /already requested/);
});

test('the other company can request the same item independently', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N');
});

test('an owned item cannot be requested again at the same or a lower tier, but can be upgraded', () => {
  const h = toShop(makeRunning());
  h.db.prepare("INSERT INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (?, 'A', 'F01', 'F01-S', 0, 180)").run(h.gameId);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B'), /already owned/);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-S'), /already owned/);
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-P');
});

test('an upgrade costs the difference between the tiers', () => {
  const h = toShop(makeRunning());
  h.db.prepare("INSERT INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (?, 'A', 'F01', 'F01-B', 0, 100)").run(h.gameId);
  assert.equal(chargeFor(h.ctx, h.game(), 'A', h.ctx.data.item('F01-P')), 180);
  assert.equal(chargeFor(h.ctx, h.game(), 'B', h.ctx.data.item('F01-P')), 280);
});

test('a rejected item cannot come back in the same shop phase', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M'), /rejected in this phase/);
});

test('a shop-phase rejection can be requested again in the competition phase', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  atSec(h, 800);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
});

test('in the competition phase a rejected item needs a 60 second wait', () => {
  const h = toShop(makeRunning());
  atSec(h, 800);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  h.db.prepare("UPDATE requests SET status='rejected', decided_at=? WHERE id=?").run(h.clock.t, id);
  atSec(h, 850);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), /wait 60 seconds/);
  atSec(h, 861);
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
});

test('requests are logged against the requester', () => {
  const h = toShop(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const e = h.db.prepare("SELECT * FROM events WHERE type='shop_request'").get();
  assert.equal(e.admission_id, h.seat.A.CMO);
});

test('labels use the idea risks, brands and taglines', () => {
  const h = toShop(makeRunning());
  const idea = h.ctx.data.ideasFor(1).find((i) => i.id === 'H1');
  assert.equal(itemLabel(h.ctx.data.item('O02'), idea), 'Fix: ' + idea.risks[1]);
  assert.equal(itemLabel(h.ctx.data.item('M02'), idea, 3), 'Brand name: ' + idea.brands[2]);
  assert.equal(itemLabel(h.ctx.data.item('M03'), idea, 1), 'Tagline: ' + idea.taglines[0]);
  assert.equal(itemLabel(h.ctx.data.item('F01-S'), idea), 'Core Function (Smart)');
  assert.equal(itemLabel(h.ctx.data.item('HC01'), idea), 'Sensor');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/shop.js`

- [ ] **Step 3: Write the minimal implementation**

`src/labels.js`:

```js
export function itemLabel(item, idea, choice) {
  if (/^O0[123]$/.test(item.id)) return `Fix: ${idea.risks[Number(item.id[2]) - 1]}`;
  if (item.id === 'M02') return choice ? `Brand name: ${idea.brands[choice - 1]}` : 'Brand name';
  if (item.id === 'M03') return choice ? `Tagline: ${idea.taglines[choice - 1]}` : 'Tagline';
  return item.option && item.option !== 'Standard' ? `${item.name} (${item.option})` : item.name;
}
```

`src/shop.js`:

```js
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { ideaOf, playerIn } from './state.js';

export const WALLET_FLOOR = -200;
export const RETRY_AFTER_MS = 60_000;
const ADDERS = ['CTO', 'CMO', 'COO'];

export const isShopOpen = (phase) => phase === 'shop' || phase === 'competition';
export const applicable = (item, idea) => item.appliesTo === 'both' || item.appliesTo === idea.type;

export function rejectionBlock(ctx, game, company, family, phase) {
  const last = ctx.db
    .prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND family=? AND status='rejected' ORDER BY decided_at DESC, id DESC LIMIT 1")
    .get(game.id, company, family);
  if (!last) return null;
  if (last.phase === 'shop' && phase === 'shop') return 'rejected in this phase; you can ask again in the next phase';
  if (last.phase === 'competition' && phase === 'competition' && ctx.now() - last.decided_at < RETRY_AFTER_MS) {
    return 'wait 60 seconds after a rejection';
  }
  return null;
}

export function chargeFor(ctx, game, company, item) {
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  return owned ? item.cost - ctx.data.item(owned.item_id).cost : item.cost;
}

function validate(ctx, game, company, item, choice) {
  const phase = phaseAt(game, ctx.now()).phase;
  if (!isShopOpen(phase)) throw new Error('the shop is closed');
  const idea = ideaOf(ctx, game, company);
  if (!idea) throw new Error('pick an idea first');
  if (!item || !applicable(item, idea)) throw new Error('that item is not available for this idea');
  if ((item.id === 'M02' || item.id === 'M03') && ![1, 2, 3].includes(Number(choice))) {
    throw new Error('pick one of the three options');
  }
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  if (owned) {
    const have = ctx.data.item(owned.item_id);
    if (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0)) throw new Error('already owned');
  }
  const open = ctx.db
    .prepare("SELECT 1 FROM requests WHERE game_id=? AND company=? AND family=? AND status IN ('awaiting_ceo','pending')")
    .get(game.id, company, item.family);
  if (open) throw new Error('already requested');
  const block = rejectionBlock(ctx, game, company, item.family, phase);
  if (block) throw new Error(block);
  return phase;
}

function insert(ctx, game, p, item, choice, status, recommended, phase) {
  const info = ctx.db
    .prepare(
      `INSERT INTO requests (game_id, company, item_id, family, choice, requested_by, recommended, status, phase, price, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(game.id, p.company, item.id, item.family, choice ?? null, p.admission_id, recommended, status, phase, item.cost, ctx.now());
  logEvent(ctx.db, {
    ts: ctx.now(), gameId: game.id, admissionId: p.admission_id,
    type: recommended ? 'shop_recommend' : 'shop_request',
    payload: { requestId: Number(info.lastInsertRowid), itemId: item.id, choice: choice ?? null, status },
  });
  return Number(info.lastInsertRowid);
}

export function requestItem(ctx, game, admissionId, itemId, choice = null) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (!ADDERS.includes(p.role)) throw new Error('only the CTO, CMO and COO can add items; the CEO can recommend');
  const item = ctx.data.item(itemId);
  if (item && item.role !== p.role) throw new Error('that item is not in your section');
  const phase = validate(ctx, game, p.company, item, choice);
  const status = p.role === 'CTO' && item.section === 'Core Features' ? 'awaiting_ceo' : 'pending';
  return insert(ctx, game, p, item, choice, status, 0, phase);
}

export function recommendItem(ctx, game, admissionId, itemId, choice = null) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can recommend');
  const item = ctx.data.item(itemId);
  const phase = validate(ctx, game, p.company, item, choice);
  return insert(ctx, game, p, item, choice, 'pending', 1, phase);
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/labels.js src/shop.js test/shop-request.test.js
git commit -m "feat: shop requests, CEO recommendations, tiers and rejection rules"
```

---

### Task 6: Shop decisions (CEO, CFO, auto-reject, summary)

**Files:**
- Modify: `src/shop.js` (append), `src/director.js` (register hooks)
- Create: `test/shop-decide.test.js`

**Interfaces:**
- Produces (`src/shop.js`):
  - `queueHead(db, gameId, company) -> row | undefined` (oldest `pending`)
  - `ceoDecide(ctx, game, admissionId, requestId, approve) -> void` (moves `awaiting_ceo` to `pending`, or rejects it with reason `ceo`)
  - `cfoDecide(ctx, game, admissionId, requestId, approve) -> void` (CFO only; only the queue head; approve charges the wallet, never below -200, and records ownership)
  - `autoRejectAll(ctx, game) -> void` (every `awaiting_ceo` and `pending` request becomes `rejected` with reason `auto`)
  - `summaryCard(ctx, game, company) -> { idea, owned: [{ itemId, label, charged }], wallet }`
- Errors: `'only the CEO can decide'`, `'only the CFO can decide'`, `'that request is not waiting for the CEO'`, `'decide the oldest request first'`, `'this would take the wallet below -200'`, `'the shop is closed'`, `'no such request'`.

- [ ] **Step 1: Write the failing tests**

`test/shop-decide.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { requestItem, recommendItem, ceoDecide, cfoDecide, autoRejectAll, queueHead, summaryCard } from '../src/shop.js';
import { companyState } from '../src/state.js';
import { runDirector, HOOKS } from '../src/director.js';

function toShop(h) {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  return h;
}
const wallet = (h, c = 'A') => companyState(h.db, h.gameId, c).wallet;
const status = (h, id) => h.db.prepare('SELECT status FROM requests WHERE id=?').get(id).status;

test('the CEO approves a CTO feature, which then joins the CFO queue', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.equal(queueHead(h.db, h.gameId, 'A'), undefined);
  ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true);
  assert.equal(queueHead(h.db, h.gameId, 'A').id, id);
});

test('the CEO can reject a feature, and only the CEO can decide', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /only the CEO can decide/);
  ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, false);
  assert.equal(status(h, id), 'rejected');
  assert.throws(() => ceoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true), /not waiting for the CEO/);
});

test('the CFO approves: the wallet is charged and the item is owned', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(status(h, id), 'approved');
  assert.equal(wallet(h), 900);
  assert.equal(h.db.prepare("SELECT item_id FROM owned WHERE company='A' AND family='M01'").get().item_id, 'M01-M');
});

test('only the CFO can decide, and a rejection costs nothing', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-M');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CEO, id, true), /only the CFO can decide/);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, false);
  assert.equal(status(h, id), 'rejected');
  assert.equal(wallet(h), 1000);
});

test('the CFO must decide the oldest request first', () => {
  const h = toShop(makeRunning());
  const first = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const second = requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, second, true), /decide the oldest request first/);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, first, true);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, second, true);
});

test('a purchase that would take the wallet below -200 cannot be approved', () => {
  const h = toShop(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -150 WHERE company='A'").run();
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L'); // 150 coins
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /below -200/);
  assert.equal(wallet(h), -150);
  assert.equal(status(h, id), 'pending');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, false); // the CFO can still reject it
});

test('exactly -200 is allowed', () => {
  const h = toShop(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -50 WHERE company='A'").run();
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(wallet(h), -200);
});

test('an upgrade charges only the difference', () => {
  const h = toShop(makeRunning());
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'), true); // 50
  const up = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-L'); // 150, difference 100
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, up, true);
  assert.equal(wallet(h), 850);
  assert.equal(h.db.prepare("SELECT item_id FROM owned WHERE company='A' AND family='M01'").get().item_id, 'M01-L');
});

test('a recommendation is decided by the CFO like any request', () => {
  const h = toShop(makeRunning());
  const id = recommendItem(h.ctx, h.game(), h.seat.A.CEO, 'M04-S');
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(wallet(h), 920);
});

test('decisions are refused when the shop is closed', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  atSec(h, 790);
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /shop is closed/);
});

test('another company cannot touch this company request', () => {
  const h = toShop(makeRunning());
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.B.CFO, id, true), /no such request/);
});

test('the director auto-rejects open requests when the shop phase ends, once', () => {
  Object.assign(HOOKS, { shop: autoRejectAll });
  const h = toShop(makeRunning());
  const a = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const b = requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B'); // still waiting for the CEO
  atSec(h, 781);
  runDirector(h.ctx);
  runDirector(h.ctx);
  for (const id of [a, b]) {
    const r = h.db.prepare('SELECT status, reject_reason FROM requests WHERE id=?').get(id);
    assert.deepEqual(r, { status: 'rejected', reject_reason: 'auto' });
  }
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='shop_auto_reject'").get().n, 2);
});

test('the summary card lists the idea, what was bought and the coins left', () => {
  const h = toShop(makeRunning());
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M02', 1), true);
  const card = summaryCard(h.ctx, h.game(), 'A');
  assert.equal(card.idea.id, 'H1');
  assert.equal(card.wallet, 960);
  assert.deepEqual(card.owned.map((o) => [o.itemId, o.charged]), [['M02', 40]]);
  assert.match(card.owned[0].label, /^Brand name: /);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `queueHead` (and others) are not exported

- [ ] **Step 3: Write the minimal implementation**

Append to `src/shop.js`:

```js
import { itemLabel } from './labels.js';
import { companyState } from './state.js';

function requireOpen(ctx, game) {
  if (!isShopOpen(phaseAt(game, ctx.now()).phase)) throw new Error('the shop is closed');
}

export const queueHead = (db, gameId, company) =>
  db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='pending' ORDER BY id LIMIT 1").get(gameId, company);

function ownRequest(ctx, game, company, requestId) {
  const r = ctx.db.prepare('SELECT * FROM requests WHERE id=? AND game_id=? AND company=?').get(requestId, game.id, company);
  if (!r) throw new Error('no such request');
  return r;
}

export function ceoDecide(ctx, game, admissionId, requestId, approve) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can decide');
  requireOpen(ctx, game);
  const r = ownRequest(ctx, game, p.company, requestId);
  if (r.status !== 'awaiting_ceo') throw new Error('that request is not waiting for the CEO');
  if (approve) {
    ctx.db.prepare("UPDATE requests SET status='pending' WHERE id=?").run(r.id);
  } else {
    ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=?, reject_reason='ceo' WHERE id=?")
      .run(ctx.now(), admissionId, r.id);
  }
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'ceo_decision', payload: { requestId: r.id, approve } });
}

export function cfoDecide(ctx, game, admissionId, requestId, approve) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CFO') throw new Error('only the CFO can decide');
  requireOpen(ctx, game);
  const r = ownRequest(ctx, game, p.company, requestId);
  const head = queueHead(ctx.db, game.id, p.company);
  if (!head || head.id !== r.id) throw new Error('decide the oldest request first');
  const wallet = companyState(ctx.db, game.id, p.company).wallet;
  const item = ctx.data.item(r.item_id);
  const charge = chargeFor(ctx, game, p.company, item);
  if (approve && wallet - charge < WALLET_FLOOR) throw new Error('this would take the wallet below -200');
  ctx.db.transaction(() => {
    if (approve) {
      ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(charge, game.id, p.company);
      ctx.db.prepare(
        `INSERT INTO owned (game_id, company, family, item_id, choice, bought_at, charged) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, company, family) DO UPDATE SET item_id=excluded.item_id, choice=excluded.choice, bought_at=excluded.bought_at, charged=owned.charged + excluded.charged`
      ).run(game.id, p.company, item.family, item.id, r.choice, ctx.now(), charge);
      ctx.db.prepare("UPDATE requests SET status='approved', charged=?, decided_at=?, decided_by=? WHERE id=?")
        .run(charge, ctx.now(), admissionId, r.id);
    } else {
      ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=?, reject_reason='cfo' WHERE id=?")
        .run(ctx.now(), admissionId, r.id);
    }
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'cfo_decision',
      payload: { requestId: r.id, itemId: item.id, approve, charged: approve ? charge : 0, walletBefore: wallet, walletAfter: approve ? wallet - charge : wallet } });
  })();
}

export function autoRejectAll(ctx, game) {
  const open = ctx.db.prepare("SELECT id, company, item_id FROM requests WHERE game_id=? AND status IN ('awaiting_ceo','pending')").all(game.id);
  for (const r of open) {
    ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, reject_reason='auto' WHERE id=?").run(ctx.now(), r.id);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'shop_auto_reject', payload: { requestId: r.id, company: r.company, itemId: r.item_id } });
  }
}

export function summaryCard(ctx, game, company) {
  const idea = ideaOf(ctx, game, company);
  const owned = ctx.db.prepare('SELECT * FROM owned WHERE game_id=? AND company=? ORDER BY bought_at, family').all(game.id, company)
    .map((o) => ({ itemId: o.item_id, label: itemLabel(ctx.data.item(o.item_id), idea, o.choice), charged: o.charged }));
  return { idea, owned, wallet: companyState(ctx.db, game.id, company).wallet };
}
```

Move the two new imports to the top of `src/shop.js` with the other imports. Append to `src/director.js`:

```js
import { autoRejectAll } from './shop.js';
HOOKS.shop = autoRejectAll;
HOOKS.competition = autoRejectAll;
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shop.js src/director.js test/shop-decide.test.js
git commit -m "feat: CEO and CFO decisions, wallet floor, auto-reject, summary card"
```

---

### Task 7: Views (what each player and the organizer may see)

**Files:**
- Create: `src/views.js`, `test/views.test.js`

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6
- Produces:
  - `viewFor(ctx, admissionId) -> view`
    - lobby player: `{ me, screen: 'lobby' }`
    - completed player: `{ me, screen: 'graphs', gameId }`
    - in-game player: `{ me, screen: 'game', clock: { phase, remainingSec }, problem: { id, title, statement }, wallet, idea | null, ideation | null, shop | null, owned: [{ itemId, label, charged }], summary | null }`
    - `ideation = { ideas: [{ id, type, name, description, votes, mine }], picked: ideaId | null, canPick: boolean }` (only own company's votes)
    - `shop = { open, catalog: [{ id, name, label, option, section, role, cost, price, state: 'available'|'owned'|'requested'|'wait', note, canRequest, canRecommend, choices|null }], queue: [{ id, itemId, label, price, by, recommended, head }] (CEO and CFO only), awaitingCeo: [...] (CEO only), mine: [{ id, itemId, label, status }] }`
    - `summary` is `summaryCard(...)` during the `summary` phase, otherwise `null`.
  - `organizerView(ctx) -> { screen: 'organizer', participants, problems, game: null | { id, problemId, clock, companies: { A: panel, B: panel } } }` where `panel = { wallet, idea, pickSource, votes, owned, queue, awaitingCeo }`.
- Hidden products: no field of a player's view mentions the rival company.

- [ ] **Step 1: Write the failing tests**

`test/views.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec, data } from './helpers.js';
import { castVote, pickIdea } from '../src/ideation.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { viewFor, organizerView } from '../src/views.js';
import { endGame } from '../src/lobby.js';
import { openDb } from '../src/db.js';

test('a lobby player gets the lobby screen, a completed player the graphs screen', () => {
  const h = makeRunning();
  assert.equal(viewFor(h.ctx, 'S10').screen, 'lobby');
  endGame(h.db, h.gameId, 5);
  const v = viewFor(h.ctx, 'S0');
  assert.deepEqual([v.screen, v.gameId], ['graphs', h.gameId]);
});

test('an in-game player sees the problem, their role and the clock during the briefing', () => {
  const h = makeRunning(); atSec(h, 10);
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(v.screen, 'game');
  assert.equal(v.me.role, 'CFO');
  assert.deepEqual(v.clock, { phase: 'briefing', remainingSec: 170 });
  assert.equal(v.problem.title, 'Food waste');
  assert.equal(v.wallet, 1000);
});

test('ideation shows the six ideas, live votes of my own company and whether I can pick', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'S3');
  const ceo = viewFor(h.ctx, h.seat.A.CEO);
  assert.equal(ceo.ideation.ideas.length, 6);
  assert.equal(ceo.ideation.canPick, true);
  assert.equal(ceo.ideation.ideas.find((i) => i.id === 'H1').votes, 1);
  assert.equal(ceo.ideation.ideas.find((i) => i.id === 'S3').votes, 0); // the rival's vote is hidden
  const cto = viewFor(h.ctx, h.seat.A.CTO);
  assert.equal(cto.ideation.canPick, false);
  assert.equal(cto.ideation.ideas.find((i) => i.id === 'H1').mine, true);
});

test('the shop view marks owned, requested and waiting items and who can act', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const cmo = viewFor(h.ctx, h.seat.A.CMO).shop;
  assert.equal(cmo.open, true);
  assert.equal(cmo.catalog.find((i) => i.id === 'M01-N').state, 'requested');
  assert.equal(cmo.catalog.find((i) => i.id === 'M01-M').canRequest, false); // same family is already requested
  assert.equal(cmo.catalog.find((i) => i.id === 'M04-S').canRequest, true);
  assert.equal(cmo.catalog.find((i) => i.id === 'F01-B').canRequest, false); // not my section
  assert.equal(cmo.catalog.find((i) => i.id === 'SC01'), undefined); // software part, hardware idea
  const cfo = viewFor(h.ctx, h.seat.A.CFO).shop;
  assert.equal(cfo.queue.length, 1);
  assert.equal(cfo.queue[0].head, true);
  assert.equal(cfo.catalog.every((i) => i.canRequest === false), true);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(viewFor(h.ctx, h.seat.A.CMO).shop.catalog.find((i) => i.id === 'M01-N').state, 'owned');
});

test('the CEO sees features waiting for approval and can recommend anything', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  const ceo = viewFor(h.ctx, h.seat.A.CEO).shop;
  assert.equal(ceo.awaitingCeo.length, 1);
  assert.equal(ceo.catalog.find((i) => i.id === 'M01-N').canRecommend, true);
  assert.equal(viewFor(h.ctx, h.seat.A.CTO).shop.awaitingCeo, undefined);
});

test('the brand item offers the three names of the chosen idea', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const brand = viewFor(h.ctx, h.seat.A.CMO).shop.catalog.find((i) => i.id === 'M02');
  assert.deepEqual(brand.choices, h.ctx.data.ideasFor(1).find((i) => i.id === 'H1').brands);
});

test('a player never sees the rival company: no rival idea, wallet or items', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  h.db.prepare("UPDATE company_state SET wallet = 123 WHERE company = 'B'").run();
  const json = JSON.stringify(viewFor(h.ctx, h.seat.A.CFO));
  assert.equal(json.includes('123'), false);
  assert.equal(json.includes('"S1"'), false);
});

test('the summary card appears only during the summary phase', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).summary, null);
  atSec(h, 790);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).summary.wallet, 1000);
});

test('the organizer sees both companies and the whole roster', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  const o = organizerView(h.ctx);
  assert.equal(o.participants.length, 12);
  assert.equal(o.problems.length, 8);
  assert.equal(o.game.companies.A.idea.id, 'H1');
  assert.equal(o.game.companies.B.idea, null);
  assert.deepEqual(Object.keys(o.game.companies), ['A', 'B']);
});

test('with no game running the organizer view has no game', () => {
  const ctx = { db: openDb(), data, now: () => 0 };
  assert.equal(organizerView(ctx).game, null);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/views.js`

- [ ] **Step 3: Write the minimal implementation**

`src/views.js`:

```js
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { companyState, ideaOf, ownedRows } from './state.js';
import { tally } from './ideation.js';
import { applicable, chargeFor, isShopOpen, queueHead, rejectionBlock, summaryCard } from './shop.js';
import { itemLabel } from './labels.js';

const ADDERS = ['CTO', 'CMO', 'COO'];

const meOf = (p) => ({ admissionId: p.admission_id, name: p.name, status: p.status, company: p.company, role: p.role, gameId: p.game_id });

function ownedList(ctx, game, company, idea) {
  return ownedRows(ctx.db, game.id, company).map((o) => ({
    itemId: o.item_id, label: itemLabel(ctx.data.item(o.item_id), idea, o.choice), charged: o.charged,
  }));
}

function requestView(ctx, idea, r, headId) {
  const item = ctx.data.item(r.item_id);
  const by = ctx.db.prepare('SELECT name FROM participants WHERE admission_id=?').get(r.requested_by);
  return {
    id: r.id, itemId: r.item_id, label: itemLabel(item, idea, r.choice), price: r.price,
    by: by ? by.name : r.requested_by, recommended: !!r.recommended, head: r.id === headId,
  };
}

function queues(ctx, game, company, idea) {
  const head = queueHead(ctx.db, game.id, company);
  const pending = ctx.db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='pending' ORDER BY id").all(game.id, company);
  const waiting = ctx.db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='awaiting_ceo' ORDER BY id").all(game.id, company);
  return {
    queue: pending.map((r) => requestView(ctx, idea, r, head && head.id)),
    awaitingCeo: waiting.map((r) => requestView(ctx, idea, r, null)),
  };
}

function itemState(ctx, game, company, item, phase) {
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  if (owned) {
    const have = ctx.data.item(owned.item_id);
    if (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0)) return { state: 'owned', note: '' };
  }
  const open = ctx.db.prepare("SELECT 1 FROM requests WHERE game_id=? AND company=? AND family=? AND status IN ('awaiting_ceo','pending')").get(game.id, company, item.family);
  if (open) return { state: 'requested', note: '' };
  const block = rejectionBlock(ctx, game, company, item.family, phase);
  if (block) return { state: 'wait', note: block };
  return { state: 'available', note: '' };
}

function shopView(ctx, game, p, idea, phase) {
  const open = isShopOpen(phase) && !!idea;
  const catalog = idea
    ? ctx.data.catalog.filter((i) => applicable(i, idea)).map((item) => {
        const st = itemState(ctx, game, p.company, item, phase);
        const mineRole = ADDERS.includes(p.role) && item.role === p.role;
        return {
          id: item.id, name: item.name, label: itemLabel(item, idea), option: item.option, section: item.section, role: item.role,
          cost: item.cost, price: chargeFor(ctx, game, p.company, item), state: st.state, note: st.note,
          canRequest: open && mineRole && st.state === 'available',
          canRecommend: open && p.role === 'CEO' && st.state === 'available',
          choices: item.id === 'M02' ? idea.brands : item.id === 'M03' ? idea.taglines : null,
        };
      })
    : [];
  const mine = ctx.db.prepare('SELECT * FROM requests WHERE game_id=? AND company=? AND requested_by=? ORDER BY id DESC LIMIT 8')
    .all(game.id, p.company, p.admission_id)
    .map((r) => ({ id: r.id, itemId: r.item_id, label: itemLabel(ctx.data.item(r.item_id), idea, r.choice), status: r.status }));
  const shop = { open, catalog, mine };
  if (p.role === 'CEO' || p.role === 'CFO') shop.queue = queues(ctx, game, p.company, idea).queue;
  if (p.role === 'CEO') shop.awaitingCeo = queues(ctx, game, p.company, idea).awaitingCeo;
  return shop;
}

export function viewFor(ctx, admissionId) {
  const p = ctx.db.prepare('SELECT * FROM participants WHERE admission_id = ?').get(admissionId);
  if (!p) return { screen: 'unknown' };
  const me = meOf(p);
  if (p.status === 'lobby') return { me, screen: 'lobby' };
  if (p.status === 'completed') return { me, screen: 'graphs', gameId: p.game_id };
  const game = activeGame(ctx.db);
  const clock = phaseAt(game, ctx.now());
  const cs = companyState(ctx.db, game.id, p.company);
  const idea = ideaOf(ctx, game, p.company);
  const problem = ctx.data.problems.find((x) => x.id === game.problemId);
  let ideation = null;
  if (clock.phase === 'ideation' || clock.phase === 'briefing') {
    const counts = tally(ctx.db, game.id, p.company);
    const mineVote = ctx.db.prepare('SELECT idea_id FROM votes WHERE game_id=? AND admission_id=?').get(game.id, admissionId);
    ideation = {
      ideas: ctx.data.ideasFor(game.problemId).map((i) => ({
        id: i.id, type: i.type, name: i.name, description: i.description,
        votes: counts[i.id] ?? 0, mine: !!mineVote && mineVote.idea_id === i.id,
      })),
      picked: cs.idea_id,
      canPick: p.role === 'CEO' && !cs.idea_id,
    };
  }
  return {
    me, screen: 'game', clock, problem, wallet: cs.wallet,
    idea: idea && { id: idea.id, type: idea.type, name: idea.name, description: idea.description },
    ideation,
    shop: clock.phase === 'shop' || clock.phase === 'competition' ? shopView(ctx, game, p, idea, clock.phase) : null,
    owned: ownedList(ctx, game, p.company, idea),
    summary: clock.phase === 'summary' ? summaryCard(ctx, game, p.company) : null,
  };
}

export function organizerView(ctx) {
  const participants = ctx.db.prepare('SELECT admission_id, name, status, company, role, game_id FROM participants ORDER BY admission_id').all();
  const problems = ctx.data.problems.map(({ id, title }) => ({ id, title }));
  const game = activeGame(ctx.db);
  if (!game) return { screen: 'organizer', participants, problems, game: null };
  const panel = (company) => {
    const cs = companyState(ctx.db, game.id, company);
    const idea = ideaOf(ctx, game, company);
    return {
      wallet: cs.wallet,
      idea: idea && { id: idea.id, type: idea.type, name: idea.name },
      pickSource: cs.pick_source,
      votes: tally(ctx.db, game.id, company),
      owned: ownedList(ctx, game, company, idea),
      ...queues(ctx, game, company, idea),
    };
  };
  return {
    screen: 'organizer', participants, problems,
    game: { id: game.id, problemId: game.problemId, clock: phaseAt(game, ctx.now()), companies: { A: panel('A'), B: panel('B') } },
  };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views.js test/views.test.js
git commit -m "feat: per-player and organizer views with hidden products"
```

---

### Task 8: Static files and the action channel

**Files:**
- Create: `src/static.js`, `test/static.test.js`, `test/actions.test.js`, `public/index.html` (a one-line placeholder so the folder exists: `<!doctype html><title>Startup Showdown</title>`)
- Modify: `src/server.js`, `src/index.js`

**Interfaces:**
- Produces:
  - `staticHandler(rootDir) -> (req, res) => Promise<void>`: serves files below `rootDir`; `/` serves `index.html`; unknown file 404; any path that resolves outside the root 403; malformed `%` escapes 400.
  - `createApp({ db, organizerPassword, now, data = loadData(), staticRoot = 'public' })` now also: handles `{ type: 'sync' }` (replies `{ type: 'state', view }`), runs the director at every `tickAll()` (and pushes state if a hook ran), and runs actions.
  - Participant messages: `vote {ideaId}`, `pick {ideaId}`, `request {itemId, choice}`, `recommend {itemId, choice}`, `ceo_decide {requestId, approve}`, `cfo_decide {requestId, approve}`.
  - Organizer messages: `roster_import {text}`, `add_participant {admissionId, name}`, `assign {admissionId, company, role}`, `start_game {problemId}`, `swap_seats {a, b}`, `replace_player {out, in}`.
  - After any successful action the server sends `{ type: 'state', view }` to **every** session. A failed action sends `{ type: 'error', error: <message> }` to the sender only. Every organizer action is logged as an `organizer_action` event.

- [ ] **Step 1: Write the failing tests**

`test/static.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staticHandler } from '../src/static.js';

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'static-'));
  mkdirSync(join(dir, 'public'));
  writeFileSync(join(dir, 'public', 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(dir, 'public', 'app.js'), 'x');
  writeFileSync(join(dir, 'secret.txt'), 'top secret');
  const server = http.createServer(staticHandler(join(dir, 'public')));
  await new Promise((r) => server.listen(0, r));
  try { await fn(server.address().port); } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}
const get = (port, path) => new Promise((resolve) => {
  http.get({ port, path }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: b })); });
});

test('the root serves index.html with the right type', async () => {
  await withServer(async (port) => {
    const r = await get(port, '/');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/html/);
    assert.equal(r.body, '<h1>hi</h1>');
  });
});

test('scripts get a javascript type and unknown files are 404', async () => {
  await withServer(async (port) => {
    assert.match((await get(port, '/app.js')).type, /javascript/);
    assert.equal((await get(port, '/nope.css')).status, 404);
  });
});

test('paths that try to leave the folder never return the secret file', async () => {
  await withServer(async (port) => {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '//../secret.txt']) {
      const r = await get(port, p);
      assert.notEqual(r.body, 'top secret', p);
      assert.ok([403, 404].includes(r.status), `${p} gave ${r.status}`);
    }
  });
});

test('a malformed escape is a 400, not a crash', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/%E0%A4%A')).status, 400);
    assert.equal((await get(port, '/')).status, 200);
  });
});
```

`test/actions.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v) };
}
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
// Sends a message and returns the next *state* message (skipping nothing: actions reply with state first).
const send = (ws, msg) => ask(ws, msg);
const done = async (app, ...ws) => { ws.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

async function organizer(url) {
  const o = await connect(url);
  assert.equal((await ask(o, { type: 'organizer', password: 'pw' })).type, 'welcome');
  return o;
}

test('the organizer imports a roster and the view lists the players', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  const m = await send(o, { type: 'roster_import', text: 'A1,Asha\nB2,Ben' });
  assert.equal(m.type, 'state');
  assert.equal(m.view.participants.length, 2);
  await done(app, o);
});

test('a failed organizer action returns an error and changes nothing', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  const m = await send(o, { type: 'start_game', problemId: 1 });
  assert.deepEqual(m, { type: 'error', error: 'both companies need all five roles before the game can start' });
  await done(app, o);
});

test('sync returns the caller view', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'add_participant', admissionId: 'p1', name: 'Pia' });
  const p = await connect(url);
  assert.equal((await ask(p, { type: 'login', admissionId: 'P1' })).view, 'lobby');
  const m = await send(p, { type: 'sync' });
  assert.deepEqual([m.type, m.view.screen, m.view.me.name], ['state', 'lobby', 'Pia']);
  await done(app, o, p);
});

test('a participant action is refused for a non-participant session and an unknown type', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  assert.deepEqual(await ask(ws, { type: 'vote', ideaId: 'H1' }), { type: 'error', error: 'bad_message' });
  await done(app, ws);
});

test('organizer actions are logged', async () => {
  const { db, app, url } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'add_participant', admissionId: 'p1', name: 'Pia' });
  const e = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").get();
  assert.equal(JSON.parse(e.payload).action, 'add_participant');
  await done(app, o);
});

test('a full path: ten players, start, vote, pick, and everyone gets fresh state', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  setT(1000);
  assert.equal((await send(o, { type: 'start_game', problemId: 1 })).type, 'state');
  const cto = await connect(url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  const ceo = await connect(url);
  await ask(ceo, { type: 'login', admissionId: 'S0' });
  setT(1000 + 200_000); // ideation
  const sawVote = next(ceo);
  const reply = await send(cto, { type: 'vote', ideaId: 'H1' });
  assert.equal(reply.type, 'state');
  const pushed = await sawVote;
  assert.equal(pushed.view.ideation.ideas.find((i) => i.id === 'H1').votes, 1);
  assert.equal((await send(ceo, { type: 'pick', ideaId: 'H1' })).type, 'state');
  assert.equal(db.prepare("SELECT idea_id FROM company_state WHERE company='A'").get().idea_id, 'H1');
  await done(app, o, cto, ceo);
});

test('tickAll runs the director and pushes state when a phase hook ran', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  setT(0);
  await send(o, { type: 'start_game', problemId: 1 });
  setT(361_000); // ideation just ended with nobody having picked
  const pushed = next(o);
  app.tickAll();
  const m = await pushed;
  assert.ok(m.type === 'tick' || m.type === 'state');
  assert.ok(db.prepare("SELECT idea_id FROM company_state WHERE company='A'").get().idea_id);
  await done(app, o);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/static.js` and `createApp` ignores the new messages

- [ ] **Step 3: Write the minimal implementation**

`src/static.js`:

```js
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

export function staticHandler(rootDir) {
  const base = resolve(rootDir);
  return async (req, res) => {
    let path;
    try {
      path = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400); return res.end();
    }
    if (path === '/' || path === '') path = '/index.html';
    const file = resolve(join(base, normalize(path)));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  };
}
```

Replace `src/server.js` with:

```js
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { participantLogin, organizerLogin } from './auth.js';
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { loadData } from './data.js';
import { staticHandler } from './static.js';
import { runDirector } from './director.js';
import { logEvent } from './events.js';
import { importRoster, addParticipant } from './roster.js';
import { assign, startGame } from './lobby.js';
import { swapSeats, replacePlayer } from './seats.js';
import { castVote, pickIdea } from './ideation.js';
import { requestItem, recommendItem, ceoDecide, cfoDecide } from './shop.js';
import { viewFor, organizerView } from './views.js';

export function createApp({ db, organizerPassword, now = Date.now, data = loadData(), staticRoot = 'public' }) {
  const ctx = { db, data, now };
  const handler = staticRoot
    ? staticHandler(staticRoot)
    : (req, res) => { res.writeHead(404); res.end(); };
  const server = http.createServer(handler);
  const wss = new WebSocketServer({ server });
  const sessions = new Map(); // ws -> { kind: 'organizer' } | { kind: 'participant', admissionId }

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const viewOf = (s) => (s.kind === 'organizer' ? organizerView(ctx) : viewFor(ctx, s.admissionId));
  const pushAll = () => { for (const [ws, s] of sessions) send(ws, { type: 'state', view: viewOf(s) }); };

  const organizerActions = {
    roster_import: (m) => importRoster(db, String(m.text ?? '')),
    add_participant: (m) => addParticipant(db, m.admissionId, m.name),
    assign: (m) => assign(db, m.admissionId, m.company, m.role),
    start_game: (m) => startGame(db, Number(m.problemId), now()),
    swap_seats: (m) => { const g = activeGame(db); if (!g) throw new Error('no game is running'); swapSeats(db, g, g.id, m.a, m.b, now()); },
    replace_player: (m) => { const g = activeGame(db); if (!g) throw new Error('no game is running'); replacePlayer(db, g, g.id, m.out, m.in, now()); },
  };
  const participantActions = {
    vote: (id, m, g) => castVote(ctx, g, id, m.ideaId),
    pick: (id, m, g) => pickIdea(ctx, g, id, m.ideaId),
    request: (id, m, g) => requestItem(ctx, g, id, m.itemId, m.choice ?? null),
    recommend: (id, m, g) => recommendItem(ctx, g, id, m.itemId, m.choice ?? null),
    ceo_decide: (id, m, g) => ceoDecide(ctx, g, id, Number(m.requestId), !!m.approve),
    cfo_decide: (id, m, g) => cfoDecide(ctx, g, id, Number(m.requestId), !!m.approve),
  };

  wss.on('connection', (ws) => {
    ws.on('close', () => sessions.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', error: 'bad_message' }); }
      if (!msg || typeof msg.type !== 'string') return send(ws, { type: 'error', error: 'bad_message' });

      if (msg.type === 'login') {
        const r = participantLogin(db, msg.admissionId, now());
        if (!r.ok) return send(ws, { type: 'error', error: r.error });
        sessions.set(ws, { kind: 'participant', admissionId: r.participant.admissionId });
        return send(ws, { type: 'welcome', view: r.view, participant: r.participant });
      }
      if (msg.type === 'organizer') {
        if (!organizerLogin(msg.password, organizerPassword)) return send(ws, { type: 'error', error: 'bad_password' });
        sessions.set(ws, { kind: 'organizer' });
        return send(ws, { type: 'welcome', view: 'organizer' });
      }

      const s = sessions.get(ws);
      if (!s) return send(ws, { type: 'error', error: 'bad_message' });
      if (msg.type === 'sync') return send(ws, { type: 'state', view: viewOf(s) });

      try {
        if (s.kind === 'organizer' && organizerActions[msg.type]) {
          organizerActions[msg.type](msg);
          logEvent(db, { ts: now(), type: 'organizer_action', payload: { action: msg.type, args: { ...msg, type: undefined } } });
        } else if (s.kind === 'participant' && participantActions[msg.type]) {
          const game = activeGame(db);
          if (!game) throw new Error('no game is running');
          participantActions[msg.type](s.admissionId, msg, game);
        } else {
          return send(ws, { type: 'error', error: 'bad_message' });
        }
      } catch (e) {
        return send(ws, { type: 'error', error: e.message });
      }
      pushAll();
    });
  });

  function tickAll() {
    const changed = runDirector(ctx);
    const game = activeGame(db);
    if (game) {
      const t = now();
      const tick = { type: 'tick', serverNow: t, ...phaseAt(game, t), gameId: game.id };
      for (const [ws, s] of sessions) {
        if (s.kind === 'organizer') { send(ws, tick); continue; }
        const p = db.prepare('SELECT status, game_id FROM participants WHERE admission_id = ?').get(s.admissionId);
        if (p && p.status === 'in_game' && p.game_id === game.id) send(ws, tick);
      }
    }
    if (changed) pushAll();
  }

  return { server, wss, tickAll, ctx };
}
```

In `src/index.js`, the call `createApp({ db, organizerPassword, now })` already works (defaults load `data/` and `public/` relative to the working directory).

> **Plan 1 compatibility:** Plan 1's `server.test.js` boots with `createApp({ db, organizerPassword, now })`; it keeps passing because `data` and `staticRoot` have defaults and a missing `public/` folder only produces 404s.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (the whole suite, including Plan 1)

- [ ] **Step 5: Commit**

```bash
git add src/static.js src/server.js public/index.html test/static.test.js test/actions.test.js
git commit -m "feat: static files, action messages and live state push"
```

---

### Task 9: Player screens (pure render functions)

**Files:**
- Create: `public/render.js`, `test/render.test.js`

**Interfaces:**
- Consumes: the `view` objects of Task 7 (JSON over the WebSocket)
- Produces (`public/render.js`, ES module usable by both the browser and Node):
  - `esc(s)`, `fmtClock(sec) -> 'm:ss'`
  - `renderLogin(error) -> html`
  - `renderScreen(view) -> html` which dispatches on `view.screen` and `view.clock.phase`: lobby, briefing, ideation, shop (also used during the competition until Plan 3 replaces it), summary, ended ("Thank you for playing"), graphs (placeholder text until Plan 5).
  - Every button carries `data-send='<JSON>'`, where the JSON is the exact message to send. The element with `id="clock"` shows the time left.
- No script or style is injected; every dynamic value goes through `esc`.

- [ ] **Step 1: Write the failing tests**

`test/render.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtClock, renderLogin, renderScreen } from '../public/render.js';

const base = (over = {}) => ({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role: 'CTO', status: 'in_game' },
  screen: 'game',
  clock: { phase: 'briefing', remainingSec: 125 },
  problem: { id: 1, title: 'Food waste', statement: 'Too much food is wasted.' },
  wallet: 1000, idea: null, ideation: null, shop: null, owned: [], summary: null, ...over,
});

test('esc escapes the five dangerous characters', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
});

test('fmtClock pads seconds', () => {
  assert.equal(fmtClock(125), '2:05');
  assert.equal(fmtClock(0), '0:00');
});

test('the login screen has the admission id field and shows an error', () => {
  assert.match(renderLogin(), /name="id"/);
  assert.match(renderLogin('That ID is not on the list.'), /not on the list/);
});

test('the briefing shows the role, the problem and a countdown only', () => {
  const html = renderScreen(base());
  assert.match(html, /CTO/);
  assert.match(html, /Food waste/);
  assert.match(html, /id="clock">2:05</);
  assert.equal(html.includes('data-send'), false);
});

test('the lobby screen asks the player to wait', () => {
  assert.match(renderScreen({ screen: 'lobby', me: { name: 'Asha' } }), /Waiting for the organizer/);
});

test('ideation: vote buttons for everyone, a pick button only for the CEO', () => {
  const ideation = (canPick) => ({
    ideas: [{ id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A sensor.', votes: 2, mine: true }],
    picked: null, canPick,
  });
  const cto = renderScreen(base({ clock: { phase: 'ideation', remainingSec: 100 }, ideation: ideation(false) }));
  assert.match(cto, /Smart Fridge Sensor/);
  assert.match(cto, /"type":"vote"/);
  assert.equal(cto.includes('"type":"pick"'), false);
  const ceo = renderScreen(base({ me: { ...base().me, role: 'CEO' }, clock: { phase: 'ideation', remainingSec: 100 }, ideation: ideation(true) }));
  assert.match(ceo, /"type":"pick"/);
});

test('a hostile idea name is escaped', () => {
  const html = renderScreen(base({
    clock: { phase: 'ideation', remainingSec: 100 },
    ideation: { ideas: [{ id: 'H1', type: 'hardware', name: '<script>alert(1)</script>', description: 'x', votes: 0, mine: false }], picked: null, canPick: false },
  }));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /&lt;script&gt;/);
});

const shopView = (role, over = {}) => base({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role },
  clock: { phase: 'shop', remainingSec: 300 }, idea: { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: '' },
  shop: {
    open: true, mine: [],
    catalog: [
      { id: 'M01-N', name: 'Target User', label: 'Target User (Small niche)', option: 'Small niche', section: 'Target User', role: 'CMO', cost: 50, price: 50, state: 'available', note: '', canRequest: role === 'CMO', canRecommend: role === 'CEO', choices: null },
      { id: 'M02', name: 'Brand Name Pack', label: 'Brand name', option: 'Pick 1 of 3', section: 'Brand', role: 'CMO', cost: 40, price: 40, state: 'available', note: '', canRequest: role === 'CMO', canRecommend: false, choices: ['FreshSense', 'ChillWatch', 'KeepFresh'] },
      { id: 'M04-S', name: 'Ad Campaign', label: 'Ad Campaign (Social posts)', option: 'Social posts', section: 'Ad Campaign', role: 'CMO', cost: 80, price: 80, state: 'owned', note: '', canRequest: false, canRecommend: false, choices: null },
    ],
    ...(role === 'CFO' ? { queue: [{ id: 7, itemId: 'M01-N', label: 'Target User (Small niche)', price: 50, by: 'Mira', recommended: false, head: true }] } : {}),
    ...(role === 'CEO' ? { queue: [], awaitingCeo: [{ id: 3, itemId: 'F01-B', label: 'Core Function (Basic)', price: 100, by: 'Asha', recommended: false, head: false }] } : {}),
    ...over,
  },
});

test('the shop shows the wallet, the items and a request button only for my own section', () => {
  const cmo = renderScreen(shopView('CMO'));
  assert.match(cmo, /1000/);
  assert.match(cmo, /"type":"request"/);
  assert.match(cmo, /"choice":2/); // brand choices are separate buttons
  assert.match(cmo, /FreshSense/);
  const cto = renderScreen(shopView('CTO'));
  assert.equal(cto.includes('"type":"request"'), false);
});

test('the CFO sees the queue with approve and reject for the head only', () => {
  const html = renderScreen(shopView('CFO'));
  assert.match(html, /"type":"cfo_decide"/);
  assert.match(html, /"approve":true/);
  assert.match(html, /"approve":false/);
});

test('the CEO sees the features waiting for approval and recommend buttons', () => {
  const html = renderScreen(shopView('CEO'));
  assert.match(html, /"type":"ceo_decide"/);
  assert.match(html, /"type":"recommend"/);
});

test('the summary card shows the idea, items and coins left', () => {
  const html = renderScreen(base({
    clock: { phase: 'summary', remainingSec: 12 },
    summary: { idea: { id: 'H1', name: 'Smart Fridge Sensor' }, owned: [{ itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }], wallet: 960 },
  }));
  assert.match(html, /Smart Fridge Sensor/);
  assert.match(html, /Brand name: FreshSense/);
  assert.match(html, /960/);
});

test('after the game ends players see only a thank you', () => {
  const html = renderScreen(base({ clock: { phase: 'ended', remainingSec: 0 } }));
  assert.match(html, /Thank you for playing/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../public/render.js`

- [ ] **Step 3: Write the minimal implementation**

`public/render.js`:

```js
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// A button that sends one message. The JSON sits in a single-quoted attribute, so single quotes become &#39;.
const send = (label, msg, cls = '') =>
  `<button class="${cls}" data-send='${JSON.stringify(msg).replace(/'/g, '&#39;')}'>${esc(label)}</button>`;

export function renderLogin(error) {
  return `<form id="login" class="card">
  <h1>Startup Showdown</h1>
  <label>Admission ID <input name="id" autocomplete="off" autocapitalize="characters" autofocus></label>
  <button type="submit">Enter</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form>`;
}

function header(v) {
  const { me, clock, wallet } = v;
  return `<header class="bar">
  <span class="who">Company ${esc(me.company)}: ${esc(me.role)}</span>
  <span class="phase">${esc(clock.phase)}</span>
  <span class="wallet">${esc(wallet)} coins</span>
  <span id="clock">${fmtClock(clock.remainingSec)}</span>
</header>`;
}

function ownedPanel(v) {
  if (!v.owned.length) return '<p class="muted">Nothing bought yet.</p>';
  return `<ul class="owned">${v.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>`;
}

function briefing(v) {
  return `${header(v)}<main><section class="card">
  <h2>You are the ${esc(v.me.role)}</h2>
  <h3>${esc(v.problem.title)}</h3><p>${esc(v.problem.statement)}</p>
  <p class="muted">The game starts when the countdown ends.</p></section></main>`;
}

function ideation(v) {
  const { ideas, picked, canPick } = v.ideation;
  const cards = ideas.map((i) => `<li class="idea${i.mine ? ' mine' : ''}">
    <h3>${esc(i.name)} <small>${esc(i.type)}</small></h3><p>${esc(i.description)}</p>
    <p class="votes">${esc(i.votes)} votes</p>
    ${picked ? '' : send(i.mine ? 'Your vote' : 'Vote', { type: 'vote', ideaId: i.id })}
    ${canPick ? send('Pick this idea', { type: 'pick', ideaId: i.id }, 'primary') : ''}
  </li>`).join('');
  return `${header(v)}<main><h2>${esc(v.problem.title)}</h2>
  ${picked ? `<p class="notice">Your company picked ${esc(ideas.find((i) => i.id === picked)?.name ?? picked)}. Waiting for the other company.</p>` : ''}
  <ul class="ideas">${cards}</ul></main>`;
}

function catalogItem(it) {
  const buy = [];
  if (it.canRequest) {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(c, { type: 'request', itemId: it.id, choice: n + 1 })));
    } else buy.push(send(`Request for ${it.price}`, { type: 'request', itemId: it.id }));
  }
  if (it.canRecommend) {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(`Recommend ${c}`, { type: 'recommend', itemId: it.id, choice: n + 1 })));
    } else buy.push(send('Recommend', { type: 'recommend', itemId: it.id }));
  }
  return `<li class="item ${esc(it.state)}"><span class="name">${esc(it.label)}</span>
    <span class="cost">${esc(it.price)}</span>
    ${it.state === 'owned' ? '<em>Owned</em>' : it.state === 'requested' ? '<em>Requested</em>' : it.state === 'wait' ? `<em>${esc(it.note)}</em>` : ''}
    ${buy.join('')}</li>`;
}

function queueList(v) {
  const q = v.shop.queue;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req${r.head ? ' head' : ''}"><span>${esc(r.label)} for ${esc(r.price)}</span>
    <small>from ${esc(r.by)}${r.recommended ? ' (CEO recommends)' : ''}</small>
    ${r.head && v.me.role === 'CFO' ? send('Approve', { type: 'cfo_decide', requestId: r.id, approve: true }, 'primary') + send('Reject', { type: 'cfo_decide', requestId: r.id, approve: false }) : ''}</li>`).join('');
  return `<section class="card"><h3>CFO queue</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">No requests waiting.</p>'}</section>`;
}

function awaitingList(v) {
  const q = v.shop.awaitingCeo;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req"><span>${esc(r.label)} for ${esc(r.price)}</span><small>suggested by ${esc(r.by)}</small>
    ${send('Approve feature', { type: 'ceo_decide', requestId: r.id, approve: true }, 'primary')}${send('Reject', { type: 'ceo_decide', requestId: r.id, approve: false })}</li>`).join('');
  return `<section class="card"><h3>Features waiting for you</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">None.</p>'}</section>`;
}

function shop(v) {
  const sections = [...new Set(v.shop.catalog.map((i) => i.section))];
  const lists = sections.map((s) => `<section class="card"><h3>${esc(s)}</h3><ul>${v.shop.catalog.filter((i) => i.section === s).map(catalogItem).join('')}</ul></section>`).join('');
  const mine = v.shop.mine.length ? `<section class="card"><h3>My requests</h3><ul>${v.shop.mine.map((r) => `<li>${esc(r.label)}: ${esc(r.status)}</li>`).join('')}</ul></section>` : '';
  return `${header(v)}<main>
  ${v.idea ? `<p class="product">Product: ${esc(v.idea.name)}</p>` : ''}
  ${awaitingList(v)}${queueList(v)}${mine}${lists}
  <section class="card"><h3>Our product</h3>${ownedPanel(v)}</section></main>`;
}

function summary(v) {
  const s = v.summary;
  return `${header(v)}<main><section class="card"><h2>${esc(s.idea?.name ?? 'No idea picked')}</h2>
  ${s.owned.length ? `<ul class="owned">${s.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing was bought.</p>'}
  <p class="big">${esc(s.wallet)} coins left</p></section></main>`;
}

export function renderScreen(v) {
  if (v.screen === 'lobby') return `<main><section class="card"><h2>Hello ${esc(v.me.name)}</h2><p>Waiting for the organizer to start the game.</p></section></main>`;
  if (v.screen === 'graphs') return '<main><section class="card"><h2>Thank you for playing</h2></section></main>';
  if (v.screen !== 'game') return '<main><section class="card"><p>Something went wrong. Please reload.</p></section></main>';
  switch (v.clock.phase) {
    case 'briefing': return briefing(v);
    case 'ideation': return ideation(v);
    case 'shop':
    case 'competition': return shop(v);
    case 'summary': return summary(v);
    default: return '<main><section class="card"><h2>Thank you for playing</h2></section></main>';
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/render.js test/render.test.js
git commit -m "feat: pure render functions for the player screens"
```

---

### Task 10: Browser glue, organizer console and styling

**Files:**
- Create: `public/render-organizer.js`, `test/render-organizer.test.js`, `public/app.js`, `public/index.html` (replace), `public/organizer.html`, `public/organizer.js`, `public/styles.css`

**Interfaces:**
- Consumes: `renderLogin`, `renderScreen`, `esc`, `fmtClock` (Task 9), the messages of Task 8
- Produces: `renderOrganizer(view) -> html` (pure, tested): the roster import box, the participant table with company and role selectors, the problem selector and Start button, and, while a game runs, a panel per company (idea, wallet, votes, items, queue) plus the clock. Selectors and buttons carry `data-send` JSON the same way as in Task 9. The `<select>` for company and role carries `data-assign="<admissionId>"`, and the browser glue turns a change into one `assign` message.
- Browser behavior of `app.js`: connects to the page's own host, auto-logs in again after any reconnect (it remembers the Admission ID in `sessionStorage`), sends `sync` after login, re-renders on every `state` message, updates only `#clock` on `tick`, shows login errors, and never keeps the rival's data (it has none).

- [ ] **Step 1: Write the failing tests for the organizer render**

`test/render-organizer.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOrganizer } from '../public/render-organizer.js';

const lobby = () => ({
  screen: 'organizer',
  problems: [{ id: 1, title: 'Food waste' }, { id: 2, title: 'Water shortage' }],
  participants: [
    { admission_id: 'S0', name: 'Asha', status: 'lobby', company: 'A', role: 'CEO', game_id: null },
    { admission_id: 'S1', name: '<b>Ben</b>', status: 'lobby', company: null, role: null, game_id: null },
  ],
  game: null,
});

test('the lobby has a roster box, a participant table and a start button with a problem choice', () => {
  const html = renderOrganizer(lobby());
  assert.match(html, /id="roster"/);
  assert.match(html, /data-assign="S0"/);
  assert.match(html, /Food waste/);
  assert.match(html, /id="start"/);
  assert.match(html, /id="add-id"/);
});

test('names are escaped', () => {
  const html = renderOrganizer(lobby());
  assert.equal(html.includes('<b>Ben</b>'), false);
  assert.match(html, /&lt;b&gt;Ben/);
});

test('the lobby shows how many seats are filled', () => {
  assert.match(renderOrganizer(lobby()), /1 of 10 seats/);
});

test('a running game shows both companies, their wallets, ideas and the clock', () => {
  const v = lobby();
  v.game = {
    id: 1, problemId: 1, clock: { phase: 'shop', remainingSec: 200 },
    companies: {
      A: { wallet: 900, idea: { id: 'H1', name: 'Smart Fridge Sensor' }, pickSource: 'ceo', votes: { H1: 3 }, owned: [{ label: 'Brand name: FreshSense', charged: 40 }], queue: [], awaitingCeo: [] },
      B: { wallet: 1000, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] },
    },
  };
  const html = renderOrganizer(v);
  assert.match(html, /Company A/);
  assert.match(html, /Company B/);
  assert.match(html, /900/);
  assert.match(html, /Smart Fridge Sensor/);
  assert.match(html, /3:20/);
  assert.equal(html.includes('id="start"'), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../public/render-organizer.js`

- [ ] **Step 3: Write the organizer render and the browser glue**

`public/render-organizer.js`:

```js
import { esc, fmtClock } from './render.js';

const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

function seatSelect(p) {
  const co = ['A', 'B'].map((c) => `<option value="${c}"${p.company === c ? ' selected' : ''}>${c}</option>`).join('');
  const ro = ROLES.map((r) => `<option value="${r}"${p.role === r ? ' selected' : ''}>${r}</option>`).join('');
  return `<select data-assign="${esc(p.admission_id)}" data-field="company"><option value="">-</option>${co}</select>
          <select data-assign="${esc(p.admission_id)}" data-field="role"><option value="">-</option>${ro}</select>`;
}

function lobby(v) {
  const seated = v.participants.filter((p) => p.status === 'lobby' && p.company && p.role).length;
  const rows = v.participants.map((p) => `<tr><td>${esc(p.admission_id)}</td><td>${esc(p.name)}</td><td>${esc(p.status)}</td>
    <td>${p.status === 'lobby' ? seatSelect(p) : `${esc(p.company ?? '')} ${esc(p.role ?? '')}`}</td></tr>`).join('');
  const problems = v.problems.map((p) => `<option value="${esc(p.id)}">${esc(p.id)}. ${esc(p.title)}</option>`).join('');
  return `<section class="card"><h2>Roster</h2>
  <textarea id="roster" rows="4" placeholder="admission_id,name (one per line)"></textarea>
  <button id="import">Import roster</button>
  <p><input id="add-id" placeholder="Admission ID"> <input id="add-name" placeholder="Name"> <button id="add">Add participant</button></p></section>
  <section class="card"><h2>Lobby</h2><p>${seated} of 10 seats filled</p>
  <table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Seat</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="card"><h2>Start</h2><label>Problem statement <select id="problem">${problems}</select></label>
  <button id="start" class="primary">Start game</button></section>`;
}

function panel(name, c) {
  const votes = Object.entries(c.votes).map(([id, n]) => `${esc(id)}: ${esc(n)}`).join(', ');
  const items = c.owned.length ? c.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('') : '<li class="muted">Nothing bought</li>';
  const queue = c.queue.length ? c.queue.map((r) => `<li>${esc(r.label)} (${esc(r.by)})</li>`).join('') : '<li class="muted">Queue empty</li>';
  return `<section class="card"><h2>Company ${esc(name)}</h2>
  <p class="big">${esc(c.wallet)} coins</p>
  <p>Idea: ${c.idea ? `${esc(c.idea.name)} (${esc(c.pickSource ?? '')})` : '<span class="muted">not picked</span>'}</p>
  ${votes ? `<p>Votes: ${votes}</p>` : ''}
  <h3>Bought</h3><ul>${items}</ul><h3>CFO queue</h3><ul>${queue}</ul></section>`;
}

export function renderOrganizer(v) {
  if (!v.game) return `<main>${lobby(v)}</main>`;
  const { clock, companies } = v.game;
  return `<header class="bar"><span>Game ${esc(v.game.id)}</span><span class="phase">${esc(clock.phase)}</span><span id="clock">${fmtClock(clock.remainingSec)}</span></header>
  <main class="two">${panel('A', companies.A)}${panel('B', companies.B)}</main>`;
}
```

`public/app.js`:

```js
import { renderLogin, renderScreen, fmtClock } from './render.js';

const root = document.getElementById('app');
let ws;
let id = null;
let lastError = '';
try { id = sessionStorage.getItem('admissionId'); } catch { /* storage may be blocked */ }

function show(html) { root.innerHTML = html; }
function login(value) { ws.send(JSON.stringify({ type: 'login', admissionId: value })); }

function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => { if (id) login(id); else show(renderLogin(lastError)); };
  ws.onclose = () => setTimeout(connect, 1000);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'welcome') {
      try { sessionStorage.setItem('admissionId', m.participant.admissionId); } catch { /* ignore */ }
      id = m.participant.admissionId;
      ws.send(JSON.stringify({ type: 'sync' }));
    } else if (m.type === 'state') {
      show(renderScreen(m.view));
    } else if (m.type === 'tick') {
      const c = document.getElementById('clock');
      if (c) c.textContent = fmtClock(m.remainingSec);
    } else if (m.type === 'error') {
      if (m.error === 'unknown_id') { id = null; lastError = 'That ID is not on the list.'; show(renderLogin(lastError)); }
      else { lastError = m.error; showToast(m.error); }
    }
  };
}

function showToast(text) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'alert'); document.body.appendChild(t); }
  t.textContent = text;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { t.textContent = ''; }, 4000);
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const v = new FormData(e.target).get('id');
  if (v && v.trim()) login(v.trim());
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-send]');
  if (b && ws.readyState === 1) ws.send(b.dataset.send);
});

connect();
```

`public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Startup Showdown</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

`public/organizer.js`:

```js
import { renderOrganizer } from './render-organizer.js';
import { fmtClock } from './render.js';

const root = document.getElementById('app');
let ws;
let password = null;
try { password = sessionStorage.getItem('orgPassword'); } catch { /* ignore */ }

const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

function loginForm(error) {
  root.innerHTML = `<form id="login" class="card"><h1>Organizer</h1>
  <label>Password <input name="pw" type="password" autofocus></label><button>Enter</button>
  ${error ? `<p class="error" role="alert">${error}</p>` : ''}</form>`;
}

function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => (password ? send({ type: 'organizer', password }) : loginForm(''));
  ws.onclose = () => setTimeout(connect, 1000);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'welcome') send({ type: 'sync' });
    else if (m.type === 'state') {
      // Keep what the organizer is typing: only re-render when no text box has focus.
      const active = document.activeElement;
      if (!(active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT'))) root.innerHTML = renderOrganizer(m.view);
    } else if (m.type === 'tick') {
      const c = document.getElementById('clock');
      if (c) c.textContent = fmtClock(m.remainingSec);
    } else if (m.type === 'error') {
      if (m.error === 'bad_password') { password = null; loginForm('Wrong password.'); } else alert(m.error);
    }
  };
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  password = new FormData(e.target).get('pw');
  try { sessionStorage.setItem('orgPassword', password); } catch { /* ignore */ }
  send({ type: 'organizer', password });
});

document.addEventListener('click', (e) => {
  const id = e.target.id;
  if (id === 'import') send({ type: 'roster_import', text: document.getElementById('roster').value });
  if (id === 'add') send({ type: 'add_participant', admissionId: document.getElementById('add-id').value, name: document.getElementById('add-name').value });
  if (id === 'start') send({ type: 'start_game', problemId: Number(document.getElementById('problem').value) });
});

document.addEventListener('change', (e) => {
  const a = e.target.dataset && e.target.dataset.assign;
  if (!a) return;
  const sel = [...document.querySelectorAll(`[data-assign="${a}"]`)];
  const company = sel.find((s) => s.dataset.field === 'company').value;
  const role = sel.find((s) => s.dataset.field === 'role').value;
  if (company && role) send({ type: 'assign', admissionId: a, company, role });
});

connect();
```

`public/organizer.html` is `index.html` with the title `Startup Showdown: Organizer` and `<script type="module" src="/organizer.js">`.

`public/styles.css`: write a **working base** now (layout, readable sizes, 44 px tap targets, no horizontal scroll at 360 px width, visible focus), then run the **frontend-design skill** on it in the step below. A minimal base:

```css
:root { --bg: #f6f5f1; --ink: #1d1d1b; --muted: #6b6a63; --line: #d9d6cc; --card: #ffffff; --accent: #1f5f4a; --accent-ink: #ffffff; --warn: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --bg: #16160f; --ink: #f1efe6; --muted: #a09d90; --line: #3a382c; --card: #211f17; --accent: #5fb596; --accent-ink: #0d1a14; --warn: #ff8a80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { padding: 12px 16px 48px; max-width: 720px; margin: 0 auto; }
main.two { max-width: 1100px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 10px 16px; position: sticky; top: 0; background: var(--card); border-bottom: 1px solid var(--line); }
#clock { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.4rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
button { min-height: 44px; padding: 0 16px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; cursor: pointer; margin: 4px 4px 4px 0; }
button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
input, select, textarea { min-height: 44px; font: inherit; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); max-width: 100%; }
textarea { width: 100%; }
ul { list-style: none; padding: 0; margin: 0; }
li.item, li.req, li.idea { padding: 8px 0; border-bottom: 1px solid var(--line); }
li.item.owned { opacity: .6; }
.muted { color: var(--muted); } .error { color: var(--warn); } .big { font-size: 1.6rem; font-weight: 700; }
table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid var(--line); }
#toast { position: fixed; left: 16px; right: 16px; bottom: 16px; background: var(--ink); color: var(--bg); padding: 10px 14px; border-radius: 6px; }
#toast:empty { display: none; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check it by hand in a real browser**

Run the server with `ORGANIZER_PASSWORD=pw PORT=8080 npm start`. In one browser tab open `http://localhost:8080/organizer.html`, enter the password, import `S0,Asha` through `S9,Jo` (10 lines), pick companies and roles for all ten, and press Start. In 10 other tabs (or phones on the same network) open `http://<your-ip>:8080/`, log in as `S0` to `S9`, and walk through Briefing, vote, CEO pick, request, CEO approve, CFO approve, summary card. Check: the clock is the same on every tab within a second, a phone screen at 360 px width has no sideways scroll, and reloading a tab brings the player back to the same screen and role.

- [ ] **Step 6: Style the screens with the frontend-design skill**

Invoke the frontend-design skill on `public/styles.css` **only**. The brief for the skill: a head-to-head business game for students, played at a desk or on a phone, with a 30 minute clock and a shared wallet. The look should feel like a stock-market or boardroom tool, not a children's game and not a generic dashboard. The clock and wallet must be the most visible numbers. Keep: 44 px tap targets, 360 px mobile width, visible focus, dark mode, reduced motion. Do not change any HTML in `render.js`; if a class name is missing, add it to `render.js` and keep the tests passing.

- [ ] **Step 7: Commit**

```bash
git add public test/render-organizer.test.js
git commit -m "feat: browser app, organizer console and base styling"
```

---

## Self-review against the spec

**Spec coverage (this plan's slice):**
- Two login pages: Task 10 (`index.html`, `organizer.html`). Roster upload and Add participant from the console: Task 8, 10.
- Briefing screen (role, problem, countdown only): Task 9.
- Ideation: 6 ideas, live votes, CEO final, auto-pick with random tie-break, early end adds time to the Shop: Task 4. Live votes visible to the company: Task 7.
- Shop: own sections, CEO approves CTO features, CEO recommends, CFO one at a time, wallet -200 floor, upgrades pay the difference, rejection rules, auto-reject, brand/tagline pick, risk fixes from the idea: Tasks 5, 6.
- Shared wallet visible to everyone: Task 7 (`wallet` in every view), Task 9 (header).
- Summary card 20 s: Tasks 6, 7, 9.
- Hidden products; the organizer sees both companies: Task 7.
- Everything recorded: `vote`, `idea_pick`, `idea_auto_pick`, `ideation_end_early`, `shop_request`, `shop_recommend`, `ceo_decision`, `cfo_decision`, `shop_auto_reject`, `organizer_action` events.
- Not in this plan on purpose: the Competition screens, trickle, attacks (Plan 3), puzzles (Plan 4), end graphs and exports (Plan 5), deployment (Plan 6). During the Competition phase the player sees the shop screen until Plan 3 replaces it.

**Placeholder scan:** none. The notes in Tasks 7 and 9 tell the implementer how to simplify two awkward helpers, with the exact replacement code.

**Type consistency:** `ctx = { db, data, now }`, `game = { id, problemId, startedAt, ideationSavedSec }`, request statuses `awaiting_ceo | pending | approved | rejected`, family ids, and the message names are the same in Tasks 4 to 10.

**Known interface changes to earlier plans:** `createApp` gains `data` and `staticRoot`; `lobby.startGame` also creates the two wallet rows; `tickAll` also runs the director. Plan 1's tests still pass unchanged.
