import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { bootstrap } from '../src/index.js';

test('the 5-minute backup timer runs only while a game runs, retries after a failure, and stop() clears it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bkt-'));
  const dbFile = join(dir, 'game.db');
  try {
    const db1 = openDb(dbFile);
    for (let i = 0; i < 10; i++) addParticipant(db1, `S${i}`, `P${i}`);
    db1.close();
    const fns = new Map();
    const cleared = [];
    const timers = {
      setInterval: (fn, ms) => { const id = Symbol('t'); fns.set(id, { fn, ms }); return id; },
      clearInterval: (id) => { cleared.push(id); fns.delete(id); },
    };
    const usb = join(dir, 'usb');
    const boot = await bootstrap({ dbFile, organizerPassword: 'pw', port: 0, now: () => 1_000_000, backupDir: usb, timers });
    const backupFn = [...fns.values()].find((t) => t.ms === 5 * 60_000);
    assert.ok(backupFn, 'default period is 5 minutes');
    const tick = async () => { backupFn.fn(); await boot.app.backupIdle(); };
    try {
      await tick();
      assert.equal(boot.app.backupStatus, null, 'no game, no backup');
      // start a game, break the folder, then fix it: the next tick tries again
      let i = 0;
      for (const c of ['A', 'B']) for (const r of ROLES) assign(boot.app.db, `S${i++}`, c, r);
      startGame(boot.app.db, 1, 1_000_000);
      boot.app.ctx.backupDir = join(dir, 'game.db', 'nope');
      await tick();
      assert.equal(boot.app.backupStatus.ok, false);
      boot.app.ctx.backupDir = usb;
      await tick();
      assert.equal(boot.app.backupStatus.ok, true);
      assert.equal(readdirSync(usb).filter((f) => f.startsWith('showdown-during-')).length, 1);
    } finally {
      await boot.stop();
    }
    assert.equal(fns.size, 0, 'the backup timer was cleared');
    assert.equal(cleared.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
