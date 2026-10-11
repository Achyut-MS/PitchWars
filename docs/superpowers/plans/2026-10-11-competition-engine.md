# Startup Showdown: Plan 3 of 7, Competition Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 16-minute Competition phase work: the coin trickle from each role's purchases, the 5-second samples for the graphs, hints, the CEO's hidden attacks and shields, the organizer's market event and coin injection, the countdown warnings and closings, and the Competition screens.

**Architecture:** Every second the server computes, for each company, the **coins per minute each role earns** from what the company owns, applies the active attack and market-event modifiers, and adds the resulting coins to the wallet. Attacks, events and shields are rows with start and end times, so the effects are derived from the clock and survive a restart. Hints and notices are rows too, so every screen can be rebuilt from the database.

**Tech Stack:** unchanged (Node.js 20+, `ws`, `better-sqlite3`, `node:test`, plain browser JavaScript).

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`, Sections 2.0, 2.0.2, 2.1, 3, 6, 8, 10. Plans 1 and 2 must be finished first.

## Global Constraints

- Everything from the Global Constraints of Plans 1 and 2 still applies.
- **Coin trickle:** each of the CTO, CMO and COO earns coins per minute from its level. Basic, Smart and Premium points are 1, 2 and 3. For a role with an average `a` of tier points: 0 coins at 0 points, `13 * a` up to 1 point, then `13 + 7 * (a - 1)` up to **27** at 3 points.
- **CTO:** the average of the **best 3 of the 6 feature slots** (the three highest tiers added up and divided by 3; an empty slot counts as 0 points; features beyond the best three add nothing), plus **+1 per part bought, first 4 parts only**.
- **CMO:** average over **2 slots** (target user and ad campaign, empty = 0), plus **+2** for the brand name and **+2** for the tagline.
- **COO:** by **number of risk fixes** (0, 1, 2, 3 give 0, 13, 20, 27), plus **+2** for the supplier or data backup, plus **+1** (Basic test) or **+2** (Full test).
- **Attacks (CEO only, hidden):** nine attacks with costs 300, 450, 350, 450, 400, 300, 350, 350, 400. Each lasts a random **30 to 45 seconds** (Surprise Tax is instant). **Cooldown 60 seconds starting after the effect ends.** Attacks need no CFO approval and may take the wallet **below -200**. No attacks in the **last 60 seconds**. The victim sees only a business cover story, never the rival or an attack.
- **Shield:** the COO's one-time Attack Shield (150 coins, one per game, never rebought) blocks the next attack. The attacker sees **"Attack blocked"** and still pays. The victim's COO sees a disguised message ("Insurance claim used").
- **Market event:** the organizer may trigger **one event per game**: Demand Surge (sales +25%, 45 s), Demand Slump (sales -25%, 45 s) or Shop Sale (shop prices -25%, 90 s). It hits **both companies**.
- **Coin injection:** the organizer may add up to **500 coins to one company, once per game**.
- **Hints:** a CTO, CMO or COO gets a hint when the **rival's same role earns 10 or more coins per minute more**, at most once per **60 seconds** per role. The text never mentions the rival or attacks. The CTO and CMO get a named upgrade; the COO gets "your part is holding back sales".
- **Countdown:** warnings at 5 minutes, 2 minutes and 30 seconds left, red timer in the last 10 seconds. The **shop closes at 30 seconds left** (the CFO finishes the queue; the director auto-rejects what is left at 0:00). **Attacks lock at 60 seconds left.**
- **Samples:** every **5 seconds** during the Competition, for each company: wallet, each role's rate, each role's cumulative sales coins, mini game coins, attack coins.
- **Everything is logged** in `events` with the Admission ID where a person caused it.

## Review Focus

1. **A Pi that skips ticks** (busy or restarted): the trickle must add at most 5 seconds of coins per tick and never negative or double (Task 4).
2. **Floating point:** 60 one-second ticks of a 27 coins/min role must add exactly 27 coins (Task 4).
3. **A CEO pressing two attacks in the same second** (double click, two tabs): the second is refused by the cooldown, and the wallet is charged once (Task 5).
4. **A shield and a Surprise Tax together:** a blocked tax moves no coins (Task 5).
5. **Attacks near the wallet floor:** an attack with a nearly empty wallet is allowed and the wallet goes negative; the CFO still cannot approve purchases below -200 (Task 5).
6. **An error message that gives the attack away:** a locked CTO or CFO must see the cover story, never "attack" or the rival (Task 5).
7. **Two organizers clicking the market event or injection:** only the first succeeds (Task 6).
8. **A hint text containing the rival or an attack name** must never appear (Task 7).

## File Structure

```
src/
  phases.js        (modify) add phaseWindow
  db.js            (modify) schema v3
  levels.js        curve, roleRates (pure)
  attacks.js       ATTACKS, launchAttack, activeAttacks, isLocked, cooldown
  marketEvents.js  EVENTS, triggerMarketEvent, saleMultiplier, injectCoins
  rates.js         effectiveRates (levels + attacks + events)
  economy.js       tickEconomy (trickle, role coins, attack credit, samples)
  hints.js         evaluateHints, latestHint
  warnings.js      warningFor, shopOpenAt
  shop.js          (modify) shopOpenAt, chargeFor with Shop Sale, locks
  views.js         (modify) competition block, organizer additions
  server.js        (modify) actions, economy and hints in tickAll, tick warning
public/
  render.js        (modify) renderCompetition
  render-organizer.js (modify) attack log, event and injection controls
test/helpers.js    (modify) give, toCompetition
```

---

### Task 1: Role levels (pure)

**Files:**
- Create: `src/levels.js`, `test/levels.test.js`

**Interfaces:**
- Consumes: `data.item(id)` (Plan 2)
- Produces:
  - `curve(points) -> coinsPerMinute`
  - `roleRates(data, ownedItemIds, mods = {}) -> { CTO, CMO, COO }` where `mods = { recallBest, adOff, riskOff }` (booleans used by attacks): `recallBest` removes the CTO's highest-tier feature, `adOff` zeroes the ad campaign slot, `riskOff` counts zero risk fixes.

- [ ] **Step 1: Write the failing tests**

`test/levels.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { data } from './helpers.js';
import { curve, roleRates } from '../src/levels.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('the curve passes through 13, 20 and 27 and is flat above 3 points', () => {
  assert.equal(curve(0), 0);
  near(curve(0.5), 6.5);
  assert.equal(curve(1), 13);
  near(curve(2), 20);
  near(curve(2.5), 23.5);
  assert.equal(curve(3), 27);
  assert.equal(curve(4), 27);
  assert.equal(curve(-1), 0);
});

test('a company with nothing earns nothing', () => {
  assert.deepEqual(roleRates(data, []), { CTO: 0, CMO: 0, COO: 0 });
});

test('the CTO level is the average of its best three feature slots', () => {
  near(roleRates(data, ['F01-P']).CTO, 13);                                  // 3 / 3 = 1 point
  near(roleRates(data, ['F01-S', 'F02-S']).CTO, 13 + 7 / 3);                 // 4 / 3 = 1.33 points
  near(roleRates(data, ['F01-B', 'F02-B', 'F03-B']).CTO, 13);                // 3 / 3 = 1 point
  near(roleRates(data, ['F01-P', 'F02-B', 'F03-B']).CTO, 13 + 7 * (5 / 3 - 1));
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P']).CTO, 27);
});

test('features beyond the best three add nothing', () => {
  near(roleRates(data, ['F01-B', 'F02-B', 'F03-B', 'F04-B', 'F05-B', 'F06-B']).CTO, 13);
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P', 'F04-B']).CTO, 27);
  near(roleRates(data, ['F01-P', 'F02-P', 'F03-P', 'F04-P', 'F05-P', 'F06-P']).CTO, 27);
});

test('the CTO gets +1 per part, for the first four parts only', () => {
  near(roleRates(data, ['HC01']).CTO, 1);
  near(roleRates(data, ['HC01', 'HC02', 'HC03', 'HC04']).CTO, 4);
  near(roleRates(data, ['HC01', 'HC02', 'HC03', 'HC04', 'HC05', 'HC06']).CTO, 4);
  near(roleRates(data, ['SC01', 'SC02']).CTO, 2);
});

test('the CMO averages the target user and the ad campaign, plus 2 each for brand and tagline', () => {
  near(roleRates(data, ['M01-L']).CMO, curve(1.5));
  near(roleRates(data, ['M01-L', 'M04-E']).CMO, 27);
  near(roleRates(data, ['M01-L', 'M04-E', 'M02', 'M03']).CMO, 31);
  near(roleRates(data, ['M02']).CMO, 2);
});

test('the COO counts risk fixes and adds the backup and the test bonuses', () => {
  assert.equal(roleRates(data, ['O01']).COO, 13);
  assert.equal(roleRates(data, ['O01', 'O02']).COO, 20);
  assert.equal(roleRates(data, ['O01', 'O02', 'O03']).COO, 27);
  assert.equal(roleRates(data, ['O01', 'O02', 'O03', 'O04-H', 'O05-F']).COO, 31);
  assert.equal(roleRates(data, ['O05-B']).COO, 1);
  assert.equal(roleRates(data, ['O06']).COO, 0); // the shield earns nothing by itself
});

test('Feature Recall removes the best feature from the CTO average', () => {
  near(roleRates(data, ['F01-P', 'F02-B'], { recallBest: true }).CTO, curve(1 / 3));
});

