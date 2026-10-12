import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { wsBarrier, waitFor } from './helpers.js';

const data = loadData('data');
async function boot() {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  return { db, app, url: `ws://127.0.0.1:${app.server.address().port}`, setT: (v) => (t = v) };
}
const sockets = new Set();
const connect = (url) => new Promise((res, rej) => {
  const ws = new WebSocket(url); ws.log = []; sockets.add(ws);
  ws.on('message', (d) => ws.log.push(d.toString()));
  ws.once('open', () => res(ws)); ws.once('error', rej);
});
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
async function ask(ws, msg) { const p = next(ws); ws.send(JSON.stringify(msg)); return p; }
const nextN = (ws, n) => new Promise((res) => { const got = []; const on = (d) => { got.push(JSON.parse(d)); if (got.length === n) { ws.off('message', on); res(got); } }; ws.on('message', on); });
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
  const login = async (id) => { const s = await connect(env.url); await ask(s, { type: 'login', admissionId: id }); return s; };
  return { ...env, o, a, b, login };
}

test('a non-CFO puzzle_next is refused', async () => {
  const env = await competing();
  assert.deepEqual(await ask(env.a, { type: 'puzzle_next' }), { type: 'error', error: 'only the CFO can play puzzles' });
  await done(env.app, env.o, env.a, env.b);
});

test('every non-CFO and the organizer are refused for next, submit and skip; nothing is created', async () => {
  const env = await competing();
  const socks = [env.a, env.b];
  for (const id of ['S1', 'S3', 'S4', 'S6', 'S9']) socks.push(await env.login(id));
  for (const s of socks) {
    for (const m of [{ type: 'puzzle_next' }, { type: 'puzzle_submit', answer: [1] }, { type: 'puzzle_skip' }]) {
      const r = await ask(s, m);
      assert.equal(r.type, 'error');
      assert.equal(r.error, 'only the CFO can play puzzles');
    }
  }
  assert.deepEqual(await ask(env.o, { type: 'puzzle_next' }), { type: 'error', error: 'bad_message' });
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM puzzle_sessions').get().n, 0);
  await done(env.app, env.o, ...socks.slice(2));
});

test('puzzle messages are refused outside the competition and for lobby players', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  env.setT(500_000);
  assert.deepEqual(await ask(cfo, { type: 'puzzle_next' }), { type: 'error', error: 'puzzles are only open during the competition' });
  await done(env.app, env.o, env.a, env.b, cfo);
  const e2 = await boot();
  const s = await connect(e2.url);
  assert.equal((await ask(s, { type: 'puzzle_next' })).error, 'bad_message');
  await done(e2.app, s);
});

test('puzzle_next from the CFO returns a state with an open puzzle', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  const r = await ask(cfo, { type: 'puzzle_next' });
  assert.equal(r.type, 'state');
  assert.notEqual(r.view.competition.puzzle, null);
  await done(env.app, env.o, env.a, env.b, cfo);
});

test('a wrong answer returns puzzle_result ok:false', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  await ask(cfo, { type: 'puzzle_next' });
  const two = nextN(cfo, 2);
  cfo.send(JSON.stringify({ type: 'puzzle_submit', answer: { nonsense: true } }));
  const got = await two;
  assert.deepEqual(got.find((m) => m.type === 'puzzle_result'), { type: 'puzzle_result', ok: false, coins: 0 });
  await done(env.app, env.o, env.a, env.b, cfo);
});

test('answers of the wrong shape or size are refused to the sender only, before the engine', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  await ask(cfo, { type: 'puzzle_next' });
  for (const answer of [undefined, null, 5, 'abc', true, 7]) {
    const r = await ask(cfo, { type: 'puzzle_submit', answer });
    assert.deepEqual(r, { type: 'error', error: 'bad_message' }, JSON.stringify(answer)?.slice(0, 30));
  }
  assert.equal(env.db.prepare('SELECT wrong_tries FROM puzzle_sessions').get().wrong_tries, 0);
  // Oversized frames are cut off by the existing 4 KB participant limit, before any parsing.
  const closed = new Promise((r) => cfo.once('close', r));
  cfo.send(JSON.stringify({ type: 'puzzle_submit', answer: ['x'.repeat(20001)] }));
  await closed;
  assert.equal(env.db.prepare('SELECT wrong_tries FROM puzzle_sessions').get().wrong_tries, 0);
  assert.equal(env.a.log.filter((x) => x.includes('bad_message')).length, 0);
  await done(env.app, env.o, env.a, env.b, cfo);
});

