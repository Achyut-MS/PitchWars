# Startup Showdown: Plan 6 of 7, Deployment and Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the whole game works and make it easy to run on the day: a full automated game from login to Excel export, a balance simulator, the Pi's own Wi-Fi, an installer that starts the game at power-up, a printable join sign with QR codes, a load test with 14 devices, and a written event-day checklist.

**Architecture:** Mostly scripts and tests around the finished game. The one new piece of game code is a speed clock for rehearsals (`SHOWDOWN_SPEED=10` plays 30 minutes in 3). The end-to-end test drives the real server with real WebSocket clients and a fake clock, so a whole game runs in a few seconds.

**Tech Stack:** adds `qrcode` (dev and install time only; it makes the join sign). Shell scripts for the Pi (`nmcli`, `systemctl`).

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md`, Sections 0, 6, 7, 8 (Organizer Watch-Outs), 11. Plans 1 to 5 must be finished first.

## Global Constraints

- Everything from the Global Constraints of Plans 1 to 5 still applies.
- **The Pi runs its own Wi-Fi hotspot:** a fixed address (default `10.42.0.1`), a network name and password that are the same at every event, no internet.
- **Players type the numeric address** (and may scan a QR code). `showdown.local` is **not** used.
- **The game starts by itself** when the Pi powers on and restarts itself if it crashes (Plan 1), reading its settings from `/etc/showdown.env` (the organizer password is never in the code or in the service file).
- **Load:** about 14 devices at once (10 players, the organizer, and a few spare). The one-second tick must reach 95% of devices within the budget set in Task 6.
- **Rehearsal speed** exists only for testing: the default is real time, and a speed above 1 must be set deliberately with an environment variable.
- **Balance numbers come from the simulator,** not from guesses: a careful buyer with 1,000 coins should earn about 60 to 80 coins per minute, about 1,000 coins over the Competition.

## Review Focus

1. **The hotspot and install scripts must never print the organizer password or leave it world-readable** (Task 4 tests the first; the env file is created with mode 600).
2. **A weak password** (too short for WPA, or an empty organizer password) must stop the scripts before they change anything (Task 4).
3. **A full game with a skipped phase** (a restart in the middle) must not lose data; the end-to-end test covers a normal game, and the checklist covers a restart rehearsal (Tasks 2 and 7).
4. **Speed settings leaking into the event:** the speed clock must default to 1 and ignore nonsense values (Task 5).
5. **The sign** must escape the Wi-Fi name and password, or a `;` in the password would produce a QR code that joins the wrong network (Task 3).
6. **Load tests that pass on a fast laptop and fail on the Pi:** the test must be run on the Pi itself over the hotspot (Task 6, Task 7).

## File Structure

```
scripts/simulate-balance.js  make-sign.js  loadtest.js  loadtest-stats.js
deploy/setup-hotspot.sh  install.sh  showdown.service
src/clock.js                       speedClock
src/index.js                       (modify) env: SHOWDOWN_SPEED, BACKUP_DIR, EXPORT_DIR
docs/event-day-checklist.md
test/balance.test.js  e2e-full-game.test.js  deploy.test.js  sign.test.js  clock.test.js  loadtest-stats.test.js
```

---

### Task 1: The balance simulator

**Files:**
- Create: `scripts/simulate-balance.js`, `test/balance.test.js`

**Interfaces:**
- Consumes: `loadData` (Plan 2), `roleRates` (Plan 3)
- Produces: `simulateBuyer(data, type, wallet = 1000, floor = 0) -> { ids, walletLeft, roles, ratePerMinute, earnedOver16Minutes }` (a careful buyer who always takes the purchase with the most extra coins per minute per coin spent, never going below `floor`) and `report(data) -> string` (a table). Running `node scripts/simulate-balance.js` prints the table.
- This code was run before this plan was written (5 tests passed). Its output with the approved catalog:

```
type       floor   per minute   CTO    CMO    COO    earned in 16 min   coins left
hardware       0         71.0   13.0   31.0   27.0               1136           50
hardware    -200         78.0   20.0   31.0   27.0               1248         -170
software       0         71.0   13.0   31.0   27.0               1136           50
software    -200         78.0   20.0   31.0   27.0               1248         -170
```

**What the numbers say:** a careful company earns about **71 coins per minute, roughly 1,140 coins** in the 16 minutes (about 1,250 with the extra 200 coins of debt), close to the guide's target of about 1,000. Buying everything at the top tier would cost about 2,150 coins for about 81 coins per minute, matching the "premium is about 80" target. **History:** the first version of this table (CTO level averaged over all six feature slots) gave the CTO only 6.5 coins per minute against 31 for the CMO and 27 for the COO, so the guide was changed (decided) so that **the CTO's level counts its best three features**; the table above is the result. The CTO is still the weakest earner per coin, but its bar on the end graph is now about as long as half of the CMO's.

- [ ] **Step 1: Write the failing tests**

`test/balance.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../src/data.js';
import { simulateBuyer, report } from '../scripts/simulate-balance.js';

const data = loadData('data');

test('a careful buyer with 1,000 coins earns about 60 to 80 coins per minute, about 1,000 over the competition', () => {
  for (const type of ['hardware', 'software']) {
    const r = simulateBuyer(data, type, 1000, 0);
    assert.ok(r.ratePerMinute >= 55 && r.ratePerMinute <= 80, `${type} ${r.ratePerMinute}`);
    assert.ok(r.earnedOver16Minutes >= 900 && r.earnedOver16Minutes <= 1300);
  }
});

test('the buyer never goes below the floor and spends nearly everything', () => {
  for (const floor of [0, -200]) {
    const r = simulateBuyer(data, 'hardware', 1000, floor);
    assert.ok(r.walletLeft >= floor);
    assert.ok(r.walletLeft - floor < 120);
  }
});

test('the extra 200 coins of debt buys a higher rate', () => {
  assert.ok(simulateBuyer(data, 'software', 1000, -200).ratePerMinute > simulateBuyer(data, 'software', 1000, 0).ratePerMinute);
});

test('the report has a line for each type and floor', () => {
  assert.equal(report(data).split('\n').length, 5);
});

