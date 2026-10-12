import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';

const data = loadData('data');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const c = { ws, all: [], last: null };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); c.all.push(m); c.last = m; });
    c.ask = async (m) => { ws.send(JSON.stringify(m)); await sleep(80); return c.last; };
    c.send = async (m) => { ws.send(JSON.stringify(m)); await sleep(80); };
    ws.once('open', () => resolve(c));
    ws.once('error', reject);
  });
}

test('CFO plays puzzles over the real protocol: paid once, two free skips then a paid one', async () => {
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null });
  await new Promise((r) => app.server.listen(0, r));
  const url = `ws://127.0.0.1:${app.server.address().port}`;
  const socks = [];
  const mk = async () => { const c = await client(url); socks.push(c); return c; };
  try {
    const o = await mk();
    await o.ask({ type: 'organizer', password: 'pw' });
    let roster = '';
    for (let i = 0; i < 10; i++) roster += `S${i},Player ${i}\n`;
    await o.ask({ type: 'roster_import', text: roster });
    const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
    for (let i = 0; i < 10; i++) o.ws.send(JSON.stringify({ type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] }));
    await sleep(150);
    await o.ask({ type: 'start_game', problemId: 1 });
    t = 200_000;
    const ceo = await mk(); await ceo.ask({ type: 'login', admissionId: 'S0' });
    await ceo.ask({ type: 'pick', ideaId: 'H1' });
    const cfo = await mk(); await cfo.ask({ type: 'login', admissionId: 'S2' });
    t = 800_000;
    const wallet = () => db.prepare("SELECT wallet FROM company_state WHERE company='A'").get().wallet;
    const solution = () => JSON.parse(db.prepare('SELECT solution FROM puzzle_sessions WHERE ended_at IS NULL').get().solution);

    const w0 = wallet();
    let r = await cfo.ask({ type: 'puzzle_next' });
    assert.equal(r.type, 'state');
    assert.ok(r.view.competition.puzzle);
    assert.equal(/"solution"|"seed"/.test(JSON.stringify(cfo.all)), false);

    const ans = JSON.stringify({ type: 'puzzle_submit', answer: solution() });
    cfo.ws.send(ans); cfo.ws.send(ans);
    await sleep(200);
    assert.equal(wallet(), w0 + 20);
    assert.equal(cfo.all.filter((m) => m.type === 'puzzle_result' && m.ok).length, 1);
    assert.equal(cfo.all.filter((m) => m.type === 'error').length, 0);
    assert.equal(cfo.all.filter((m) => m.type === 'puzzle_result' && m.closed).length, 1);
    assert.equal(cfo.all.find((m) => m.type === 'puzzle_result').coins, 20);

    const w1 = wallet();
    for (let i = 0; i < 2; i++) { await cfo.ask({ type: 'puzzle_next' }); await cfo.ask({ type: 'puzzle_skip' }); assert.equal(wallet(), w1); }
    await cfo.ask({ type: 'puzzle_next' });
    r = await cfo.ask({ type: 'puzzle_skip' });
    assert.equal(wallet(), w1 - 10);
    assert.deepEqual(r.view.competition.puzzlesDone, { solved: 1, skipped: 3 });
    assert.equal(r.view.wallet, w1 - 10);
    // teammates never saw the puzzle
    assert.equal(ceo.all.some((m) => m.view && m.view.competition && 'puzzle' in m.view.competition), false);
  } finally {
    socks.forEach((c) => c.ws.terminate());
    app.wss.clients.forEach((c) => c.terminate());
    await new Promise((r) => app.server.close(r));
  }
});
