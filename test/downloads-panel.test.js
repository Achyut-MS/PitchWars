import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { organizerView, viewFor } from '../src/views.js';
import { renderOrganizer } from '../public/render-organizer.js';
import { readWorkbook } from '../src/xlsx.js';

const data = loadData('data');
function setup(games = 1) {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  const exportDir = mkdtempSync(join(tmpdir(), 'dl-'));
  const t = { v: 0 };
  const app = createApp({ db, organizerPassword: 'pw', now: () => t.v, data, staticRoot: null, exportDir, backupDir: mkdtempSync(join(tmpdir(), 'bk-')) });
  return { db, app, t, exportDir };
}
function seat(db) { let i = 0; for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r); }

test('organizerView lists every game newest first with ids, times and flags only', () => {
  const { db, app, t } = setup();
  assert.deepEqual(organizerView(app.ctx).downloads, { games: [], event: true });
  seat(db); startGame(db, 1, 0);
  let d = organizerView(app.ctx).downloads;
  assert.deepEqual(d.games, [{ id: 1, endedAt: null, revealedAt: null, running: true }]);
  t.v = 5000; app.runAction('next_game');
  d = organizerView(app.ctx).downloads;
  assert.equal(d.games[0].running, false);
  assert.equal(d.games[0].endedAt, 5000);
  assert.equal(d.games[0].revealedAt, 5000);
  assert.deepEqual(Object.keys(d.games[0]).sort(), ['endedAt', 'id', 'revealedAt', 'running']);
});

test('the list is capped at 20, newest first', () => {
  const { db, app } = setup();
  for (let i = 0; i < 25; i++) db.prepare('INSERT INTO games (problem_id, started_at, ended_at) VALUES (1, ?, ?)').run(i, i + 1);
  const g = organizerView(app.ctx).downloads.games;
  assert.equal(g.length, 20);
  assert.equal(g[0].id, 25);
});

test('a player view never carries the downloads list', () => {
  const { db, app } = setup();
  seat(db); startGame(db, 1, 0);
  for (const id of ['S0', 'S5']) {
    const json = JSON.stringify(viewFor(app.ctx, id));
    assert.equal(/downloads|revealedAt|\/export\//.test(json), false);
  }
});

const links = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/export/'));

test('the Downloads panel shows in lobby, running and between-games states', () => {
  const lobbyHtml = renderOrganizer({ participants: [], problems: [], game: null, downloads: { games: [{ id: 1, endedAt: 9, revealedAt: 9, running: false }, { id: 2, endedAt: 9, revealedAt: null, running: false }], event: true } });
  assert.match(lobbyHtml, /Downloads/);
  assert.match(lobbyHtml, /Whole event \(Excel\)/);
  const l = links(lobbyHtml);
  assert.ok(l.includes('/export/event.xlsx') && l.includes('/export/game/1.xlsx') && l.includes('/export/game/2.xlsx'));
  assert.ok(l.includes('/export/game/1/role-bars.png') && !l.some((h) => h.startsWith('/export/game/2/')));
  assert.match(lobbyHtml, /graphs appear after Reveal/);
  assert.equal(/token/i.test(lobbyHtml), false);
  assert.equal(lobbyHtml.match(/data-export/g).length, l.length);

  const running = renderOrganizer({ participants: [], problems: [], rehearsalSpeed: null, game: { id: 3, clock: { phase: 'ideation', remainingSec: 5 }, ended: false, revealed: false, companies: {} }, downloads: { games: [{ id: 3, endedAt: null, revealedAt: null, running: true }], event: true } });
  assert.match(running, /Downloads/);
  assert.ok(links(running).includes('/export/game/3.xlsx'));
  assert.ok(links(running).includes('/export/event.xlsx'));
});

test('a missing downloads field renders without a panel and does not throw', () => {
  assert.doesNotThrow(() => renderOrganizer({ participants: [], problems: [], game: null }));
});

const connect = (port) => new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.once('open', () => res(ws)); ws.once('error', rej); });
const get = (port, path) => new Promise((resolve) => { http.get({ port, path }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c) })); }); });

test('after Next Game the finished game workbook, saved PNGs and the event workbook still download', async () => {
  const { db, app, t, exportDir } = setup();
  seat(db); startGame(db, 1, 0);
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const ws = await connect(port);
  const token = await new Promise((res) => { ws.once('message', (d) => res(JSON.parse(d).token)); ws.send(JSON.stringify({ type: 'organizer', password: 'pw' })); });
  t.v = 5000; app.runAction('next_game');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM games WHERE ended_at IS NULL').get().n, 0);
  const x = await get(port, `/export/game/1.xlsx?token=${token}`);
  assert.equal(x.status, 200);
  assert.equal((await readWorkbook(x.body)).some((s) => s.name === 'Players'), true);
  const png = await get(port, `/export/game/1/role-bars.png?token=${token}`);
  assert.equal(png.status, 200);
  assert.equal(png.body.slice(0, 4).toString('hex'), '89504e47');
  assert.equal((await get(port, `/export/event.xlsx?token=${token}`)).status, 200);
  ws.terminate(); app.wss.clients.forEach((c) => c.terminate());
  await new Promise((r) => app.server.close(r));
});