test('with almost no coins the buyer buys little and earns little', () => {
  const r = simulateBuyer(data, 'hardware', 100, 0);
  assert.ok(r.ratePerMinute < 20);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../scripts/simulate-balance.js`

- [ ] **Step 3: Write the implementation**

`scripts/simulate-balance.js`:

```js
import { loadData } from '../src/data.js';
import { roleRates } from '../src/levels.js';

const MANAGED_ROLES = ['CTO', 'CMO', 'COO'];

function offers(data, type) {
  const families = new Map();
  for (const item of data.catalog) {
    if (!MANAGED_ROLES.includes(item.role) || item.section === 'Protection') continue;
    if (item.appliesTo !== 'both' && item.appliesTo !== type) continue;
    if (!families.has(item.family)) families.set(item.family, []);
    families.get(item.family).push(item);
  }
  return families;
}

// A careful buyer: always takes the purchase that adds the most coins per minute for each coin spent,
// and never takes the wallet below `floor`.
export function simulateBuyer(data, type, wallet = 1000, floor = 0) {
  const families = offers(data, type);
  const owned = new Map();
  const total = (map) => {
    const r = roleRates(data, [...map.values()].map((i) => i.id));
    return r.CTO + r.CMO + r.COO;
  };
  for (;;) {
    const now = total(owned);
    let best = null;
    for (const [family, items] of families) {
      const have = owned.get(family);
      for (const item of items) {
        if (have && (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0))) continue;
        const cost = item.cost - (have ? have.cost : 0);
        if (wallet - cost < floor) continue;
        const gain = total(new Map(owned).set(family, item)) - now;
        const score = gain / cost;
        if (gain > 0 && (!best || score > best.score)) best = { family, item, cost, score };
      }
    }
    if (!best) break;
    owned.set(best.family, best.item);
    wallet -= best.cost;
  }
  const ids = [...owned.values()].map((i) => i.id);
  const roles = roleRates(data, ids);
  const rate = roles.CTO + roles.CMO + roles.COO;
  return { ids, walletLeft: wallet, roles, ratePerMinute: rate, earnedOver16Minutes: rate * 16 };
}

export function report(data) {
  const lines = ['type       floor   per minute   CTO    CMO    COO    earned in 16 min   coins left'];
  for (const type of ['hardware', 'software']) {
    for (const floor of [0, -200]) {
      const r = simulateBuyer(data, type, 1000, floor);
      lines.push(`${type.padEnd(10)} ${String(floor).padStart(5)}   ${r.ratePerMinute.toFixed(1).padStart(10)}   ${r.roles.CTO.toFixed(1).padStart(4)}   ${r.roles.CMO.toFixed(1).padStart(4)}   ${r.roles.COO.toFixed(1).padStart(4)}   ${r.earnedOver16Minutes.toFixed(0).padStart(16)}   ${String(r.walletLeft).padStart(10)}`);
    }
  }
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('simulate-balance.js')) console.log(report(loadData('data')));
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test && node scripts/simulate-balance.js`
Expected: PASS, and the table above

- [ ] **Step 5: Commit**

```bash
git add scripts/simulate-balance.js test/balance.test.js
git commit -m "feat: balance simulator for the shop and the coin curve"
```

---

### Task 2: A full game, end to end

**Files:**
- Create: `test/e2e-full-game.test.js`

**Interfaces:**
- Consumes: everything from Plans 1 to 5 through the real WebSocket and HTTP interfaces, with a fake clock (`now`) that the test moves forward one second at a time and `app.tickAll()` called once per second.
- Produces: one long test that walks a complete game and checks the recorded data. It has no production code of its own; if it fails, fix the earlier plan's code.

The test plays this game (all times are game seconds): roster of 12 players imported, ten assigned (A: S0 to S4, B: S5 to S9), start; **10 s** two players swap seats and swap back; **190 s** votes, both CEOs pick (Ideation ends early); in the Shop the CMO, COO and CTO of company A buy things (the CEO approves the feature, the CFO approves each request), company B's COO buys the shield; **790 s** a request during the summary card is refused; **800 s** the Competition starts; the A CFO starts a puzzle and skips three (the third costs 10 coins); **820 s** the A CEO attacks company B and is blocked by the shield; **900 s** the organizer triggers Demand Surge; the A CEO attacks again and it lands; **950 s** the organizer adds 500 coins to A; the B CFO submits a wrong puzzle answer; **1762 s** the game has ended; players see only "Thank you"; the organizer reveals; a player reconnects and still sees the graphs; Next Game; the organizer downloads the Excel files.

- [ ] **Step 1: Write the test**

`test/e2e-full-game.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { readWorkbook } from '../src/xlsx.js';

const data = loadData('data');
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(ws) {
    this.ws = ws; this.ring = []; this.seq = 0; this.latest = {};
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      this.seq++;
      this.latest[m.type] = m;
      this.ring.push({ seq: this.seq, m });
      if (this.ring.length > 300) this.ring.shift();
    });
  }
  static async connect(port) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return new Bot(ws);
  }
  // Sends one message and returns the messages that came back.
  async say(msg) {
    await settle();
    const mark = this.seq;
    this.ws.send(JSON.stringify(msg));
    await settle();
    return this.ring.filter((x) => x.seq > mark).map((x) => x.m);
  }
  state() { return this.latest.state && this.latest.state.view; }
}
const errors = (msgs) => msgs.filter((m) => m.type === 'error').map((m) => m.error);

const get = (port, path) => new Promise((resolve) => {
  http.get({ port, path }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c) })); });
});

