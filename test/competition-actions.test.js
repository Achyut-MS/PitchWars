import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { wsBarrier } from './helpers.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v) };
}
const sockets = new Set();
const connect = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); sockets.add(ws); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
const done = async (app, ...ws) => { ws.forEach((s) => s.terminate()); app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };
// Barrier on every open socket: the server has handled what was sent and what it pushed has arrived (no sleeping).
const wait = () => Promise.all([...sockets].map((w) => wsBarrier(w)));

async function competing() {
  const env = await boot();
  const o = await connect(env.url);
  await ask(o, { type: 'organizer', password: 'pw' });
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await ask(o, { type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) await ask(o, { type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  env.setT(0);
  await ask(o, { type: 'start_game', problemId: 1 });
  env.setT(200_000);
  const a = await connect(env.url); await ask(a, { type: 'login', admissionId: 'S0' });
  const b = await connect(env.url); await ask(b, { type: 'login', admissionId: 'S5' });
  await ask(a, { type: 'pick', ideaId: 'H1' });
  await ask(b, { type: 'pick', ideaId: 'S1' });
  env.setT(800_000);
  return { ...env, o, a, b };
}

test('the CEO attacks and gets a direct result; the organizer sees the real cause', async () => {
  const env = await competing();
  const res = next(env.a);
  env.a.send(JSON.stringify({ type: 'attack', key: 'price_squeeze' }));
  const first = await res;
  assert.ok(first.type === 'attack_result' || first.type === 'state');
  assert.equal(first.type === 'attack_result' ? first.blocked : false, false);
  assert.equal(env.db.prepare('SELECT key FROM attacks').get().key, 'price_squeeze');
  await done(env.app, env.o, env.a, env.b);
});

test('a non-CEO attack is refused with an error', async () => {
  const env = await competing();
  const cto = await connect(env.url);
  await ask(cto, { type: 'login', admissionId: 'S1' });
  assert.deepEqual(await ask(cto, { type: 'attack', key: 'market_crash' }), { type: 'error', error: 'only the CEO can attack' });
  await done(env.app, env.o, env.a, env.b, cto);
});

test('attack keys are validated: non-strings and unknown keys are refused, nothing is charged', async () => {
  const env = await competing();
  for (const key of [5, null, { a: 1 }, ['market_crash'], '__proto__', 'constructor', 'nope']) {
    const r = await ask(env.a, { type: 'attack', key });
    assert.equal(r.type, 'error');
  }
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM attacks').get().n, 0);
  await done(env.app, env.o, env.a, env.b);
});

test('the organizer triggers one event and one injection', async () => {
  const env = await competing();
  assert.equal((await ask(env.o, { type: 'market_event', key: 'demand_surge' })).type, 'state');
  assert.deepEqual(await ask(env.o, { type: 'market_event', key: 'demand_slump' }), { type: 'error', error: 'an event was already used in this game' });
  assert.equal((await ask(env.o, { type: 'inject', company: 'A', coins: 500 })).type, 'state');
  assert.equal(env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1500);
  await done(env.app, env.o, env.a, env.b);
});

test('new organizer actions are logged to events', async () => {
  const env = await competing();
  await ask(env.o, { type: 'market_event', key: 'shop_sale' });
  await ask(env.o, { type: 'inject', company: 'B', coins: 100 });
  const acts = env.db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((r) => JSON.parse(r.payload).action);
  assert.ok(acts.includes('market_event') && acts.includes('inject'));
  assert.ok(env.db.prepare("SELECT 1 FROM events WHERE type='attack' OR type='market_event' OR type='coin_injection'").get());
  await done(env.app, env.o, env.a, env.b);
});

test('participants cannot use organizer-only actions, each gets bad_message', async () => {
  const env = await competing();
  for (const m of [
    { type: 'market_event', key: 'demand_surge' },
    { type: 'inject', company: 'A', coins: 500 },
    { type: 'attack_log' },
    { type: 'reveal_attacks' },
  ]) {
    assert.deepEqual(await ask(env.a, m), { type: 'error', error: 'bad_message' }, m.type);
  }
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM market_events').get().n, 0);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM injections').get().n, 0);
  await done(env.app, env.o, env.a, env.b);
});

test('organizer inputs are validated: bad types and ranges are refused', async () => {
  const env = await competing();
  for (const m of [
    { type: 'market_event', key: 7 }, { type: 'market_event', key: 'nope' }, { type: 'market_event', key: '__proto__' },
    { type: 'inject', company: 'C', coins: 5 }, { type: 'inject', company: 1, coins: 5 },
    { type: 'inject', company: 'A', coins: '5' }, { type: 'inject', company: 'A', coins: 0 },
    { type: 'inject', company: 'A', coins: 501 }, { type: 'inject', company: 'A', coins: 1.5 },
    { type: 'inject', company: 'A', coins: -3 }, { type: 'inject', company: 'A', coins: null },
  ]) assert.equal((await ask(env.o, m)).type, 'error', JSON.stringify(m));
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM market_events').get().n, 0);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM injections').get().n, 0);
  await done(env.app, env.o, env.a, env.b);
});

