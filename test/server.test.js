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

test('non-string credentials get bad_message and the server keeps running', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  for (const m of [
    { type: 'login', admissionId: 123 },
    { type: 'login', admissionId: null },
    { type: 'login' },
    { type: 'organizer', password: 5 },
    { type: 'organizer', password: null },
    null,
    [],
  ]) {
    assert.deepEqual(await ask(ws, m), { type: 'error', error: 'bad_message' });
  }
  assert.equal((await ask(ws, { type: 'login', admissionId: 'S0' })).type, 'welcome');
  await close(app, ws);
});

test('an oversized message drops only that client; others still get ticks', async () => {
  const { db, app, url } = await boot(() => 2000);
  seatAll(db);
  startGame(db, 1, 1000);
  const good = await connect(url);
  assert.equal((await ask(good, { type: 'login', admissionId: 'S0' })).view, 'game');
  const bad = await connect(url);
  const closed = new Promise((r) => bad.once('close', r));
  bad.on('error', () => {});
  bad.send('x'.repeat(10000));
  await closed;
  const t = next(good);
  app.tickAll();
  assert.equal((await t).type, 'tick');
  await close(app, good, bad);
});
