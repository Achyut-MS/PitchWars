import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import { bootstrap } from '../src/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

// A WebSocket client that remembers its latest state view and every state it saw.
function client(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const c = { ws, view: null, seen: [], last: null, ticks: 0, waiters: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'tick') c.ticks++;
      if (m.type === 'state') { c.view = m.view; c.seen.push(JSON.stringify(m.view)); }
      c.last = m;
      c.waiters = c.waiters.filter((w) => !w(m));
    });
    c.send = (m) => ws.send(JSON.stringify(m));
    // Resolves with the first message matching pred (checked on arrival only).
    c.wait = (pred, ms = 5000) => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting for message')), ms);
      c.waiters.push((m) => { if (pred(m)) { clearTimeout(t); res(m); return true; } return false; });
    });
    // Pushes may be coalesced (about 200 ms), so replies are not matched to requests one by one:
    // fire() sends, expectError() waits for the error reply, and sync() settles then reads fresh state.
    c.fire = (m) => c.send(m);
    c.expectError = async (m) => { const p = c.wait((x) => x.type === 'error'); c.send(m); return (await p).error; };
    c.sync = async () => { await sleep(350); const p = c.wait((x) => x.type === 'state'); c.send({ type: 'sync' }); return (await p).view; };
    c.ask = async (m) => { c.send(m); return c.sync(); };
    ws.once('open', () => resolve(c));
    ws.once('error', reject);
  });
}

