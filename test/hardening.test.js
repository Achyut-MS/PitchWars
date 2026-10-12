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
  try {
    assert.equal((await ask(other, { type: 'login', admissionId: 'S1' })).type, 'welcome');
    const flooderClosed = closed(flooder);
    const msg = JSON.stringify({ type: 'login', admissionId: 'S0' });
    for (let i = 0; i < 20_000; i++) flooder.send(msg);
    const t0 = performance.now();
    assert.equal((await ask(other, { type: 'sync' })).type, 'state');
    const ms = performance.now() - t0;
    // Unflooded this is ~6 ms and the unfixed server took 4.5 s; the bound leaves room for a loaded CI box.
    assert.ok(ms < 250, `sync took ${ms.toFixed(0)} ms during the flood`);
    await flooderClosed;
    const n = db.prepare("SELECT COUNT(*) n FROM events WHERE type='login' AND admission_id='S0'").get().n;
    assert.equal(n, 1, 'repeat logins of the same id on the same socket are not logged');
  } finally { await done(app, other, flooder); }
});

test('normal use stays under the limit: a steady stream of syncs is never dropped', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  await ask(ws, { type: 'login', admissionId: 'S1' });
  for (let i = 0; i < 40; i++) assert.equal((await ask(ws, { type: 'sync' })).type, 'state');
  assert.equal(ws.readyState, 1);
  await done(app, ws);
});

// ---- 2. per-IP organizer throttle ----
const org = (ws, password = 'wrong') => ask(ws, { type: 'organizer', password });

test('20 sockets spamming wrong passwords from one IP do not block a login from another IP', async () => {
  const { app, url } = await boot();
  const socks = [];
  for (let i = 0; i < 20; i++) { const w = await connect(url, '10.0.0.9'); socks.push(w); await org(w); }
  const good = await connect(url, '10.0.0.5');
  socks.push(good);
  assert.equal((await org(good, 'pw-long-enough')).type, 'welcome');
  await done(app, ...socks);
});

test('the throttle still stops a single-IP guesser, then relaxes', async () => {
  const { app, url, setT, getT } = await boot();
  const socks = [];
  for (let i = 0; i < 10; i++) { const w = await connect(url, '10.0.0.9'); socks.push(w); assert.equal((await org(w)).error, 'bad_password'); }
  const w = await connect(url, '10.0.0.9'); socks.push(w);
  setT(getT() + 1000);
  assert.equal((await org(w)).error, 'bad_password'); // one allowed per second
  assert.equal((await org(w, 'pw-long-enough')).error, 'too_many_attempts');
  setT(getT() + 1200);
  assert.equal((await org(w, 'pw-long-enough')).type, 'welcome');
  await done(app, ...socks);
});

test('the IPv4-mapped IPv6 form counts as the same address', async () => {
  const { app, url, setT, getT } = await boot();
  const socks = [];
  for (let i = 0; i < 10; i++) { const w = await connect(url, i % 2 ? '::ffff:10.0.0.9' : '10.0.0.9'); socks.push(w); await org(w); }
  const w = await connect(url, '10.0.0.9'); socks.push(w);
  assert.equal((await org(w, 'pw-long-enough')).error, 'too_many_attempts');
  await done(app, ...socks);
});

test('loopback is never locked out by other connections', async () => {
  const { app, url } = await boot({ ipOf: undefined });
  const socks = [];
  for (let i = 0; i < 30; i++) { const w = await connect(url); socks.push(w); await org(w); }
  const w = await connect(url); socks.push(w);
  assert.equal((await org(w, 'pw-long-enough')).type, 'welcome');
  await done(app, ...socks);
});

test('the console keeps its saved password on too_many_attempts', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('public/organizer.js', 'utf8');
  const m = src.match(/if \(e === 'too_many_attempts'\) \{([^}]*)\}/);
  assert.ok(m, 'there is a too_many_attempts branch');
  assert.ok(!/removeItem|password = null/.test(m[1]));
});

// ---- 3. login throttle, duplicate sessions ----
test('failed logins from one IP are refused for a minute after 10 misses; other IPs are fine', async () => {
  const { app, url, setT, getT } = await boot();
  const socks = [];
  const w = await connect(url, '10.1.1.1'); socks.push(w);
  for (let i = 0; i < 10; i++) assert.equal((await ask(w, { type: 'login', admissionId: `NOPE${i}` })).error, 'unknown_id');
  assert.equal((await ask(w, { type: 'login', admissionId: 'S1' })).error, 'too_many_attempts');
  const other = await connect(url, '10.1.1.2'); socks.push(other);
  assert.equal((await ask(other, { type: 'login', admissionId: 'S1' })).type, 'welcome');
  setT(getT() + 61_000);
  assert.equal((await ask(w, { type: 'login', admissionId: 'S2' })).type, 'welcome');
  await done(app, ...socks);
});

async function orgOf(url) {
  const o = await connect(url);
  assert.equal((await org(o, 'pw-long-enough')).type, 'welcome');
  return o;
}

test('a second login replaces the first: the old socket is told and closed, the organizer sees a counter', async () => {
  const { db, app, url } = await boot();
  const o = await orgOf(url);
  const first = await connect(url);
  await ask(first, { type: 'login', admissionId: 'S1' });
  const told = next(first);
  const gone = closed(first);
  const second = await connect(url);
  assert.equal((await ask(second, { type: 'login', admissionId: 's1' })).type, 'welcome');
  assert.deepEqual(await told, { type: 'error', error: 'logged_in_elsewhere' });
  await gone;
  assert.equal(second.readyState, 1);
  // again
  const third = await connect(url);
  await ask(third, { type: 'login', admissionId: 'S1' });
  await closed(second);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE type='login_replaced' AND admission_id='S1'").get().n, 2);
  app.flush();
  const view = (await ask(o, { type: 'sync' })).view;
  assert.deepEqual(view.warnings, [{ type: 'duplicate_login', admissionId: 'S1', count: 2 }]);
  // players never see any of it
  const mine = (await ask(third, { type: 'sync' }));
  assert.ok(!/duplicate|warnings|logged_in_elsewhere/.test(JSON.stringify(mine)));
  await done(app, o, first, second, third);
});

test('a repeat login on the same socket is not a replacement', async () => {
  const { app, url } = await boot();
  const o = await orgOf(url);
  const w = await connect(url);
  await ask(w, { type: 'login', admissionId: 'S1' });
  await ask(w, { type: 'login', admissionId: 'S1' });
  assert.deepEqual((await ask(o, { type: 'sync' })).view.warnings, []);
  await done(app, o, w);
});

test('the organizer console shows who logged in again', async () => {
  const { renderOrganizer } = await import('../public/render-organizer.js');
  const base = { screen: 'organizer', participants: [{ admission_id: 'S1', name: 'Pia', status: 'lobby' }], problems: [], game: null,
    warnings: [{ type: 'duplicate_login', admissionId: 'S1', count: 3 }] };
  assert.match(renderOrganizer(base), /Logged in again: Pia \(3x\)/);
  assert.doesNotMatch(renderOrganizer({ ...base, warnings: [] }), /Logged in again/);
  assert.match(renderOrganizer({ ...base, participants: [{ admission_id: 'S1', name: '<b>x</b>', status: 'lobby' }] }), /&lt;b&gt;x&lt;\/b&gt; \(3x\)/);
});
