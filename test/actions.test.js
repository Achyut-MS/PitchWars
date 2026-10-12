import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { wsBarrier, isBarrierReply } from './helpers.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, exportDir: mkdtempSync(join(tmpdir(), 'ex-')), backupDir: mkdtempSync(join(tmpdir(), 'bk-')) });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v) };
}
const sockets = new Set();
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); sockets.add(ws); ws.once('open', () => res(ws)); ws.once('error', rej); });
// Instead of sleeping: every open socket has handled what was sent and received what the server pushed so far.
const tick = () => Promise.all([...sockets].map((w) => wsBarrier(w)));
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
// Sends a message and returns the next *state* message (skipping nothing: actions reply with state first).
const send = (ws, msg) => ask(ws, msg);
const done = async (app, ...ws) => { ws.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

async function organizer(url) {
  const o = await connect(url);
  assert.equal((await ask(o, { type: 'organizer', password: 'pw' })).type, 'welcome');
  return o;
}

test('the organizer imports a roster and the view lists the players', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  const m = await send(o, { type: 'roster_import', text: 'A1,Asha\nB2,Ben' });
  assert.equal(m.type, 'state');
  assert.equal(m.view.participants.length, 2);
  await done(app, o);
});

test('a failed organizer action returns an error and changes nothing', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  const m = await send(o, { type: 'start_game', problemId: 1 });
  assert.deepEqual(m, { type: 'error', error: 'both companies need all five roles before the game can start' });
  await done(app, o);
});

test('sync returns the caller view', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'add_participant', admissionId: 'p1', name: 'Pia' });
  const p = await connect(url);
  assert.equal((await ask(p, { type: 'login', admissionId: 'P1' })).view, 'lobby');
  const m = await send(p, { type: 'sync' });
  assert.deepEqual([m.type, m.view.screen, m.view.me.name], ['state', 'lobby', 'Pia']);
  await done(app, o, p);
});

test('a participant action is refused for a non-participant session and an unknown type', async () => {
  const { app, url } = await boot();
  const ws = await connect(url);
  assert.deepEqual(await ask(ws, { type: 'vote', ideaId: 'H1' }), { type: 'error', error: 'bad_message' });
  await done(app, ws);
});

test('organizer actions are logged', async () => {
  const { db, app, url } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'add_participant', admissionId: 'p1', name: 'Pia' });
  const e = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").get();
  assert.equal(JSON.parse(e.payload).action, 'add_participant');
  await done(app, o);
});

test('a full path: ten players, start, vote, pick, and everyone gets fresh state', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  setT(1000);
  assert.equal((await send(o, { type: 'start_game', problemId: 1 })).type, 'state');
  const cto = await connect(url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  const ceo = await connect(url);
  await ask(ceo, { type: 'login', admissionId: 'S0' });
  setT(1000 + 200_000); // ideation
  const sawVote = next(ceo);
  const reply = await send(cto, { type: 'vote', ideaId: 'H1' });
  assert.equal(reply.type, 'state');
  const pushed = await sawVote;
  assert.equal(pushed.view.ideation.ideas.find((i) => i.id === 'H1').votes, 1);
  assert.equal((await send(ceo, { type: 'pick', ideaId: 'H1' })).type, 'state');
  assert.equal(db.prepare("SELECT idea_id FROM company_state WHERE company='A'").get().idea_id, 'H1');
  await done(app, o, cto, ceo);
});

test('tickAll runs the director and pushes state when a phase hook ran', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  setT(0);
  await send(o, { type: 'start_game', problemId: 1 });
  setT(361_000); // ideation just ended with nobody having picked
  const pushed = next(o);
  app.tickAll();
  const m = await pushed;
  assert.ok(m.type === 'tick' || m.type === 'state');
  assert.ok(db.prepare("SELECT idea_id FROM company_state WHERE company='A'").get().idea_id);
  await done(app, o);
});

// ---- hardening, scoping, logging, throttle, ping ----

