# Startup Showdown: Plan 1 of 7, Core Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the game server: roster, logins, lobby, game start and end, the synchronized phase timer, crash recovery, and the live WebSocket channel, running on a Raspberry Pi.

**Architecture:** One Node.js program on the Pi owns all game state in one SQLite file. Phase and timer state is **derived from a start time**, never stored as a countdown, so every browser sees the same clock and a restart resumes where it left off. Browsers talk to the server over a WebSocket and receive a tick every second. Pure logic (roster, lobby, phases) lives in small modules with no network code, so it is tested without a server.

**Tech Stack:** Node.js 20+ (ES modules), `ws`, `better-sqlite3`, the built-in `node:test` runner. No frameworks, no CDN, fully offline.

**Spec:** `Future_Makers_Round_2_Startup_Showdown_Master_Guide.md` (Sections 0, 0.1, 2, 4, 6, 7, 10, 11) in the project root. Read it first.

## The six plans

This guide covers several independent subsystems, so it is split into six plans, listed in `docs/superpowers/plans/README.md`. Each produces working, testable software. This is plan 1. The browser screens are built inside plans 2 to 5 using the frontend-design skill. Every task in every plan follows TDD (superpowers:test-driven-development).

## Global Constraints

- **Offline:** no CDN, no external API, no font or script loaded from the internet. Everything is served from the Pi.
- **Admission ID is the primary key** for every participant. IDs are trimmed and upper-cased everywhere they enter the system.
- **Participant statuses:** `lobby`, `in_game`, `completed`. Start game sets `in_game`. Next Game sets `completed`. A `completed` participant can still log in but only sees their own old game's graphs.
- **Companies and roles:** companies `A` and `B`; roles `CEO`, `CTO`, `CFO`, `CMO`, `COO`; exactly one of each role per company; 10 players per game.
- **Phase lengths (seconds):** Briefing 180, Ideation 180, Shop 420, Summary card 20, Competition 960. The timer is synchronized: one server clock for every screen.
- **Early end of Ideation:** the saved time is added to the Shop phase.
- **Role and company changes** are allowed only during the Briefing, and every change is logged.
- **Only the organizer ends a game** (Next Game). A timer running out never changes statuses.
- **Crash recovery:** the game resumes automatically after a Pi restart, from the last heartbeat.
- **Every action is recorded** in the `events` table against the Admission ID, with the game number and a time.
- **One game at a time.**

## Review Focus

Failure modes the spec implies that no one would think to test; each has a test in the owning task.

1. **Admission ID typed with spaces or lower case** (`" a001 "`) must log in as `A001` (Task 3, Task 4).
2. **The roster uploaded twice, or a late "Add participant" for an existing ID,** must not create a duplicate or overwrite a name (Task 3).
3. **Start game with a half-filled lobby or while a game is already running** must refuse and change nothing (Task 5).
4. **A `completed` participant logging in while a later game runs** must get the graphs view for their own old game, never the live game (Task 4).
5. **The Pi powered off for an hour mid-game, with no internet clock:** the timer must resume from the last heartbeat, not jump forward by the downtime or backward past zero (Task 8).
6. **Seat swaps after the Briefing** must be refused (Task 7).

## File Structure