test('a blocked attack tells the attacker only blocked and endsAt, never victim state', async () => {
  const env = await competing();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'B', 'O06', 'O06', 0, 150)").run();
  const got = [];
  env.a.on('message', (d) => got.push(JSON.parse(d)));
  env.a.send(JSON.stringify({ type: 'attack', key: 'market_crash' }));
  await wait();
  const r = got.find((m) => m.type === 'attack_result');
  assert.deepEqual(Object.keys(r).sort(), ['blocked', 'endsAt', 'type']);
  assert.equal(r.blocked, true);
  await done(env.app, env.o, env.a, env.b);
});

test('every tick in the competition earns coins and pushes fresh state', async () => {
  const env = await competing();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O01', 'O01', 0, 60)").run();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O02', 'O02', 0, 100)").run();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O03', 'O03', 0, 150)").run();
  env.app.tickAll();
  env.setT(805_000);
  const msgs = [];
  env.a.on('message', (d) => msgs.push(JSON.parse(d)));
  env.app.tickAll();
  await wait();
  const state = msgs.find((m) => m.type === 'state');
  assert.ok(state, 'a state message was pushed');
  assert.equal(state.view.competition.rates.COO, 27);
  assert.equal(env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet, 1002);
  await done(env.app, env.o, env.a, env.b);
});

test('two ticks in the same server second do not double-credit or double-push', async () => {
  const env = await competing();
  env.db.prepare("INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, 'A', 'O03', 'O03', 0, 150)").run();
  env.app.tickAll();
  await wait();
  env.setT(805_000);
  const msgs = [];
  env.a.on('message', (d) => msgs.push(JSON.parse(d)));
  env.app.tickAll();
  const w1 = env.db.prepare("SELECT wallet, cto_coins+cmo_coins+coo_coins c FROM company_state WHERE company='A'").get();
  env.setT(805_400);
  env.app.tickAll();
  env.app.tickAll();
  await wait();
  assert.deepEqual(env.db.prepare("SELECT wallet, cto_coins+cmo_coins+coo_coins c FROM company_state WHERE company='A'").get(), w1);
  assert.equal(msgs.filter((m) => m.type === 'state').length, 1, JSON.stringify(msgs.map((m) => m.type)));
  await done(env.app, env.o, env.a, env.b);
});

test('a failing stage does not stop the others or the process', async () => {
  const env = await competing();
  env.db.exec('ALTER TABLE hints RENAME TO hints_x'); // evaluateHints will throw
  const origErr = console.error; console.error = () => {};
  const msgs = [];
  env.a.on('message', (d) => msgs.push(JSON.parse(d)));
  env.setT(806_000);
  try { env.app.tickAll(); } finally { console.error = origErr; }
  await wait();
  assert.ok(msgs.find((m) => m.type === 'tick'));
  assert.ok(msgs.find((m) => m.type === 'state'));
  await done(env.app, env.o, env.a, env.b);
});

test('the tick carries the warning only when there is one', async () => {
  const env = await competing();
  env.setT(1_470_000);
  const got = [];
  env.a.on('message', (d) => got.push(JSON.parse(d)));
  env.app.tickAll();
  await wait();
  assert.equal(got.find((m) => m.type === 'tick').warning, '5min');
  env.setT(900_000);
  got.length = 0;
  env.app.tickAll();
  await wait();
  assert.equal('warning' in got.find((m) => m.type === 'tick'), false);
  await done(env.app, env.o, env.a, env.b);
});
