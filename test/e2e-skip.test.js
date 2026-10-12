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
    const c = { ws, all: [], last: null };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); c.all.push(m); c.last = m; });
    c.ask = (m) => askBarrier(c, ws, m);
    ws.once('open', () => resolve(c));
    ws.once('error', reject);
  });
}

test('skip_phase walks Briefing to Competition over real sockets; ideation auto-picks once', async () => {
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
    await waitFor(() => db.prepare('SELECT COUNT(*) AS n FROM participants WHERE role IS NOT NULL').get().n === 10);
    await o.ask({ type: 'start_game', problemId: 1 });
    const p = await mk();
    await p.ask({ type: 'login', admissionId: 'S0' });

    // a participant may not skip
    assert.deepEqual(await p.ask({ type: 'skip_phase' }), { type: 'error', error: 'bad_message' });

    const phaseOf = () => db.prepare('SELECT started_at FROM games').get();
    const view = () => [...o.all].reverse().find((m) => m.type === 'state').view.game.clock.phase;
    const seen = [];
    t = 5000; app.tickAll();
    for (const expect of ['ideation', 'shop', 'summary', 'competition']) {
      const r = await o.ask({ type: 'skip_phase' });
      assert.equal(r.type, 'state');
      assert.equal(r.view.game.clock.phase, expect);
      t += 1000;
      app.tickAll(); app.tickAll();
      app.flush();
      await waitFor(() => view() === expect && [...o.all].reverse().find((m) => m.type === 'tick')?.phase === expect).catch(() => {});
      assert.equal(view(), expect);
      const tick = [...o.all].reverse().find((m) => m.type === 'tick');
      assert.equal(tick.phase, expect);
      seen.push(expect);
    }
    assert.deepEqual(seen, ['ideation', 'shop', 'summary', 'competition']);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM phase_done").get().n, 4);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE type='idea_auto_pick'").get().n, 2);
    assert.deepEqual(db.prepare('SELECT pick_source s FROM company_state').all().map((r) => r.s), ['auto', 'auto']);
    const picks = db.prepare('SELECT company, idea_id FROM company_state').all();
    assert.ok(picks.every((c) => c.idea_id), 'each company has an idea after auto-pick');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM warnings_sent").get().n, 0);
    // refused inside the competition
    const r = await o.ask({ type: 'skip_phase' });
    assert.equal(r.type, 'error');
    const logged = db.prepare("SELECT payload FROM events WHERE type='organizer_action'").all().map((e) => JSON.parse(e.payload)).filter((e) => e.action === 'skip_phase');
    assert.deepEqual(logged.map((e) => [e.args.from, e.args.to]), [['briefing', 'ideation'], ['ideation', 'shop'], ['shop', 'summary'], ['summary', 'competition']]);
    assert.ok(phaseOf());
  } finally {
    socks.forEach((s) => s.ws.terminate()); app.wss.clients.forEach((c) => c.terminate());
    await new Promise((r) => app.server.close(r));
  }
});
