import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from '../src/server.js';
import { createClock, speedClock } from '../src/clock.js';
import { phaseAt } from '../src/phases.js';
import { activeGame } from '../src/persist.js';
import { organizerView, viewFor } from '../src/views.js';
import { makeRunning, data, give, wsBarrier } from './helpers.js';

// Plays a whole game (1780 game seconds) with an injected real clock, one tick per game second as bootstrap does.
function playGame(speed) {
  const h = makeRunning({ startAt: 500 }); // half a second in, so float rounding never crosses a second boundary
  let real = 0;
  const clock = createClock({ real: speedClock(speed, () => real) });
  clock.setOffset(500);
  const app = createApp({ db: h.db, organizerPassword: 'pw', now: clock.now, data, staticRoot: null, speed });
  give(h, 'A', ['O01', 'O02', 'O03']);
  const phases = [];
  for (let s = 1; s <= 1800; s++) {
    real = Math.round((s * 1000) / speed); // each tick is 1000/speed real ms
    app.tickAll();
    const p = phaseAt(activeGame(h.db) ?? { startedAt: 500, ideationSavedSec: 0 }, clock.now()).phase;
    if (phases.at(-1) !== p) phases.push(p);
  }
  const wallets = Object.fromEntries(h.db.prepare('SELECT company, wallet FROM company_state').all().map((r) => [r.company, r.wallet]));
  return { phases, wallets };
}

test('a whole game at speed 60 walks the phases and credits the same coins as at speed 1', () => {
  const slow = playGame(1);
  const fast = playGame(60);
  assert.ok(slow.wallets.A > 1000, 'the economy credited something');
  assert.deepEqual(fast.phases, slow.phases);
  assert.deepEqual(fast.phases, ['briefing', 'ideation', 'shop', 'summary', 'competition', 'ended']);
  for (const c of ['A', 'B']) assert.ok(Math.abs(fast.wallets[c] - slow.wallets[c]) <= 1, `${c}: ${fast.wallets[c]} vs ${slow.wallets[c]}`);
});

test('only the organizer view carries rehearsalSpeed', () => {
  const h = makeRunning();
  const fast = { ...h.ctx, speed: 10 };
  assert.equal(organizerView(fast).rehearsalSpeed, 10);
  assert.equal(organizerView(h.ctx).rehearsalSpeed, null);
  assert.ok(!('rehearsalSpeed' in viewFor(fast, 'S0')));
  assert.ok(!JSON.stringify(viewFor(fast, 'S0')).includes('rehearsal'));
});

test('starting a game at speed > 1 records it in events; at speed 1 it does not', async () => {
  for (const speed of [10, 1]) {
    const h = makeRunning();
    h.db.prepare('DELETE FROM games').run();
    h.db.prepare("UPDATE participants SET status='lobby', game_id=NULL").run();
    h.db.prepare('DELETE FROM company_state').run();
    const app = createApp({ db: h.db, organizerPassword: 'pw', now: () => 1000, data, staticRoot: null, speed });
    await new Promise((r) => app.server.listen(0, r));
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}`);
    await new Promise((r) => ws.once('open', r));
    const send = (m) => ws.send(JSON.stringify(m));
    send({ type: 'organizer', password: 'pw' });
    await wsBarrier(ws);
    send({ type: 'start_game', problemId: 1 });
    await wsBarrier(ws);
    const rows = h.db.prepare("SELECT payload FROM events WHERE type='rehearsal_speed'").all();
    if (speed > 1) assert.deepEqual(rows.map((r) => JSON.parse(r.payload).speed), [10]);
    else assert.equal(rows.length, 0);
    ws.close();
    app.wss.close();
    await new Promise((r) => app.server.close(r));
  }
});
