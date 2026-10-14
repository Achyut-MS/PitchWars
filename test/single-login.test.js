import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { waitFor } from './helpers.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  const timers = [];
  const app = createApp({
    db, organizerPassword: 'pw', now: () => 0, data, staticRoot: null,
    setTimer: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clearTimer: (t) => { t.dead = true; },
  });
  await new Promise((r) => app.server.listen(0, r));
  app.ctx.db.prepare("INSERT INTO participants (admission_id, name) VALUES ('P1', 'Pia')").run();
  const socks = [];
  const connect = () => new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}`);
    ws.seen = [];
    ws.on('message', (d) => ws.seen.push(JSON.parse(d)));
    socks.push(ws);
    ws.once('open', () => res(ws));
    ws.once('error', rej);
  });
  const got = (ws, type, from = 0) => waitFor(() => ws.seen.slice(from).find((m) => m.type === type || (type === 'error' && m.type === 'error')), { message: `no ${type}` });
  const close = async () => { socks.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };
  const login = async (deviceId) => { const ws = await connect(); ws.send(JSON.stringify({ type: 'login', admissionId: 'p1', deviceId })); return ws; };
  return { app, timers, got, close, login, connect };
}

test('a second device waits, the first allows, the first is logged out', async () => {
  const { got, close, login } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(b, 'login_pending');
  await got(a, 'login_request');
  a.send(JSON.stringify({ type: 'login_decision', allow: true }));
  await got(a, 'logged_out_elsewhere');
  const w = await got(b, 'welcome');
  assert.equal(w.participant.admissionId, 'P1');
  await close();
});

test('the first device can say no, and the second is refused', async () => {
  const { got, close, login } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(a, 'login_request');
  a.send(JSON.stringify({ type: 'login_decision', allow: false }));
  assert.equal((await got(b, 'error')).error, 'login_denied');
  assert.ok(!b.seen.some((m) => m.type === 'welcome'));
  await got(a, 'login_request_end');
  assert.ok(!a.seen.some((m) => m.type === 'logged_out_elsewhere'));
  await close();
});

test('no answer in time counts as no', async () => {
  const { got, close, login, timers } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(a, 'login_request');
  const t = timers.find((x) => x.ms === 30_000 && !x.dead);
  assert.ok(t);
  t.fn();
  assert.equal((await got(b, 'error')).error, 'login_timeout');
  await got(a, 'login_request_end');
  await close();
});

test('when the first device is gone, the waiting device gets in', async () => {
  const { got, close, login } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(b, 'login_pending');
  a.terminate();
  await got(b, 'welcome');
  await close();
});

test('the same device signing in again takes over without asking', async () => {
  const { got, close, login } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const a2 = await login('dev-a');
  await got(a2, 'welcome');
  await got(a, 'logged_out_elsewhere');
  assert.ok(!a2.seen.some((m) => m.type === 'login_pending'));
  await close();
});

test('only one request at a time, and only the logged-in device can answer', async () => {
  const { got, close, login } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(b, 'login_pending');
  const c = await login('dev-c');
  assert.equal((await got(c, 'error')).error, 'login_busy');
  b.send(JSON.stringify({ type: 'login_decision', allow: true })); // the waiting device cannot approve itself
  await got(a, 'login_request');
  assert.ok(!b.seen.some((m) => m.type === 'welcome'));
  await close();
});

test('the organizer sees who is online, and a pending device is not online yet', async () => {
  const { app, got, close, login, connect } = await boot();
  const a = await login('dev-a');
  await got(a, 'welcome');
  const b = await login('dev-b');
  await got(b, 'login_pending');
  assert.deepEqual([...app.ctx.online()], ['P1']);
  const o = await connect();
  o.send(JSON.stringify({ type: 'organizer', password: 'pw' }));
  await got(o, 'welcome');
  await close();
});
