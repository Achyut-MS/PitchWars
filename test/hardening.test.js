import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';

const data = loadData('data');

export async function boot(extra = {}, rows = 12) {
  const db = openDb();
  for (let i = 0; i < rows; i++) addParticipant(db, `S${i}`, `P${i}`);
  let t = 1_000_000;
  const timers = [];
  const app = createApp({
    db, organizerPassword: 'pw-long-enough', now: () => t, data, staticRoot: null,
    setTimer: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.live = false; },
    ipOf: (req) => req.headers['x-test-ip'] || req.socket.remoteAddress,
    ...extra,
  });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  return { db, app, url, timers, setT: (v) => { t = v; }, getT: () => t,
    fire: (ms) => timers.filter((h) => h.live && (ms === undefined || h.ms === ms)).forEach((h) => { h.live = false; h.fn(); }) };
}
export const connect = (url, ip) => new Promise((res, rej) => {
  const ws = new WebSocket(url, ip ? { headers: { 'x-test-ip': ip } } : undefined);
  ws.once('open', () => res(ws)); ws.once('error', rej);
});
export const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
export async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
export const closed = (ws) => new Promise((r) => (ws.readyState === 3 ? r() : ws.once('close', r)));
export const done = async (app, ...ws) => { ws.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

// ---- 1. per-socket rate limit ----
test('a login flood is dropped, other players stay fast and only one login is logged', async () => {
  const { db, app, url } = await boot();
  const flooder = await connect(url);
  const other = await connect(url);
  assert.equal((await ask(other, { type: 'login', admissionId: 'S1' })).type, 'welcome');
  const flooderClosed = closed(flooder);
  const msg = JSON.stringify({ type: 'login', admissionId: 'S0' });
  for (let i = 0; i < 20_000; i++) flooder.send(msg);
  const t0 = performance.now();
  assert.equal((await ask(other, { type: 'sync' })).type, 'state');
  const ms = performance.now() - t0;
  assert.ok(ms < 100, `sync took ${ms.toFixed(0)} ms during the flood`);
  await flooderClosed;
  const n = db.prepare("SELECT COUNT(*) n FROM events WHERE type='login' AND admission_id='S0'").get().n;
  assert.equal(n, 1, 'repeat logins of the same id on the same socket are not logged');
  await done(app, other, flooder);
});

test('normal use stays under the limit: a steady stream of syncs is never dropped', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  await ask(ws, { type: 'login', admissionId: 'S1' });
  for (let i = 0; i < 40; i++) assert.equal((await ask(ws, { type: 'sync' })).type, 'state');
  assert.equal(ws.readyState, 1);
  await done(app, ws);
});
