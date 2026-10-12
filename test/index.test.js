import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { phaseAt } from '../src/phases.js';
import { activeGame } from '../src/persist.js';
import { bootstrap, checkPassword } from '../src/index.js';

test('a restart on the same database file resumes the running game', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'showdown-'));
  const dbFile = join(dir, 'game.db');
  try {
    // First life: start a game 200 s ago, record a heartbeat, then "crash".
    const db1 = openDb(dbFile);
    for (let i = 0; i < 10; i++) addParticipant(db1, `S${i}`, `P${i}`);
    let i = 0;
    for (const c of ['A', 'B']) for (const r of ROLES) assign(db1, `S${i++}`, c, r);
    const gid = startGame(db1, 1, 1_000_000);
    db1.prepare('UPDATE games SET heartbeat_at = ? WHERE id = ?').run(1_200_000, gid);
    db1.close();

    // Second life: a new process with a wildly different clock.
    const { app, clock, stop } = await bootstrap({ dbFile, organizerPassword: 'pw', port: 0, now: () => 50_000_000 });
    try {
      const g = activeGame(app.db);
      assert.equal(clock.now(), 1_200_000);
      assert.deepEqual(phaseAt(g, clock.now()), { phase: 'ideation', remainingSec: 160 });
    } finally {
      await stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stop() clears intervals and releases the port so the process can exit', async () => {
  const { app, stop } = await bootstrap({ dbFile: ':memory:', organizerPassword: 'pw', port: 0 });
  assert.ok(app.server.listening);
  await stop();
  assert.equal(app.server.listening, false);
});

test('a clock earlier than the last heartbeat still resumes without throwing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'showdown-'));
  const dbFile = join(dir, 'game.db');
  try {
    const db1 = openDb(dbFile);
    for (let i = 0; i < 10; i++) addParticipant(db1, `S${i}`, `P${i}`);
    let i = 0;
    for (const c of ['A', 'B']) for (const r of ROLES) assign(db1, `S${i++}`, c, r);
    const gid = startGame(db1, 1, 1_000_000);
    db1.prepare('UPDATE games SET heartbeat_at = ? WHERE id = ?').run(1_200_000, gid);
    db1.close();
    const { app, clock, stop } = await bootstrap({ dbFile, organizerPassword: 'pw', port: 0, now: () => 500 });
    try {
      const g = activeGame(app.db);
      assert.ok(g);
      assert.equal(clock.now(), 1_200_000);
      assert.ok(Number.isFinite(phaseAt(g, clock.now()).remainingSec));
    } finally {
      await stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a throw inside the tick or heartbeat callback does not stop either interval', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const errors = mock.method(console, 'error', () => {});
  const { app, stop } = await bootstrap({ dbFile: ':memory:', organizerPassword: 'pw', port: 0 });
  try {
    let ticks = 0;
    app.tickAll = () => { ticks++; if (ticks === 1) throw new Error('boom'); };
    mock.timers.tick(1000);
    mock.timers.tick(1000);
    assert.equal(ticks, 2);
    const realPrepare = app.db.prepare.bind(app.db);
    let beats = 0;
    app.db.prepare = (sql) => { beats++; if (beats === 1) throw new Error('db boom'); return realPrepare(sql); };
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    assert.ok(beats >= 2);
    assert.ok(errors.mock.callCount() >= 2);
  } finally {
    errors.mock.restore();
    mock.timers.reset();
    await stop();
  }
});

test('bootstrap accepts an injected real clock and exposes the server clock', async () => {
  const { clock, stop } = await bootstrap({ dbFile: ':memory:', organizerPassword: 'pw', port: 0, real: () => 123 });
  try {
    assert.equal(clock.now(), 123);
  } finally {
    await stop();
  }
});

test('checkPassword rejects unset, empty and the placeholder password', () => {
  assert.equal(checkPassword(undefined).ok, false);
  assert.equal(checkPassword('').ok, false);
  assert.equal(checkPassword('change-me-before-the-event').ok, false);
  assert.match(checkPassword('').message, /ORGANIZER_PASSWORD/);
  assert.equal(checkPassword('a-real-secret').ok, true);
  assert.equal(checkPassword('short').ok, false);
  assert.match(checkPassword('1234567').message, /8 characters/);
  assert.equal(checkPassword('12345678').ok, true);
});

import { cleanSpeed } from '../src/index.js';

test('cleanSpeed accepts 1 to 60 and turns everything else into 1 with a warning', () => {
  const warn = mock.method(console, 'warn', () => {});
  try {
    assert.equal(cleanSpeed(undefined), 1);
    assert.equal(cleanSpeed(''), 1);
    assert.equal(cleanSpeed('10'), 10);
    assert.equal(cleanSpeed(60), 60);
    assert.equal(warn.mock.callCount(), 0);
    for (const bad of [0, -5, NaN, 'abc', 61, '1e9', '0', Infinity]) assert.equal(cleanSpeed(bad), 1, String(bad));
    assert.equal(warn.mock.callCount(), 8);
  } finally { warn.mock.restore(); }
});

test('bootstrap speed 10 makes the clock ten times faster; bad speeds behave like 1', async () => {
  const warn = mock.method(console, 'warn', () => {});
  const log = mock.method(console, 'log', () => {});
  try {
    for (const [speed, factor] of [[10, 10], ['fast', 1], [500, 1], [undefined, 1]]) {
      let real = 1_000_000;
      const { clock, app, stop } = await bootstrap({ dbFile: ':memory:', organizerPassword: 'pw', port: 0, speed, realNow: () => real });
      try {
        const start = clock.now();
        real += 5000;
        assert.equal(clock.now() - start, 5000 * factor, `speed ${speed}`);
        assert.equal(app.ctx.speed, factor);
      } finally { await stop(); }
    }
    assert.ok(log.mock.calls.some((c) => /speed/i.test(String(c.arguments[0]))), 'the speed is logged at startup');
  } finally { warn.mock.restore(); log.mock.restore(); }
});

test('bootstrap runs the tick every 1000/speed ms, the heartbeat every 5000/speed ms, backup and ping in real time', async () => {
  const calls = [];
  const realSet = globalThis.setInterval;
  const spy = mock.method(globalThis, 'setInterval', (fn, ms, ...rest) => { calls.push(ms); return realSet(fn, ms, ...rest); });
  const log = mock.method(console, 'log', () => {});
  try {
    const timers = { setInterval: (fn, ms) => { calls.push(`backup:${ms}`); return 0; }, clearInterval() {} };
    const { stop } = await bootstrap({ dbFile: ':memory:', organizerPassword: 'pw', port: 0, speed: 10, backupEveryMs: 300000, timers });
    await stop();
    assert.ok(calls.includes(100), 'tick 100 ms');
    assert.ok(calls.includes(500), 'heartbeat 500 ms');
    assert.ok(calls.includes(30000), 'ping stays 30 s');
    assert.ok(calls.includes('backup:300000'), 'backup stays in real ms');
  } finally { spy.mock.restore(); log.mock.restore(); }
});