```
package.json
src/
  db.js          open SQLite, create tables
  events.js      logEvent: the single place events are written
  roster.js      normId, addParticipant, importRoster
  auth.js        participantLogin, organizerLogin
  lobby.js       ROLES, assign, startGame, endGame
  phases.js      timeline, phaseAt, endIdeationEarly (pure, no I/O)
  seats.js       swapSeats, replacePlayer (Briefing only)
  persist.js     heartbeat, resumeActiveGame, rowToGame
  server.js      HTTP + WebSocket, createApp
  index.js       boot script
test/            one test file per module
deploy/
  showdown.service   systemd unit
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `test/smoke.test.js`

**Interfaces:**
- Produces: `npm test` runs every `test/*.test.js` with the built-in runner.

- [ ] **Step 1: Initialise git and the package**

```bash
cd /home/achyut/Projects/Future_Makers_Game
git init
cat > package.json <<'EOF'
{
  "name": "startup-showdown",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "start": "node src/index.js"
  },
  "engines": { "node": ">=20" }
}
EOF
printf 'node_modules/\ndata/\n.superpowers/\n' > .gitignore
npm install ws better-sqlite3
```

Expected: `package.json` lists `ws` and `better-sqlite3`; `node_modules/` exists. (Install needs internet once, on the build machine. For the Pi, run `npm ci` there while online, or copy `node_modules` built on the same CPU architecture, because `better-sqlite3` is a native module.)

- [ ] **Step 2: Write the failing smoke test**

`test/smoke.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

test('sqlite works in memory', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (x INTEGER)');
  db.prepare('INSERT INTO t VALUES (?)').run(7);
  assert.equal(db.prepare('SELECT x FROM t').get().x, 7);
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: PASS (this proves the toolchain and the native module work).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore test/smoke.test.js docs Future_Makers_Round_2_Startup_Showdown_Master_Guide.md idea_options_DRAFT.csv shop_catalog_DRAFT.csv
git commit -m "chore: scaffold project with node:test and sqlite"
```

---

### Task 2: Database schema and event log

**Files:**
- Create: `src/db.js`, `src/events.js`, `test/db.test.js`

**Interfaces:**
- Produces:
  - `openDb(file = ':memory:') -> Database` (tables created, WAL on)
  - `logEvent(db, { ts, gameId, admissionId, type, payload }) -> void`
  - Tables: `participants(admission_id PK, name, status, game_id, company, role)`, `games(id PK, problem_id, started_at, heartbeat_at, ideation_saved_sec, ended_at)`, `events(id PK, ts, game_id, admission_id, type, payload)`.

- [ ] **Step 1: Write the failing test**

`test/db.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { logEvent } from '../src/events.js';

test('participants default to the lobby status', () => {
  const db = openDb();
  db.prepare('INSERT INTO participants (admission_id, name) VALUES (?, ?)').run('A1', 'Asha');
  assert.equal(db.prepare('SELECT status FROM participants').get().status, 'lobby');
});

test('status only accepts the three known values', () => {
  const db = openDb();
  assert.throws(() =>
    db.prepare("INSERT INTO participants (admission_id, name, status) VALUES ('A1','Asha','banana')").run());
});

test('logEvent stores the payload as JSON against the admission id', () => {
  const db = openDb();
  logEvent(db, { ts: 5, gameId: 1, admissionId: 'A1', type: 'login', payload: { ok: true } });
  const row = db.prepare('SELECT * FROM events').get();
  assert.equal(row.admission_id, 'A1');
  assert.deepEqual(JSON.parse(row.payload), { ok: true });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/db.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/db.js`:

```js
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (
  admission_id TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'lobby'
               CHECK (status IN ('lobby','in_game','completed')),
  game_id      INTEGER,
  company      TEXT CHECK (company IN ('A','B')),
  role         TEXT CHECK (role IN ('CEO','CTO','CFO','CMO','COO'))
);
CREATE TABLE IF NOT EXISTS games (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id         INTEGER NOT NULL,
  started_at         INTEGER NOT NULL,
  heartbeat_at       INTEGER,
  ideation_saved_sec INTEGER NOT NULL DEFAULT 0,
  ended_at           INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  game_id      INTEGER,
  admission_id TEXT,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_by_game ON events (game_id, ts);
`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
```

`src/events.js`:

```js
export function logEvent(db, { ts, gameId = null, admissionId = null, type, payload = {} }) {
  db.prepare(
    'INSERT INTO events (ts, game_id, admission_id, type, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(ts, gameId, admissionId, type, JSON.stringify(payload));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/events.js test/db.test.js
git commit -m "feat: sqlite schema and event log"
```

---

### Task 3: Roster import and "Add participant"

**Files:**
- Create: `src/roster.js`, `test/roster.test.js`

**Interfaces:**
- Consumes: `openDb` (Task 2)
- Produces:
  - `normId(s) -> string` (trim, upper-case)
  - `addParticipant(db, admissionId, name) -> boolean` (`true` if added, `false` if the ID already existed; throws if either value is blank)
  - `importRoster(db, text) -> { added, skipped }` (lines of `admission_id,name`; an optional header line starting with `admission` is ignored)

- [ ] **Step 1: Write the failing tests**

`test/roster.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { normId, addParticipant, importRoster } from '../src/roster.js';

test('normId trims and upper-cases', () => {
  assert.equal(normId('  a001 '), 'A001');
});

test('import adds new ids, skips duplicates, and ignores the header', () => {
  const db = openDb();
  const r = importRoster(db, 'admission_id,name\n a001 ,Asha\nA001,Asha Again\nB002,Ben');
  assert.deepEqual(r, { added: 2, skipped: 1 });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A001'").get().name, 'Asha');
});

test('uploading the same roster twice changes nothing', () => {
  const db = openDb();
  importRoster(db, 'A1,Asha\nB2,Ben');
  assert.deepEqual(importRoster(db, 'A1,Asha\nB2,Ben'), { added: 0, skipped: 2 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 2);
});

test('a late add for an existing id does not overwrite the name', () => {
  const db = openDb();
  addParticipant(db, 'A1', 'Asha');
  assert.equal(addParticipant(db, 'a1', 'Someone Else'), false);
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Asha');
});

test('a blank id or name is refused', () => {
  const db = openDb();
  assert.throws(() => addParticipant(db, '  ', 'Asha'));
  assert.throws(() => addParticipant(db, 'A1', ' '));
});

test('a name containing a comma is kept whole', () => {
  const db = openDb();
  importRoster(db, 'A1,Rao, Asha');
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Rao, Asha');
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/roster.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/roster.js`:

```js
export const normId = (s) => String(s).trim().toUpperCase();

export function addParticipant(db, admissionId, name) {
  const id = normId(admissionId);
  const nm = String(name).trim();
  if (!id || !nm) throw new Error('admission id and name are required');
  const info = db
    .prepare('INSERT OR IGNORE INTO participants (admission_id, name) VALUES (?, ?)')
    .run(id, nm);
  return info.changes === 1;
}

export function importRoster(db, text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /^admission/i.test(l)));
  let added = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const line of lines) {
      const [id, ...rest] = line.split(',');
      if (addParticipant(db, id, rest.join(','))) added++;
      else skipped++;
    }
  })();
  return { added, skipped };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/roster.js test/roster.test.js
git commit -m "feat: roster import and add participant"
```

---

### Task 4: Participant and organizer login

**Files:**
- Create: `src/auth.js`, `test/auth.test.js`

**Interfaces:**
- Consumes: `openDb`, `logEvent` (Task 2), `normId`, `addParticipant` (Task 3)
- Produces:
  - `participantLogin(db, admissionId, now = Date.now()) -> { ok: false, error: 'unknown_id' } | { ok: true, view: 'lobby' | 'game' | 'graphs', participant: { admissionId, name, status, gameId, company, role } }`
  - `organizerLogin(password, expected) -> boolean`
- The view is chosen from the status: `lobby` for lobby, `game` for in_game, `graphs` for completed (the graphs of `participant.gameId` only).

- [ ] **Step 1: Write the failing tests**

`test/auth.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { participantLogin, organizerLogin } from '../src/auth.js';

function setup() {
  const db = openDb();
  addParticipant(db, 'A001', 'Asha');
  return db;
}

test('an unknown admission id is refused', () => {
  assert.deepEqual(participantLogin(setup(), 'NOPE'), { ok: false, error: 'unknown_id' });
});

test('login accepts spaces and lower case', () => {
  const r = participantLogin(setup(), ' a001 ');
  assert.equal(r.ok, true);
  assert.equal(r.participant.admissionId, 'A001');
  assert.equal(r.participant.name, 'Asha');
});

test('a lobby participant gets the lobby view', () => {
  assert.equal(participantLogin(setup(), 'A001').view, 'lobby');
});

test('an in_game participant gets the game view, with company and role', () => {
  const db = setup();
  db.prepare("UPDATE participants SET status='in_game', game_id=3, company='A', role='CFO'").run();
  const r = participantLogin(db, 'A001');
  assert.equal(r.view, 'game');
  assert.equal(r.participant.role, 'CFO');
});

test('a completed participant gets the graphs of their OWN old game, even while game 4 runs', () => {
  const db = setup();
  db.prepare("UPDATE participants SET status='completed', game_id=3").run();
  db.prepare('INSERT INTO games (id, problem_id, started_at) VALUES (4, 1, 0)').run();
  const r = participantLogin(db, 'A001');
  assert.equal(r.view, 'graphs');
  assert.equal(r.participant.gameId, 3);
});

test('every login attempt that matches an id is logged against it', () => {
  const db = setup();
  participantLogin(db, 'A001', 99);
  const e = db.prepare("SELECT * FROM events WHERE type='login'").get();
  assert.equal(e.admission_id, 'A001');
  assert.equal(e.ts, 99);
});

test('organizer password must match and not be empty', () => {
  assert.equal(organizerLogin('secret', 'secret'), true);
  assert.equal(organizerLogin('wrong', 'secret'), false);
  assert.equal(organizerLogin('', ''), false);
  assert.equal(organizerLogin(undefined, 'secret'), false);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/auth.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/auth.js`:

```js
import { logEvent } from './events.js';
import { normId } from './roster.js';

const VIEW_BY_STATUS = { lobby: 'lobby', in_game: 'game', completed: 'graphs' };

export function participantLogin(db, admissionId, now = Date.now()) {
  const id = normId(admissionId);
  const p = db.prepare('SELECT * FROM participants WHERE admission_id = ?').get(id);
  if (!p) return { ok: false, error: 'unknown_id' };
  logEvent(db, { ts: now, gameId: p.game_id, admissionId: id, type: 'login' });
  return {
    ok: true,
    view: VIEW_BY_STATUS[p.status],
    participant: {
      admissionId: id,
      name: p.name,
      status: p.status,
      gameId: p.game_id,
      company: p.company,
      role: p.role,
    },
  };
}

export function organizerLogin(password, expected) {
  return typeof password === 'string' && password.length > 0 && password === expected;
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth.js test/auth.test.js
git commit -m "feat: participant and organizer login"
```

---

### Task 5: Lobby, start game, Next Game

**Files:**
- Create: `src/lobby.js`, `test/lobby.test.js`

**Interfaces:**
- Consumes: `openDb`, `logEvent` (Task 2), `normId`, `addParticipant` (Task 3)
- Produces:
  - `ROLES = ['CEO','CTO','CFO','CMO','COO']`
  - `assign(db, admissionId, company, role) -> void` (lobby participants only; throws if the company or role is invalid or the seat is already taken)
  - `startGame(db, problemId, now) -> gameId` (needs all 10 seats filled and no game running; sets all 10 to `in_game`)
  - `endGame(db, gameId, now) -> void` (the Next Game click: every player of that game becomes `completed`; sets `ended_at`)

- [ ] **Step 1: Write the failing tests**

`test/lobby.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame, endGame } from '../src/lobby.js';

function seeded(n = 10) {
  const db = openDb();
  for (let i = 0; i < n; i++) addParticipant(db, `S${i}`, `Player ${i}`);
  return db;
}
function fillAll(db) {
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
}
const status = (db) => db.prepare('SELECT status FROM participants ORDER BY admission_id').all().map((r) => r.status);

test('a role already taken in a company is refused', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assert.throws(() => assign(db, 'S1', 'A', 'CEO'), /already has a CEO/);
});

test('the same role is allowed in the other company', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S1', 'B', 'CEO');
});

test('reassigning the same player moves them without clashing with themselves', () => {
  const db = seeded();
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S0', 'A', 'CEO');
  assign(db, 'S0', 'B', 'CFO');
});

test('an invalid company or role is refused', () => {
  const db = seeded();
  assert.throws(() => assign(db, 'S0', 'C', 'CEO'));
  assert.throws(() => assign(db, 'S0', 'A', 'JANITOR'));
});

test('startGame refuses a half-filled lobby and changes nothing', () => {
  const db = seeded();
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) { if (i < 9) assign(db, `S${i}`, c, r); i++; }
  assert.throws(() => startGame(db, 1, 1000), /five roles/);
  assert.deepEqual(new Set(status(db)), new Set(['lobby']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0);
});

test('startGame puts all ten in_game and links them to the game', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 2, 1000);
  assert.deepEqual(new Set(status(db)), new Set(['in_game']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants WHERE game_id = ?').get(gid).n, 10);
  assert.equal(db.prepare('SELECT problem_id, started_at FROM games WHERE id = ?').get(gid).problem_id, 2);
});

test('a second startGame while a game runs is refused', () => {
  const db = seeded(20);
  fillAll(db);
  startGame(db, 1, 1000);
  assert.throws(() => startGame(db, 2, 2000), /already running/);
});

test('endGame marks the ten completed and keeps their game link', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.deepEqual(new Set(status(db)), new Set(['completed']));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants WHERE game_id = ?').get(gid).n, 10);
  assert.equal(db.prepare('SELECT ended_at FROM games WHERE id = ?').get(gid).ended_at, 5000);
});

test('a completed participant cannot be assigned again', () => {
  const db = seeded(20);
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.throws(() => assign(db, 'S0', 'A', 'CEO'), /not in the lobby/);
});

test('start and end are logged against the admission ids', () => {
  const db = seeded();
  fillAll(db);
  const gid = startGame(db, 1, 1000);
  endGame(db, gid, 5000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='game_start'").get().n, 10);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='game_end'").get().n, 10);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/lobby.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/lobby.js`:

```js
import { logEvent } from './events.js';
import { normId } from './roster.js';

export const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
const COMPANIES = ['A', 'B'];

export function assign(db, admissionId, company, role) {
  if (!COMPANIES.includes(company)) throw new Error('company must be A or B');
  if (!ROLES.includes(role)) throw new Error('unknown role');
  const id = normId(admissionId);
  const p = db.prepare('SELECT status FROM participants WHERE admission_id = ?').get(id);
  if (!p) throw new Error('unknown participant');
  if (p.status !== 'lobby') throw new Error('participant is not in the lobby');
  const taken = db
    .prepare(
      "SELECT 1 FROM participants WHERE status='lobby' AND company=? AND role=? AND admission_id<>?"
    )
    .get(company, role, id);
  if (taken) throw new Error(`${company} already has a ${role}`);
  db.prepare('UPDATE participants SET company = ?, role = ? WHERE admission_id = ?').run(company, role, id);
}

export function startGame(db, problemId, now) {
  if (db.prepare('SELECT 1 FROM games WHERE ended_at IS NULL').get()) {
    throw new Error('a game is already running');
  }
  const seated = db
    .prepare("SELECT admission_id, company, role FROM participants WHERE status='lobby' AND company IS NOT NULL AND role IS NOT NULL")
    .all();
  const full = COMPANIES.every((c) => ROLES.every((r) => seated.some((p) => p.company === c && p.role === r)));
  if (!full) throw new Error('both companies need all five roles before the game can start');

  return db.transaction(() => {
    const gameId = db
      .prepare('INSERT INTO games (problem_id, started_at, heartbeat_at) VALUES (?, ?, ?)')
      .run(problemId, now, now).lastInsertRowid;
    const setGame = db.prepare("UPDATE participants SET status='in_game', game_id=? WHERE admission_id=?");
    for (const p of seated) {
      setGame.run(gameId, p.admission_id);
      logEvent(db, { ts: now, gameId, admissionId: p.admission_id, type: 'game_start', payload: { company: p.company, role: p.role, problemId } });
    }
    return Number(gameId);
  })();
}

export function endGame(db, gameId, now) {
  db.transaction(() => {
    const players = db.prepare('SELECT admission_id FROM participants WHERE game_id = ?').all(gameId);
    db.prepare("UPDATE participants SET status='completed' WHERE game_id = ?").run(gameId);
    db.prepare('UPDATE games SET ended_at = ? WHERE id = ?').run(now, gameId);
    for (const p of players) logEvent(db, { ts: now, gameId, admissionId: p.admission_id, type: 'game_end' });
  })();
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lobby.js test/lobby.test.js
git commit -m "feat: lobby seats, start game, Next Game"
```

---

### Task 6: Phase timeline

**Files:**
- Create: `src/phases.js`, `test/phases.test.js`

**Interfaces:**
- Produces (pure functions, no I/O):
  - `timeline(game) -> [[name, seconds], ...]` for `game = { startedAt, ideationSavedSec }`
  - `phaseAt(game, nowMs) -> { phase: 'briefing'|'ideation'|'shop'|'summary'|'competition'|'ended', remainingSec }`
  - `endIdeationEarly(game, nowMs) -> game` (a new game object with the saved time added; throws if not in Ideation)

- [ ] **Step 1: Write the failing tests**

`test/phases.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { timeline, phaseAt, endIdeationEarly } from '../src/phases.js';

const g = { startedAt: 0, ideationSavedSec: 0 };

test('the default timeline matches the spec', () => {
  assert.deepEqual(timeline(g), [
    ['briefing', 180], ['ideation', 180], ['shop', 420], ['summary', 20], ['competition', 960],
  ]);
});

test('phases change exactly on the boundary', () => {
  assert.deepEqual(phaseAt(g, 0), { phase: 'briefing', remainingSec: 180 });
  assert.deepEqual(phaseAt(g, 179_000), { phase: 'briefing', remainingSec: 1 });
  assert.deepEqual(phaseAt(g, 180_000), { phase: 'ideation', remainingSec: 180 });
  assert.deepEqual(phaseAt(g, 360_000), { phase: 'shop', remainingSec: 420 });
  assert.deepEqual(phaseAt(g, 780_000), { phase: 'summary', remainingSec: 20 });
  assert.deepEqual(phaseAt(g, 800_000), { phase: 'competition', remainingSec: 960 });
});

test('the game is ended after the competition and stays ended', () => {
  assert.deepEqual(phaseAt(g, 1_759_000), { phase: 'competition', remainingSec: 1 });
  assert.deepEqual(phaseAt(g, 1_760_000), { phase: 'ended', remainingSec: 0 });
  assert.deepEqual(phaseAt(g, 9_999_999), { phase: 'ended', remainingSec: 0 });
});

test('a clock reading before the start is treated as the start', () => {
  assert.deepEqual(phaseAt({ startedAt: 5000, ideationSavedSec: 0 }, 0), { phase: 'briefing', remainingSec: 180 });
});

test('ending Ideation early adds the saved time to the Shop', () => {
  const early = endIdeationEarly(g, 200_000); // 20 s into Ideation, 160 s left
  assert.equal(early.ideationSavedSec, 160);
  assert.deepEqual(phaseAt(early, 200_000), { phase: 'shop', remainingSec: 580 });
});

test('the total length does not change after an early end', () => {
  const early = endIdeationEarly(g, 200_000);
  assert.deepEqual(phaseAt(early, 1_759_000), { phase: 'competition', remainingSec: 1 });
});

test('ending Ideation early outside Ideation is refused', () => {
  assert.throws(() => endIdeationEarly(g, 10_000), /not in ideation/);
  assert.throws(() => endIdeationEarly(g, 400_000), /not in ideation/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/phases.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/phases.js`:

```js
const BASE = [
  ['briefing', 180],
  ['ideation', 180],
  ['shop', 420],
  ['summary', 20],
  ['competition', 960],
];

export function timeline(game) {
  const saved = game.ideationSavedSec || 0;
  return BASE.map(([name, sec]) => [
    name,
    name === 'ideation' ? sec - saved : name === 'shop' ? sec + saved : sec,
  ]);
}

export function phaseAt(game, nowMs) {
  let t = Math.max(0, (nowMs - game.startedAt) / 1000);
  for (const [name, sec] of timeline(game)) {
    if (t < sec) return { phase: name, remainingSec: Math.ceil(sec - t) };
    t -= sec;
  }
  return { phase: 'ended', remainingSec: 0 };
}

export function endIdeationEarly(game, nowMs) {
  const p = phaseAt(game, nowMs);
  if (p.phase !== 'ideation') throw new Error('not in ideation');
  return { ...game, ideationSavedSec: (game.ideationSavedSec || 0) + p.remainingSec };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/phases.js test/phases.test.js
git commit -m "feat: synchronized phase timeline"
```

---

### Task 7: Seat changes in the Briefing only

**Files:**
- Create: `src/seats.js`, `test/seats.test.js`

**Interfaces:**
- Consumes: `phaseAt` (Task 6), `logEvent` (Task 2), `normId` (Task 3), `ROLES`, `assign`, `startGame` (Task 5), `rowToGame` is **not** used here: the caller passes a game object `{ startedAt, ideationSavedSec }`.
- Produces:
  - `swapSeats(db, game, gameId, idA, idB, now) -> void` (the two in-game players trade company and role)
  - `replacePlayer(db, game, gameId, outId, inId, now) -> void` (a lobby participant takes the seat of an in-game one; the one leaving goes back to the lobby with no seat)
  - Both throw `'seats are locked after the briefing'` outside the Briefing and log `seat_swap` or `seat_replace` events.

- [ ] **Step 1: Write the failing tests**

`test/seats.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { swapSeats, replacePlayer } from '../src/seats.js';

function running() {
  const db = openDb();
  for (let i = 0; i < 11; i++) addParticipant(db, `S${i}`, `Player ${i}`); // S10 waits in the lobby
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  const gameId = startGame(db, 1, 0);
  return { db, gameId, game: { startedAt: 0, ideationSavedSec: 0 } };
}
const seat = (db, id) => db.prepare('SELECT company, role, status FROM participants WHERE admission_id=?').get(id);

test('two players can swap seats during the briefing', () => {
  const { db, game, gameId } = running();
  swapSeats(db, game, gameId, 'S0', 'S6', 60_000); // A/CEO <-> B/CTO
  assert.deepEqual(seat(db, 'S0'), { company: 'B', role: 'CTO', status: 'in_game' });
  assert.deepEqual(seat(db, 'S6'), { company: 'A', role: 'CEO', status: 'in_game' });
});

test('swaps are refused once Ideation has started', () => {
  const { db, game, gameId } = running();
  assert.throws(() => swapSeats(db, game, gameId, 'S0', 'S1', 180_000), /locked after the briefing/);
  assert.deepEqual(seat(db, 'S0'), { company: 'A', role: 'CEO', status: 'in_game' });
});

test('a lobby participant can replace an in-game player during the briefing', () => {
  const { db, game, gameId } = running();
  replacePlayer(db, game, gameId, 'S2', 'S10', 10_000);
  assert.deepEqual(seat(db, 'S10'), { company: 'A', role: 'CFO', status: 'in_game' });
  assert.deepEqual(seat(db, 'S2'), { company: null, role: null, status: 'lobby' });
});

test('replacement is refused after the briefing and when the new player is not in the lobby', () => {
  const { db, game, gameId } = running();
  assert.throws(() => replacePlayer(db, game, gameId, 'S2', 'S10', 200_000), /locked after the briefing/);
  assert.throws(() => replacePlayer(db, game, gameId, 'S2', 'S3', 10_000), /not in the lobby/);
});

test('every seat change is logged', () => {
  const { db, game, gameId } = running();
  swapSeats(db, game, gameId, 'S0', 'S1', 10_000);
  replacePlayer(db, game, gameId, 'S2', 'S10', 20_000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('seat_swap','seat_replace')").get().n, 2);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/seats.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/seats.js`:

```js
import { logEvent } from './events.js';
import { normId } from './roster.js';
import { phaseAt } from './phases.js';

function requireBriefing(game, now) {
  if (phaseAt(game, now).phase !== 'briefing') throw new Error('seats are locked after the briefing');
}

function inGamePlayer(db, gameId, id) {
  const p = db.prepare("SELECT * FROM participants WHERE admission_id=? AND game_id=? AND status='in_game'").get(id, gameId);
  if (!p) throw new Error(`${id} is not in this game`);
  return p;
}

export function swapSeats(db, game, gameId, idA, idB, now) {
  requireBriefing(game, now);
  const a = inGamePlayer(db, gameId, normId(idA));
  const b = inGamePlayer(db, gameId, normId(idB));
  db.transaction(() => {
    const set = db.prepare('UPDATE participants SET company=?, role=? WHERE admission_id=?');
    set.run(b.company, b.role, a.admission_id);
    set.run(a.company, a.role, b.admission_id);
    logEvent(db, { ts: now, gameId, admissionId: a.admission_id, type: 'seat_swap',
      payload: { with: b.admission_id, from: [a.company, a.role], to: [b.company, b.role] } });
  })();
}

export function replacePlayer(db, game, gameId, outId, inId, now) {
  requireBriefing(game, now);
  const out = inGamePlayer(db, gameId, normId(outId));
  const incoming = db.prepare('SELECT * FROM participants WHERE admission_id=?').get(normId(inId));
  if (!incoming) throw new Error('unknown participant');
  if (incoming.status !== 'lobby') throw new Error('the new player is not in the lobby');
  db.transaction(() => {
    db.prepare("UPDATE participants SET status='in_game', game_id=?, company=?, role=? WHERE admission_id=?")
      .run(gameId, out.company, out.role, incoming.admission_id);
    db.prepare("UPDATE participants SET status='lobby', game_id=NULL, company=NULL, role=NULL WHERE admission_id=?")
      .run(out.admission_id);
    logEvent(db, { ts: now, gameId, admissionId: incoming.admission_id, type: 'seat_replace',
      payload: { replaced: out.admission_id, company: out.company, role: out.role } });
  })();
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/seats.js test/seats.test.js
git commit -m "feat: briefing-only seat swaps and replacements"
```

---

### Task 8: Heartbeat and resume after a restart

**Files:**
- Create: `src/persist.js`, `test/persist.test.js`

**Interfaces:**
- Consumes: `openDb` (Task 2), `startGame` (Task 5), `phaseAt` (Task 6)
- Produces:
  - `rowToGame(row) -> { id, problemId, startedAt, ideationSavedSec }`
  - `activeGame(db) -> game | null` (the one game with `ended_at IS NULL`)
  - `heartbeat(db, gameId, now) -> void`
  - `resumeActiveGame(db, now) -> game | null` (after a restart: rebuilds `started_at` so the elapsed time equals the time up to the last heartbeat, ignoring however long the Pi was off or what its clock says now)

- [ ] **Step 1: Write the failing tests**

`test/persist.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame, endGame } from '../src/lobby.js';
import { phaseAt } from '../src/phases.js';
import { activeGame, heartbeat, resumeActiveGame } from '../src/persist.js';

function running(startMs) {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  const gameId = startGame(db, 1, startMs);
  return { db, gameId };
}

test('no game running means nothing to resume', () => {
  assert.equal(resumeActiveGame(openDb(), 1000), null);
  assert.equal(activeGame(openDb()), null);
});

test('after a restart the timer continues from the last heartbeat, not from the wall clock', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000); // 200 s in: Ideation, 160 s left
  // Pi was off for an hour; its clock now reads something unrelated:
  const g = resumeActiveGame(db, 9_000_000);
  assert.deepEqual(phaseAt(g, 9_000_000), { phase: 'ideation', remainingSec: 160 });
});

test('the timer still counts down normally after a resume', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 200_000);
  const g = resumeActiveGame(db, 9_000_000);
  assert.deepEqual(phaseAt(g, 9_000_000 + 160_000), { phase: 'shop', remainingSec: 420 });
});

test('a clock that jumped BACKWARD on reboot does not push the game below zero elapsed', () => {
  const { db, gameId } = running(5_000_000);
  heartbeat(db, gameId, 5_000_000 + 30_000);
  const g = resumeActiveGame(db, 100); // clock reset to near zero
  assert.deepEqual(phaseAt(g, 100), { phase: 'briefing', remainingSec: 150 });
});

test('resuming twice in a row does not lose or gain time', () => {
  const { db, gameId } = running(1_000_000);
  heartbeat(db, gameId, 1_000_000 + 50_000);
  resumeActiveGame(db, 7_000_000);
  const g = resumeActiveGame(db, 8_000_000); // second restart with no heartbeat in between
  assert.deepEqual(phaseAt(g, 8_000_000), { phase: 'briefing', remainingSec: 130 });
});

test('an ended game is never resumed', () => {
  const { db, gameId } = running(0);
  endGame(db, gameId, 10);
  assert.equal(resumeActiveGame(db, 20), null);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/persist.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/persist.js`:

```js
export const rowToGame = (g) => ({
  id: g.id,
  problemId: g.problem_id,
  startedAt: g.started_at,
  ideationSavedSec: g.ideation_saved_sec,
});

export function activeGame(db) {
  const g = db.prepare('SELECT * FROM games WHERE ended_at IS NULL').get();
  return g ? rowToGame(g) : null;
}

export function heartbeat(db, gameId, now) {
  db.prepare('UPDATE games SET heartbeat_at = ? WHERE id = ?').run(now, gameId);
}

export function resumeActiveGame(db, now) {
  const g = db.prepare('SELECT * FROM games WHERE ended_at IS NULL').get();
  if (!g) return null;
  const elapsed = Math.max(0, (g.heartbeat_at ?? g.started_at) - g.started_at);
  const startedAt = now - elapsed;
  db.prepare('UPDATE games SET started_at = ?, heartbeat_at = ? WHERE id = ?').run(startedAt, now, g.id);
  return rowToGame({ ...g, started_at: startedAt });
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/persist.js test/persist.test.js
git commit -m "feat: heartbeat and resume after restart"
```

---

### Task 9: WebSocket server

**Files:**
- Create: `src/server.js`, `test/server.test.js`

**Interfaces:**
- Consumes: `participantLogin`, `organizerLogin` (Task 4), `activeGame` (Task 8), `phaseAt` (Task 6)
- Produces: `createApp({ db, organizerPassword, now = Date.now }) -> { server, wss, tickAll() }`
  - Client to server: `{ type: 'login', admissionId }` or `{ type: 'organizer', password }`
  - Server to client: `{ type: 'welcome', view, participant }`, `{ type: 'welcome', view: 'organizer' }`, `{ type: 'error', error }`, and every second `{ type: 'tick', serverNow, phase, remainingSec, gameId }`.
  - Ticks go only to the organizer and to participants whose status is `in_game` in the running game. A participant whose status is `completed` gets no live ticks.

- [ ] **Step 1: Write the failing tests**

`test/server.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame, endGame } from '../src/lobby.js';
import { createApp } from '../src/server.js';

async function boot(now = () => 2000) {
  const db = openDb();
  for (let i = 0; i < 20; i++) addParticipant(db, `S${i}`, `P${i}`);
  const app = createApp({ db, organizerPassword: 'pw', now });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  return { db, app, url };
}
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
function seatAll(db, first = 0) { let i = first; for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r); }
const close = async (app, ...sockets) => {
  sockets.forEach((s) => s.terminate());
  app.wss.clients.forEach((c) => c.terminate());
  await new Promise((r) => app.server.close(r));
};

test('an unknown id gets an error', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  assert.deepEqual(await ask(ws, { type: 'login', admissionId: 'NOPE' }), { type: 'error', error: 'unknown_id' });
  await close(app, ws);
});

test('a lobby participant is welcomed to the lobby', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  const m = await ask(ws, { type: 'login', admissionId: ' s0 ' });
  assert.equal(m.type, 'welcome');
  assert.equal(m.view, 'lobby');
  assert.equal(m.participant.admissionId, 'S0');
  await close(app, ws);
});

test('a wrong organizer password is refused, the right one is welcomed', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  assert.equal((await ask(ws, { type: 'organizer', password: 'bad' })).type, 'error');
  assert.deepEqual(await ask(ws, { type: 'organizer', password: 'pw' }), { type: 'welcome', view: 'organizer' });
  await close(app, ws);
});

test('an in-game participant receives the synchronized tick', async () => {
  const { db, app, url } = await boot(() => 2000);
  seatAll(db);
  startGame(db, 1, 1000); // 1 s in: 179 s of Briefing left
  const ws = await connect(url);
  assert.equal((await ask(ws, { type: 'login', admissionId: 'S0' })).view, 'game');
  const t = next(ws);
  app.tickAll();
  assert.deepEqual(await t, { type: 'tick', serverNow: 2000, phase: 'briefing', remainingSec: 179, gameId: 1 });
  await close(app, ws);
});

test('a completed participant gets no live ticks while a later game runs', async () => {
  const { db, app, url } = await boot(() => 2000);
  seatAll(db);
  endGame(db, startGame(db, 1, 1000), 1500);   // game 1 is over: S0 to S9 are completed
  seatAll(db, 10);
  startGame(db, 2, 1800);                       // game 2 is running with S10 to S19
  const ws = await connect(url);
  assert.equal((await ask(ws, { type: 'login', admissionId: 'S0' })).view, 'graphs');
  let got = false;
  ws.on('message', () => { got = true; });
  app.tickAll();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(got, false);
  await close(app, ws);
});

test('malformed messages do not crash the server', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  const p = next(ws);
  ws.send('{not json');
  assert.deepEqual(await p, { type: 'error', error: 'bad_message' });
  assert.equal((await ask(ws, { type: 'login', admissionId: 'S0' })).type, 'welcome');
  await close(app, ws);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/server.js'`

- [ ] **Step 3: Write the minimal implementation**

`src/server.js`:

```js
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { participantLogin, organizerLogin } from './auth.js';
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';

export function createApp({ db, organizerPassword, now = Date.now }) {
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server });
  const sessions = new Map(); // ws -> { kind: 'organizer' } | { kind: 'participant', admissionId }

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

  wss.on('connection', (ws) => {
    ws.on('close', () => sessions.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', error: 'bad_message' });
      }
      if (msg && msg.type === 'login') {
        const r = participantLogin(db, msg.admissionId, now());
        if (!r.ok) return send(ws, { type: 'error', error: r.error });
        sessions.set(ws, { kind: 'participant', admissionId: r.participant.admissionId });
        return send(ws, { type: 'welcome', view: r.view, participant: r.participant });
      }
      if (msg && msg.type === 'organizer') {
        if (!organizerLogin(msg.password, organizerPassword)) return send(ws, { type: 'error', error: 'bad_password' });
        sessions.set(ws, { kind: 'organizer' });
        return send(ws, { type: 'welcome', view: 'organizer' });
      }
      return send(ws, { type: 'error', error: 'bad_message' });
    });
  });

  function tickAll() {
    const game = activeGame(db);
    if (!game) return;
    const t = now();
    const tick = { type: 'tick', serverNow: t, ...phaseAt(game, t), gameId: game.id };
    for (const [ws, s] of sessions) {
      if (s.kind === 'organizer') { send(ws, tick); continue; }
      const p = db.prepare('SELECT status, game_id FROM participants WHERE admission_id = ?').get(s.admissionId);
      if (p && p.status === 'in_game' && p.game_id === game.id) send(ws, tick);
    }
  }

  return { server, wss, tickAll };
}
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "feat: websocket server with synchronized tick"
```

---

### Task 10: Boot script and automatic start

**Files:**
- Create: `src/index.js`, `deploy/showdown.service`, `test/index.test.js`

**Interfaces:**
- Consumes: `openDb`, `resumeActiveGame`, `heartbeat`, `activeGame`, `createApp`
- Produces: `bootstrap({ dbFile, organizerPassword, port, now }) -> { app, stop() }` (exported from `src/index.js`; the file only listens when run directly). Intervals: a tick every 1 s and a heartbeat every 5 s. On boot it calls `resumeActiveGame`.
- The systemd unit starts the server at boot, restarts it on any exit, and lets it bind port 80.

- [ ] **Step 1: Write the failing test**

`test/index.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { phaseAt } from '../src/phases.js';
import { activeGame } from '../src/persist.js';
import { bootstrap } from '../src/index.js';

test('a restart on the same database file resumes the running game', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'showdown-'));
  const dbFile = join(dir, 'game.db');
  try {
    // First life: start a game 200 s ago, record a heartbeat, then "crash".
    const db1 = openDb(dbFile);
    for (let i = 0; i < 10; i++) addParticipant(db1, `S${i}`, `P${i}`);
    let i = 0;
    for (const c of ['A', 'B']) for (const r of ROLES) assign(db1, `S${i++}`, c, r);
    const gid = startGame(db1, 1, 1_000_000);
    db1.prepare('UPDATE games SET heartbeat_at = ? WHERE id = ?').run(1_200_000, gid);
    db1.close();

    // Second life: a new process with a wildly different clock.
    const { app, stop } = await bootstrap({ dbFile, organizerPassword: 'pw', port: 0, now: () => 50_000_000 });
    try {
      const g = activeGame(app.db);
      assert.deepEqual(phaseAt(g, 50_000_000), { phase: 'ideation', remainingSec: 160 });
    } finally {
      await stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../src/index.js'` (or `bootstrap is not a function`)

- [ ] **Step 3: Write the minimal implementation**

`src/index.js`:

```js
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './server.js';
import { activeGame, heartbeat, resumeActiveGame } from './persist.js';

export async function bootstrap({ dbFile, organizerPassword, port, now = Date.now }) {
  if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  resumeActiveGame(db, now());
  const app = createApp({ db, organizerPassword, now });
  app.db = db;
  await new Promise((resolve) => app.server.listen(port, '0.0.0.0', resolve));

  const tick = setInterval(() => app.tickAll(), 1000);
  const beat = setInterval(() => {
    const g = activeGame(db);
    if (g) heartbeat(db, g.id, now());
  }, 5000);

  return {
    app,
    async stop() {
      clearInterval(tick);
      clearInterval(beat);
      app.wss.close();
      await new Promise((r) => app.server.close(r));
      db.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const organizerPassword = process.env.ORGANIZER_PASSWORD;
  if (!organizerPassword) {
    console.error('Set ORGANIZER_PASSWORD before starting the server.');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 80);
  await bootstrap({ dbFile: process.env.DB_FILE || 'data/showdown.db', organizerPassword, port });
  console.log(`Showdown server listening on port ${port}`);
}
```

`deploy/showdown.service`:

```ini
[Unit]
Description=Startup Showdown game server
After=network.target

[Service]
WorkingDirectory=/home/pi/showdown
Environment=ORGANIZER_PASSWORD=change-me-before-the-event
Environment=PORT=80
Environment=DB_FILE=/home/pi/showdown/data/showdown.db
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=1
AmbientCapabilities=CAP_NET_BIND_SERVICE
User=pi

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Run to see it pass**

Run: `npm test`
Expected: PASS (the whole suite)

- [ ] **Step 5: Install on the Pi and check by hand (not automated)**

On the Pi: copy the project to `/home/pi/showdown`, run `npm ci` while online, edit the password in `deploy/showdown.service`, then:

```bash
sudo cp deploy/showdown.service /etc/systemd/system/
sudo systemctl enable --now showdown
sudo systemctl status showdown
sudo reboot
```

Expected: after the reboot the service is `active (running)` without anyone logging in. Then `sudo kill -9 $(pgrep -f "node src/index.js")` and confirm systemd restarts it within about a second. (The hotspot setup is a separate one-time Pi task: a fixed address such as `10.42.0.1`, Wi-Fi name and password as in Section 0 of the guide.)

- [ ] **Step 6: Commit**

```bash
git add src/index.js test/index.test.js deploy/showdown.service
git commit -m "feat: boot script, resume on start, systemd service"
```

---

## Self-review against the spec

**Spec coverage (this plan's slice):**
- Two login pages, Admission ID as key, pre-loaded roster, Add participant: Tasks 3, 4. (The two HTML pages themselves are built in plan 2 with the frontend-design skill; the server side they call is here.)
- Statuses lobby / In Game / Game Completed, completed login sees only own old graphs: Tasks 4, 5.
- Organizer assigns companies and roles by hand; changes only in the Briefing: Tasks 5, 7.
- Synchronized timer, phase lengths, early Ideation end adding to Shop: Tasks 6, 9.
- Only the organizer ends a game; the timer never changes statuses: Task 5 (`endGame` is the only status change at the end).
- Reconnect to the same session, company and role: Tasks 4, 9 (a fresh login returns the stored company and role).
- Crash recovery and automatic start: Tasks 8, 10.
- Everything recorded against the Admission ID: Tasks 2 to 5, 7 (events table).
- Not in this plan on purpose: voting, shop, wallet, Competition, mini games, graphs, Excel, backups, HTML screens (plans 2 to 6). The organizer's "pick the problem statement" is the `problemId` argument of `startGame`; the problem statement data is loaded in plan 2.

**Placeholder scan:** none. Every step has the full code or the exact command.

**Type consistency:** `normId`, `addParticipant`, `assign`, `startGame(db, problemId, now)`, `endGame(db, gameId, now)`, `phaseAt(game, nowMs)`, `game = { startedAt, ideationSavedSec }`, `activeGame`, `heartbeat`, `resumeActiveGame`, `createApp` keep the same names and signatures across Tasks 3 to 10.

**Review Focus coverage:** items 1 and 2 in Tasks 3 and 4; item 3 in Task 5; item 4 in Tasks 4 and 9; item 5 in Task 8 (and the integration check in Task 10); item 6 in Task 7.

**Assumption to confirm:** the Briefing, Ideation, Shop, summary and Competition times add to 29 minutes 20 seconds (1,760 s), as in the guide's table, not an exact 30 minutes. The other 40 seconds is left as slack for the organizer to click Start and Next Game.
