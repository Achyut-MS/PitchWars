import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    exportDir: mkdtempSync(join(tmpdir(), 'ex-')), backupDir: mkdtempSync(join(tmpdir(), 'bk-')),
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

// ---- 4. start_game validates the problem ----
test('start_game refuses an unknown problem id and creates no game', async () => {
  const { db, app, url } = await boot();
  const o = await orgOf(url);
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) assert.notEqual((await ask(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] })).type, 'error');
  assert.deepEqual(await ask(o, { type: 'start_game', problemId: 999 }), { type: 'error', error: 'unknown problem' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM games').get().n, 0);
  assert.equal((await ask(o, { type: 'start_game', problemId: 1 })).type, 'state');
  await done(app, o);
});

// ---- 6. idle unauthenticated sockets ----
test('a socket that does not log in within 60 s is closed; logging in cancels the timer', async () => {
  const { app, url, fire } = await boot();
  const idle = await connect(url);
  const player = await connect(url);
  await ask(player, { type: 'login', admissionId: 'S1' });
  const idleClosed = closed(idle);
  await new Promise((r) => setTimeout(r, 20));
  fire(60_000);
  await idleClosed;
  assert.equal(idle.readyState, 3);
  assert.equal(player.readyState, 1);
  await done(app, idle, player);
});

test('a closed socket clears its login timer', async () => {
  const { app, url, timers } = await boot();
  const w = await connect(url);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(timers.some((h) => h.ms === 60_000 && h.live));
  w.close(); await closed(w);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!timers.some((h) => h.ms === 60_000 && h.live));
  await done(app, w);
});

test('unauthenticated sockets are capped; extra ones get close code 1013', async () => {
  const { app, url } = await boot({ maxUnauth: 3 });
  const socks = [];
  for (let i = 0; i < 3; i++) socks.push(await connect(url));
  const extra = new WebSocket(url);
  const code = await new Promise((r) => { extra.on('close', (c) => r(c)); extra.on('error', () => {}); });
  assert.equal(code, 1013);
  // a login frees a slot
  await ask(socks[0], { type: 'login', admissionId: 'S1' });
  const again = await connect(url);
  assert.equal(again.readyState, 1);
  await done(app, ...socks, again);
});

// ---- 7. download tokens expire after the organizer socket closes ----
import http from 'node:http';
const getStatus = (url, path) => new Promise((resolve, reject) => {
  const u = new URL(url);
  http.get({ port: u.port, path }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
});

test('a download token lives while the organizer socket is open and 30 minutes after it closes', async () => {
  const { app, url, setT, getT } = await boot();
  const o = await connect(url);
  const welcome = await org(o, 'pw-long-enough');
  const path = `/export/event.xlsx?token=${welcome.token}`;
  assert.equal(await getStatus(url, path), 200);
  setT(getT() + 5 * 3600_000); // hours later, socket still open
  assert.equal(await getStatus(url, path), 200);
  o.close(); await closed(o);
  await new Promise((r) => setTimeout(r, 30));
  setT(getT() + 29 * 60_000);
  assert.equal(await getStatus(url, path), 200);
  setT(getT() + 2 * 60_000);
  assert.equal(await getStatus(url, path), 403);
  await done(app, o);
});

test('a second organizer connection keeps its own token valid', async () => {
  const { app, url, setT, getT } = await boot();
  const a = await connect(url); const ta = (await org(a, 'pw-long-enough')).token;
  const b = await connect(url); const tb = (await org(b, 'pw-long-enough')).token;
  a.close(); await closed(a);
  await new Promise((r) => setTimeout(r, 30));
  setT(getT() + 31 * 60_000);
  assert.equal(await getStatus(url, `/export/event.xlsx?token=${ta}`), 403);
  assert.equal(await getStatus(url, `/export/event.xlsx?token=${tb}`), 200);
  await done(app, a, b);
});

// ---- 9. per-company sequence numbers instead of global ids ----
import { makeRunning, atSec } from './helpers.js';
import { pickIdea } from '../src/ideation.js';
import { requestItem } from '../src/shop.js';
import { startPuzzle } from '../src/minigame.js';
import { viewFor, organizerView } from '../src/views.js';

function shopHarness() {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  atSec(h, 400);
  return h;
}

test('request ids in player views are per-company sequence numbers, never the global id', () => {
  const h = shopHarness();
  const b1 = requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N'); // global 1
  const a1 = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'); // global 2
  const a2 = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M04-S'); // global 3
  assert.deepEqual([b1, a1, a2], [1, 2, 3]);
  const cfoA = viewFor(h.ctx, h.seat.A.CFO).shop.queue;
  assert.deepEqual(cfoA.map((r) => r.id), [1, 2]);
  const cfoB = viewFor(h.ctx, h.seat.B.CFO).shop.queue;
  assert.deepEqual(cfoB.map((r) => r.id), [1]);
  assert.deepEqual(viewFor(h.ctx, h.seat.A.CMO).shop.mine.map((r) => r.id).sort(), [1, 2]);
  assert.deepEqual(viewFor(h.ctx, h.seat.B.CMO).shop.mine.map((r) => r.id), [1]);
});

test('a decide message names the sender-company sequence number and cannot reach the rival', async () => {
  const h = shopHarness();
  requestItem(h.ctx, h.game(), h.seat.B.CMO, 'M01-N'); // global 1, company B
  requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N'); // global 2, company A = sequence 1
  const app = createApp({ db: h.db, organizerPassword: 'pw-long-enough', now: h.ctx.now, data, staticRoot: null,
    exportDir: mkdtempSync(join(tmpdir(), 'ex-')), backupDir: mkdtempSync(join(tmpdir(), 'bk-')) });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  const cfo = await connect(url);
  await ask(cfo, { type: 'login', admissionId: h.seat.A.CFO });
  assert.equal((await ask(cfo, { type: 'cfo_decide', requestId: 2, approve: true })).error, 'no such request'); // A has only sequence 1
  assert.equal((await ask(cfo, { type: 'cfo_decide', requestId: 0, approve: true })).error, 'no such request');
  assert.equal((await ask(cfo, { type: 'cfo_decide', requestId: 1, approve: true })).type, 'state');
  const rows = h.db.prepare('SELECT id, company, status FROM requests ORDER BY id').all();
  assert.deepEqual(rows.map((r) => [r.id, r.company]), [[1, 'B'], [2, 'A']]);
  assert.equal(rows[0].status, 'pending'); // the rival's request is untouched
  assert.notEqual(rows[1].status, 'pending');
  await done(app, cfo);
});

test('puzzle ids in the CFO view are per-company sequence numbers', () => {
  const h = shopHarness();
  atSec(h, 800);
  const g = h.game();
  startPuzzle(h.ctx, g, h.seat.B.CFO); // global 1
  startPuzzle(h.ctx, g, h.seat.A.CFO); // global 2, sequence 1 for A
  assert.equal(viewFor(h.ctx, h.seat.A.CFO).competition.puzzle.id, 1);
  assert.equal(viewFor(h.ctx, h.seat.B.CFO).competition.puzzle.id, 1);
});