test('Ad Blackout zeroes the ad slot, Safety Audit zeroes the risk fixes but keeps the extras', () => {
  near(roleRates(data, ['M01-L', 'M04-E'], { adOff: true }).CMO, curve(1.5));
  assert.equal(roleRates(data, ['O01', 'O02', 'O03', 'O04-S'], { riskOff: true }).COO, 2);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/levels.js`

- [ ] **Step 3: Write the minimal implementation**

`src/levels.js`:

```js
export const curve = (points) => {
  if (points <= 0) return 0;
  if (points <= 1) return 13 * points;
  return Math.min(27, 13 + 7 * (points - 1));
};

export function roleRates(data, ownedItemIds, mods = {}) {
  const items = ownedItemIds.map((id) => data.item(id)).filter(Boolean);
  const has = (family) => items.some((i) => i.family === family);
  const tier = (family) => items.find((i) => i.family === family)?.tierPoints ?? 0;

  const feats = items.filter((i) => i.section === 'Core Features').map((i) => i.tierPoints).sort((a, b) => b - a);
  if (mods.recallBest) feats.shift();
  const parts = items.filter((i) => i.section === 'Components').length;
  const CTO = curve(feats.slice(0, 3).reduce((a, b) => a + b, 0) / 3) + Math.min(4, parts);

  const ad = mods.adOff ? 0 : tier('M04');
  const CMO = curve((tier('M01') + ad) / 2) + (has('M02') ? 2 : 0) + (has('M03') ? 2 : 0);

  const fixes = mods.riskOff ? 0 : items.filter((i) => /^O0[123]$/.test(i.id)).length;
  const COO = [0, 13, 20, 27][fixes] + (has('O04') ? 2 : 0) + tier('O05');

  return { CTO, CMO, COO };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/levels.js test/levels.test.js
git commit -m "feat: role levels and the coin curve"
```

---

### Task 2: Schema v3, phase windows, and test helpers

**Files:**
- Modify: `src/db.js`, `src/phases.js`, `test/helpers.js`
- Create: `test/schema3.test.js`

**Interfaces:**
- Produces:
  - `phaseWindow(game, name) -> { start, end }` in milliseconds.
  - New columns on `company_state`: `last_tick_at INTEGER`, `frac REAL NOT NULL DEFAULT 0`, `mini_coins REAL NOT NULL DEFAULT 0`, `attack_coins REAL NOT NULL DEFAULT 0`, `cto_coins REAL NOT NULL DEFAULT 0`, `cmo_coins REAL NOT NULL DEFAULT 0`, `coo_coins REAL NOT NULL DEFAULT 0`, `last_sample_at INTEGER`. Edit the `CREATE TABLE company_state` statement in `src/db.js` directly (the project has no deployed databases to migrate).
  - New tables (add to `SCHEMA`): `attacks`, `notices`, `market_events`, `injections`, `shield_use`, `samples`, `hints` with the columns used in the code below.
  - Test helpers: `give(h, company, itemIds)` inserts owned rows (charged = item cost); `toCompetition(h, ideaA = 'H1', ideaB = 'S1')` makes both CEOs pick and sets the clock to 800 s (the start of the Competition); `owned` rows created by `give` use `bought_at = 0`.

- [ ] **Step 1: Write the failing tests**

`test/schema3.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { phaseWindow } from '../src/phases.js';
import { makeRunning, give, toCompetition } from './helpers.js';
import { companyState } from '../src/state.js';

test('the new tables exist', () => {
  const db = openDb();
  for (const t of ['attacks', 'notices', 'market_events', 'injections', 'shield_use', 'samples', 'hints']) {
    assert.ok(db.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t), t);
  }
});

test('company_state has the economy columns with zero defaults', () => {
  const h = makeRunning();
  const cs = companyState(h.db, h.gameId, 'A');
  assert.deepEqual([cs.frac, cs.mini_coins, cs.attack_coins, cs.cto_coins, cs.last_tick_at], [0, 0, 0, 0, null]);
});

test('phaseWindow gives the start and end of each phase in milliseconds', () => {
  const g = { startedAt: 1000, ideationSavedSec: 0 };
  assert.deepEqual(phaseWindow(g, 'briefing'), { start: 1000, end: 181_000 });
  assert.deepEqual(phaseWindow(g, 'competition'), { start: 801_000, end: 1_761_000 });
  assert.throws(() => phaseWindow(g, 'nope'));
});

test('phaseWindow follows an early end of ideation', () => {
  const g = { startedAt: 0, ideationSavedSec: 160 };
  assert.deepEqual(phaseWindow(g, 'shop'), { start: 200_000, end: 780_000 });
  assert.deepEqual(phaseWindow(g, 'competition'), { start: 800_000, end: 1_760_000 });
});

test('give and toCompetition set up a competing game quickly', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'M02']);
  assert.equal(h.clock.t, 800_000);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM owned WHERE company='A'").get().n, 2);
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S1');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `give` and `phaseWindow` are not exported

- [ ] **Step 3: Write the minimal implementation**

In `src/phases.js` append:

```js
export function phaseWindow(game, name) {
  let t = game.startedAt;
  for (const [n, sec] of timeline(game)) {
    if (n === name) return { start: t, end: t + sec * 1000 };
    t += sec * 1000;
  }
  throw new Error(`unknown phase ${name}`);
}
```

In `src/db.js`, change `CREATE TABLE IF NOT EXISTS company_state` so it reads:

```sql
CREATE TABLE IF NOT EXISTS company_state (
  game_id        INTEGER NOT NULL,
  company        TEXT NOT NULL,
  idea_id        TEXT,
  picked_by      TEXT,
  picked_at      INTEGER,
  pick_source    TEXT,
  wallet         INTEGER NOT NULL DEFAULT 1000,
  last_tick_at   INTEGER,
  frac           REAL NOT NULL DEFAULT 0,
  mini_coins     REAL NOT NULL DEFAULT 0,
  attack_coins   REAL NOT NULL DEFAULT 0,
  cto_coins      REAL NOT NULL DEFAULT 0,
  cmo_coins      REAL NOT NULL DEFAULT 0,
  coo_coins      REAL NOT NULL DEFAULT 0,
  last_sample_at INTEGER,
  PRIMARY KEY (game_id, company)
);
```

and append these tables inside `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS attacks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  attacker    TEXT NOT NULL,
  victim      TEXT NOT NULL,
  key         TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  launched_by TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  end_at      INTEGER NOT NULL,
  blocked     INTEGER NOT NULL DEFAULT 0,
  cover       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  role    TEXT,
  text    TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  until   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS market_events (
  game_id    INTEGER PRIMARY KEY,
  key        TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS injections (
  game_id INTEGER PRIMARY KEY,
  company TEXT NOT NULL,
  coins   INTEGER NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shield_use (
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, company)
);
CREATE TABLE IF NOT EXISTS samples (
  game_id      INTEGER NOT NULL,
  ts           INTEGER NOT NULL,
  company      TEXT NOT NULL,
  wallet       INTEGER NOT NULL,
  cto_rate     REAL NOT NULL,
  cmo_rate     REAL NOT NULL,
  coo_rate     REAL NOT NULL,
  cto_coins    REAL NOT NULL,
  cmo_coins    REAL NOT NULL,
  coo_coins    REAL NOT NULL,
  mini_coins   REAL NOT NULL,
  attack_coins REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS samples_by_game ON samples (game_id, ts, company);
CREATE TABLE IF NOT EXISTS hints (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  role    TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  text    TEXT NOT NULL,
  acted   INTEGER
);
```

Append to `test/helpers.js`:

```js
import { pickIdea } from '../src/ideation.js';

export function give(h, company, itemIds) {
  const stmt = h.db.prepare(
    `INSERT OR REPLACE INTO owned (game_id, company, family, item_id, choice, bought_at, charged)
     VALUES (?, ?, ?, ?, NULL, 0, ?)`
  );
  for (const id of itemIds) {
    const item = h.ctx.data.item(id);
    stmt.run(h.gameId, company, item.family, id, item.cost);
  }
}

export function toCompetition(h, ideaA = 'H1', ideaB = 'S1') {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, ideaA);
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, ideaB);
  atSec(h, 800);
  return h;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (Plans 1 and 2 tests too)

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/phases.js test/helpers.js test/schema3.test.js
git commit -m "feat: schema v3, phase windows and competition test helpers"
```

---

### Task 3: Attacks, effects and effective rates

**Files:**
- Create: `src/attacks.js`, `src/marketEvents.js`, `src/rates.js`, `test/rates.test.js`

**Interfaces:**
- Consumes: `roleRates` (Task 1), `ownedRows` (Plan 2)
- Produces:
  - `ATTACKS` (array of `{ key, name, cost, kind, value?, cover }`; kinds: `mult`, `ad_off`, `recall`, `risk_off`, `minigame_half`, `cto_lock`, `cfo_lock`, `tax`), `attackByKey(key)`.
  - `activeAttacks(db, gameId, victim, t) -> rows` (not blocked, `launched_at <= t < end_at`)
  - `EVENTS = { demand_surge: { name, salesMult: 1.25, durationSec: 45 }, demand_slump: { name, salesMult: 0.75, durationSec: 45 }, shop_sale: { name, priceMult: 0.75, durationSec: 90 } }`
  - `activeEvent(db, gameId, t) -> { key, ...EVENTS[key] } | null`
  - `effectiveRates(ctx, game, company, t, { attacks = true } = {}) -> { CTO, CMO, COO, total }`: base levels, then the victim's active attacks (`ad_off`, `recall`, `risk_off`), then multipliers (`mult` attacks and the market event's `salesMult`).

- [ ] **Step 1: Write the failing tests**

`test/rates.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition } from './helpers.js';
import { effectiveRates } from '../src/rates.js';
import { ATTACKS, attackByKey } from '../src/attacks.js';
import { EVENTS } from '../src/marketEvents.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
function attack(h, victim, key, startMs, endMs, blocked = 0) {
  h.db.prepare(
    'INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
  ).run(h.gameId, victim === 'A' ? 'B' : 'A', victim, key, 'S5', startMs, endMs, blocked, 'x');
}

test('there are nine attacks with the agreed costs', () => {
  assert.deepEqual(ATTACKS.map((a) => a.cost), [300, 450, 350, 450, 400, 300, 350, 350, 400]);
  assert.equal(attackByKey('surprise_tax').kind, 'tax');
  assert.equal(attackByKey('nope'), undefined);
});

test('with no attacks the rates are the base levels and the total is their sum', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03', 'M01-L', 'M04-E']);
  const r = effectiveRates(h.ctx, h.game(), 'A', h.clock.t);
  near(r.COO, 27); near(r.CMO, 27); near(r.CTO, 0); near(r.total, 54);
});

test('Price Squeeze takes 25% off every role, Market Crash 50%, and they stop at the end time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'price_squeeze', 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 20.25);
  near(effectiveRates(h.ctx, h.game(), 'B', 840_000).COO, 27); // the end time is exclusive
  attack(h, 'B', 'market_crash', 900_000, 940_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 910_000).COO, 13.5);
});

test('a blocked attack has no effect', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'market_crash', 800_000, 840_000, 1);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO, 27);
});

test('Ad Blackout, Feature Recall and Safety Audit hit the role they target', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['M01-L', 'M04-E', 'F01-P', 'F02-B', 'O01', 'O02', 'O03', 'O04-H']);
  attack(h, 'A', 'ad_blackout', 800_000, 840_000);
  attack(h, 'A', 'feature_recall', 800_000, 840_000);
  attack(h, 'A', 'safety_audit', 800_000, 840_000);
  const r = effectiveRates(h.ctx, h.game(), 'A', 810_000);
  near(r.CMO, 16.5);      // (3 + 0) / 2 = 1.5 points
  near(r.CTO, 13 / 3);    // the best feature is removed; F02-B (1 point) over three slots
  near(r.COO, 2);         // risk fixes stop counting; the backup bonus stays
});

test('a market event changes both companies and ends on time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01', 'O02', 'O03']);
  h.db.prepare('INSERT INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)').run(h.gameId, 'demand_surge', 800_000, 845_000);
  near(effectiveRates(h.ctx, h.game(), 'A', 820_000).COO, 33.75);
  near(effectiveRates(h.ctx, h.game(), 'B', 820_000).COO, 33.75);
  near(effectiveRates(h.ctx, h.game(), 'A', 850_000).COO, 27);
  assert.equal(EVENTS.shop_sale.priceMult, 0.75);
});

test('attacks=false shows what the rates would be without attacks but with market events', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  attack(h, 'B', 'market_crash', 800_000, 840_000);
  near(effectiveRates(h.ctx, h.game(), 'B', 810_000, { attacks: false }).COO, 27);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/rates.js`

- [ ] **Step 3: Write the minimal implementation**

`src/attacks.js` (data and read helpers; launching is Task 5):

