import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  addParticipant(db, 'S0', 'P0');
  const app = createApp({ db, organizerPassword: 'pw', now: () => 7000, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, port: app.server.address().port };
}
const connect = (port) => new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
const closed = (ws) => new Promise((r) => ws.once('close', r));
const settle = () => new Promise((r) => setTimeout(r, 100));
const rows = (db, type) => db.prepare('SELECT * FROM events WHERE type = ? ORDER BY id').all(type);
const done = async (app) => { app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

test('a participant closing is logged once with Admission ID, game id and time', async () => {
  const { db, app, port } = await boot();
  const ws = await connect(port);
  const p = next(ws);
  ws.send(JSON.stringify({ type: 'login', admissionId: 's0' }));
  await p;
  ws.close();
  await closed(ws); await settle();
  const r = rows(db, 'disconnect');
  assert.equal(r.length, 1);
  assert.equal(r[0].admission_id, 'S0');
  assert.equal(r[0].ts, 7000);
  assert.equal(r[0].game_id, null);
  assert.equal(rows(db, 'login').length, 1);
  await done(app);
});

test('the disconnect carries the game id of the participant', async () => {
  const { db, app, port } = await boot();
  db.prepare("UPDATE participants SET status='in_game', game_id=3 WHERE admission_id='S0'").run();
  const ws = await connect(port);
  const p = next(ws);
  ws.send(JSON.stringify({ type: 'login', admissionId: 'S0' }));
  await p;
  ws.terminate(); await closed(ws); await settle();
  assert.equal(rows(db, 'disconnect')[0].game_id, 3);
  await done(app);
});

test('unauthenticated, wrong-id and organizer sockets log nothing; reconnect logs login then disconnect again', async () => {
  const { db, app, port } = await boot();
  const a = await connect(port); a.terminate(); await closed(a);
  const b = await connect(port); let p = next(b); b.send(JSON.stringify({ type: 'login', admissionId: 'NOPE' })); await p; b.terminate(); await closed(b);
  const c = await connect(port); p = next(c); c.send(JSON.stringify({ type: 'organizer', password: 'pw' })); await p; c.terminate(); await closed(c);
  await settle();
  assert.equal(rows(db, 'disconnect').length, 0);
  for (let i = 0; i < 2; i++) {
    const w = await connect(port); const q = next(w);
    w.send(JSON.stringify({ type: 'login', admissionId: 'S0' })); await q;
    w.terminate(); await closed(w); await settle();
  }
  assert.equal(rows(db, 'disconnect').length, 2);
  assert.equal(rows(db, 'login').length, 2);
  await done(app);
});

test('a socket error plus close, and the ping reaper, still log exactly once; a failing log never throws', async () => {
  const { db, app, port } = await boot();
  const w = await connect(port); let q = next(w);
  w.send(JSON.stringify({ type: 'login', admissionId: 'S0' })); await q;
  const [server] = app.wss.clients;
  server.emit('error', new Error('x')); // error handler terminates; close follows
  await closed(w); await settle();
  assert.equal(rows(db, 'disconnect').length, 1);

  const w2 = await connect(port); q = next(w2);
  w2.send(JSON.stringify({ type: 'login', admissionId: 'S0' })); await q;
  app.pingAll(); app.pingAll(); // second strike terminates a silent socket (it answers, so alive resets)
  w2.terminate(); await closed(w2); await settle();
  assert.equal(rows(db, 'disconnect').length, 2);

  const w3 = await connect(port); q = next(w3);
  w3.send(JSON.stringify({ type: 'login', admissionId: 'S0' })); await q;
  db.exec('ALTER TABLE events RENAME TO events_gone');
  const origErr = console.error; console.error = () => {};
  try { w3.terminate(); await closed(w3); await settle(); } finally { console.error = origErr; }
  db.exec('ALTER TABLE events_gone RENAME TO events');
  assert.equal(rows(db, 'disconnect').length, 2);
  await done(app);
});
