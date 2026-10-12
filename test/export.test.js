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
  assert.ok(sheets.Events.rows.some((r) => r[0] == null && r[5] && String(r[5]).includes('roster_import')));
});

test('hostile text in a name stays text and the export does not fail', async () => {
  const h = story();
  h.db.prepare("UPDATE participants SET name = '=HYPERLINK(\"http://x\")' WHERE admission_id = 'S3'").run();
  const sheets = byName(await readWorkbook(await exportGame(h.db, data, h.gameId)));
  assert.equal(sheets.Players.rows.find((r) => r[1] === 'S3')[2], '=HYPERLINK("http://x")');
});

test('every event row carries game, admission id, ISO time, raw ms and type; ordering is deterministic', async () => {
  const h = story();
  const a = byName(gameSheets(h.db, data, h.gameId)).Events;
  const b = byName(gameSheets(h.db, data, h.gameId)).Events;
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.columns, ['game', 'time', 'ts_ms', 'admission_id', 'type', 'payload']);
  const n = h.db.prepare('SELECT COUNT(*) c FROM events WHERE game_id = ?').get(h.gameId).c;
  assert.equal(a.rows.length, n);
  for (const r of a.rows) {
    assert.equal(r[0], h.gameId);
    assert.equal(r[1], new Date(r[2]).toISOString()); // time comes from the stored ts, not the clock
    assert.ok(r[4]);
  }
  assert.ok(a.rows.every((r, i) => i === 0 || a.rows[i - 1][2] <= r[2]));
  const s = byName(gameSheets(h.db, data, h.gameId));
  assert.deepEqual(s.Sessions.columns.slice(-1), ['ts_ms']);
});

test('no puzzle solution, seed or password appears anywhere in the workbook files', async () => {
  const h = story();
  startPuzzle(h.ctx, h.game(), h.seat.B.CFO, mulberry32(7)); // left open: its solution is still stored
  const rows = h.db.prepare('SELECT puzzle, solution FROM puzzle_sessions').all();
  assert.ok(rows.length >= 2);
  const JSZip = (await import('jszip')).default;
  for (const buf of [await exportGame(h.db, data, h.gameId), await exportEvent(h.db, data)]) {
    const zip = await JSZip.loadAsync(buf);
    let text = '';
    for (const f of Object.values(zip.files)) if (!f.dir) text += await f.async('string');
    for (const r of rows) {
      assert.ok(r.solution.length > 4 && !text.includes(r.solution), 'solution leaked');
      assert.ok(!text.includes(r.puzzle), 'puzzle body leaked');
    }
    assert.ok(!/solution|seed/i.test(text.replace(/<[^>]+>/g, ' ').match(/\b\w*(solution|seed)\w*\b/gi)?.join(' ') ?? ''), 'solution/seed column or value present');
  }
  const puzzleCols = byName(gameSheets(h.db, data, h.gameId)).Puzzles.columns;
  assert.ok(!puzzleCols.some((c) => /solution|seed|puzzle$/.test(c)));
});

test('the event workbook includes unfinished games and the empty event still opens', async () => {
  const h = story(); // game still running, never ended
  assert.equal(h.db.prepare('SELECT ended_at FROM games WHERE id = ?').get(h.gameId).ended_at, null);
  const sheets = byName(await readWorkbook(await exportEvent(h.db, data)));
  assert.ok(sheets.Players.rows.length > 1);
  assert.ok(sheets.Samples.rows.length > 1);
  const empty = await readWorkbook(await exportEvent(makeRunning().db, data));
  assert.ok(empty.length >= 1);
  const { openDb } = await import('../src/db.js');
  assert.deepEqual((await readWorkbook(await exportEvent(openDb(':memory:'), data))).map((s) => s.name), ['Empty']);
});

test('hostile text in tagline-like fields and organizer args stays text', async () => {
  const h = story();
  logEvent(h.db, { ts: 9, gameId: h.gameId, type: 'organizer_action', payload: { action: '@SUM(1)', args: { x: '+cmd|\' /C calc\'!A0' } } });
  const sheets = byName(await readWorkbook(await exportGame(h.db, data, h.gameId)));
  const row = sheets['Organizer actions'].rows.find((r) => r[2] === '@SUM(1)');
  assert.equal(typeof row[2], 'string');
});

test('a large event (80 players, 193 samples per company, thousands of events) exports quickly', async () => {
  const h = story();
  const ins = h.db.prepare('INSERT INTO samples (game_id, ts, company, wallet, cto_rate, cmo_rate, coo_rate, cto_coins, cmo_coins, coo_coins, mini_coins, attack_coins) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const ev = h.db.prepare('INSERT INTO events (ts, game_id, admission_id, type, payload) VALUES (?,?,?,?,?)');
  h.db.transaction(() => {
    for (let i = 0; i < 193; i++) for (const c of ['A', 'B']) ins.run(h.gameId, 900000 + i * 5000, c, 1000 + i, 1, 2, 3, i, i, i, 0, 0);
    for (let i = 0; i < 4000; i++) ev.run(100000 + i, h.gameId, `S${i % 10}`, 'vote', JSON.stringify({ i, note: '=HYPERLINK("x")' }));
  })();
  for (let i = 12; i < 80; i++) h.db.prepare("INSERT INTO participants (admission_id, name) VALUES (?, ?)").run(`L${i}`, `Late ${i}`);
  const before = process.memoryUsage().rss;
  const t = Date.now();
  const buf = await exportEvent(h.db, data);
  const ms = Date.now() - t;
  const grown = process.memoryUsage().rss - before;
  // wall-clock sanity bound only: the suite runs files concurrently and under load this took 3.5 s
  assert.ok(ms < 15000, `took ${ms} ms`);
  assert.ok(grown < 300 * 1024 * 1024, `rss grew ${grown}`);
  const sheets = byName(await readWorkbook(buf));
  assert.equal(sheets.Roster.rows.length, 81);
  assert.ok(sheets.Samples.rows.length > 386);
  assert.ok(sheets.Events.rows.length > 4000);
});