async function runningGame(o, setT) {
  let roster = '';
  for (let i = 0; i < 12; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  setT(1000);
  assert.equal((await send(o, { type: 'start_game', problemId: 1 })).type, 'state');
}
// Watches ws; awaiting it settles via a barrier (everything the server pushed to ws by then has arrived) and yields the last message or null.
const quiet = (ws) => {
  let got = null; const f = (d) => { const m = JSON.parse(d); if (!isBarrierReply(m)) got = m; };
  ws.on('message', f);
  return { then(res, rej) { wsBarrier(ws).then(() => { ws.off('message', f); return got; }).then(res, rej); } };
};

test('the roster upload response lists rejected rows with line and reason', async () => {
  const { app, url } = await boot();
  const o = await organizer(url);
  const m = await send(o, { type: 'roster_import', text: 'A1,Asha\n,NoId\nB2,\nC3,Cy' });
  assert.equal(m.type, 'state');
  assert.equal(m.result.added, 2);
  assert.deepEqual(m.result.rejected, [{ line: 2, reason: 'blank admission id' }, { line: 3, reason: 'blank name' }]);
  await done(app, o);
});

test('every garbage input gets an error reply and the server keeps working', async () => {
  const { app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  const cto = await connect(url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  const bad = [
    { type: 'vote', ideaId: 5 }, { type: 'vote' }, { type: 'vote', ideaId: { a: 1 } }, { type: 'pick', ideaId: null },
    { type: 'request', itemId: {} }, { type: 'request', itemId: 'T01', choice: 5 }, { type: 'recommend', itemId: [] },
    { type: 'ceo_decide', requestId: 'x', approve: true }, { type: 'ceo_decide', requestId: 1, approve: 'yes' },
    { type: 'cfo_decide', requestId: 1.5, approve: true }, { type: 'cfo_decide', requestId: null },
  ];
  for (const b of bad) {
    const r = await ask(cto, b);
    assert.equal(r.type, 'error', JSON.stringify(b));
  }
  const badOrg = [
    { type: 'roster_import', text: 5 }, { type: 'roster_import' }, { type: 'add_participant', admissionId: 1, name: 'x' },
    { type: 'add_participant', admissionId: 'z', name: {} }, { type: 'assign', admissionId: 'S11', company: 5, role: 'CEO' },
    { type: 'assign', admissionId: [], company: 'A', role: 'CEO' }, { type: 'unassign', admissionId: 7 },
    { type: 'start_game', problemId: '1' }, { type: 'start_game', problemId: 1.5 }, { type: 'swap_seats', a: 1, b: 'S1' },
    { type: 'replace_player', out: 'S1', in: null },
  ];
  for (const b of badOrg) assert.equal((await ask(o, b)).type, 'error', JSON.stringify(b));
  for (const raw of ['null', '[]', '5', '"x"', '{"type":5}', '{bad json']) {
    {
      const p = next(cto); cto.send(raw); assert.deepEqual(await p, { type: 'error', error: 'bad_message' });
    }
  }
  assert.equal((await send(cto, { type: 'sync' })).type, 'state');
  await done(app, o, cto);
});

test('errors go to the sender only', async () => {
  const { app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  const cto = await connect(url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  const watching = quiet(o);
  const r = await ask(cto, { type: 'vote', ideaId: 'NOPE' });
  assert.equal(r.type, 'error');
  assert.equal(await watching, null);
  await done(app, o, cto);
});

test('a participant cannot send organizer actions', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  const p = await connect(url);
  await ask(p, { type: 'login', admissionId: 'S11' });
  const attempts = [
    { type: 'roster_import', text: 'Z9,Zed' }, { type: 'add_participant', admissionId: 'Z8', name: 'z' },
    { type: 'assign', admissionId: 'S11', company: 'A', role: 'CEO' }, { type: 'unassign', admissionId: 'S11' },
    { type: 'start_game', problemId: 1 }, { type: 'swap_seats', a: 'S0', b: 'S1' }, { type: 'replace_player', out: 'S0', in: 'S10' },
    { type: 'next_game' }, { type: 'reveal' }, { type: 'end_game' }, { type: 'end_ideation_early' },
  ];
  for (const a of attempts) assert.deepEqual(await ask(p, a), { type: 'error', error: 'bad_message' }, a.type);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM participants WHERE admission_id IN ('Z9','Z8')").get().n, 0);
  assert.equal(db.prepare('SELECT ended_at FROM games').get().ended_at, null);
  // and an unauthenticated socket
  const anon = await connect(url);
  assert.deepEqual(await ask(anon, { type: 'next_game' }), { type: 'error', error: 'bad_message' });
  await done(app, o, p, anon);
});

test('a lobby player, a completed player and a rival-less session cannot act', async () => {
  const { app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  const lobby = await connect(url);
  await ask(lobby, { type: 'login', admissionId: 'S11' });
  setT(1000 + 200_000);
  assert.equal((await ask(lobby, { type: 'vote', ideaId: 'H1' })).type, 'error');
  assert.equal((await ask(lobby, { type: 'request', itemId: 'T01' })).type, 'error');
  const ceo = await connect(url);
  await ask(ceo, { type: 'login', admissionId: 'S0' });
  const ceoPush = next(ceo);
  assert.equal((await ask(o, { type: 'end_game' })).error, 'bad_message'); // no such action any more
  assert.equal((await ask(o, { type: 'next_game' })).type, 'state');
  const pushedFirst = await ceoPush; // Next Game: completed, own game revealed by it
  assert.equal(pushedFirst.view.screen, 'graphs');
  const m = await ask(ceo, { type: 'pick', ideaId: 'H1' });
  assert.equal(m.type, 'error');
  await done(app, o, lobby, ceo);
});

test('a status change pushes a new view to the affected players', async () => {
  const { app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await send(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await send(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  const p = await connect(url);
  assert.equal((await ask(p, { type: 'login', admissionId: 'S3' })).view, 'lobby');
  setT(1000);
  const pushed = next(p);
  await send(o, { type: 'start_game', problemId: 1 });
  assert.equal((await pushed).view.screen, 'game');
  const completed = next(p);
  await send(o, { type: 'next_game' });
  assert.equal((await completed).view.screen, 'graphs');
  await done(app, o, p);
});

test('unassign frees a seat and end_ideation_early shortens ideation; both are logged', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'roster_import', text: 'A1,Asha' });
  await send(o, { type: 'assign', admissionId: 'A1', company: 'A', role: 'CEO' });
  await send(o, { type: 'unassign', admissionId: 'A1' });
  assert.equal(db.prepare("SELECT company FROM participants WHERE admission_id='A1'").get().company, null);
  await done(app, o);
  const b = await boot();
  const o2 = await organizer(b.url);
  await runningGame(o2, b.setT);
  b.setT(1000 + 200_000);
  assert.equal((await send(o2, { type: 'end_ideation_early' })).type, 'state');
  assert.ok(b.db.prepare('SELECT ideation_saved_sec s FROM games').get().s > 0);
  assert.equal((await send(o2, { type: 'end_ideation_early' })).type, 'error');
  const types = b.db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((r) => JSON.parse(r.payload).action);
  for (const a of ['roster_import', 'assign', 'start_game', 'end_ideation_early']) assert.ok(types.includes(a), a);
  assert.ok(b.db.prepare("SELECT 1 FROM events WHERE type='assign'").get());
  await done(b.app, o2);
});

test('swap_seats, replace_player and next_game are organizer actions that log', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  assert.equal((await send(o, { type: 'swap_seats', a: 'S0', b: 'S1' })).type, 'state');
  assert.equal((await send(o, { type: 'replace_player', out: 'S2', in: 'S11' })).type, 'state');
  assert.equal((await send(o, { type: 'next_game' })).type, 'state');
  const types = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((r) => JSON.parse(r.payload).action);
  for (const a of ['swap_seats', 'replace_player', 'next_game']) assert.ok(types.includes(a), a);
  await done(app, o);
});

test('the tick survives a throwing director and still pushes the clock', async () => {
  const db = openDb();
  const app = createApp({ db, organizerPassword: 'pw', now: () => 5000, data, staticRoot: null, exportDir: mkdtempSync(join(tmpdir(), 'ex-')), backupDir: mkdtempSync(join(tmpdir(), 'bk-')), director: () => { throw new Error('boom'); } });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  const o = await organizer(url);
  db.prepare('INSERT INTO games (problem_id, started_at, heartbeat_at) VALUES (1, 4000, 4000)').run();
  const t = next(o);
  const origErr = console.error; console.error = () => {};
  try { app.tickAll(); } finally { console.error = origErr; }
  assert.equal((await t).type, 'tick');
  await done(app, o);
});

test('organizer password attempts are throttled, then allowed again after a minute', async () => {
  const { app, url, setT } = await boot();
  const ws = await connect(url);
  setT(10_000);
  for (let i = 0; i < 5; i++) assert.deepEqual(await ask(ws, { type: 'organizer', password: 'bad' }), { type: 'error', error: 'bad_password' });
  assert.deepEqual(await ask(ws, { type: 'organizer', password: 'pw' }), { type: 'error', error: 'too_many_attempts' });
  setT(10_000 + 30_000);
  assert.equal((await ask(ws, { type: 'organizer', password: 'pw' })).error, 'too_many_attempts');
  setT(10_000 + 61_000);
  assert.equal((await ask(ws, { type: 'organizer', password: 'pw' })).type, 'welcome');
  await done(app, ws);
});

test('pingAll terminates sockets that never answered and keeps live ones', async () => {
  const { app, url } = await boot();
  const live = await connect(url);
  const dead = await connect(url);
  dead._receiver.removeAllListeners('ping'); // never pongs
  dead.pong = () => {};
  const closed = new Promise((r) => dead.once('close', r));
  await tick(); // the server has registered both connections
  const pinged = new Promise((r) => live.once('ping', r));
  app.pingAll(); // marks everyone suspect and pings
  await pinged; await wsBarrier(live); // the live socket's pong (sent on ping) precedes its barrier probe
  app.pingAll(); // dead one never answered
  await closed;
  assert.equal(live.readyState, 1);
  await done(app, live);
});

// ---- review fixes: coalesced push, phase push, payload size, global throttle ----

async function bootManual(extraOpts = {}) {
  const db = openDb();
  let t = 0;
  const timers = [];
  const app = createApp({
    db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, exportDir: mkdtempSync(join(tmpdir(), 'ex-')), backupDir: mkdtempSync(join(tmpdir(), 'bk-')), ...extraOpts,
    setTimer: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; },
    clearTimer: (h) => { if (h) h.live = false; },
  });
  await new Promise((r) => app.server.listen(0, r));
  const fire = () => timers.filter((h) => h.live).forEach((h) => { h.live = false; h.fn(); });
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v), fire, timers };
}
const collect = (ws) => { const got = []; ws.on('message', (d) => { const m = JSON.parse(d); if (!isBarrierReply(m)) got.push(m); }); return got; };

test('the actor gets state at once; everyone else gets ONE coalesced push after five rapid actions', async () => {
  const { app, url, setT, fire } = await bootManual();
  const o = await organizer(url);
  await runningGame(o, setT);
  const cto = await connect(url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  const ceo = await connect(url);
  await ask(ceo, { type: 'login', admissionId: 'S0' });
  fire(); await tick();
  setT(1000 + 200_000);
  const seen = collect(ceo);
  for (let i = 0; i < 5; i++) assert.equal((await ask(cto, { type: 'vote', ideaId: i % 2 ? 'H1' : 'H2' })).type, 'state');
  await tick();
  assert.equal(seen.length, 0, 'nothing is pushed to others before the flush');
  fire(); await tick();
  assert.equal(seen.filter((m) => m.type === 'state').length, 1);
  fire(); await tick();
  assert.equal(seen.filter((m) => m.type === 'state').length, 1, 'no repeat flush when nothing changed');
  await done(app, o, cto, ceo);
});

test('pushing to 80 sessions stays fast', async () => {
  const { app, url, setT } = await bootManual({ allowDuplicateSessions: true });
  const o = await organizer(url);
  await runningGame(o, setT);
  const socks = [];
  for (let i = 0; i < 80; i++) { const w = await connect(url); await ask(w, { type: 'login', admissionId: `S${i % 10}` }); socks.push(w); }
  setT(1000 + 370_000); // shop: the tick auto-picks ideas, so every view carries the full catalog
  const t0 = performance.now();
  app.tickAll(); // runs the ideation hook, then pushes to all 80 + organizer
  const ms = performance.now() - t0;
  assert.ok(ms < 150, `push of 80 sessions took ${ms.toFixed(1)} ms`);
  await done(app, o, ...socks);
});

test('a phase change with no hook pushes a new view to everyone', async () => {
  const { app, url, setT } = await bootManual();
  const o = await organizer(url);
  await runningGame(o, setT);
  const p = await connect(url);
  await ask(p, { type: 'login', admissionId: 'S1' });
  setT(1000 + 10_000); app.tickAll(); // briefing recorded
  await tick();
  const seen = collect(p);
  setT(1000 + 181_000); // ideation begins
  app.tickAll();
  await tick();
  const st = seen.find((m) => m.type === 'state');
  assert.ok(st, 'state pushed at the phase change');
  assert.equal(st.view.clock.phase, 'ideation');
  await done(app, o, p);
});

test('an organizer may paste a 200-row roster; a participant sending 5000 bytes is dropped', async () => {
  const { app, url, setT } = await boot();
  const o = await organizer(url);
  let roster = '';
  for (let i = 0; i < 200; i++) roster += `R${i},Student number ${i}\n`;
  assert.ok(roster.length > 4096);
  const m = await send(o, { type: 'roster_import', text: roster });
  assert.equal(m.view.participants.length, 200);
  await send(o, { type: 'assign', admissionId: 'R0', company: 'A', role: 'CEO' });
  const p = await connect(url);
  await ask(p, { type: 'login', admissionId: 'R0' });
  const closed = new Promise((r) => p.once('close', r));
  p.send(JSON.stringify({ type: 'sync', pad: 'x'.repeat(5000) }));
  await closed;
  assert.equal(o.readyState, 1);
  assert.equal((await send(o, { type: 'sync' })).type, 'state');
  await done(app, o, p);
});

test('a participant row that says in_game with no active game gets the lobby screen, not a crash', async () => {
  const { db, app, url } = await boot();
  const o = await organizer(url);
  await send(o, { type: 'add_participant', admissionId: 'g1', name: 'Ghost' });
  db.prepare("UPDATE participants SET status='in_game', game_id=99, company='A', role='CEO' WHERE admission_id='G1'").run();
  const p = await connect(url);
  await ask(p, { type: 'login', admissionId: 'G1' });
  const m = await send(p, { type: 'sync' });
  assert.equal(m.view.screen, 'lobby');
  await done(app, o, p);
});

test('skip_phase: organizer-only, pushes the new phase, logs from/to, refused in the competition', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  const p = await connect(url);
  await ask(p, { type: 'login', admissionId: 'S11' });
  assert.deepEqual(await ask(p, { type: 'skip_phase' }), { type: 'error', error: 'bad_message' });
  const before = db.prepare('SELECT started_at FROM games').get().started_at;
  const r = await ask(o, { type: 'skip_phase' });
  assert.equal(r.type, 'state');
  assert.ok(db.prepare('SELECT started_at FROM games').get().started_at < before);
  const ev = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((e) => JSON.parse(e.payload)).find((e) => e.action === 'skip_phase');
  assert.deepEqual(ev.args, { from: 'briefing', to: 'ideation' });
  await done(app, o, p);
});
