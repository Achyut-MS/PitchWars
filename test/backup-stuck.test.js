import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { organizerView, viewFor } from '../src/views.js';
import { bootstrap } from '../src/index.js';
import { openDb } from '../src/db.js';
import { makeRunning, data } from './helpers.js';

// A manual timer: fire() runs every pending timeout callback, so no real waiting.
function manualTimers() {
  const pending = new Map();
  let n = 0;
  return {
    setTimer: (fn) => { const id = ++n; pending.set(id, fn); return id; },
    clearTimer: (id) => { pending.delete(id); },
    fire: () => { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } },
  };
}

function hung() {
  const calls = [];
  const jobs = [];
  const backup = (db, dir, label) => { calls.push(label); return new Promise((resolve, reject) => jobs.push({ resolve, reject })); };
  return { backup, calls, jobs };
}

const mk = (extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'bkk-'));
  const h = makeRunning();
  const mt = manualTimers();
  const app = createApp({
    db: h.db, organizerPassword: 'pw', now: () => h.clock.t, data, staticRoot: null,
    exportDir: join(dir, 'ex'), backupDir: join(dir, 'usb'), setTimer: mt.setTimer, clearTimer: mt.clearTimer, ...extra,
  });
  return { dir, h, mt, app, done: () => rmSync(dir, { recursive: true, force: true }) };
};

const tick = () => new Promise((r) => setImmediate(r));
const timeOut = async (app, mt, label = 'during') => {
  const p = app.runBackup(label);
  await tick();
  mt.fire();
  return p;
};

test('a timeout sets stuck; the next tick does not start another backup and says so (organizer only)', async () => {
  const f = hung();
  const { h, mt, app, done } = mk({ backup: f.backup });
  try {
    h.clock.t = 7000;
    const st = await timeOut(app, mt);
    assert.equal(st.ok, false);
    assert.match(st.error, /timed out/);
    assert.equal(f.calls.length, 1);
    h.clock.t = 9000;
    const again = await app.runBackup('during');
    assert.equal(f.calls.length, 1, 'no overlapping backup');
    assert.deepEqual(again, { ok: false, at: 9000, file: null, error: 'previous backup still running' });
    assert.deepEqual(organizerView(app.ctx).backup, again);
    const raw = JSON.stringify(viewFor(app.ctx, 'S0'));
    assert.ok(!raw.includes('backup') && !raw.includes('still running'));
  } finally { done(); }
});

for (const how of ['resolve', 'reject']) {
  test(`when the hung backup finally ${how}s, stuck clears and the next tick backs up`, async () => {
    const f = hung();
    const { mt, app, done } = mk({ backup: f.backup });
    try {
      await timeOut(app, mt);
      await app.runBackup('during');
      assert.equal(f.calls.length, 1);
      if (how === 'resolve') f.jobs[0].resolve('x.db'); else f.jobs[0].reject(new Error('late'));
      await tick();
      const p = app.runBackup('during');
      await tick();
      assert.equal(f.calls.length, 2, 'a fresh backup started');
      f.jobs[1].resolve('y.db');
      assert.equal((await p).ok, true);
    } finally { done(); }
  });
}

const boot = async (dir, f, mt) => {
  const dbFile = join(dir, 'game.db');
  openDb(dbFile).close();
  return bootstrap({ dbFile, organizerPassword: 'pw', port: 0, now: () => 1_000_000, backupDir: join(dir, 'usb'),
    backup: f.backup, setTimer: mt.setTimer, clearTimer: mt.clearTimer });
};

test('stop() while a backup is stuck does not wait for it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bkk-'));
  try {
    const mt = manualTimers();
    const b = await boot(dir, hung(), mt);
    await timeOut(b.app, mt);
    const t0 = performance.now();
    await b.stop();
    assert.ok(performance.now() - t0 < 2500);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stop() during a not-yet-timed-out hung backup waits at most its 2 s cap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bkk-'));
  try {
    const mt = manualTimers();
    const b = await boot(dir, hung(), mt);
    b.app.runBackup('during');
    await tick();
    const t0 = performance.now();
    await b.stop();
    const dt = performance.now() - t0;
    assert.ok(dt < 3000, `stop took ${dt}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real db.backup into a non-writable directory rejects fast: ok:false, not stuck', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root ignores permissions');
  const { dir, app, done } = mk();
  const ro = join(dir, 'ro');
  try {
    mkdirSync(ro);
    chmodSync(ro, 0o500);
    app.ctx.backupDir = join(ro, 'usb');
    const t0 = performance.now();
    const st = await app.runBackup('during');
    assert.ok(performance.now() - t0 < 2000);
    assert.equal(st.ok, false);
    assert.doesNotMatch(st.error, /still running/);
    app.ctx.backupDir = join(dir, 'usb');
    assert.equal((await app.runBackup('during')).ok, true, 'not stuck: next one runs');
    assert.equal(readdirSync(join(dir, 'usb')).length, 1);
  } finally { try { chmodSync(ro, 0o700); } catch { /* ignore */ } done(); }
});
