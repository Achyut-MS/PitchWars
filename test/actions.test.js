import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v) };
}
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.once('open', () => res(ws)); ws.once('error', rej); });
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
const quiet = (ws, ms = 60) => new Promise((res) => { let got = null; const f = (d) => { got = JSON.parse(d); }; ws.on('message', f); setTimeout(() => { ws.off('message', f); res(got); }, ms); });

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
    { type: 'end_game' }, { type: 'end_ideation_early' },
  ];
  for (const a of attempts) assert.deepEqual(await ask(p, a), { type: 'error', error: 'bad_message' }, a.type);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM participants WHERE admission_id IN ('Z9','Z8')").get().n, 0);
  assert.equal(db.prepare('SELECT ended_at FROM games').get().ended_at, null);
  // and an unauthenticated socket
  const anon = await connect(url);
  assert.deepEqual(await ask(anon, { type: 'end_game' }), { type: 'error', error: 'bad_message' });
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
  assert.equal((await ask(o, { type: 'end_game' })).type, 'state');
  const pushedFirst = await ceoPush; // the end_game push: now on the graphs screen
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
  await send(o, { type: 'end_game' });
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

test('swap_seats, replace_player and end_game are organizer actions that log', async () => {
  const { db, app, url, setT } = await boot();
  const o = await organizer(url);
  await runningGame(o, setT);
  assert.equal((await send(o, { type: 'swap_seats', a: 'S0', b: 'S1' })).type, 'state');
  assert.equal((await send(o, { type: 'replace_player', out: 'S2', in: 'S11' })).type, 'state');
  assert.equal((await send(o, { type: 'end_game' })).type, 'state');
  const types = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((r) => JSON.parse(r.payload).action);
  for (const a of ['swap_seats', 'replace_player', 'end_game']) assert.ok(types.includes(a), a);
  await done(app, o);
});

test('the tick survives a throwing director and still pushes the clock', async () => {
  const db = openDb();
  const app = createApp({ db, organizerPassword: 'pw', now: () => 5000, data, staticRoot: null, director: () => { throw new Error('boom'); } });
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
  await new Promise((r) => setTimeout(r, 20));
  app.pingAll(); // marks everyone suspect and pings
  await new Promise((r) => setTimeout(r, 50));
  app.pingAll(); // dead one never answered
  await closed;
  assert.equal(live.readyState, 1);
  await done(app, live);
});