```js
export const ATTACKS = [
  { key: 'price_squeeze', name: 'Price Squeeze', cost: 300, kind: 'mult', value: 0.75, cover: 'Customer demand has softened' },
  { key: 'market_crash', name: 'Market Crash', cost: 450, kind: 'mult', value: 0.5, cover: 'Stock market prices have fallen' },
  { key: 'ad_blackout', name: 'Ad Blackout', cost: 350, kind: 'ad_off', cover: 'Ad platform outage' },
  { key: 'feature_recall', name: 'Feature Recall', cost: 450, kind: 'recall', cover: 'A component supplier issued a recall' },
  { key: 'safety_audit', name: 'Safety Audit', cost: 400, kind: 'risk_off', cover: 'A regulator is reviewing the industry' },
  { key: 'minigame_jam', name: 'Mini-Game Jam', cost: 300, kind: 'minigame_half', cover: 'Network congestion is slowing the system' },
  { key: 'supplier_delay', name: 'Supplier Delay', cost: 350, kind: 'cto_lock', cover: 'Supplier systems are down for maintenance' },
  { key: 'bank_freeze', name: 'Bank Freeze', cost: 350, kind: 'cfo_lock', cover: 'Bank systems are under maintenance' },
  { key: 'surprise_tax', name: 'Surprise Tax', cost: 400, kind: 'tax', value: 100, cover: 'An unexpected tax bill has arrived' },
];

export const attackByKey = (key) => ATTACKS.find((a) => a.key === key);

export function activeAttacks(db, gameId, victim, t) {
  return db
    .prepare('SELECT * FROM attacks WHERE game_id=? AND victim=? AND blocked=0 AND launched_at <= ? AND ? < end_at')
    .all(gameId, victim, t, t);
}
```

`src/marketEvents.js` (data and read helpers; triggering is Task 6):

```js
export const EVENTS = {
  demand_surge: { name: 'Demand Surge', salesMult: 1.25, durationSec: 45 },
  demand_slump: { name: 'Demand Slump', salesMult: 0.75, durationSec: 45 },
  shop_sale: { name: 'Shop Sale', priceMult: 0.75, durationSec: 90 },
};

export function activeEvent(db, gameId, t) {
  const e = db.prepare('SELECT * FROM market_events WHERE game_id=? AND started_at <= ? AND ? < ends_at').get(gameId, t, t);
  return e ? { key: e.key, ...EVENTS[e.key] } : null;
}
```

`src/rates.js`:

```js
import { roleRates } from './levels.js';
import { ownedRows } from './state.js';
import { activeAttacks, attackByKey } from './attacks.js';
import { activeEvent } from './marketEvents.js';

export function effectiveRates(ctx, game, company, t, { attacks = true } = {}) {
  const ids = ownedRows(ctx.db, game.id, company).map((o) => o.item_id);
  const mods = {};
  let mult = 1;
  if (attacks) {
    for (const row of activeAttacks(ctx.db, game.id, company, t)) {
      const a = attackByKey(row.key);
      if (a.kind === 'ad_off') mods.adOff = true;
      if (a.kind === 'recall') mods.recallBest = true;
      if (a.kind === 'risk_off') mods.riskOff = true;
      if (a.kind === 'mult') mult *= a.value;
    }
  }
  const ev = activeEvent(ctx.db, game.id, t);
  if (ev && ev.salesMult) mult *= ev.salesMult;
  const base = roleRates(ctx.data, ids, mods);
  const CTO = base.CTO * mult;
  const CMO = base.CMO * mult;
  const COO = base.COO * mult;
  return { CTO, CMO, COO, total: CTO + CMO + COO };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/attacks.js src/marketEvents.js src/rates.js test/rates.test.js
git commit -m "feat: attack table, market events and effective role rates"
```

---

### Task 4: The economy tick (trickle, role coins, attack credit, samples)

**Files:**
- Create: `src/economy.js`, `test/economy.test.js`

**Interfaces:**
- Consumes: `effectiveRates` (Task 3), `phaseWindow` (Task 2), `companyState` (Plan 2)
- Produces: `tickEconomy(ctx, game) -> void`, to be called once per second by the server.
  - Does nothing before the Competition starts.
  - For each company: `dt = min(upTo - last_tick_at, 5000) ms` where `upTo = min(now, competition end)` and the first `last_tick_at` is the Competition start. Adds `rate / 60 * dt` coins per role to the role's cumulative coins, adds the total to `frac`, moves whole coins into the wallet (`floor(total + 1e-9)`), and credits the **rival's** `attack_coins` with the sales this company lost to attacks in the interval (`rates without attacks` minus `rates with attacks`).
  - Writes one `samples` row per company the first time it runs in the Competition and then whenever at least 5000 ms have passed since the last sample.

- [ ] **Step 1: Write the failing tests**

`test/economy.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { tickEconomy } from '../src/economy.js';
import { companyState } from '../src/state.js';

const wallet = (h, c = 'A') => companyState(h.db, h.gameId, c).wallet;
function run(h, fromSec, toSec) {
  for (let s = fromSec; s <= toSec; s++) { atSec(h, s); tickEconomy(h.ctx, h.game()); }
}

test('nothing happens before the competition starts', () => {
  const h = makeRunning();
  give(h, 'A', ['O01', 'O02', 'O03']);
  atSec(h, 500);
  tickEconomy(h.ctx, h.game());
  assert.equal(wallet(h), 1000);
});

test('sixty one-second ticks of a 27 coins per minute role add exactly 27 coins', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 860);
  assert.equal(wallet(h), 1027);
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').coo_coins - 27) < 1e-6);
});

test('fractions are kept, not lost', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']); // 13 per minute
  run(h, 800, 830);      // 30 s = 6.5 coins
  assert.equal(wallet(h), 1006);
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').frac - 0.5) < 1e-6);
});

test('a long gap counts at most five seconds', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  atSec(h, 800); tickEconomy(h.ctx, h.game());
  atSec(h, 900); tickEconomy(h.ctx, h.game()); // 100 s later, capped at 5 s: 2.25 coins
  assert.equal(wallet(h), 1002);
});

test('the same tick twice adds nothing the second time', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 810);
  const before = wallet(h);
  tickEconomy(h.ctx, h.game());
  assert.equal(wallet(h), before);
});

test('coins stop at the end of the competition', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 1755, 1760);
  const w = wallet(h);
  run(h, 1761, 1770);
  assert.equal(wallet(h), w);
});

test('an attack credits the attacker with the sales the victim lost', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O01', 'O02', 'O03']);
  h.db.prepare("INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover) VALUES (?, 'A', 'B', 'market_crash', 450, 'S0', 800000, 860000, 0, 'x')").run(h.gameId);
  run(h, 800, 860); // B earns 13.5/min instead of 27/min for 60 s
  assert.ok(Math.abs(companyState(h.db, h.gameId, 'A').attack_coins - 13.5) < 0.3);
  assert.equal(companyState(h.db, h.gameId, 'B').attack_coins, 0);
  assert.equal(wallet(h, 'B'), 1000 + 13); // 13.5 coins earned, 13 whole coins
});

test('samples are written every five seconds for both companies', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  run(h, 800, 830);
  const rows = h.db.prepare("SELECT * FROM samples WHERE company='A' ORDER BY ts").all();
  assert.deepEqual(rows.map((r) => r.ts), [800000, 805000, 810000, 815000, 820000, 825000, 830000]);
  assert.equal(rows[0].wallet, 1000);
  assert.equal(rows[6].coo_rate, 27);
  assert.ok(rows[6].wallet > rows[0].wallet);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM samples WHERE company='B'").get().n, 7);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/economy.js`

- [ ] **Step 3: Write the minimal implementation**

`src/economy.js`:

