import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createClock } from './clock.js';
import { createApp } from './server.js';
import { activeGame, heartbeat, resumeActiveGame } from './persist.js';

const PLACEHOLDER_PASSWORD = 'change-me-before-the-event';

export function checkPassword(pw) {
  if (!pw || pw === PLACEHOLDER_PASSWORD) {
    return { ok: false, message: 'Set ORGANIZER_PASSWORD to a real secret (not empty, not the placeholder) before starting the server.' };
  }
  if (pw.length < 8) return { ok: false, message: 'ORGANIZER_PASSWORD must be at least 8 characters.' };
  return { ok: true };
}

export async function bootstrap({
  dbFile, organizerPassword, port, now = Date.now, real = now,
  backupDir = 'backups', backupEveryMs = 5 * 60_000, timers = { setInterval, clearInterval },
}) {
  if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  const clock = createClock({ real });
  resumeActiveGame(db, clock);
  const app = createApp({ db, organizerPassword, now: clock.now, backupDir });
  app.db = db;
  await new Promise((resolve) => app.server.listen(port, '0.0.0.0', resolve));

  const tick = setInterval(() => {
    try {
      app.tickAll();
    } catch (err) {
      console.error('tick failed:', err);
    }
  }, 1000);
  const ping = setInterval(() => {
    try {
      app.pingAll();
    } catch (err) {
      console.error('ping failed:', err);
    }
  }, 30_000);
  const beat = setInterval(() => {
    try {
      const g = activeGame(db);
      if (g) heartbeat(db, g.id, clock.now());
    } catch (err) {
      console.error('heartbeat failed:', err);
    }
  }, 5000);

  // Every 5 minutes while a game runs (and only then); a failure is stored for the organizer and the next tick retries.
  const backupTimer = timers.setInterval(() => {
    try {
      if (activeGame(db)) app.runBackup('during').catch(() => {});
    } catch (err) {
      console.error('backup tick failed:', err);
    }
  }, backupEveryMs);

  return {
    app,
    clock,
    async stop() {
      clearInterval(tick);
      clearInterval(beat);
      clearInterval(ping);
      timers.clearInterval(backupTimer);
      app.wss.close();
      await new Promise((r) => app.server.close(r));
      // let a running backup finish (but never wait on a hung one) before the database closes
      await Promise.race([app.backupIdle(), new Promise((r) => setTimeout(r, 2000).unref())]);
      db.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const organizerPassword = process.env.ORGANIZER_PASSWORD;
  const check = checkPassword(organizerPassword);
  if (!check.ok) {
    console.error(check.message);
    process.exit(1);
  }
  const port = Number(process.env.PORT || 80);
  await bootstrap({
    dbFile: process.env.DB_FILE || 'data/showdown.db', organizerPassword, port,
    backupDir: process.env.BACKUP_DIR || 'backups',
    backupEveryMs: Number(process.env.BACKUP_EVERY_MS) || 5 * 60_000,
  });
  console.log(`Showdown server listening on port ${port}`);
}
