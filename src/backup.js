import { readdirSync, lstatSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const LABELS = ['during', 'after', 'manual'];
// Only files we created ourselves are ever pruned: showdown-<label>-<iso time with - separators>.db
const NAME = /^showdown-(during|after|manual)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/;

const stamp = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');

// Copies the live database into dir as showdown-<label>-<time>.db using SQLite's own online backup
// (consistent even while the WAL-mode database is being written). `dir` comes from the BACKUP_DIR
// environment variable only; the file name is built from a label whitelist and an integer time.
export async function backupDb(db, dir, label, now = Date.now()) {
  if (!LABELS.includes(label)) throw new Error('backup label must be one of: ' + LABELS.join(', '));
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('backup time must be a non-negative integer');
  if (typeof dir !== 'string' || !dir) throw new Error('backup folder is not set');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `showdown-${label}-${stamp(now)}.db`);
  await db.backup(file);
  return file;
}

// Keeps the newest `keep` backup files (by modified time) so a USB stick does not fill up.
// Touches only regular files directly inside dir whose names match our own pattern.
export function pruneBackups(dir, keep = 50) {
  const files = [];
  for (const f of readdirSync(dir)) {
    if (!NAME.test(f)) continue;
    const st = lstatSync(join(dir, f));
    if (st.isFile()) files.push({ f, t: st.mtimeMs });
  }
  files.sort((a, b) => b.t - a.t || (a.f < b.f ? 1 : -1));
  for (const { f } of files.slice(keep)) rmSync(join(dir, f));
  return files.slice(0, keep).length;
}