```js
import { effectiveRates } from './rates.js';
import { phaseWindow } from './phases.js';
import { companyState } from './state.js';

const MAX_DT_MS = 5000;
const SAMPLE_EVERY_MS = 5000;

export function tickEconomy(ctx, game) {
  const w = phaseWindow(game, 'competition');
  const now = ctx.now();
  if (now < w.start) return;
  const upTo = Math.min(now, w.end);

  for (const company of ['A', 'B']) {
    const rival = company === 'A' ? 'B' : 'A';
    const cs = companyState(ctx.db, game.id, company);
    const last = cs.last_tick_at ?? w.start;
    const dt = Math.max(0, Math.min(upTo - last, MAX_DT_MS)) / 1000;
    if (dt > 0) {
      const withAttacks = effectiveRates(ctx, game, company, upTo, { attacks: true });
      const without = effectiveRates(ctx, game, company, upTo, { attacks: false });
      const gain = (rate) => (rate / 60) * dt;
      const total = cs.frac + gain(withAttacks.total);
      const whole = Math.floor(total + 1e-9);
      ctx.db.prepare(
        `UPDATE company_state SET wallet = wallet + ?, frac = ?, last_tick_at = ?,
           cto_coins = cto_coins + ?, cmo_coins = cmo_coins + ?, coo_coins = coo_coins + ?
         WHERE game_id=? AND company=?`
      ).run(whole, total - whole, upTo, gain(withAttacks.CTO), gain(withAttacks.CMO), gain(withAttacks.COO), game.id, company);
      const lost = gain(without.total - withAttacks.total);
      if (lost > 0) {
        ctx.db.prepare('UPDATE company_state SET attack_coins = attack_coins + ? WHERE game_id=? AND company=?').run(lost, game.id, rival);
      }
    } else if (cs.last_tick_at == null) {
      ctx.db.prepare('UPDATE company_state SET last_tick_at = ? WHERE game_id=? AND company=?').run(upTo, game.id, company);
    }
  }
  sample(ctx, game, upTo);
}

function sample(ctx, game, t) {
  for (const company of ['A', 'B']) {
    const cs = companyState(ctx.db, game.id, company);
    if (cs.last_sample_at != null && t - cs.last_sample_at < SAMPLE_EVERY_MS) continue;
    const r = effectiveRates(ctx, game, company, t);
    ctx.db.prepare(
      `INSERT INTO samples (game_id, ts, company, wallet, cto_rate, cmo_rate, coo_rate, cto_coins, cmo_coins, coo_coins, mini_coins, attack_coins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(game.id, t, company, cs.wallet, r.CTO, r.CMO, r.COO, cs.cto_coins, cs.cmo_coins, cs.coo_coins, cs.mini_coins, cs.attack_coins);
    ctx.db.prepare('UPDATE company_state SET last_sample_at = ? WHERE game_id=? AND company=?').run(t, game.id, company);
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS. (If the "exactly 27 coins" test fails by one coin, check the `1e-9` allowance and that `frac` is stored as the leftover `total - whole`.)

- [ ] **Step 5: Commit**

```bash
git add src/economy.js test/economy.test.js
git commit -m "feat: coin trickle, role coins, attack credit and 5-second samples"
```

---

### Task 5: Launching attacks, shields and locks

**Files:**
- Modify: `src/attacks.js` (append `launchAttack`, `isLocked`, `attackCooldownUntil`), `src/shop.js` (supplier and bank locks)
- Create: `test/attacks.test.js`

**Interfaces:**
- Produces:
  - `launchAttack(ctx, game, admissionId, key, rng = Math.random) -> { blocked: boolean, endsAt: number }`
  - `attackCooldownUntil(db, gameId, company) -> number` (0 if none; otherwise the last attack's `end_at + 60000`)
  - `isLocked(ctx, game, company, kind, t = ctx.now()) -> boolean` for kinds `cto_lock` and `cfo_lock`
  - `hasShield(db, gameId, company) -> boolean` (owns `O06` and has not used it)
- Errors (shown to the CEO): `'only the CEO can attack'`, `'unknown attack'`, `'attacks are only possible during the competition'`, `'attacks are locked in the last 60 seconds'`, `'attack on cooldown'`.
- Lock errors (shown to the victim): the **cover story**. A locked CTO's `requestItem` throws `'Supplier systems are down for maintenance'`; a locked CFO's `cfoDecide` throws `'Bank systems are under maintenance'`.
- Effects of a launch: the attacker's wallet drops by the cost (the wallet may go below -200); a normal attack inserts an `attacks` row with a random 30 to 45 second duration; a victim notice (all roles) with the cover story is written for the effect's length; **Surprise Tax** moves 100 coins from the victim to the attacker at once and adds 100 to the attacker's `attack_coins`; a **blocked** attack inserts a `blocked = 1` row with `end_at = now`, records `shield_use`, writes a COO notice `'Insurance claim used'`, and moves no coins.

- [ ] **Step 1: Write the failing tests**

`test/attacks.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { launchAttack, attackCooldownUntil, isLocked, hasShield } from '../src/attacks.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { companyState } from '../src/state.js';

const wallet = (h, c) => companyState(h.db, h.gameId, c).wallet;
const go = (h, key, rng = () => 0, who = 'A') => launchAttack(h.ctx, h.game(), h.seat[who].CEO, key, rng);

test('only the CEO can attack, and only a known attack, and only in the competition', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => launchAttack(h.ctx, h.game(), h.seat.A.CTO, 'market_crash'), /only the CEO/);
  assert.throws(() => go(h, 'nope'), /unknown attack/);
  atSec(h, 500);
  assert.throws(() => go(h, 'market_crash'), /only possible during the competition/);
});

test('a launch costs the attack price and lasts between 30 and 45 seconds', () => {
  const h = toCompetition(makeRunning());
  const lo = go(h, 'price_squeeze', () => 0);
  assert.equal(lo.endsAt, 800_000 + 30_000);
  assert.equal(wallet(h, 'A'), 700);
  const h2 = toCompetition(makeRunning());
  assert.equal(go(h2, 'price_squeeze', () => 0.999999).endsAt, 800_000 + 45_000);
});

test('the victim gets the cover story and nothing names the attacker', () => {
  const h = toCompetition(makeRunning());
  go(h, 'market_crash');
  const n = h.db.prepare("SELECT * FROM notices WHERE company='B'").all();
  assert.equal(n.length, 1);
  assert.equal(n[0].role, null);
  assert.equal(n[0].text, 'Stock market prices have fallen');
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM notices WHERE company='A'").get().n, 0);
});

test('the cooldown starts after the effect ends and lasts 60 seconds', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze', () => 0); // ends at 830 s
  assert.equal(attackCooldownUntil(h.db, h.gameId, 'A'), 890_000);
  atSec(h, 880);
  assert.throws(() => go(h, 'price_squeeze'), /attack on cooldown/);
  atSec(h, 891);
  go(h, 'price_squeeze');
});

test('two attacks in the same second charge the wallet once', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze');
  assert.throws(() => go(h, 'market_crash'), /cooldown/);
  assert.equal(wallet(h, 'A'), 700);
});

test('the rival can attack back while we are on cooldown', () => {
  const h = toCompetition(makeRunning());
  go(h, 'price_squeeze', () => 0, 'A');
  go(h, 'price_squeeze', () => 0, 'B');
});

test('attacks are locked in the last 60 seconds', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1700); // 60 s left exactly
  assert.throws(() => go(h, 'price_squeeze'), /locked in the last 60 seconds/);
  atSec(h, 1699);
  go(h, 'price_squeeze');
});

test('an attack may take the wallet below -200, and the CFO still cannot buy below -200', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -150 WHERE company='A'").run();
  go(h, 'market_crash'); // 450
  assert.equal(wallet(h, 'A'), -600);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /below -200/);
});

test('Surprise Tax moves 100 coins at once and has no lasting effect', () => {
  const h = toCompetition(makeRunning());
  const r = go(h, 'surprise_tax');
  assert.equal(r.endsAt, 800_000);
  assert.equal(wallet(h, 'A'), 1000 - 400 + 100);
  assert.equal(wallet(h, 'B'), 900);
  assert.equal(companyState(h.db, h.gameId, 'A').attack_coins, 100);
  assert.equal(attackCooldownUntil(h.db, h.gameId, 'A'), 860_000);
});

test('a shield blocks one attack: the attacker pays, the victim loses nothing, the COO gets a disguised notice', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  assert.equal(hasShield(h.db, h.gameId, 'B'), true);
  const r = go(h, 'surprise_tax');
  assert.equal(r.blocked, true);
  assert.equal(wallet(h, 'A'), 600);
  assert.equal(wallet(h, 'B'), 1000);
  assert.equal(hasShield(h.db, h.gameId, 'B'), false);
  const n = h.db.prepare("SELECT role, text FROM notices WHERE company='B'").get();
  assert.deepEqual(n, { role: 'COO', text: 'Insurance claim used' });
  assert.equal(h.db.prepare('SELECT blocked FROM attacks').get().blocked, 1);
});

test('after the shield is used the next attack lands, and the shield cannot be requested again', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  go(h, 'price_squeeze', () => 0);
  atSec(h, 900);
  const r = go(h, 'price_squeeze', () => 0);
  assert.equal(r.blocked, false);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.B.COO, 'O06'), /already owned/);
});

test('Supplier Delay locks the CTO with the cover story, Bank Freeze locks the CFO', () => {
  const h = toCompetition(makeRunning());
  go(h, 'supplier_delay', () => 0);
  assert.equal(isLocked(h.ctx, h.game(), 'B', 'cto_lock'), true);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.B.CTO, 'F01-B'), (e) => e.message === 'Supplier systems are down for maintenance');
  requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N'); // other roles are not locked
  atSec(h, 900);
  assert.equal(isLocked(h.ctx, h.game(), 'B', 'cto_lock'), false);
  go(h, 'bank_freeze', () => 0, 'A');
  h.db.prepare("UPDATE attacks SET launched_at = 899000, end_at = 929000 WHERE key = 'bank_freeze'").run();
  const id = requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-M');
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.B.CFO, id, true), (e) => e.message === 'Bank systems are under maintenance');
});

test('every attack is logged with the real cause', () => {
  const h = toCompetition(makeRunning());
  go(h, 'market_crash');
  const e = h.db.prepare("SELECT * FROM events WHERE type='attack'").get();
  assert.equal(e.admission_id, h.seat.A.CEO);
  assert.equal(JSON.parse(e.payload).key, 'market_crash');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `launchAttack` is not exported

- [ ] **Step 3: Write the minimal implementation**

Append to `src/attacks.js`:

```js
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { playerIn } from './state.js';

const COOLDOWN_MS = 60_000;
const LOCK_LAST_SEC = 60;

export function attackCooldownUntil(db, gameId, company) {
  const last = db.prepare('SELECT end_at FROM attacks WHERE game_id=? AND attacker=? ORDER BY id DESC LIMIT 1').get(gameId, company);
  return last ? last.end_at + COOLDOWN_MS : 0;
}

export function hasShield(db, gameId, company) {
  const owns = db.prepare("SELECT 1 FROM owned WHERE game_id=? AND company=? AND family='O06'").get(gameId, company);
  const used = db.prepare('SELECT 1 FROM shield_use WHERE game_id=? AND company=?').get(gameId, company);
  return !!owns && !used;
}

export function isLocked(ctx, game, company, kind, t = ctx.now()) {
  return activeAttacks(ctx.db, game.id, company, t).some((r) => attackByKey(r.key).kind === kind);
}

export function launchAttack(ctx, game, admissionId, key, rng = Math.random) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can attack');
  const a = attackByKey(key);
  if (!a) throw new Error('unknown attack');
  const clock = phaseAt(game, ctx.now());
  if (clock.phase !== 'competition') throw new Error('attacks are only possible during the competition');
  if (clock.remainingSec <= LOCK_LAST_SEC) throw new Error('attacks are locked in the last 60 seconds');
  const now = ctx.now();
  if (now < attackCooldownUntil(ctx.db, game.id, p.company)) throw new Error('attack on cooldown');

  const victim = p.company === 'A' ? 'B' : 'A';
  const blocked = hasShield(ctx.db, game.id, victim);
  const duration = a.kind === 'tax' || blocked ? 0 : 30_000 + Math.floor(rng() * 15_001);
  const endsAt = now + duration;

  ctx.db.transaction(() => {
    ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(a.cost, game.id, p.company);
    ctx.db.prepare(
      `INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(game.id, p.company, victim, a.key, a.cost, admissionId, now, endsAt, blocked ? 1 : 0, a.cover);
    const notice = ctx.db.prepare('INSERT INTO notices (game_id, company, role, text, ts, until) VALUES (?, ?, ?, ?, ?, ?)');
    if (blocked) {
      ctx.db.prepare('INSERT INTO shield_use (game_id, company, used_at) VALUES (?, ?, ?)').run(game.id, victim, now);
      notice.run(game.id, victim, 'COO', 'Insurance claim used', now, now + 30_000);
    } else {
      if (a.kind === 'tax') {
        ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(a.value, game.id, victim);
        ctx.db.prepare('UPDATE company_state SET wallet = wallet + ?, attack_coins = attack_coins + ? WHERE game_id=? AND company=?').run(a.value, a.value, game.id, p.company);
      }
      notice.run(game.id, victim, null, a.cover, now, a.kind === 'tax' ? now + 30_000 : endsAt);
    }
    logEvent(ctx.db, { ts: now, gameId: game.id, admissionId, type: 'attack',
      payload: { key: a.key, name: a.name, cost: a.cost, victim, blocked, endsAt, cover: a.cover } });
  })();
  return { blocked, endsAt };
}
```

Move the three new `import` lines to the top of `src/attacks.js`. In `src/shop.js`:

- add `import { isLocked } from './attacks.js';` (the file `attacks.js` does not import `shop.js`, so there is no cycle);
- at the start of `requestItem`, after the player and role checks and before `validate(...)`, add:

```js
  if (p.role === 'CTO' && isLocked(ctx, game, p.company, 'cto_lock')) throw new Error('Supplier systems are down for maintenance');
```

- at the start of `cfoDecide`, after the role check, add:

```js
  if (isLocked(ctx, game, p.company, 'cfo_lock')) throw new Error('Bank systems are under maintenance');
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/attacks.js src/shop.js test/attacks.test.js
git commit -m "feat: hidden attacks, shields, cooldown and cover-story locks"
```

---

### Task 6: Market event, coin injection and the Shop Sale price

**Files:**
- Modify: `src/marketEvents.js` (append), `src/shop.js` (`chargeFor` applies the sale)
- Create: `test/market.test.js`

**Interfaces:**
- Produces:
  - `triggerMarketEvent(ctx, game, key) -> void` (organizer; Competition phase only; only once per game; errors `'unknown event'`, `'events are only possible during the competition'`, `'an event was already used in this game'`)
  - `injectCoins(ctx, game, company, coins) -> void` (once per game; whole number from 1 to 500; errors `'unknown company'`, `'coins must be a whole number from 1 to 500'`, `'coins were already injected in this game'`)
  - `saleMultiplier(db, gameId, t) -> 1 | 0.75`
  - `chargeFor` now multiplies by `saleMultiplier` and rounds to a whole number.

- [ ] **Step 1: Write the failing tests**

`test/market.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { triggerMarketEvent, injectCoins, saleMultiplier, activeEvent } from '../src/marketEvents.js';
import { chargeFor } from '../src/shop.js';
import { effectiveRates } from '../src/rates.js';
import { companyState } from '../src/state.js';

test('an event starts now and lasts its duration', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  assert.equal(activeEvent(h.db, h.gameId, 850_000).key, 'shop_sale');
  assert.equal(activeEvent(h.db, h.gameId, 890_000), null); // 90 s after 800 s
});

test('only one event per game, and only the three known events', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'earthquake'), /unknown event/);
  triggerMarketEvent(h.ctx, h.game(), 'demand_slump');
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'demand_surge'), /already used/);
});

test('events are refused before the competition', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => triggerMarketEvent(h.ctx, h.game(), 'demand_surge'), /during the competition/);
});

test('Demand Surge raises both companies by 25%', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  give(h, 'B', ['O01', 'O02', 'O03']);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  assert.ok(Math.abs(effectiveRates(h.ctx, h.game(), 'A', 810_000).COO - 33.75) < 1e-9);
  assert.ok(Math.abs(effectiveRates(h.ctx, h.game(), 'B', 810_000).COO - 33.75) < 1e-9);
});

test('Shop Sale takes 25% off prices and upgrades while it lasts', () => {
  const h = toCompetition(makeRunning());
  const item = h.ctx.data.item('M01-L'); // 150
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 150);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  assert.equal(saleMultiplier(h.db, h.gameId, 850_000), 0.75);
  h.clock.t = 850_000;
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 113); // 112.5 rounds to 113
  give(h, 'A', ['M01-N']);
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 75); // difference of 100, minus 25%
  h.clock.t = 900_000;
  assert.equal(chargeFor(h.ctx, h.game(), 'A', item), 100);
});

test('the organizer can inject up to 500 coins into one company, once', () => {
  const h = toCompetition(makeRunning());
  injectCoins(h.ctx, h.game(), 'A', 500);
  assert.equal(companyState(h.db, h.gameId, 'A').wallet, 1500);
  assert.throws(() => injectCoins(h.ctx, h.game(), 'B', 100), /already injected/);
});

test('injections reject bad amounts and unknown companies without using up the one allowed injection', () => {
  const h = toCompetition(makeRunning());
  for (const bad of [0, -5, 501, 2.5, 'abc', null]) {
    assert.throws(() => injectCoins(h.ctx, h.game(), 'A', bad), /whole number from 1 to 500/);
  }
  assert.throws(() => injectCoins(h.ctx, h.game(), 'C', 100), /unknown company/);
  injectCoins(h.ctx, h.game(), 'B', 1);
});

test('events and injections are logged', () => {
  const h = toCompetition(makeRunning());
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'A', 200);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('market_event','coin_injection')").get().n, 2);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `triggerMarketEvent` is not exported

- [ ] **Step 3: Write the minimal implementation**

Append to `src/marketEvents.js`:

```js
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';

export function saleMultiplier(db, gameId, t) {
  const e = activeEvent(db, gameId, t);
  return e && e.priceMult ? e.priceMult : 1;
}

export function triggerMarketEvent(ctx, game, key) {
  const ev = EVENTS[key];
  if (!ev) throw new Error('unknown event');
  if (phaseAt(game, ctx.now()).phase !== 'competition') throw new Error('events are only possible during the competition');
  const now = ctx.now();
  const info = ctx.db
    .prepare('INSERT OR IGNORE INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)')
    .run(game.id, key, now, now + ev.durationSec * 1000);
  if (info.changes === 0) throw new Error('an event was already used in this game');
  logEvent(ctx.db, { ts: now, gameId: game.id, type: 'market_event', payload: { key, name: ev.name, durationSec: ev.durationSec } });
}

export function injectCoins(ctx, game, company, coins) {
  if (!['A', 'B'].includes(company)) throw new Error('unknown company');
  if (!Number.isInteger(coins) || coins < 1 || coins > 500) throw new Error('coins must be a whole number from 1 to 500');
  const now = ctx.now();
  const info = ctx.db.prepare('INSERT OR IGNORE INTO injections (game_id, company, coins, ts) VALUES (?, ?, ?, ?)').run(game.id, company, coins, now);
  if (info.changes === 0) throw new Error('coins were already injected in this game');
  ctx.db.prepare('UPDATE company_state SET wallet = wallet + ? WHERE game_id=? AND company=?').run(coins, game.id, company);
  logEvent(ctx.db, { ts: now, gameId: game.id, type: 'coin_injection', payload: { company, coins } });
}
```

(Move the two new imports to the top of the file.) In `src/shop.js`, replace `chargeFor` with:

```js
import { saleMultiplier } from './marketEvents.js';

export function chargeFor(ctx, game, company, item) {
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  const base = owned ? item.cost - ctx.data.item(owned.item_id).cost : item.cost;
  return Math.round(base * saleMultiplier(ctx.db, game.id, ctx.now()));
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/marketEvents.js src/shop.js test/market.test.js
git commit -m "feat: market event, coin injection and Shop Sale pricing"
```

---

### Task 7: Hints

**Files:**
- Create: `src/hints.js`, `test/hints.test.js`

**Interfaces:**
- Consumes: `effectiveRates` (Task 3), `ownedRows`, `ideaOf` (Plan 2), `applicable` (Plan 2 `shop.js`)
- Produces:
  - `evaluateHints(ctx, game) -> void`: during the Competition, for each company and each of CTO, CMO, COO: if the **rival's same role** earns at least 10 coins per minute more than this company's, and this role has had no hint in the last 60 seconds, insert a `hints` row and log a `hint_shown` event. It also sets `acted` on hints older than 60 seconds: `1` if anyone in that role made a shop request in the 60 seconds after the hint, else `0` (logged as `hint_result`).
  - `latestHint(db, gameId, company, role, t) -> { id, text, ts } | null`: the newest hint of at most 60 seconds ago.
  - `suggest(ctx, game, company, role) -> string`: the hint text. CTO and CMO: `Upgrade <name> from <have> to <next> for <diff> coins` or `Buy <name> (<option>) for <cost> coins` (the cheapest next step among the role's tiered families); COO, or nothing left to upgrade: `Your part of the sales is holding the company back. Check your shop section.`
- The text never contains the words "rival", "attack", "opponent" or the other company's letter.

- [ ] **Step 1: Write the failing tests**

`test/hints.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { evaluateHints, latestHint, suggest } from '../src/hints.js';
import { requestItem } from '../src/shop.js';

const hints = (h) => h.db.prepare('SELECT * FROM hints ORDER BY id').all();

test('no hint while the companies are within 10 coins per minute', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']); // 27
  give(h, 'B', ['O01', 'O02']);         // 20, a gap of 7
  evaluateHints(h.ctx, h.game());
  assert.equal(hints(h).length, 0);
});

test('the weaker company role gets a hint when the rival earns 10 or more more', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']); // 27
  give(h, 'B', ['O01']);                // 13, a gap of 14
  evaluateHints(h.ctx, h.game());
  const rows = hints(h);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].company, rows[0].role], ['B', 'COO']);
  assert.match(rows[0].text, /holding the company back/);
});

function gapGame(bItems) {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01']);   // company A's COO earns 13 per minute
  give(h, 'B', bItems);
  evaluateHints(h.ctx, h.game());
  return hints(h);
}

test('a gap of 9 coins per minute gets no hint', () => {
  assert.equal(gapGame(['O04-H', 'O05-F']).length, 0);   // company B's COO earns 4
});

test('a gap of exactly 10 gets a hint', () => {
  const rows = gapGame(['O04-H', 'O05-B']);              // company B's COO earns 3
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].company, rows[0].role], ['B', 'COO']);
});

