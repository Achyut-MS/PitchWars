import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    ws.once('open', () => resolve(c));
    ws.once('error', reject);
  });
}

test('reveal over the wire: players get nothing before, everyone gets it after; organizer-only; idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ws-exp-'));
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, exportDir: dir });
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
    const p = await mk(); await p.ask({ type: 'login', admissionId: 'S0' });
    const q = await mk(); await q.ask({ type: 'login', admissionId: 'S7' });

    t = 900_000;
    let r = await o.ask({ type: 'reveal' });
    assert.equal(r.type, 'error');
    assert.match(r.error, /still running/);

    t = 1_800_000;
    await p.ask({ type: 'sync' });
    assert.equal(p.last.view.clock.phase, 'ended');
    r = await p.ask({ type: 'reveal' });
    assert.equal(r.type, 'error');
    assert.equal(db.prepare('SELECT revealed_at FROM games').get().revealed_at, null);
    assert.equal(/<svg|"results"|"graphs"/.test(JSON.stringify(p.all) + JSON.stringify(q.all)), false);

    await o.ask({ type: 'reveal' });
    await sleep(300);
    for (const c of [p, q]) {
      const st = [...c.all].reverse().find((m) => m.type === 'state');
      assert.equal((JSON.stringify(st.view.results).match(/<svg/g) || []).length, 3);
    }
    await o.ask({ type: 'reveal' });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='graphs_revealed'").get().n, 1);

    await o.ask({ type: 'next_game' });
    await sleep(300);
    const st = [...p.all].reverse().find((m) => m.type === 'state');
    assert.equal(st.view.screen, 'graphs');
    assert.equal(st.view.me.status, 'completed');
  } finally {
    for (const c of socks) c.ws.terminate();
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