test('the puzzle and its solution never reach any other socket, and the CFO socket never sees the solution', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  const mate = await env.login('S3');
  await ask(cfo, { type: 'puzzle_next' });
  await ask(cfo, { type: 'puzzle_submit', answer: [0] });
  env.app.tickAll();
  await wait();
  const row = env.db.prepare('SELECT * FROM puzzle_sessions').get();
  const mine = JSON.stringify(JSON.parse(row.puzzle));
  for (const s of [env.a, env.b, mate, env.o]) {
    const all = s.log.join('\n');
    assert.equal(all.includes(mine), false);
    assert.equal(/"solution"|"seed"/.test(all), false);
  }
  const mineAll = cfo.log.join('\n');
  assert.equal(/"solution"|"seed"/.test(mineAll), false);
  assert.ok(mineAll.includes(mine));
  await done(env.app, env.o, env.a, env.b, cfo, mate);
});

test('solving pushes the wallet to the actor at once and the teammates by the coalesced push', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  const mate = await env.login('S1');
  await ask(cfo, { type: 'puzzle_next' });
  const sol = JSON.parse(env.db.prepare('SELECT solution FROM puzzle_sessions').get().solution);
  const before = cfo.log.length;
  const two = nextN(cfo, 2);
  cfo.send(JSON.stringify({ type: 'puzzle_submit', answer: sol }));
  const got = await two;
  assert.deepEqual(got.find((m) => m.type === 'puzzle_result'), { type: 'puzzle_result', ok: true, coins: 20 });
  assert.equal(got.find((m) => m.type === 'state').view.wallet, env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet);
  env.app.flush();
  await waitFor(() => mate.log.some((x) => JSON.parse(x).type === 'state' && JSON.parse(x).view.wallet === 1020)).catch(() => {});
  assert.ok(mate.log.some((x) => JSON.parse(x).type === 'state' && JSON.parse(x).view.wallet === 1020));
  assert.ok(cfo.log.length > before);
  const ev = env.db.prepare("SELECT type FROM events WHERE type LIKE 'puzzle_%'").all().map((r) => r.type);
  assert.deepEqual(ev, ['puzzle_shown', 'puzzle_solved']);
  await done(env.app, env.o, env.a, env.b, cfo, mate);
});

test('if no puzzle can be generated the sender gets a friendly try-again error', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  const { PUZZLES, KINDS } = await import('../src/puzzles/index.js');
  const saved = KINDS.map((k) => [k, PUZZLES[k].generate]);
  for (const k of KINDS) PUZZLES[k].generate = () => { throw new Error('boom'); };
  try {
    assert.deepEqual(await ask(cfo, { type: 'puzzle_next' }), { type: 'error', error: 'could not make a puzzle just now, please try again' });
  } finally { for (const [k, f] of saved) PUZZLES[k].generate = f; }
  assert.equal((await ask(cfo, { type: 'puzzle_next' })).type, 'state');
  await done(env.app, env.o, env.a, env.b, cfo);
});

test('a submit or skip with no open puzzle replies quietly, never an error, and charges nothing', async () => {
  const env = await competing();
  const cfo = await env.login('S2');
  const wallet = () => env.db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet;
  const w = wallet();
  const two = nextN(cfo, 2);
  cfo.send(JSON.stringify({ type: 'puzzle_submit', answer: [1] }));
  const got = await two;
  assert.deepEqual(got.find((m) => m.type === 'puzzle_result'), { type: 'puzzle_result', ok: false, coins: 0, closed: true });
  assert.ok(got.find((m) => m.type === 'state'));
  assert.equal(got.some((m) => m.type === 'error'), false);
  const r = await ask(cfo, { type: 'puzzle_skip' });
  assert.equal(r.type, 'state');
  assert.equal(wallet(), w);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM events WHERE type IN ('puzzle_wrong','puzzle_skipped')").get().n, 0);
  await done(env.app, env.o, env.a, env.b, cfo);
});