test('a gap of 11 gets a hint', () => {
  assert.equal(gapGame(['O05-F']).length, 1);            // company B's COO earns 2
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/hints.js`

- [ ] **Step 3: Write the minimal implementation**

`src/hints.js`:

```js
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { effectiveRates } from './rates.js';
import { applicable } from './shop.js';
import { ideaOf } from './state.js';

const GAP = 10;
const COOLDOWN_MS = 60_000;
const ROLES = ['CTO', 'CMO', 'COO'];
const FAMILIES = { CTO: ['Core Features'], CMO: ['Target User', 'Ad Campaign'] };
const GENERIC = 'Your part of the sales is holding the company back. Check your shop section.';

export function suggest(ctx, game, company, role) {
  if (role === 'COO') return GENERIC;
  const idea = ideaOf(ctx, game, company);
  if (!idea) return GENERIC;
  const owned = new Map(ctx.db.prepare('SELECT * FROM owned WHERE game_id=? AND company=?').all(game.id, company).map((o) => [o.family, ctx.data.item(o.item_id)]));
  let best = null;
  for (const item of ctx.data.catalog) {
    if (!FAMILIES[role].includes(item.section) || !applicable(item, idea) || item.tierPoints == null) continue;
    const have = owned.get(item.family);
    if (item.tierPoints !== (have ? have.tierPoints : 0) + 1) continue;
    const cost = item.cost - (have ? have.cost : 0);
    if (!best || cost < best.cost) best = { item, have, cost };
  }
  if (!best) return GENERIC;
  return best.have
    ? `Upgrade ${best.item.name} from ${best.have.option} to ${best.item.option} for ${best.cost} coins`
    : `Buy ${best.item.name} (${best.item.option}) for ${best.cost} coins`;
}

export function latestHint(db, gameId, company, role, t) {
  const h = db.prepare('SELECT id, text, ts FROM hints WHERE game_id=? AND company=? AND role=? ORDER BY ts DESC, id DESC LIMIT 1').get(gameId, company, role);
  return h && t - h.ts < COOLDOWN_MS ? h : null;
}

export function evaluateHints(ctx, game) {
  const t = ctx.now();
  if (phaseAt(game, t).phase !== 'competition') return;

  for (const h of ctx.db.prepare('SELECT * FROM hints WHERE game_id=? AND acted IS NULL AND ts + ? <= ?').all(game.id, COOLDOWN_MS, t)) {
    const asked = ctx.db.prepare(
      `SELECT 1 FROM requests r JOIN participants p ON p.admission_id = r.requested_by
       WHERE r.game_id=? AND r.company=? AND p.role=? AND r.requested_at >= ? AND r.requested_at < ?`
    ).get(game.id, h.company, h.role, h.ts, h.ts + COOLDOWN_MS);
    ctx.db.prepare('UPDATE hints SET acted=? WHERE id=?').run(asked ? 1 : 0, h.id);
    logEvent(ctx.db, { ts: t, gameId: game.id, type: 'hint_result', payload: { hintId: h.id, company: h.company, role: h.role, acted: !!asked } });
  }

  const rates = { A: effectiveRates(ctx, game, 'A', t), B: effectiveRates(ctx, game, 'B', t) };
  for (const company of ['A', 'B']) {
    const rival = company === 'A' ? 'B' : 'A';
    for (const role of ROLES) {
      if (rates[rival][role] - rates[company][role] < GAP - 1e-9) continue;
      if (latestHint(ctx.db, game.id, company, role, t)) continue;
      const text = suggest(ctx, game, company, role);
      const info = ctx.db.prepare('INSERT INTO hints (game_id, company, role, ts, text) VALUES (?, ?, ?, ?, ?)').run(game.id, company, role, t, text);
      logEvent(ctx.db, { ts: t, gameId: game.id, type: 'hint_shown', payload: { hintId: Number(info.lastInsertRowid), company, role, text } });
    }
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hints.js test/hints.test.js
git commit -m "feat: hints based on the rival's same role, with a 60 second cooldown"
```

---

### Task 8: Countdown warnings and the closing of the shop

**Files:**
- Create: `src/warnings.js`, `test/warnings.test.js`
- Modify: `src/shop.js`, `src/views.js` (use `shopOpenAt`)

**Interfaces:**
- Produces:
  - `warningFor(clock) -> null | '5min' | '2min' | '30s' | 'last10'`: only in the `competition` phase: `last10` at 10 seconds or less left, `30s` at 30 or less, `2min` at 120 or less, `5min` at 300 or less.
  - `shopOpenAt(game, t) -> boolean`: the Shop phase, or the Competition phase with **more than 30 seconds left**.
  - `isShopOpen(phase)` from Plan 2 is **removed**; every call site (`validate` and `requireOpen` in `shop.js`, `shopView` in `views.js`) uses `shopOpenAt(game, ctx.now())`.

- [ ] **Step 1: Write the failing tests**

`test/warnings.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition, atSec } from './helpers.js';
import { warningFor, shopOpenAt } from '../src/warnings.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { viewFor } from '../src/views.js';

const c = (remainingSec, phase = 'competition') => ({ phase, remainingSec });

test('warnings appear at 5 minutes, 2 minutes, 30 seconds and the last 10 seconds', () => {
  assert.equal(warningFor(c(301)), null);
  assert.equal(warningFor(c(300)), '5min');
  assert.equal(warningFor(c(121)), '5min');
  assert.equal(warningFor(c(120)), '2min');
  assert.equal(warningFor(c(31)), '2min');
  assert.equal(warningFor(c(30)), '30s');
  assert.equal(warningFor(c(11)), '30s');
  assert.equal(warningFor(c(10)), 'last10');
  assert.equal(warningFor(c(0)), 'last10');
});

test('no warnings outside the competition', () => {
  assert.equal(warningFor(c(10, 'shop')), null);
  assert.equal(warningFor(c(5, 'ideation')), null);
});

test('the shop is open in the shop phase and until 30 seconds before the end of the competition', () => {
  const g = { startedAt: 0, ideationSavedSec: 0 };
  assert.equal(shopOpenAt(g, 400_000), true);
  assert.equal(shopOpenAt(g, 790_000), false); // summary card
  assert.equal(shopOpenAt(g, 900_000), true);
  assert.equal(shopOpenAt(g, 1_729_000), true);  // 31 s left
  assert.equal(shopOpenAt(g, 1_730_000), false); // 30 s left
  assert.equal(shopOpenAt(g, 1_761_000), false);
});

test('requests are refused in the last 30 seconds, and the CFO can no longer decide', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1700);
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  atSec(h, 1731);
  assert.throws(() => requestItem(h.ctx, h.game(), h.seat.A.COO, 'O01'), /shop is closed/);
  assert.throws(() => cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true), /shop is closed/);
});