test('end to end: lobby, start, ideation, shop over real WebSockets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'showdown-'));
  const clock = { t: 1_000_000 };
  const port = await freePort();
  const srv = await bootstrap({ dbFile: join(dir, 'e2e.db'), organizerPassword: 'pw', port, real: () => clock.t });
  const url = `ws://127.0.0.1:${port}`;
  const sockets = [];
  try {
    // Static files are served.
    const html = await (await fetch(`http://127.0.0.1:${port}/organizer.html`)).text();
    assert.match(html, /organizer\.js/);

    // Organizer logs in (wrong password first).
    const org = await client(url); sockets.push(org);
    assert.equal(await org.expectError({ type: 'organizer', password: 'nope' }), 'bad_password');
    const w = org.wait((m) => m.type === 'welcome');
    org.send({ type: 'organizer', password: 'pw' });
    await w;

    // Roster with one bad row: the result reports it.
    const roster = ['id,name', ...Array.from({ length: 12 }, (_, i) => `S${i},Player ${i}`), ',No Id'].join('\n');
    const impP = org.wait((m) => m.type === 'state' && m.result);
    org.send({ type: 'roster_import', text: roster });
    const imp = await impP;
    assert.equal(imp.result.added, 12);
    assert.deepEqual(imp.result.rejected, [{ line: 14, reason: 'blank admission id' }]);

    // Seats: S0..S4 are company A (CEO,CTO,CFO,CMO,COO), S5..S9 company B.
    const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
    for (let i = 0; i < 10; i++) org.fire({ type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] });
    org.fire({ type: 'unassign', admissionId: 'S9' });
    assert.equal((await org.sync()).participants.find((p) => p.admission_id === 'S9').company, null);
    await org.ask({ type: 'assign', admissionId: 'S9', company: 'B', role: 'COO' });
    assert.equal(org.view.participants.filter((p) => p.company).length, 10);

    // Ten players connect and log in.
    const p = {};
    for (let i = 0; i < 10; i++) {
      const c = await client(url); sockets.push(c); p[`S${i}`] = c;
      const welcome = c.wait((m) => m.type === 'welcome');
      c.send({ type: 'login', admissionId: `s${i}` });
      assert.equal((await welcome).view, 'lobby');
      assert.equal((await c.sync()).screen, 'lobby');
    }

    // Start: everyone is pushed into the Briefing.
    const started = p.S0.wait((m) => m.type === 'state' && m.view.screen === 'game');
    org.fire({ type: 'start_game', problemId: 1 });
    await started;
    assert.equal(p.S0.view.clock.phase, 'briefing');
    assert.equal(org.view.game.clock.phase, 'briefing');

    // Swap two players in the briefing and swap back.
    org.fire({ type: 'swap_seats', a: 'S1', b: 'S2' });
    org.fire({ type: 'swap_seats', a: 'S1', b: 'S2' });

    await sleep(350);
    // Ideation. Players only learn of the new phase through a sync (here: after the tick-driven director).
    clock.t += 181_000;
    await p.S0.wait((m) => m.type === 'tick' && m.phase === 'ideation', 5000);
    assert.equal((await p.S0.sync()).clock.phase, 'ideation');
    for (let i = 0; i < 5; i++) p[`S${i}`].fire({ type: 'vote', ideaId: 'H1' });
    for (let i = 5; i < 10; i++) p[`S${i}`].fire({ type: 'vote', ideaId: 'H2' });
    assert.equal((await p.S0.sync()).ideation.ideas.find((i) => i.id === 'H1').votes, 5);

    // A CEO picking twice is refused; both CEOs picked ends ideation early.
    p.S0.fire({ type: 'pick', ideaId: 'H1' });
    assert.equal(await p.S0.expectError({ type: 'pick', ideaId: 'H1' }), 'your company has already picked');
    p.S5.fire({ type: 'pick', ideaId: 'H2' });
    await sleep(350);
    const from = Object.fromEntries(Object.entries(p).map(([k, c]) => [k, c.seen.length]));
    for (const c of Object.values(p)) await c.sync();
    assert.equal(p.S0.view.clock.phase, 'shop');
    assert.equal(p.S0.view.idea.id, 'H1');
    assert.equal(p.S5.view.idea.id, 'H2');

    // Shop: the CTO asks for a core feature (CEO then CFO approve); the CMO buys a brand name.
    p.S1.fire({ type: 'request', itemId: 'F01-B' });
    const ceoReq = (await p.S0.sync()).shop.awaitingCeo[0];
    p.S0.fire({ type: 'ceo_decide', requestId: ceoReq.id, approve: true });
    p.S3.fire({ type: 'request', itemId: 'M02', choice: '1' });
    const q = (await p.S2.sync()).shop.queue;
    assert.equal(q.length, 2);
    assert.equal(await p.S2.expectError({ type: 'cfo_decide', requestId: q[1].id, approve: true }), 'decide the oldest request first');
    p.S2.fire({ type: 'cfo_decide', requestId: q[0].id, approve: true });
    p.S2.fire({ type: 'cfo_decide', requestId: q[1].id, approve: true });

    // Final wallet and owned items, as the CFO and as the organizer see them.
    await p.S2.sync();
    assert.equal(p.S2.view.wallet, 860);
    assert.deepEqual(p.S2.view.owned.map((o) => o.itemId).sort(), ['F01-B', 'M02']);
    await org.sync();
    assert.equal(org.view.game.companies.A.wallet, 860);
    assert.equal(org.view.game.companies.B.wallet, 1000);
    assert.equal(org.view.game.companies.B.owned.length, 0);

    // Hidden products: after the picks, company A's screens never mention company B's idea (and vice versa).
    for (let i = 0; i < 5; i++) for (const s of p[`S${i}`].seen.slice(from[`S${i}`])) assert.equal(s.includes('Canteen Waste Scale'), false);
    for (let i = 5; i < 10; i++) for (const s of p[`S${i}`].seen.slice(from[`S${i}`])) assert.equal(s.includes('Smart Fridge Sensor'), false);

    // Organizer ends the game; the players are sent to the final screen.
    org.fire({ type: 'next_game' });
    assert.equal((await p.S0.sync()).screen, 'graphs');
  } finally {
    for (const c of sockets) c.ws.terminate();
    await srv.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
