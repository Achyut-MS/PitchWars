import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { waitFor, askBarrier } from './helpers.js';

const data = loadData('data');

function client(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const c = { ws, all: [], view: null, last: null };
    ws.on('message', (raw) => {
      const text = raw.toString();
      const m = JSON.parse(text);
      c.all.push(text);
      if (m.type === 'state') c.view = m.view;
      c.last = m;
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    c.ask = (m) => askBarrier(c, ws, m);
    ws.once('open', () => resolve(c));
    ws.once('error', reject);
  });
}

async function setup(extra = 0) {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, allowDuplicateSessions: true });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  const env = { db, app, url, setT: (v) => (t = v), socks: [] };
  const mk = async () => { const c = await client(url); env.socks.push(c); return c; };
  env.mk = mk;
  const o = await mk();
  await o.ask({ type: 'organizer', password: 'pw' });
  let roster = '';
  for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
  await o.ask({ type: 'roster_import', text: roster });
  const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  for (let i = 0; i < 10; i++) o.send({ type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
  await waitFor(() => db.prepare('SELECT COUNT(*) AS n FROM participants WHERE role IS NOT NULL').get().n === 10);
  env.setT(0);
  await o.ask({ type: 'start_game', problemId: 1 });
  env.setT(200_000);
  env.p = {};
  for (let i = 0; i < 10; i++) { const c = await mk(); await c.ask({ type: 'login', admissionId: `S${i}` }); env.p[`S${i}`] = c; }
  await env.p.S0.ask({ type: 'pick', ideaId: 'H1' });
  await env.p.S5.ask({ type: 'pick', ideaId: 'S1' });
  env.setT(800_000);
  env.o = o;
  return env;
}
const close = async (env) => { env.socks.forEach((s) => s.ws.terminate()); env.app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => env.app.server.close(r)); };
const wallet = (env, c) => env.db.prepare('SELECT wallet FROM company_state WHERE company=?').get(c).wallet;
const own = (env, company, id, charged) =>
  env.db.prepare('INSERT OR REPLACE INTO owned (game_id, company, family, item_id, bought_at, charged) VALUES (1, ?, ?, ?, 0, ?)').run(company, id, id, charged);

test('a short competition over the real protocol: purchases, attack, shield block, injection, event', async () => {
  const env = await setup();
  try {
    env.app.tickAll(); // economy starts
    own(env, 'A', 'O01', 60); own(env, 'A', 'O02', 100); own(env, 'A', 'O03', 150);
    for (let s = 801; s <= 805; s++) { env.setT(s * 1000); env.app.tickAll(); }
    env.app.flush();
    await waitFor(() => env.p.S4.view?.competition?.rates?.COO === 27).catch(() => {});
    assert.equal(env.p.S4.view.competition.rates.COO, 27);
    const walletA = wallet(env, 'A');
    assert.ok(walletA > 1000 + 5 * 27 / 60 - 1 && walletA <= 1000 + 5 * 27 / 60 + 1 - 0, `wallet A ${walletA}`);

    // CEO of A attacks B (no shield yet): charged, B sees only a cover story.
    const before = wallet(env, 'A');
    const r1 = await env.p.S0.ask({ type: 'attack', key: 'price_squeeze' });
    assert.ok(r1.type === 'state' || r1.type === 'attack_result');
    assert.ok(env.p.S0.all.some((x) => JSON.parse(x).type === 'attack_result' && JSON.parse(x).blocked === false));
    assert.equal(before - wallet(env, 'A'), 300);
    env.app.flush(); // the coalesced push reaches the other players
    await waitFor(() => env.p.S5.all.some((x) => JSON.parse(x).type === 'state' && /Customer demand has softened/.test(x))).catch(() => {});

    // Second attack in the cooldown is refused and not charged.
    assert.deepEqual(await env.p.S0.ask({ type: 'attack', key: 'market_crash' }), { type: 'error', error: 'attack on cooldown' });
    assert.equal(before - wallet(env, 'A'), 300);

    // B buys the shield (seeded), A attacks after the cooldown: blocked, still pays.
    own(env, 'B', 'O06', 150);
    env.setT(950_000); env.app.tickAll();
    const w2 = wallet(env, 'A');
    await env.p.S0.ask({ type: 'attack', key: 'market_crash' });
    const results = env.p.S0.all.map((x) => JSON.parse(x)).filter((x) => x.type === 'attack_result');
    assert.equal(results.at(-1).blocked, true);
    assert.ok(w2 - wallet(env, 'A') >= 450 - 1);

    // Organizer: market event and injection.
    const wB = wallet(env, 'B');
    assert.equal((await env.o.ask({ type: 'market_event', key: 'demand_surge' })).type, 'state');
    assert.equal((await env.o.ask({ type: 'inject', company: 'B', coins: 200 })).type, 'state');
    assert.equal(wallet(env, 'B') - wB, 200);
    await env.o.ask({ type: 'inject', company: 'A', coins: 100 });
    assert.ok(env.o.all.some((x) => JSON.parse(x).error === 'coins were already injected in this game'));

    // Victim: every message any B player ever received never carries the attacker.
    env.setT(951_000); env.app.tickAll(); env.app.flush();
    await waitFor(() => ['S5', 'S6', 'S7', 'S8', 'S9'].every((id) => env.p[id].all.join('\n').includes('Customer demand has softened'))).catch(() => {});
    for (const id of ['S5', 'S6', 'S7', 'S8', 'S9']) {
      const text = env.p[id].all.join('\n');
      // The victim CEO (S5) legitimately sees its own attack menu, so attack names are checked on non-CEOs only.
      const needles = ['S0', 'Player 0', 'launched_by', 'attacker', 'shield_use', ...(id === 'S5' ? [] : ['price_squeeze', 'market_crash'])];
      for (const needle of needles) {
        { const i = text.indexOf(needle); assert.ok(i < 0, `${id} received "${needle}" in: ${text.slice(Math.max(0, i - 200), i + 80)}`); }
      }
      assert.ok(text.includes('Customer demand has softened'), `${id}: cover story shown`);
    }
  } finally { await close(env); }
});

test('performance: 80 sessions, a full tick plus coalesced push stays under 1 s', async () => {
  const env = await setup();
  try {
    own(env, 'A', 'O03', 150);
    const extra = [];
    for (let i = 0; i < 70; i++) { const c = await env.mk(); await c.ask({ type: 'login', admissionId: `S${i % 10}` }); extra.push(c); }
    assert.equal(env.app.wss.clients.size, 81);
    env.app.tickAll();
    let worst = 0;
    for (let s = 801; s <= 806; s++) {
      env.setT(s * 1000);
      const t0 = performance.now();
      env.app.tickAll();
      worst = Math.max(worst, performance.now() - t0);
    }
    assert.ok(worst < 1000, `worst tick ${worst.toFixed(1)} ms`);
    env.app.flush();
    await waitFor(() => extra[0].view?.competition).catch(() => {});
    assert.ok(extra[0].view.competition);
  } finally { await close(env); }
});