test('the view reports the warning and the closed shop', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1735);
  const v = viewFor(h.ctx, h.seat.A.CMO);
  assert.equal(v.clock.warning, '30s');
  assert.equal(v.shop.open, false);
});
```

> **Note on the CFO test:** the Plan 2 rule says "the CFO decides one request at a time", and the director auto-rejects what is left at 0:00. The CFO of the last 30 seconds cannot approve anything: requests in the queue wait for the auto-reject. This follows the guide: "the CFO finishes the queue" is **not** possible once the shop is closed, so if you prefer to let the CFO finish the queue until 0:00, change the CFO check to use `phase === 'competition' || phase === 'shop'` and update the third assertion; ask your human partner first because it changes a rule in the guide (Section 2.0.2, "Shop at the end").

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/warnings.js`

- [ ] **Step 3: Write the minimal implementation**

`src/warnings.js`:

```js
import { phaseAt } from './phases.js';

export function warningFor(clock) {
  if (clock.phase !== 'competition') return null;
  const s = clock.remainingSec;
  if (s <= 10) return 'last10';
  if (s <= 30) return '30s';
  if (s <= 120) return '2min';
  if (s <= 300) return '5min';
  return null;
}

export function shopOpenAt(game, t) {
  const p = phaseAt(game, t);
  return p.phase === 'shop' || (p.phase === 'competition' && p.remainingSec > 30);
}
```

In `src/shop.js`: delete `isShopOpen`; add `import { shopOpenAt } from './warnings.js';`; in `validate` replace the first two lines with:

```js
  const phase = phaseAt(game, ctx.now()).phase;
  if (!shopOpenAt(game, ctx.now())) throw new Error('the shop is closed');
```

and in `requireOpen` replace the body with:

```js
  if (!shopOpenAt(game, ctx.now())) throw new Error('the shop is closed');
```

In `src/views.js`: replace the import of `isShopOpen` with `import { shopOpenAt, warningFor } from './warnings.js';`, change `const open = isShopOpen(phase) && !!idea;` to `const open = shopOpenAt(game, ctx.now()) && !!idea;`, and in `viewFor` after computing `clock` build `const clockOut = { ...clock, ...(warningFor(clock) ? { warning: warningFor(clock) } : {}) };` and return `clock: clockOut`. (Only the key `warning` is added, and only when it applies, so earlier tests that compare the whole `clock` object keep passing.)

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/warnings.js src/shop.js src/views.js test/warnings.test.js
git commit -m "feat: countdown warnings and the shop closing at 30 seconds"
```

---

### Task 9: Views for the Competition phase

**Files:**
- Modify: `src/views.js`, `test/views.test.js` (append tests in a new file `test/views-competition.test.js` instead)
- Create: `test/views-competition.test.js`

**Interfaces:**
- Produces in `viewFor` for an in-game player, **only when the phase is `competition`**: `competition = { rates: { CTO, CMO, COO, total } (rounded to one decimal), notices: [text], hint: { text } | null, shield: { owned, used } | null (COO only), attack: { options: [{ key, name, cost }], cooldownLeftSec, lockedReason } | null (CEO only) }`.
  - `notices` are the player's company notices that are still active and addressed to everyone or to the player's role (cover stories only).
  - `hint` is `latestHint` for the player's role (CTO, CMO, COO only).
  - `lockedReason` is `null` when the CEO can attack, otherwise one of `'cooldown'`, `'last minute'`.
- Produces in `organizerView().game`: `attacks: [{ id, attacker, victim, name, cost, at, endsAt, blocked, by }]` (**the real cause**), `eventUsed: key | null`, `injectionUsed: { company, coins } | null`.
- A player's `competition` block never contains the rival's rates, attacks, or the real cause.

- [ ] **Step 1: Write the failing tests**

`test/views-competition.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { viewFor, organizerView } from '../src/views.js';
import { launchAttack } from '../src/attacks.js';
import { evaluateHints } from '../src/hints.js';
import { triggerMarketEvent, injectCoins } from '../src/marketEvents.js';

test('there is no competition block before the competition', () => {
  const h = makeRunning(); atSec(h, 10);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).competition, undefined);
});

test('a player sees their company rates rounded to one decimal', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'M01-L', 'HC01']);
  const c = viewFor(h.ctx, h.seat.A.CFO).competition;
  assert.deepEqual(c.rates, { CTO: 1, CMO: 6.5, COO: 13, total: 20.5 });
});

test('the CEO sees the nine attacks and the cooldown, the others see no attack panel', () => {
  const h = toCompetition(makeRunning());
  const ceo = viewFor(h.ctx, h.seat.A.CEO).competition.attack;
  assert.equal(ceo.options.length, 9);
  assert.equal(ceo.lockedReason, null);
  assert.equal(viewFor(h.ctx, h.seat.A.CTO).competition.attack, null);
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'price_squeeze', () => 0);
  const after = viewFor(h.ctx, h.seat.A.CEO).competition.attack;
  assert.equal(after.lockedReason, 'cooldown');
  assert.equal(after.cooldownLeftSec, 90); // 30 s effect + 60 s cooldown
});

test('attacks show as a locked panel in the last minute', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 1710);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).competition.attack.lockedReason, 'last minute');
});

test('the victim sees only the cover story, and the attacker sees nothing of it', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  const b = viewFor(h.ctx, h.seat.B.CTO).competition;
  assert.deepEqual(b.notices, ['Stock market prices have fallen']);
  const json = JSON.stringify(viewFor(h.ctx, h.seat.B.CFO));
  assert.equal(/market_crash|Market Crash|attack/i.test(json), false);
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CTO).competition.notices, []);
});

test('notices end with the effect', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  atSec(h, 831);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CTO).competition.notices, []);
});

test('the shield notice goes only to the COO', () => {
  const h = toCompetition(makeRunning());
  give(h, 'B', ['O06']);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.shield, { owned: true, used: false });
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'market_crash', () => 0);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.notices, ['Insurance claim used']);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CTO).competition.notices, []);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.COO).competition.shield, { owned: true, used: true });
  assert.equal(viewFor(h.ctx, h.seat.B.CTO).competition.shield, null);
});

test('a role sees its own hint, others do not', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'O02', 'O03']);
  evaluateHints(h.ctx, h.game());
  assert.match(viewFor(h.ctx, h.seat.B.COO).competition.hint.text, /holding the company back/);
  assert.equal(viewFor(h.ctx, h.seat.B.CMO).competition.hint, null);
  assert.equal(viewFor(h.ctx, h.seat.B.CEO).competition.hint, null);
});

test('the organizer sees the real attacks, the event and the injection', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.A.CEO, 'bank_freeze', () => 0);
  triggerMarketEvent(h.ctx, h.game(), 'demand_surge');
  injectCoins(h.ctx, h.game(), 'B', 300);
  const g = organizerView(h.ctx).game;
  assert.equal(g.attacks[0].name, 'Bank Freeze');
  assert.deepEqual([g.attacks[0].attacker, g.attacks[0].victim, g.attacks[0].by], ['A', 'B', h.seat.A.CEO]);
  assert.equal(g.eventUsed, 'demand_surge');
  assert.deepEqual(g.injectionUsed, { company: 'B', coins: 300 });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `competition` is undefined

- [ ] **Step 3: Write the minimal implementation**

In `src/views.js` add imports:

```js
import { ATTACKS, attackCooldownUntil, hasShield } from './attacks.js';
import { effectiveRates } from './rates.js';
import { latestHint } from './hints.js';
```

Add this function:

```js
const round1 = (n) => Math.round(n * 10) / 10;

function competitionView(ctx, game, p, clock) {
  const t = ctx.now();
  const r = effectiveRates(ctx, game, p.company, t);
  const notices = ctx.db
    .prepare('SELECT text FROM notices WHERE game_id=? AND company=? AND (role IS NULL OR role=?) AND ts <= ? AND ? < until ORDER BY id')
    .all(game.id, p.company, p.role, t, t).map((n) => n.text);
  const hint = ['CTO', 'CMO', 'COO'].includes(p.role) ? latestHint(ctx.db, game.id, p.company, p.role, t) : null;
  let shield = null;
  if (p.role === 'COO') {
    const owns = !!ctx.db.prepare("SELECT 1 FROM owned WHERE game_id=? AND company=? AND family='O06'").get(game.id, p.company);
    shield = { owned: owns, used: owns && !hasShield(ctx.db, game.id, p.company) };
  }
  let attack = null;
  if (p.role === 'CEO') {
    const cooldownLeftSec = Math.max(0, Math.ceil((attackCooldownUntil(ctx.db, game.id, p.company) - t) / 1000));
    const lockedReason = clock.remainingSec <= 60 ? 'last minute' : cooldownLeftSec > 0 ? 'cooldown' : null;
    attack = { options: ATTACKS.map(({ key, name, cost }) => ({ key, name, cost })), cooldownLeftSec, lockedReason };
  }
  return {
    rates: { CTO: round1(r.CTO), CMO: round1(r.CMO), COO: round1(r.COO), total: round1(r.total) },
    notices, hint: hint && { text: hint.text }, shield, attack,
  };
}
```

