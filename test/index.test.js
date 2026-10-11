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
});