test('a whole game from the roster to the Excel export', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, exportDir: join(dir, 'exports'), backupDir: join(dir, 'backups') });
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const bots = [];
  const bot = async () => { const b = await Bot.connect(port); bots.push(b); return b; };

  async function advanceTo(sec) {
    for (let s = Math.floor(t / 1000) + 1; s <= sec; s++) {
      t = s * 1000;
      app.tickAll();
      if (s % 25 === 0) await new Promise((r) => setImmediate(r));
    }
    await settle(60);
  }

  try {
    // Organizer, roster and seats
    const org = await bot();
    const welcome = (await org.say({ type: 'organizer', password: 'pw' })).find((m) => m.type === 'welcome');
    assert.ok(welcome.token);
    let roster = '';
    for (let i = 0; i < 12; i++) roster += `S${i},Player ${i}\n`;
    assert.deepEqual(errors(await org.say({ type: 'roster_import', text: roster })), []);
    const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
    for (let i = 0; i < 10; i++) assert.deepEqual(errors(await org.say({ type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] })), []);
    assert.deepEqual(errors(await org.say({ type: 'start_game', problemId: 1 })), []);

    const p = [];
    for (let i = 0; i < 10; i++) {
      const b = await bot();
      assert.equal((await b.say({ type: 'login', admissionId: `S${i}` })).find((m) => m.type === 'welcome').view, 'game');
      await b.say({ type: 'sync' });
      p.push(b);
    }
    const [aCeo, aCto, aCfo, aCmo, aCoo, bCeo, bCto, bCfo, bCmo, bCoo] = p;

    // Briefing: seats can change now, and not later
    await advanceTo(10);
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S6' })), []);
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S6' })), []);

    // Ideation: votes, picks, early end
    await advanceTo(190);
    await org.say({ type: 'sync' });
    assert.equal(org.state().game.clock.phase, 'ideation');
    assert.deepEqual(errors(await aCto.say({ type: 'vote', ideaId: 'H1' })), []);
    assert.deepEqual(errors(await aCto.say({ type: 'pick', ideaId: 'H1' })), ['only the CEO can pick']);
    assert.deepEqual(errors(await aCeo.say({ type: 'pick', ideaId: 'H1' })), []);
    assert.deepEqual(errors(await bCeo.say({ type: 'pick', ideaId: 'S1' })), []);
    assert.equal(org.state().game.clock.phase, 'shop');
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S2' })), ['seats are locked after the briefing']);

    // Shop: request, approve, in order
    const approveHead = async (cfo, approve = true) => {
      await cfo.say({ type: 'sync' });
      const head = cfo.state().shop.queue.find((r) => r.head);
      return errors(await cfo.say({ type: 'cfo_decide', requestId: head.id, approve }));
    };
    assert.deepEqual(errors(await aCmo.say({ type: 'request', itemId: 'M01-L' })), []);
    assert.deepEqual(await approveHead(aCfo), []);
    for (const id of ['O01', 'O02', 'O03']) {
      assert.deepEqual(errors(await aCoo.say({ type: 'request', itemId: id })), []);
      assert.deepEqual(await approveHead(aCfo), []);
    }
    assert.deepEqual(errors(await aCto.say({ type: 'request', itemId: 'F01-B' })), []);
    await aCeo.say({ type: 'sync' });
    const waiting = aCeo.state().shop.awaitingCeo[0];
    assert.deepEqual(errors(await aCeo.say({ type: 'ceo_decide', requestId: waiting.id, approve: true })), []);
    assert.deepEqual(await approveHead(aCfo), []);
    assert.deepEqual(errors(await bCoo.say({ type: 'request', itemId: 'O06' })), []);
    assert.deepEqual(await approveHead(bCfo), []);
    assert.deepEqual(errors(await aCmo.say({ type: 'request', itemId: 'M04-S' })), []); // left open on purpose: auto-reject at the end
    assert.equal(db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1000 - 150 - 60 - 100 - 150 - 100);
    assert.equal(db.prepare("SELECT wallet FROM company_state WHERE company='B'").get().wallet, 850);

    // Summary card
    await advanceTo(790);
    await aCmo.say({ type: 'sync' });
    assert.ok(aCmo.state().summary);
    assert.deepEqual(errors(await aCoo.say({ type: 'request', itemId: 'O04-H' })), ['the shop is closed']);
    assert.equal(db.prepare("SELECT status, reject_reason FROM requests WHERE item_id='M04-S'").get().reject_reason, 'auto');

    // Competition
    await advanceTo(805);
    for (let i = 0; i < 3; i++) {
      await aCfo.say({ type: 'puzzle_next' });
      assert.ok(aCfo.state().competition.puzzle, 'a puzzle is open');
      assert.deepEqual(errors(await aCfo.say({ type: 'puzzle_skip' })), []);
    }
    assert.equal(db.prepare("SELECT SUM(penalty) AS n FROM puzzle_sessions WHERE company='A'").get().n, 10);

    await advanceTo(820);
    const blocked = (await aCeo.say({ type: 'attack', key: 'market_crash' })).find((m) => m.type === 'attack_result');
    assert.equal(blocked.blocked, true);
    await bCoo.say({ type: 'sync' });
    assert.ok(bCoo.state().competition.notices.includes('Insurance claim used'));
    assert.deepEqual(errors(await aCeo.say({ type: 'attack', key: 'price_squeeze' })), ['attack on cooldown']);

    await advanceTo(900);
    const landed = (await aCeo.say({ type: 'attack', key: 'market_crash' })).find((m) => m.type === 'attack_result');
    assert.equal(landed.blocked, false);
    await bCto.say({ type: 'sync' });
    assert.ok(bCto.state().competition.notices.some((n) => n === 'Stock market prices have fallen'));
    assert.equal(JSON.stringify(bCto.state()).includes('market_crash'), false);
    assert.deepEqual(errors(await org.say({ type: 'market_event', key: 'demand_surge' })), []);

    await advanceTo(950);
    assert.deepEqual(errors(await org.say({ type: 'inject', company: 'A', coins: 500 })), []);
    await bCfo.say({ type: 'puzzle_next' });
    const wrong = (await bCfo.say({ type: 'puzzle_submit', answer: null })).find((m) => m.type === 'puzzle_result');
    assert.deepEqual([wrong.ok, wrong.coins], [false, 0]);
    assert.deepEqual(db.prepare('SELECT company, coins FROM injections').get(), { company: 'A', coins: 500 });

    // The end: thank you, reveal, reconnect, Next Game
    await advanceTo(1762);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM samples').get().n >= 300, true);
    await aCeo.say({ type: 'sync' });
    assert.equal(aCeo.state().clock.phase, 'ended');
    assert.equal(aCeo.state().results, undefined);
    assert.deepEqual(errors(await org.say({ type: 'reveal' })), []);
    await aCeo.say({ type: 'sync' });
    assert.deepEqual(Object.keys(aCeo.state().results), ['companyVsCompany', 'coinDifference', 'roleBars']);

    aCeo.ws.terminate();
    await settle(100);
    const again = await bot();
    assert.equal((await again.say({ type: 'login', admissionId: 'S0' })).find((m) => m.type === 'welcome').view, 'game');
    await again.say({ type: 'sync' });
    assert.ok(again.state().results, 'a reconnected player still sees the graphs');

    assert.deepEqual(errors(await org.say({ type: 'next_game' })), []);
    await again.say({ type: 'sync' });
    assert.equal(again.state().screen, 'graphs');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='completed'").get().n, 10);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='lobby'").get().n, 2);

    // Exports, images and the backup
    const ev = await get(port, `/export/event.xlsx?token=${welcome.token}`);
    assert.equal(ev.status, 200);
    const sheets = Object.fromEntries((await readWorkbook(ev.body)).map((s) => [s.name, s.rows]));
    assert.ok(sheets.Roster.length === 13);
    assert.ok(sheets.Samples.length > 300);
    assert.equal(sheets.Attacks.length, 3); // header and two attacks
    assert.ok(sheets['Shop requests'].length >= 8);
    assert.ok(sheets.Puzzles.length >= 5);
    assert.equal((await get(port, '/export/event.xlsx')).status, 403);
    assert.equal(readdirSync(join(dir, 'exports', 'game-1')).length, 6);
    await settle(300);
    assert.ok(readdirSync(join(dir, 'backups')).some((f) => f.includes('after')));

    // The recording holds the story
    const types = new Set(db.prepare('SELECT DISTINCT type FROM events').all().map((r) => r.type));
    for (const t2 of ['login', 'disconnect', 'game_start', 'seat_swap', 'vote', 'idea_pick', 'ideation_end_early', 'shop_request', 'cfo_decision', 'ceo_decision', 'shop_auto_reject', 'attack', 'market_event', 'coin_injection', 'puzzle_shown', 'puzzle_skipped', 'graphs_revealed', 'next_game', 'organizer_action']) {
      assert.ok(types.has(t2), `the recording has a ${t2} event`);
    }
  } finally {
    bots.forEach((b) => b.ws.terminate());
    app.wss.clients.forEach((c) => c.terminate());
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it and fix what it finds**

Run: `npm test -- --test-name-pattern="whole game"` (or `node --test test/e2e-full-game.test.js`)
Expected: PASS in about 10 to 20 seconds. This is the first time all seven plans run together, so expect a failure or two. For each failure:

1. Read the assertion message and find which earlier plan owns the behaviour.
2. If the plan's code is wrong, fix the code and its own unit test, and add a unit test that would have caught the bug.
3. If the end-to-end test's expectation is wrong (an item id, a wallet total, a message order), fix the test and say so in the commit message.
4. Never loosen an assertion just to make it pass.

The wallet sums above follow the approved catalog: company A buys M01-L (150), O01 (60), O02 (100), O03 (150) and F01-B (100), so it has 440 coins before the competition and the open M04-S request is rejected at the end of the Shop phase; company B buys the shield (150) and has 850.

- [ ] **Step 3: Commit**

```bash
git add test/e2e-full-game.test.js
git commit -m "test: a whole game end to end, from roster to Excel export"
```

---

### Task 3: The join sign

**Files:**
- Create: `scripts/make-sign.js`, `test/sign.test.js`
- Run: `npm install qrcode`

**Interfaces:**
- Produces: `signHtml({ ssid, password, address }) -> Promise<string>` (a printable page with the network name, the password, the address in big type, and two QR codes: one that joins the Wi-Fi, one that opens `http://<address>/`), `escapeWifi(s)` (adds a backslash before `\`, `;`, `,`, `:` and `"`). Command line: `node scripts/make-sign.js --password <wifi password> [--ssid Showdown] [--address 10.42.0.1] [--out sign.html]`.
- Verified before this plan was written (3 tests passed against the real `qrcode` package).

- [ ] **Step 1: Write the failing tests**

`test/sign.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { signHtml, escapeWifi } from '../scripts/make-sign.js';

const BS = String.fromCharCode(92);

test('special characters in the Wi-Fi string are escaped with a backslash', () => {
  assert.equal(escapeWifi(`a;b,c:d"e${BS}f`), `a${BS};b${BS},c${BS}:d${BS}"e${BS}${BS}f`);
  assert.equal(escapeWifi('plain'), 'plain');
});

test('the sign shows the network, password and address, and has two QR codes', async () => {
  const html = await signHtml({ ssid: 'Showdown', password: 'pass1234', address: '10.42.0.1' });
  assert.match(html, />Showdown</);
  assert.match(html, />pass1234</);
  assert.match(html, />10\.42\.0\.1</);
  assert.equal((html.match(/<svg/g) || []).length, 2);
  assert.match(html, /no internet/);
});

test('a hostile network name is escaped in the page', async () => {
  const html = await signHtml({ ssid: '<script>x</script>', password: 'p"q', address: '10.42.0.1' });
  assert.equal(html.includes('<script>x</script>'), false);
  assert.match(html, /&lt;script&gt;/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../scripts/make-sign.js`

- [ ] **Step 3: Write the implementation**

`scripts/make-sign.js`:

```js
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

// Special characters in a Wi-Fi QR string must be escaped with a backslash.
const WIFI_SPECIAL = new Set([String.fromCharCode(92), ';', ',', ':', '"']);
export const escapeWifi = (s) => [...String(s)].map((c) => (WIFI_SPECIAL.has(c) ? String.fromCharCode(92) + c : c)).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function signHtml({ ssid, password, address }) {
  const wifi = `WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`;
  const url = `http://${address}/`;
  const qr = (text) => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const [wifiQr, urlQr] = await Promise.all([qr(wifi), qr(url)]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Startup Showdown: how to join</title>
<style>
body{font:20px/1.4 system-ui,sans-serif;margin:0;padding:24px;color:#0F1B2E;background:#fff}
h1{font-size:44px;margin:0 0 8px} ol{padding-left:28px} li{margin:18px 0}
.row{display:flex;gap:32px;align-items:center;flex-wrap:wrap} .qr{width:220px} .qr svg{width:100%;height:auto}
.big{font-size:34px;font-weight:700;letter-spacing:.02em} .box{border:3px solid #0F1B2E;padding:6px 14px;display:inline-block}
@media print{body{padding:0}}
</style></head><body>
<h1>Join Startup Showdown</h1>
<ol>
<li><div class="row"><div>Connect to the Wi-Fi<br><span class="big box">${esc(ssid)}</span><br>Password <span class="big box">${esc(password)}</span></div><div class="qr" aria-label="Wi-Fi QR code">${wifiQr}</div></div></li>
<li><div class="row"><div>Open your browser and type<br><span class="big box">${esc(address)}</span><br>If your phone says there is no internet, stay on this Wi-Fi.</div><div class="qr" aria-label="Game address QR code">${urlQr}</div></div></li>
<li>Type your Admission ID and wait for the organizer.</li>
</ol></body></html>`;
}

if (process.argv[1] && process.argv[1].endsWith('make-sign.js')) {
  const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
  const password = arg('password');
  if (!password) { console.error('Usage: node scripts/make-sign.js --password <wifi password> [--ssid Showdown] [--address 10.42.0.1] [--out sign.html]'); process.exit(1); }
  const html = await signHtml({ ssid: arg('ssid', 'Showdown'), password, address: arg('address', '10.42.0.1') });
  writeFileSync(arg('out', 'sign.html'), html);
  console.log(`Wrote ${arg('out', 'sign.html')}. Open it and print it.`);
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Make a sign and read it**

Run: `node scripts/make-sign.js --password 'the-real-wifi-password'`, open `sign.html`, and check with a real phone: the Wi-Fi QR joins the network (on the Pi, once Task 4 is done) and the address QR opens the game. Print the page for the room. **Do not commit `sign.html`** (it contains the Wi-Fi password); add it to `.gitignore`.

- [ ] **Step 6: Commit**

```bash
echo 'sign.html' >> .gitignore
git add scripts/make-sign.js test/sign.test.js .gitignore package.json package-lock.json
git commit -m "feat: printable join sign with Wi-Fi and address QR codes"
```

---

### Task 4: The Pi's Wi-Fi and the installer

**Files:**
- Create: `deploy/setup-hotspot.sh`, `deploy/install.sh`, `test/deploy.test.js`
- Modify: `deploy/showdown.service` (read settings from `/etc/showdown.env`), `src/index.js` (read `EXPORT_DIR` and `BACKUP_DIR`)

**Interfaces:**
- Produces:
  - `setup-hotspot.sh`: needs `PASSWORD` (8 to 63 characters; exits 1 otherwise); optional `SSID` (default `Showdown`), `ADDRESS` (default `10.42.0.1/24`), `CHANNEL` (default 6, 2.4 GHz so older phones work), `COUNTRY` (sets the Wi-Fi country code with `raspi-config`); creates a NetworkManager access point named `showdown-hotspot` that starts at boot, shares the connection with DHCP (`ipv4.method shared`), and has `DRY_RUN=1` to print instead of run.
  - `install.sh`: needs `ORGANIZER_PASSWORD` (at least 6 characters); optional `APP_DIR`, `RUN_USER`, `ENV_FILE`, `UNIT_FILE`, `BACKUP_DIR`; creates folders, writes `/etc/showdown.env` with mode 600, runs `npm ci --omit=dev`, installs the unit and `systemctl enable --now showdown`; never prints the password; has `DRY_RUN=1`.
  - `showdown.service`: `EnvironmentFile=/etc/showdown.env`, `Restart=always`, `AmbientCapabilities=CAP_NET_BIND_SERVICE`, `NoNewPrivileges=true`, starts after the network manager.
- Verified before this plan was written (7 tests passed, including syntax checks with `bash -n`, the dry-run output and the password rules).

- [ ] **Step 1: Write the failing tests**

`test/deploy.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = (script, env) => spawnSync('bash', [script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

test('the hotspot script has valid shell syntax', () => {
  assert.equal(spawnSync('bash', ['-n', 'deploy/setup-hotspot.sh']).status, 0);
});

test('a short or missing password is refused before anything runs', () => {
  const r = run('deploy/setup-hotspot.sh', { DRY_RUN: '1', PASSWORD: 'short' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /8 to 63 characters/);
  assert.equal(r.stdout.includes('nmcli'), false);
  assert.equal(run('deploy/setup-hotspot.sh', { DRY_RUN: '1' }).status, 1);
});

test('a dry run prints an access point with the fixed address, WPA and sharing', () => {
  const r = run('deploy/setup-hotspot.sh', { DRY_RUN: '1', PASSWORD: 'goodpass123', SSID: 'Showdown', ADDRESS: '10.42.0.1/24' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /802-11-wireless\.mode ap/);
  assert.match(r.stdout, /ipv4\.method shared/);
  assert.match(r.stdout, /ipv4\.addresses 10\.42\.0\.1\/24/);
  assert.match(r.stdout, /wifi-sec\.key-mgmt wpa-psk/);
  assert.match(r.stdout, /autoconnect yes/);
  assert.match(r.stdout, /game address is 10\.42\.0\.1/);
});

test('the country code is set only when asked', () => {
  const without = run('deploy/setup-hotspot.sh', { DRY_RUN: '1', PASSWORD: 'goodpass123' });
  assert.equal(without.stdout.includes('do_wifi_country'), false);
  const withCountry = run('deploy/setup-hotspot.sh', { DRY_RUN: '1', PASSWORD: 'goodpass123', COUNTRY: 'IN' });
  assert.match(withCountry.stdout, /do_wifi_country IN/);
});

test('the install script refuses a weak organizer password', () => {
  const r = run('deploy/install.sh', { DRY_RUN: '1', ORGANIZER_PASSWORD: 'abc' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /at least 6 characters/);
});

test('a dry run installs dependencies, the service, and starts it at boot', () => {
  const r = run('deploy/install.sh', { DRY_RUN: '1', ORGANIZER_PASSWORD: 'secret-pass', APP_DIR: '/home/pi/showdown' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /npm --prefix \/home\/pi\/showdown ci --omit=dev/);
  assert.match(r.stdout, /systemctl enable --now showdown/);
  assert.match(r.stdout, /mode 600/);
  assert.equal(r.stdout.includes('secret-pass'), false); // the password is never printed
});

test('the install script has valid syntax and the unit reads its settings from the env file and restarts on failure', async () => {
  assert.equal(spawnSync('bash', ['-n', 'deploy/install.sh']).status, 0);
  const { readFileSync } = await import('node:fs');
  const unit = readFileSync('deploy/showdown.service', 'utf8');
  assert.match(unit, /EnvironmentFile=\/etc\/showdown\.env/);
  assert.match(unit, /Restart=always/);
  assert.match(unit, /CAP_NET_BIND_SERVICE/);
  assert.equal(/ORGANIZER_PASSWORD=/.test(unit), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL (the scripts do not exist)

- [ ] **Step 3: Write the scripts**

`deploy/setup-hotspot.sh`:

```bash
#!/usr/bin/env bash
# Makes the Raspberry Pi create its own Wi-Fi network with a fixed address.
# Usage: PASSWORD='something-8-to-63-long' [SSID=Showdown] [ADDRESS=10.42.0.1/24] [COUNTRY=IN] sudo -E bash deploy/setup-hotspot.sh
# Add DRY_RUN=1 to only print the commands.
set -euo pipefail

SSID="${SSID:-Showdown}"
ADDRESS="${ADDRESS:-10.42.0.1/24}"
CON="${CON:-showdown-hotspot}"
CHANNEL="${CHANNEL:-6}"
PASSWORD="${PASSWORD:-}"

if [ "${#PASSWORD}" -lt 8 ] || [ "${#PASSWORD}" -gt 63 ]; then
  echo "PASSWORD must be 8 to 63 characters long." >&2
  exit 1
fi

run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then echo "+ $*"; else "$@"; fi
}

if [ -n "${COUNTRY:-}" ]; then
  run raspi-config nonint do_wifi_country "$COUNTRY"
fi

if [ "${DRY_RUN:-0}" = "1" ] || nmcli -t -f NAME connection show | grep -qx "$CON"; then
  run nmcli connection delete "$CON" || true
fi

run nmcli connection add type wifi ifname wlan0 con-name "$CON" autoconnect yes ssid "$SSID" \
  802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel "$CHANNEL" \
  ipv4.method shared ipv4.addresses "$ADDRESS" ipv6.method disabled \
  wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASSWORD"
run nmcli connection modify "$CON" connection.autoconnect-priority 100
run nmcli connection up "$CON"
echo "Hotspot '$SSID' is on. The game address is ${ADDRESS%/*}."
```

`deploy/install.sh`:

```bash
#!/usr/bin/env bash
# Installs the game on the Raspberry Pi and makes it start by itself at power-up.
# Usage: ORGANIZER_PASSWORD='...' [BACKUP_DIR=/media/pi/SHOWDOWN] sudo -E bash deploy/install.sh
# Add DRY_RUN=1 to only print the commands.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/pi/showdown}"
RUN_USER="${RUN_USER:-pi}"
ENV_FILE="${ENV_FILE:-/etc/showdown.env}"
UNIT_FILE="${UNIT_FILE:-/etc/systemd/system/showdown.service}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
ORGANIZER_PASSWORD="${ORGANIZER_PASSWORD:-}"

if [ "${#ORGANIZER_PASSWORD}" -lt 6 ]; then
  echo "ORGANIZER_PASSWORD must be at least 6 characters long." >&2
  exit 1
fi

run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then echo "+ $*"; else "$@"; fi
}

run mkdir -p "$APP_DIR/data" "$APP_DIR/exports" "$BACKUP_DIR"
run chown -R "$RUN_USER" "$APP_DIR" "$BACKUP_DIR"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "+ write $ENV_FILE with PORT=80, DB_FILE, BACKUP_DIR (mode 600)"
else
  umask 077
  printf 'ORGANIZER_PASSWORD=%s\nPORT=80\nDB_FILE=%s/data/showdown.db\nBACKUP_DIR=%s\nEXPORT_DIR=%s/exports\n' \
    "$ORGANIZER_PASSWORD" "$APP_DIR" "$BACKUP_DIR" "$APP_DIR" > "$ENV_FILE"
fi

run npm --prefix "$APP_DIR" ci --omit=dev
run cp "$APP_DIR/deploy/showdown.service" "$UNIT_FILE"
run systemctl daemon-reload
run systemctl enable --now showdown
echo "Installed. Check it with: systemctl status showdown"
```

`deploy/showdown.service` (replaces the Plan 1 version):

```ini
[Unit]
Description=Startup Showdown game server
After=network-online.target NetworkManager.service
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/showdown
EnvironmentFile=/etc/showdown.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=1
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

In `src/index.js` pass the folders through to `createApp`: `exportDir: process.env.EXPORT_DIR || 'exports'` and `backupDir: process.env.BACKUP_DIR || 'backups'` (Plan 5's options).

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Try it on the Pi (by hand; this cannot be automated)**

1. Copy the project to the Pi and run the dry runs first:
   `DRY_RUN=1 PASSWORD='goodpass123' bash deploy/setup-hotspot.sh` and `DRY_RUN=1 ORGANIZER_PASSWORD='something' bash deploy/install.sh`. Read the commands.
2. Run them for real (`sudo -E`). Set `COUNTRY` to the venue's country code the first time.
3. From a phone, join the `Showdown` network, open `http://10.42.0.1/`, and confirm the login page appears. Join with a laptop too.
4. Reboot the Pi. Without logging in to it, confirm the network and the game come back within about a minute.
5. `sudo kill -9 $(pgrep -f 'node src/index.js')` and confirm the game is back within a few seconds.

- [ ] **Step 6: Commit**

```bash
git add deploy test/deploy.test.js src/index.js
git commit -m "feat: hotspot and install scripts, and a service that reads its settings from an env file"
```

---

### Task 5: Rehearsal speed

**Files:**
- Create: `src/clock.js`, `test/clock.test.js`
- Modify: `src/index.js`

**Interfaces:**
- Produces: `speedClock(speed = 1, realNow = Date.now) -> () => ms`. In `src/index.js`: `SHOWDOWN_SPEED` (default 1; any value that is not a number from 1 to 60 is ignored and treated as 1, with a console warning) sets the clock passed to the app, makes the one-second tick run every `1000 / speed` ms (so each tick is still one game second and the 5-second cap in the economy does not lose coins), the heartbeat every `5000 / speed` ms and the backup every `300000 / speed` ms.
- Verified before this plan was written (2 tests passed).

- [ ] **Step 1: Write the failing tests**

`test/clock.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { speedClock } from '../src/clock.js';

test('speed 1 follows the real clock', () => {
  let t = 1000;
  const now = speedClock(1, () => t);
  t += 5000;
  assert.equal(now(), 6000);
});

test('speed 10 runs ten times faster from the moment it was made', () => {
  let t = 1000;
  const now = speedClock(10, () => t);
  assert.equal(now(), 1000);
  t += 5000;
  assert.equal(now(), 51000);
});
```

Add to `test/index.test.js` a test that `bootstrap({ ..., speed: 10 })` with a fake `realNow` makes `now()` return a time ten times as far from the start, and that `bootstrap({ speed: 'fast' })` and `bootstrap({ speed: 500 })` behave like speed 1. (Give `bootstrap` a `speed` option and a `realNow` option; `main` reads `process.env.SHOWDOWN_SPEED`.)

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../src/clock.js`

- [ ] **Step 3: Write the implementation**

`src/clock.js`:

```js
// A clock that runs `speed` times faster than real time. Only for rehearsals: speed 10 plays a 30 minute game in 3 minutes.
export function speedClock(speed = 1, realNow = Date.now) {
  const start = realNow();
  return () => start + (realNow() - start) * speed;
}
```

In `src/index.js` add:

```js
import { speedClock } from './clock.js';

export function cleanSpeed(raw) {
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === '') return 1;
  if (!Number.isFinite(n) || n < 1 || n > 60) { console.warn(`SHOWDOWN_SPEED ${raw} is not a number from 1 to 60; using 1`); return 1; }
  return n;
}
```

and in `bootstrap` use `const speed = cleanSpeed(options.speed); const now = options.now ?? speedClock(speed, options.realNow);` and set the three intervals from `speed` as described above.

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/clock.js src/index.js test/clock.test.js test/index.test.js
git commit -m "feat: rehearsal speed for playing a whole game in a few minutes"
```

---

### Task 6: The load test

**Files:**
- Create: `scripts/loadtest.js`, `scripts/loadtest-stats.js`, `test/loadtest-stats.test.js`

**Interfaces:**
- Produces:
  - `percentile(sorted, p)`, `summarize(gaps) -> { count, p50, p95, max }`, `verdict(summary, errors, budgetMs) -> { ok, problems[] }`. Verified before this plan was written (3 tests passed).
  - `node scripts/loadtest.js --url ws://10.42.0.1 --password <organizer password> [--seconds 180] [--budget-ms 1500]`: logs in as the organizer, imports 14 test people `L0` to `L13`, seats `L0` to `L9`, starts a game, logs in all 14 as clients (the four spare ones sit in the lobby), makes the ten players act every one to three seconds (votes, picks, requests, approvals, attacks, puzzles, with the errors the game itself returns for invalid moves counted as normal), and measures the gap between consecutive ticks seen by each client. It prints the summary and exits with code 1 if the verdict fails. Run the server with `SHOWDOWN_SPEED=10` to cover the whole game in three minutes.
- Not part of `npm test` (it needs a running server). Only the statistics are unit-tested.

- [ ] **Step 1: Write the failing tests**

`test/loadtest-stats.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, verdict } from '../scripts/loadtest-stats.js';

test('percentile picks the right value and copes with an empty list', () => {
  const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(s, 50), 50);
  assert.equal(percentile(s, 95), 100);
  assert.equal(percentile([], 95), 0);
});

test('summarize sorts and reports count, median, p95 and max', () => {
  assert.deepEqual(summarize([300, 100, 200, 100, 100, 100, 100, 100, 100, 1000]), { count: 10, p50: 100, p95: 1000, max: 1000 });
  assert.deepEqual(summarize([]), { count: 0, p50: 0, p95: 0, max: 0 });
});

test('the verdict fails on slow ticks, errors, or too little data', () => {
  assert.equal(verdict({ count: 100, p50: 1000, p95: 1200, max: 1500 }, 0, 1500).ok, true);
  assert.match(verdict({ count: 100, p50: 1000, p95: 2000, max: 3000 }, 0, 1500).problems[0], /p95 was 2000/);
  assert.match(verdict({ count: 100, p50: 1, p95: 1, max: 1 }, 3, 1500).problems[0], /3 unexpected errors/);
  assert.match(verdict({ count: 2, p50: 1, p95: 1, max: 1 }, 0, 1500).problems[0], /too few ticks/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, cannot find `../scripts/loadtest-stats.js`

- [ ] **Step 3: Write the implementation**

`scripts/loadtest-stats.js`:

```js
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

// gaps: milliseconds between consecutive ticks seen by one client. All clients' gaps are pooled.
export function summarize(gaps) {
  const s = [...gaps].sort((a, b) => a - b);
  return { count: s.length, p50: percentile(s, 50), p95: percentile(s, 95), max: s.length ? s[s.length - 1] : 0 };
}

export function verdict(summary, errors, budgetMs) {
  const problems = [];
  if (summary.count < 10) problems.push('too few ticks were received');
  if (summary.p95 > budgetMs) problems.push(`95% of ticks should arrive within ${budgetMs} ms but p95 was ${summary.p95} ms`);
  if (errors > 0) problems.push(`${errors} unexpected errors`);
  return { ok: problems.length === 0, problems };
}
```

`scripts/loadtest.js`:

```js
import WebSocket from 'ws';
import { summarize, verdict } from './loadtest-stats.js';

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const url = arg('url', 'ws://127.0.0.1');
const password = arg('password');
const seconds = Number(arg('seconds', 180));
const budgetMs = Number(arg('budget-ms', 1500));
if (!password) { console.error('Usage: node scripts/loadtest.js --url ws://10.42.0.1 --password <organizer password> [--seconds 180] [--budget-ms 1500]'); process.exit(1); }

const EXPECTED = /only the|already|closed|cooldown|locked|wait|not in|no puzzle|no game|pick|requested|owned|below -200|oldest|not available|not in your section|rejected/i;
const gaps = [];
let unexpected = 0;
let bytes = 0;
let messages = 0;

function client(name) {
  const ws = new WebSocket(url);
  const c = { name, ws, view: null, lastTick: null, send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  ws.on('message', (d) => {
    bytes += d.length; messages++;
    const m = JSON.parse(d);
    if (m.type === 'tick') {
      const now = Date.now();
      if (c.lastTick) gaps.push(now - c.lastTick);
      c.lastTick = now;
    } else if (m.type === 'state') c.view = m.view;
    else if (m.type === 'error' && !EXPECTED.test(m.error)) { unexpected++; console.error(`${name}: ${m.error}`); }
  });
  ws.on('error', (e) => { unexpected++; console.error(`${name}: ${e.message}`); });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const org = await client('organizer');
org.send({ type: 'organizer', password });
await pause(300);
org.send({ type: 'roster_import', text: Array.from({ length: 14 }, (_, i) => `L${i},Load ${i}`).join('\n') });
const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
for (let i = 0; i < 10; i++) org.send({ type: 'assign', admissionId: `L${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
await pause(300);
org.send({ type: 'start_game', problemId: 1 });

const clients = [];
for (let i = 0; i < 14; i++) {
  const c = await client(`L${i}`);
  c.send({ type: 'login', admissionId: `L${i}` });
  await pause(50);
  c.send({ type: 'sync' });
  c.role = i < 10 ? roles[i % 5] : null;
  clients.push(c);
}

const ITEMS = { CTO: ['F01-B', 'F02-B', 'HC01', 'SC01'], CMO: ['M01-N', 'M04-S', 'M02', 'M03'], COO: ['O01', 'O02', 'O03', 'O04-H', 'O04-S', 'O06'] };
function act(c) {
  const v = c.view;
  if (!v || v.screen !== 'game') return;
  const phase = v.clock.phase;
  if (phase === 'ideation') {
    c.send({ type: 'vote', ideaId: pick(['H1', 'H2', 'H3', 'S1', 'S2', 'S3']) });
    if (c.role === 'CEO' && Math.random() < 0.2) c.send({ type: 'pick', ideaId: pick(['H1', 'S1']) });
  } else if (phase === 'shop' || phase === 'competition') {
    if (ITEMS[c.role]) c.send({ type: 'request', itemId: pick(ITEMS[c.role]), choice: 1 + Math.floor(Math.random() * 3) });
    if (c.role === 'CFO' && v.shop && v.shop.queue && v.shop.queue.length) c.send({ type: 'cfo_decide', requestId: v.shop.queue[0].id, approve: Math.random() < 0.8 });
    if (c.role === 'CEO' && v.shop && v.shop.awaitingCeo && v.shop.awaitingCeo.length) c.send({ type: 'ceo_decide', requestId: v.shop.awaitingCeo[0].id, approve: true });
    if (phase === 'competition' && c.role === 'CEO' && Math.random() < 0.1) c.send({ type: 'attack', key: pick(['price_squeeze', 'ad_blackout', 'surprise_tax']) });
    if (phase === 'competition' && c.role === 'CFO') c.send({ type: Math.random() < 0.5 ? 'puzzle_next' : 'puzzle_skip' });
  }
}

console.log(`Running ${clients.length} clients for ${seconds} seconds against ${url}`);
const started = Date.now();
await Promise.all(clients.map(async (c) => {
  while (Date.now() - started < seconds * 1000) { act(c); await pause(1000 + Math.random() * 2000); }
}));

const summary = summarize(gaps);
const result = verdict(summary, unexpected, budgetMs);
console.log(`ticks: ${summary.count}, median gap ${summary.p50} ms, p95 ${summary.p95} ms, worst ${summary.max} ms`);
console.log(`${messages} messages, ${(bytes / 1024).toFixed(0)} KB received in total (${(bytes / messages / 1024).toFixed(1)} KB each)`);
console.log(result.ok ? 'PASS' : `FAIL: ${result.problems.join('; ')}`);
clients.forEach((c) => c.ws.close());
org.ws.close();
process.exit(result.ok ? 0 : 1);
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (the statistics tests)

- [ ] **Step 5: Run the load test for real, on the Pi**

1. Start the game server on the Pi with `SHOWDOWN_SPEED=10` (edit `/etc/showdown.env` and `sudo systemctl restart showdown`).
2. From a laptop joined to the Pi's hotspot: `node scripts/loadtest.js --url ws://10.42.0.1 --password '<organizer password>' --seconds 180 --budget-ms 400` (at speed 10 a tick is due every 100 ms, so 400 ms is a fair budget).
3. At the same time, join 3 or 4 real phones and watch that their screens keep updating, and run `top` on the Pi to see the CPU use.
4. Remove `SHOWDOWN_SPEED` from the env file, restart, and run again at normal speed with `--budget-ms 1500` for two minutes.
5. Record the printed lines in `docs/event-day-checklist.md` under "Last rehearsal result". A FAIL means the Pi is too slow or the Wi-Fi is struggling: try channel 1 or 11, move the Pi to the middle of the room, or reduce the push rate (Plan 3 pushes state to everyone every second during the Competition).

- [ ] **Step 6: Commit**

```bash
git add scripts/loadtest.js scripts/loadtest-stats.js test/loadtest-stats.test.js
git commit -m "feat: load test with 14 clients and tick-gap statistics"
```

---

### Task 7: The event-day checklist

**Files:**
- Create: `docs/event-day-checklist.md`

**Interfaces:**
- Produces: a one-page checklist an organizer can follow with the Pi in front of them. No code and no tests; the review is reading it against the guide.

- [ ] **Step 1: Write the checklist**

`docs/event-day-checklist.md`:

```markdown
# Startup Showdown: Event-Day Checklist

## A week before
- [ ] Run the end-to-end test and the load test on the Pi itself (Plan 6, Tasks 2 and 6). Write the result at the bottom of this page.
- [ ] Run `node scripts/simulate-balance.js` and check that a careful company earns about 70 coins per minute (about 1,100 coins over the Competition). The CTO rule (best three features) is already decided; do not change rules on the day.
- [ ] Load the roster of all 80 players (Admission ID and name) into a CSV with the header `admission_id,name`.
- [ ] Print the join sign (`node scripts/make-sign.js --password '<wifi password>'`) and put one copy at each end of the room.
- [ ] Put a USB stick in the Pi and set `BACKUP_DIR` to its folder in `/etc/showdown.env`. Confirm a backup file appears after five minutes of a test game.

## One hour before
- [ ] Power the Pi from a socket that nobody can unplug. If possible, use a small power bank or a UPS as well.
- [ ] Wait one minute after power-up. On your own phone: join the Showdown Wi-Fi, open `10.42.0.1`, and confirm the login page.
- [ ] Open `10.42.0.1/organizer.html` on the organizer laptop and log in.
- [ ] Import the roster. Check the count in the lobby.
- [ ] Check the clock: the Pi has no internet. If the date is wrong it does not matter for the game, but the Excel files will show the wrong date; note the real date in your own notes.
- [ ] Keep a paper copy of the 8 problem statements and the six ideas under each one (they are in `data/` and the guide, Section 9).

## For each game (10 players)
- [ ] Players log in with their Admission ID. Anyone not on the list: use "Add participant".
- [ ] Put each player in a company and a role in the lobby. Check: five roles in each company.
- [ ] Choose the problem statement. Press **Start game**.
- [ ] During the Briefing (3 minutes) fix any seat problem. After that, seats are locked.
- [ ] Watch the organizer screen. The attack list shows the real cause of every attack.
- [ ] Optional, once per game: one market event, and one coin injection (up to 500).
- [ ] When the Competition timer ends, players see "Thank you for playing". Press **Reveal graphs** when you are ready.
- [ ] Press **Next Game** when the room is ready. Download that game's Excel file straight away.

## If something goes wrong
- A player's phone dies: they log in again from any device and carry on. Their seat is kept.
- The Pi restarts: wait one minute. The game resumes from the last save. Tell players to reload the page.
- A player cannot join the Wi-Fi: read them the password from the sign, or let them scan the QR code. Tell them to stay on the Wi-Fi even if the phone says there is no internet.
- The organizer page shows "Backup failed": check the USB stick. The game carries on; copy the database file by hand at the end of the day (`/home/pi/showdown/data/showdown.db`).
- Everything is lost: use the paper fallback (problem statements, role cards) and run the game by hand.

## After the event
- [ ] Download the whole-event Excel file and each game's graph images.
- [ ] Copy `/home/pi/showdown/data/showdown.db`, `exports/` and the USB backups to a safe place.

## Last rehearsal result
(Paste the load test summary lines here after each rehearsal, with the date.)
```

- [ ] **Step 2: Review the checklist against the guide**

Read the checklist beside Sections 0, 4, 6, 8 and 10 of the guide. Every organizer duty in the guide (roster, Add participant, role assignment, Start, Next Game, graphs reveal, load test with 14 devices, paper fallback, offline) must appear. Fix gaps.

- [ ] **Step 3: Commit**

```bash
git add docs/event-day-checklist.md
git commit -m "docs: event-day checklist"
```

---

## Self-review against the spec

**Spec coverage (this plan's slice):** the Pi's own hotspot with a fixed numeric address and no `showdown.local` (Task 4); QR code as a backup for typing (Task 3); automatic start and recovery with the password outside the code (Task 4); load test with about 14 devices (Task 6); paper fallback and offline reminders (Task 7); the "balance check" flagged during design is answered with numbers (Task 1); a complete game from roster to Excel export proves the plans fit together (Task 2).

**Verified code:** the simulator, sign, deploy scripts, speed clock and statistics were run before this plan was written (balance 5, sign 3, deploy 7, clock 2, statistics 3: all passing). The end-to-end test and the load test could not be run until the earlier plans are built; Task 2 says how to handle the failures it will find.

**Placeholder scan:** none.

**Type consistency:** the message names, view fields, helpers and file paths match Plans 1 to 5.