In `viewFor`, add `...(clock.phase === 'competition' ? { competition: competitionView(ctx, game, p, clock) } : {})` to the returned object. In `organizerView`, inside the `game` object, add:

```js
      attacks: ctx.db.prepare('SELECT * FROM attacks WHERE game_id=? ORDER BY id').all(game.id).map((a) => ({
        id: a.id, attacker: a.attacker, victim: a.victim, name: ATTACKS.find((x) => x.key === a.key).name,
        cost: a.cost, at: a.launched_at, endsAt: a.end_at, blocked: !!a.blocked, by: a.launched_by,
      })),
      eventUsed: (ctx.db.prepare('SELECT key FROM market_events WHERE game_id=?').get(game.id) || {}).key ?? null,
      injectionUsed: (() => { const i = ctx.db.prepare('SELECT company, coins FROM injections WHERE game_id=?').get(game.id); return i ? { company: i.company, coins: i.coins } : null; })(),
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views.js test/views-competition.test.js
git commit -m "feat: competition views with cover stories, hints and the organizer attack log"
```

---

### Task 10: Server wiring (attacks, events, injection, the one-second pipeline)

**Files:**
- Modify: `src/server.js`
- Create: `test/competition-actions.test.js`

**Interfaces:**
- Produces: participant message `attack { key }` (reply: the usual `state`, plus a direct `{ type: 'attack_result', blocked }` to the sender only); organizer messages `market_event { key }` and `inject { company, coins }`.
- `tickAll()` now runs, in this order: the director, `tickEconomy`, `evaluateHints`, then sends ticks (with `warning` when there is one, only then) and **pushes state to everyone every second during the Competition** (rates and notices change continuously), and also after a hook ran.

- [ ] **Step 1: Write the failing tests**

