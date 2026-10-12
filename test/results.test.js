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
import { assign, startGame } from '../src/lobby.js';
import { activeGame } from '../src/persist.js';

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

// ---- extra review-focus tests ----
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';


test('before the reveal no player view carries graphs, svg or results (whole serialised view)', () => {
  const h = finished();
  for (const c of ['A', 'B']) for (const id of Object.values(h.seat[c])) {
    const s = JSON.stringify(viewFor(h.ctx, id));
    assert.equal(/<svg|"results"|"graphs"|companyVsCompany|coinDifference|roleBars/.test(s), false);
  }
  const org = JSON.stringify(organizerView(h.ctx));
  assert.equal(org.includes('<svg'), false);
});

test('a second reveal never throws, changes nothing and logs once even after the time moved on', () => {
  const h = withDir(finished());
  try {
    revealGame(h.ctx, h.game()); revealGame(h.ctx, h.game());
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='graphs_revealed'").get().n, 1);
  } finally { cleanup(h); }
});

test('images are written atomically: no temp files remain, files are real PNG and SVG', () => {
  const h = withDir(finished());
  try {
    saveGameImages(h.ctx, h.gameId, h.ctx.exportDir);
    const dir = join(h.ctx.exportDir, `game-${h.gameId}`);
    assert.equal(readdirSync(dir).some((f) => f.includes('.tmp')), false);
    assert.equal(readFileSync(join(dir, 'role-bars.png')).subarray(1, 4).toString(), 'PNG');
    assert.match(readFileSync(join(dir, 'role-bars.svg'), 'utf8'), /^<svg /);
    saveGameImages(h.ctx, h.gameId, h.ctx.exportDir); // overwrite is fine
  } finally { cleanup(h); }
});

test('saving refuses a game id that is not a positive integer (no path traversal)', () => {
  const h = withDir(finished());
  try {
    for (const bad of ['../x', '1/../../x', 1.5, -1, '1', null, undefined, NaN]) {
      assert.throws(() => saveGameImages(h.ctx, bad, h.ctx.exportDir), /game id/);
    }
    assert.equal(readdirSync(h.ctx.exportDir).length, 0);
  } finally { cleanup(h); }
});

test('two finished games and a third running: a completed player only ever gets their own game', () => {
  const h = withDir(finished());
  try {
    nextGame(h.ctx, h.game());
    const g1 = h.gameId;
    const v1 = viewFor(h.ctx, h.seat.A.CEO);
    // second game with the same ten players is impossible (completed); use two fresh ones
    for (let i = 20; i < 40; i++) h.db.prepare("INSERT INTO participants (admission_id, name) VALUES (?, ?)").run(`T${i}`, `T ${i}`);
    const seatGame = (offset) => {
      const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
      let i = offset;
      for (const c of ['A', 'B']) for (const r of roles) { assign(h.db, `T${i}`, c, r); i++; }
    };
    seatGame(20);
    const g2 = startGame(h.db, 1, h.clock.t);
    h.clock.t += 2_000_000;
    nextGame(h.ctx, activeGame(h.db));
    for (let i = 20; i < 30; i++) h.db.prepare("UPDATE participants SET status='completed' WHERE admission_id=?").run(`T${i}`);
    seatGame(30);
    const g3 = startGame(h.db, 1, h.clock.t);
    const a = viewFor(h.ctx, h.seat.A.CEO);
    const b = viewFor(h.ctx, 'T20');
    const c = viewFor(h.ctx, 'T30');
    assert.equal(a.gameId, g1); assert.equal(b.gameId, g2); assert.notEqual(g2, g3);
    assert.equal(a.graphs.roleBars, v1.graphs.roleBars);
    assert.notEqual(a.graphs.roleBars, b.graphs.roleBars);
    assert.equal(c.screen, 'game'); assert.equal(c.graphs, undefined);
  } finally { cleanup(h); }
});

// ---- reveal gate fixes ----
test('ended but unrevealed: the raw view carries no wallet, owned or numbers about the game', () => {
  const h = finished();
  const v = viewFor(h.ctx, h.seat.A.CEO);
  assert.equal(v.clock.phase, 'ended');
  assert.equal(v.wallet, 0);
  assert.deepEqual(v.owned, []);
  assert.equal(v.competition, undefined);
  const real = h.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet;
  assert.notEqual(real, 0);
  assert.equal(JSON.stringify(v).includes(String(real)), false);
});

test('Next Game without a prior reveal reveals and saves; before it nothing leaks', () => {
  const h = withDir(finished());
  try {
    assert.equal(JSON.stringify(viewFor(h.ctx, h.seat.A.CEO)).includes('<svg'), false);
    nextGame(h.ctx, h.game());
    assert.ok(h.db.prepare('SELECT revealed_at FROM games').get().revealed_at);
    assert.equal(viewFor(h.ctx, h.seat.B.CTO).graphs.roleBars.startsWith('<svg'), true);
    assert.equal(readdirSync(h.ctx.exportDir).length, 1);
  } finally { cleanup(h); }
});

test('a completed player of an unrevealed game sees only the holding screen, no graphs or coins', () => {
  const h = finished();
  h.db.prepare("UPDATE participants SET status='completed' WHERE game_id=?").run(h.gameId); // as the old end path did
  const v = viewFor(h.ctx, h.seat.A.CEO);
  assert.equal(v.screen, 'graphs');
  assert.equal(v.graphs, undefined);
  assert.equal(/<svg|wallet|coins/.test(JSON.stringify(v)), false);
});

test('reveal then Next Game still works', () => {
  const h = withDir(finished());
  try {
    revealGame(h.ctx, h.game());
    nextGame(h.ctx, h.game());
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='graphs_revealed'").get().n, 1);
    assert.ok(viewFor(h.ctx, h.seat.A.CEO).graphs);
  } finally { cleanup(h); }
});
