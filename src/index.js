import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './server.js';
import { activeGame, heartbeat, resumeActiveGame } from './persist.js';

const PLACEHOLDER_PASSWORD = 'change-me-before-the-event';

export function checkPassword(pw) {
  if (!pw || pw === PLACEHOLDER_PASSWORD) {
    return { ok: false, message: 'Set ORGANIZER_PASSWORD to a real secret (not empty, not the placeholder) before starting the server.' };
  }
  return { ok: true };
}

export async function bootstrap({ dbFile, organizerPassword, port, now = Date.now }) {
  if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });
  const db = openDb(dbFile);
  resumeActiveGame(db, now());
  const app = createApp({ db, organizerPassword, now });
  app.db = db;
  await new Promise((resolve) => app.server.listen(port, '0.0.0.0', resolve));

  const tick = setInterval(() => {
    try {
      app.tickAll();
    } catch (err) {
      console.error('tick failed:', err);
    }
  }, 1000);
  const beat = setInterval(() => {
    try {
      const g = activeGame(db);
      if (g) heartbeat(db, g.id, now());
    } catch (err) {
      console.error('heartbeat failed:', err);
    }
  }, 5000);

  return {
    app,
    async stop() {
      clearInterval(tick);
      clearInterval(beat);
      app.wss.close();
      await new Promise((r) => app.server.close(r));
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
  await bootstrap({ dbFile: process.env.DB_FILE || 'data/showdown.db', organizerPassword, port });
  console.log(`Showdown server listening on port ${port}`);
}
