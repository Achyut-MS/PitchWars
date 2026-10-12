import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { organizerView, viewFor } from '../src/views.js';
import { makeRunning, data } from './helpers.js';

const mk = (extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'bks-'));
  const h = makeRunning();
  const app = createApp({ db: h.db, organizerPassword: 'pw', now: () => h.clock.t, data, staticRoot: null, exportDir: join(dir, 'ex'), backupDir: join(dir, 'usb'), ...extra });
  return { dir, h, app, done: () => { rmSync(dir, { recursive: true, force: true }); } };
};

test('runBackup stores an ok status with the file, and the organizer (only) sees it', async () => {
  const { dir, h, app, done } = mk();
  try {
    h.clock.t = 5000;
    assert.equal(organizerView(app.ctx).backup, null);
    const st = await app.runBackup('after');
    assert.equal(st.ok, true);
    assert.equal(app.backupStatus.ok, true);
    assert.equal(app.backupStatus.at, 5000);
    assert.equal(readdirSync(join(dir, 'usb')).length, 1);
    assert.match(app.backupStatus.file, /showdown-after-/);
    assert.deepEqual(organizerView(app.ctx).backup, app.backupStatus);
    // never in a player view
    assert.ok(!JSON.stringify(viewFor(app.ctx, 'S0')).includes('backup'));
    assert.ok(!JSON.stringify(viewFor(app.ctx, 'S11')).includes('backup'));
  } finally { done(); }
});

test('a failing backup resolves, stores the error, logs an event, and the next try can succeed', async () => {
  const { dir, h, app, done } = mk();
  try {
    writeFileSync(join(dir, 'blocker'), 'x');
    app.ctx.backupDir = join(dir, 'blocker', 'usb');
    const st = await app.runBackup('during');
    assert.equal(st.ok, false);
    assert.ok(st.error);
    assert.equal(organizerView(app.ctx).backup.ok, false);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='backup_failed'").get().n, 1);
    assert.ok(!JSON.stringify(viewFor(app.ctx, 'S0')).includes(dir));
    app.ctx.backupDir = join(dir, 'usb');
    assert.equal((await app.runBackup('during')).ok, true);
  } finally { done(); }
});

test('a hanging folder (like /proc) times out quickly and does not block the event loop', async () => {
  // /proc/x/y really hangs mkdir; the test uses a never-settling backup so the test process can still exit.
  const { app, done } = mk({ backup: () => new Promise(() => {}), backupTimeoutMs: 200, setTimer: (fn, ms) => setTimeout(fn, ms) });
  try {
    let ticks = 0;
    const iv = setInterval(() => ticks++, 20);
    const t0 = performance.now();
    const st = await app.runBackup('during');
    clearInterval(iv);
    assert.equal(st.ok, false);
    assert.match(st.error, /timed out/);
    assert.ok(performance.now() - t0 < 2000);
    assert.ok(ticks >= 3, 'event loop kept running');
  } finally { done(); }
});

test('never two backups at once', async () => {
  const { dir, app, done } = mk();
  try {
    const a = app.runBackup('during');
    const b = app.runBackup('during');
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(readdirSync(join(dir, 'usb')).length, 1);
    assert.equal(ra.file, rb.file);
    // and a later call works again
    assert.equal((await app.runBackup('manual')).ok, true);
    assert.equal(readdirSync(join(dir, 'usb')).length, 2);
  } finally { done(); }
});

test('a backup that throws synchronously inside never escapes', async () => {
  const { app, done } = mk({ backup: () => { throw new Error('boom'); } });
  try {
    const st = await app.runBackup('during');
    assert.equal(st.ok, false);
    assert.match(st.error, /boom/);
  } finally { done(); }
});

test('next_game starts an after-backup without waiting for it and without failing the action', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  const { h, app, done } = mk({ backup: async (db, dir, label) => { calls.push(label); await gate; return join(dir, 'f.db'); } });
  try {
    h.clock.t = 10_000_000;
    // end the game so Next Game is legal, then run the organizer action the way the server does
    const ws = { readyState: 1, sent: [], send(t) { this.sent.push(JSON.parse(t)); }, on() {}, once() {}, ping() {}, terminate() {} };
    const { runAction } = app;
    assert.equal(typeof runAction, 'function');
    const t0 = performance.now();
    runAction('next_game', {});
    assert.ok(performance.now() - t0 < 500);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(calls, ['after']);
    release();
    await app.backupIdle();
    assert.equal(app.backupStatus.ok, true);
    void ws;
  } finally { done(); }
});

test('next_game still succeeds when the after-backup fails', async () => {
  const { h, app, done } = mk({ backup: async () => { throw new Error('usb gone'); } });
  try {
    h.clock.t = 10_000_000;
    app.runAction('next_game', {});
    await app.backupIdle();
    assert.equal(app.backupStatus.ok, false);
    assert.match(app.backupStatus.error, /usb gone/);
  } finally { done(); }
});