`test/competition-actions.test.js`:

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
const done = async (app, ...ws) => { ws.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

async function competing() {
  const env = await boot();
  const o = await connect(env.url);
  await ask(o, { type: 'organizer', password: 'pw' });
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await ask(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await ask(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  env.setT(0);
  await ask(o, { type: 'start_game', problemId: 1 });
  env.setT(200_000);
  const a = await connect(env.url); await ask(a, { type: 'login', admissionId: 'S0' }); // A CEO
  const b = await connect(env.url); await ask(b, { type: 'login', admissionId: 'S5' }); // B CEO
  await ask(a, { type: 'pick', ideaId: 'H1' });
  await ask(b, { type: 'pick', ideaId: 'S1' });
  env.setT(800_000);
  return { ...env, o, a, b };
}

test('the CEO attacks and gets a direct result; the organizer sees the real cause', async () => {
  const env = await competing();
  const res = next(env.a);
  env.a.send(JSON.stringify({ type: 'attack', key: 'price_squeeze' }));
  const first = await res;
  assert.ok(first.type === 'attack_result' || first.type === 'state');
  assert.equal(env.db.prepare('SELECT key FROM attacks').get().key, 'price_squeeze');
  await done(env.app, env.o, env.a, env.b);
});

test('a non-CEO attack is refused with an error', async () => {
  const env = await competing();
  const cto = await connect(env.url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  assert.deepEqual(await ask(cto, { type: 'attack', key: 'market_crash' }), { type: 'error', error: 'only the CEO can attack' });
  await done(env.app, env.o, env.a, env.b, cto);
});

test('the organizer triggers one event and one injection', async () => {
  const env = await competing();
  assert.equal((await ask(env.o, { type: 'market_event', key: 'demand_surge' })).type, 'state');
  assert.deepEqual(await ask(env.o, { type: 'market_event', key: 'demand_slump' }), { type: 'error', error: 'an event was already used in this game' });
  assert.equal((await ask(env.o, { type: 'inject', company: 'A', coins: 500 })).type, 'state');
  assert.equal(env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1500);
  await done(env.app, env.o, env.a, env.b);
});

test('every tick in the competition earns coins and pushes fresh state', async () => {
  const env = await competing();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O01', 'O01', 0, 60)").run();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O02', 'O02', 0, 100)").run();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O03', 'O03', 0, 150)").run();
  env.app.tickAll(); // first tick at the start of the competition
  env.setT(805_000);
  const msgs = [];
  env.a.on('message', (d) => msgs.push(JSON.parse(d)));
  env.app.tickAll();
  await new Promise((r) => setTimeout(r, 100));
  const state = msgs.find((m) => m.type === 'state');
  assert.ok(state, 'a state message was pushed');
  assert.equal(state.view.competition.rates.COO, 27);
  assert.equal(env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1002);
  await done(env.app, env.o, env.a, env.b);
});

test('the tick carries the warning only when there is one', async () => {
  const env = await competing();
  env.setT(1_470_000); // 290 s left
  const got = [];
  env.a.on('message', (d) => got.push(JSON.parse(d)));
  env.app.tickAll();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(got.find((m) => m.type === 'tick').warning, '5min');
  await done(env.app, env.o, env.a, env.b);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`attack`, `market_event` and `inject` are unknown messages)

- [ ] **Step 3: Write the minimal implementation**

In `src/server.js` add imports:

```js
import { launchAttack } from './attacks.js';
import { triggerMarketEvent, injectCoins } from './marketEvents.js';
import { tickEconomy } from './economy.js';
import { evaluateHints } from './hints.js';
import { warningFor } from './warnings.js';
```

Add to `organizerActions`:

```js
    market_event: (m) => { const g = activeGame(db); if (!g) throw new Error('no game is running'); triggerMarketEvent(ctx, g, m.key); },
    inject: (m) => { const g = activeGame(db); if (!g) throw new Error('no game is running'); injectCoins(ctx, g, m.company, m.coins); },
```

Add to `participantActions`:

```js
    attack: (id, m, g) => launchAttack(ctx, g, id, m.key),
```

In the participant branch of the message handler, keep the result of the action and send the direct reply for attacks; replace the participant branch with:

```js
        } else if (s.kind === 'participant' && participantActions[msg.type]) {
          const game = activeGame(db);
          if (!game) throw new Error('no game is running');
          const result = participantActions[msg.type](s.admissionId, msg, game);
          if (msg.type === 'attack') send(ws, { type: 'attack_result', blocked: !!(result && result.blocked) });
        } else {
```

Replace `tickAll` with:

```js
  function tickAll() {
    const changed = runDirector(ctx);
    const game = activeGame(db);
    let competing = false;
    if (game) {
      tickEconomy(ctx, game);
      evaluateHints(ctx, game);
      const t = now();
      const clock = phaseAt(game, t);
      competing = clock.phase === 'competition';
      const warning = warningFor(clock);
      const tick = { type: 'tick', serverNow: t, ...clock, gameId: game.id, ...(warning ? { warning } : {}) };
      for (const [ws, s] of sessions) {
        if (s.kind === 'organizer') { send(ws, tick); continue; }
        const p = db.prepare('SELECT status, game_id FROM participants WHERE admission_id = ?').get(s.admissionId);
        if (p && p.status === 'in_game' && p.game_id === game.id) send(ws, tick);
      }
    }
    if (changed || competing) pushAll();
  }
```

> The test "the tick carries the warning only when there is one" expects the `tick` message for the sender. Because `pushAll` also sends `state`, the tests above look the messages up by `type` instead of expecting a fixed order.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (all earlier tests too; Plan 1's tick test is unaffected because the tick has no `warning` outside the last 5 minutes of the Competition)

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/competition-actions.test.js
git commit -m "feat: attack, event and injection messages, and the one-second competition pipeline"
```

---

### Task 11: Competition screens

**Files:**
- Modify: `public/render.js`, `public/render-organizer.js`, `public/app.js`, `public/organizer.js`, `public/styles.css`
- Create: `test/render-competition.test.js`

**Interfaces:**
- Produces in `public/render.js`: `renderScreen` for the `competition` phase now returns `renderCompetition(view)` = header (with a banner for the active `clock.warning`), the company notices, the hint side card, a rates panel (CTO, CMO and COO coins per minute, total), the CEO's attack panel, the COO's shield status, and then the same shop body as Plan 2. The old `shop(v)` is split into `shopBody(v)` (everything below the header) so both phases share it.
- Banner texts: `5min` "5 minutes left", `2min` "2 minutes left", `30s` "30 seconds left: the shop is closed", `last10` "Last 10 seconds". The `#clock` element gets the class `red` when `warning === 'last10'`.
- Attack buttons: `data-send` `{"type":"attack","key":"<key>"}`; disabled when `attack.lockedReason` is set; the cooldown text shows the seconds left.
- Organizer render: an "Attacks (real cause)" list per game (attacker, victim, name, cost, blocked), market event buttons (disabled once used), and an injection form (company, coins, disabled once used). Buttons use ids `ev-demand_surge`, `ev-demand_slump`, `ev-shop_sale`, `inject-go`, fields `inject-company`, `inject-coins`.
- `app.js` handles `attack_result` by showing a toast: `"Attack blocked"` or `"Attack launched"`.

- [ ] **Step 1: Write the failing tests**

`test/render-competition.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from '../public/render.js';
import { renderOrganizer } from '../public/render-organizer.js';

const view = (role, comp = {}, clock = { phase: 'competition', remainingSec: 500 }) => ({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role, status: 'in_game' },
  screen: 'game', clock, problem: { id: 1, title: 'Food waste', statement: '' }, wallet: 1234,
  idea: { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: '' },
  ideation: null, owned: [], summary: null,
  shop: { open: true, catalog: [], mine: [], ...(role === 'CFO' ? { queue: [] } : {}) },
  competition: { rates: { CTO: 6.5, CMO: 13, COO: 20, total: 39.5 }, notices: [], hint: null, shield: null, attack: null, ...comp },
});

test('the competition screen shows the wallet and each role rate', () => {
  const html = renderScreen(view('CTO'));
  assert.match(html, /1234/);
  assert.match(html, /39\.5/);
  assert.match(html, /6\.5/);
  assert.match(html, /per minute/);
});

test('notices are shown as plain business messages', () => {
  const html = renderScreen(view('CTO', { notices: ['Stock market prices have fallen'] }));
  assert.match(html, /Stock market prices have fallen/);
});

test('a hint is a hideable side card', () => {
  const html = renderScreen(view('COO', { hint: { text: 'Your part of the sales is holding the company back.' } }));
  assert.match(html, /holding the company back/);
  assert.match(html, /class="hint/);
  assert.match(html, /aria-label="Hint"/);
});

test('only the CEO sees attack buttons, and they are disabled during the cooldown', () => {
  const attack = { options: [{ key: 'market_crash', name: 'Market Crash', cost: 450 }], cooldownLeftSec: 42, lockedReason: 'cooldown' };
  assert.equal(renderScreen(view('CTO')).includes('"type":"attack"'), false);
  const ceo = renderScreen(view('CEO', { attack }));
  assert.match(ceo, /"type":"attack","key":"market_crash"/);
  assert.match(ceo, /disabled/);
  assert.match(ceo, /42/);
  const ready = renderScreen(view('CEO', { attack: { ...attack, lockedReason: null, cooldownLeftSec: 0 } }));
  assert.equal(/disabled/.test(ready.split('"type":"attack"')[1].split('</button>')[0]), false);
});

test('the COO sees the shield status', () => {
  assert.match(renderScreen(view('COO', { shield: { owned: true, used: false } })), /Shield ready/);
  assert.match(renderScreen(view('COO', { shield: { owned: true, used: true } })), /Shield used/);
  assert.match(renderScreen(view('COO', { shield: { owned: false, used: false } })), /No shield/);
});

test('warnings show a banner and the last ten seconds turn the clock red', () => {
  assert.match(renderScreen(view('CTO', {}, { phase: 'competition', remainingSec: 280, warning: '5min' })), /5 minutes left/);
  assert.match(renderScreen(view('CTO', {}, { phase: 'competition', remainingSec: 25, warning: '30s' })), /shop is closed/);
  const red = renderScreen(view('CTO', {}, { phase: 'competition', remainingSec: 8, warning: 'last10' }));
  assert.match(red, /id="clock" class="red"/);
});

test('hostile notice text is escaped', () => {
  const html = renderScreen(view('CTO', { notices: ['<img src=x onerror=alert(1)>'] }));
  assert.equal(html.includes('<img src=x'), false);
});

const organizer = (over = {}) => ({
  screen: 'organizer', problems: [], participants: [],
  game: {
    id: 1, problemId: 1, clock: { phase: 'competition', remainingSec: 400 },
    companies: { A: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] }, B: { wallet: 1, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] } },
    attacks: [{ id: 1, attacker: 'A', victim: 'B', name: 'Market Crash', cost: 450, at: 0, endsAt: 40000, blocked: false, by: 'S0' }],
    eventUsed: null, injectionUsed: null, ...over,
  },
});

test('the organizer sees the real attack cause, event buttons and the injection form', () => {
  const html = renderOrganizer(organizer());
  assert.match(html, /Market Crash/);
  assert.match(html, /Company A attacked Company B/);
  assert.match(html, /id="ev-demand_surge"/);
  assert.match(html, /id="inject-go"/);
});

test('used events and injections are disabled', () => {
  const html = renderOrganizer(organizer({ eventUsed: 'shop_sale', injectionUsed: { company: 'A', coins: 500 } }));
  assert.match(html, /id="ev-demand_surge" disabled/);
  assert.match(html, /id="inject-go" disabled/);
  assert.match(html, /500 coins to Company A/);
});

test('a blocked attack is marked as blocked', () => {
  const v = organizer();
  v.game.attacks[0].blocked = true;
  assert.match(renderOrganizer(v), /blocked/i);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (`renderScreen` still shows the plain shop in the competition)

- [ ] **Step 3: Write the minimal implementation**

In `public/render.js`:

1. Change `header(v)` so the clock element reads `<span id="clock"${v.clock.warning === 'last10' ? ' class="red"' : ''}>${fmtClock(v.clock.remainingSec)}</span>`.
2. Rename the body of `shop(v)` (everything after the header) into `export function shopBody(v)` and make `shop(v)` return `${header(v)}${shopBody(v)}`.
3. Add:

```js
const BANNERS = {
  '5min': '5 minutes left',
  '2min': '2 minutes left',
  '30s': '30 seconds left: the shop is closed',
  last10: 'Last 10 seconds',
};

function ratesPanel(c) {
  const r = c.rates;
  return `<section class="card rates"><h3>Sales per minute</h3>
  <ul><li>CTO <b>${esc(r.CTO)}</b></li><li>CMO <b>${esc(r.CMO)}</b></li><li>COO <b>${esc(r.COO)}</b></li></ul>
  <p class="big">${esc(r.total)} coins per minute</p></section>`;
}

function attackPanel(c) {
  const a = c.attack;
  if (!a) return '';
  const lock = a.lockedReason === 'cooldown' ? `Ready in ${a.cooldownLeftSec} s` : a.lockedReason === 'last minute' ? 'Attacks are closed for the last minute' : '';
  const buttons = a.options.map((o) => `<button data-send='${JSON.stringify({ type: 'attack', key: o.key }).replace(/'/g, '&#39;')}'${a.lockedReason ? ' disabled' : ''}>${esc(o.name)} (${esc(o.cost)})</button>`).join('');
  return `<section class="card attacks"><h3>Attacks</h3>${lock ? `<p class="muted">${esc(lock)}</p>` : ''}${buttons}</section>`;
}

function shieldPanel(c) {
  if (!c.shield) return '';
  const t = !c.shield.owned ? 'No shield' : c.shield.used ? 'Shield used' : 'Shield ready';
  return `<section class="card"><h3>${esc(t)}</h3></section>`;
}

function hintCard(c) {
  if (!c.hint) return '';
  return `<aside class="hint" aria-label="Hint"><details open><summary>Hint</summary><p>${esc(c.hint.text)}</p></details></aside>`;
}

function renderCompetition(v) {
  const c = v.competition;
  const banner = v.clock.warning ? `<p class="banner ${esc(v.clock.warning)}" role="status">${esc(BANNERS[v.clock.warning])}</p>` : '';
  const notices = c.notices.map((n) => `<p class="notice">${esc(n)}</p>`).join('');
  return `${header(v)}${banner}${notices}<main>${hintCard(c)}${ratesPanel(c)}${attackPanel(c)}${shieldPanel(c)}</main>${shopBody(v)}`;
}
```

and in `renderScreen` change `case 'competition': return shop(v);` to `case 'competition': return renderCompetition(v);` (keep `case 'shop': return shop(v);`).

In `public/render-organizer.js`, extend the running-game branch of `renderOrganizer`:

```js
function control(g) {
  const ev = (key, label) => `<button id="ev-${key}"${g.eventUsed ? ' disabled' : ''}>${label}</button>`;
  const log = g.attacks.length
    ? g.attacks.map((a) => `<li>Company ${esc(a.attacker)} attacked Company ${esc(a.victim)}: ${esc(a.name)} (${esc(a.cost)} coins)${a.blocked ? ' blocked by a shield' : ''}, by ${esc(a.by)}</li>`).join('')
    : '<li class="muted">No attacks yet</li>';
  return `<section class="card"><h2>Attacks (real cause)</h2><ul>${log}</ul></section>
  <section class="card"><h2>Market event (one per game)</h2>${ev('demand_surge', 'Demand Surge')}${ev('demand_slump', 'Demand Slump')}${ev('shop_sale', 'Shop Sale')}
  ${g.eventUsed ? `<p class="muted">Used: ${esc(g.eventUsed)}</p>` : ''}</section>
  <section class="card"><h2>Coin injection (once, up to 500)</h2>
  <select id="inject-company"><option>A</option><option>B</option></select>
  <input id="inject-coins" type="number" min="1" max="500" value="100">
  <button id="inject-go"${g.injectionUsed ? ' disabled' : ''}>Add coins</button>
  ${g.injectionUsed ? `<p class="muted">Added ${esc(g.injectionUsed.coins)} coins to Company ${esc(g.injectionUsed.company)}</p>` : ''}</section>`;
}
```

and render `${control(v.game)}` after the two company panels inside the running-game `<main>`. In the test the used injection must read `500 coins to Company A`, so the muted line is `Added ${coins} coins to Company ${company}`.

In `public/organizer.js` add to the click handler:

```js
  if (id && id.startsWith('ev-')) send({ type: 'market_event', key: id.slice(3) });
  if (id === 'inject-go') send({ type: 'inject', company: document.getElementById('inject-company').value, coins: Number(document.getElementById('inject-coins').value) });
```

In `public/app.js` add to `onmessage`:

```js
    } else if (m.type === 'attack_result') {
      showToast(m.blocked ? 'Attack blocked' : 'Attack launched');
```

Add to `public/styles.css`: `#clock.red { color: var(--warn); }`, `.banner { margin: 0; padding: 8px 16px; font-weight: 700; background: var(--accent); color: var(--accent-ink); }`, `.banner.last10, .banner.30s { background: var(--warn); }` (note: a class name starting with a digit needs escaping, so use `.banner[class~="30s"]`), `.notice { margin: 0; padding: 8px 16px; background: var(--card); border-left: 4px solid var(--warn); }`, `.hint { position: sticky; top: 56px; z-index: 2; margin: 8px 0; }` and `.hint details { background: var(--card); border: 1px solid var(--accent); border-radius: 8px; padding: 8px 12px; }`.

Then run the **frontend-design skill** on `public/styles.css` only, with this brief for the Competition screen: a live trading-floor feel; the wallet, the clock and the sales per minute are the three biggest numbers; the CEO's attack panel is dark and slightly secretive; the hint card is calm and never blocks the shop; warnings escalate in colour from 5 minutes to the last 10 seconds.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Check it by hand in a real browser**

Run two games' worth of the Plan 2 walk-through, but jump the Competition forward: in the organizer console start a game with the real timers, or to save time temporarily set `BASE` seconds with the environment variable `SHOWDOWN_SPEED=10` **only if** you add such a flag in a separate task. Without a speed flag, wait through the first 13 minutes once, then check: sales per minute rise after the CFO approves purchases; the CEO attack lands and the victim sees only the cover story; a hint appears on the weaker side; the 5 minute, 2 minute, 30 second warnings and the red clock appear; the shop closes at 30 seconds; at 0:00 everything locks.

- [ ] **Step 6: Commit**

```bash
git add public test/render-competition.test.js
git commit -m "feat: competition screens, attack panel, hint card and organizer controls"
```

---

## Self-review against the spec

**Spec coverage (this plan's slice):**
- Steady coin trickle, equal thirds by role, better purchases earn more with the agreed numbers: Tasks 1, 4.
- Per-role contribution recorded over time for the graphs, every 5 seconds: Task 4 (`samples`).
- Hints (rival's same role, 10 or more, 60 s cooldown, named upgrade for CTO and CMO, general for COO, side card): Tasks 7, 9, 11.
- Attacks (CEO only, nine attacks, costs, 30 to 45 s, cooldown after the effect, no CFO approval, cover stories, no attacks in the last 60 s, may go below -200): Task 5. Shield (150 coins, one per game, blocked message, disguised notice): Tasks 5, 9. Organizer sees the real cause: Task 9.
- Market events (three, one per game, both companies) and the 500-coin injection: Task 6.
- Countdown warnings and closings (5 min, 2 min, 30 s, red last 10 s, shop closes at 30 s, attacks lock at 60 s): Tasks 5, 8, 11.
- Everything logged: `attack`, `market_event`, `coin_injection`, `hint_shown`, `hint_result`, plus the Plan 2 events.
- Not in this plan on purpose: the CFO's mini games and their coins (Plan 4; `mini_coins` and the Mini-Game Jam kind `minigame_half` are already in place), the end graphs and Excel (Plan 5).

**Placeholder scan:** two tests carry short "note for the implementer" paragraphs where the exact arithmetic or setup is better rewritten while implementing (the Task 3 attack-effects test and the Task 7 boundary test); both state the exact values to use. The Task 8 note asks the human partner before changing a guide rule.

**Type consistency:** `ctx`, `game`, the attack and event tables, `effectiveRates(ctx, game, company, t, opts)`, `tickEconomy(ctx, game)`, `evaluateHints(ctx, game)`, `launchAttack(ctx, game, id, key, rng)`, the message names and the view fields are the same in Tasks 3 to 11.

**Interface changes to earlier plans:** `isShopOpen` is removed in favour of `shopOpenAt`; `chargeFor` applies Shop Sale; `requestItem` and `cfoDecide` honour the locks; `company_state` gained columns; `tickAll` gained the economy and hint steps and a per-second push in the Competition.
