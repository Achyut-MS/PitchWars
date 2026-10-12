import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readdirSync, utimesSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDb, pruneBackups } from '../src/backup.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'bk-'));

test('a backup opens as a database with the same rows', async () => {
  const dir = tmp();
  try {
    const db = new Database(join(dir, 'live.db'));
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (x INTEGER)');
    db.prepare('INSERT INTO t VALUES (?)').run(42);
    const file = await backupDb(db, join(dir, 'usb'), 'during', 1_700_000_000_000);
    assert.match(file, /showdown-during-2023-11-14T22-13-20-000Z\.db$/);
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.prepare('SELECT x FROM t').get().x, 42);
    copy.close();
    db.prepare('INSERT INTO t VALUES (?)').run(43);
    const again = new Database(file, { readonly: true });
    assert.equal(again.prepare('SELECT COUNT(*) AS n FROM t').get().n, 1);
    again.close();
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('online backup of a WAL database that is being written is consistent', async () => {
  const dir = tmp();
  try {
    const db = new Database(join(dir, 'live.db'));
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (x INTEGER PRIMARY KEY, pad TEXT)');
    const ins = db.prepare('INSERT INTO t (pad) VALUES (?)');
    for (let i = 0; i < 5000; i++) ins.run('x'.repeat(200));
    let writing = true;
    let written = 0;
    const writer = (async () => {
      while (writing) { ins.run('y'.repeat(200)); written++; await new Promise((r) => setImmediate(r)); }
    })();
    const file = await backupDb(db, join(dir, 'usb'), 'during', 1_700_000_000_000);
    writing = false;
    await writer;
    assert.ok(written > 0, 'writes happened while the backup ran');
    const copy = new Database(file, { readonly: true });
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
    const n = copy.prepare('SELECT COUNT(*) AS n FROM t').get().n;
    const max = copy.prepare('SELECT MAX(x) AS m FROM t').get().m;
    assert.ok(n >= 5000 && n <= 5000 + written);
    assert.equal(n, max, 'rows are a gap-free prefix, so the copy is a consistent snapshot');
    copy.close();
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unwritable folder fails loudly instead of silently', async () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'a-file'), 'x');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    await assert.rejects(() => backupDb(db, join(dir, 'a-file', 'usb'), 'manual'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('file names come from a label whitelist and an integer time only', async () => {
  const dir = tmp();
  try {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    for (const bad of ['../evil', 'x', '', 'during/../../x', 'a b', undefined]) {
      await assert.rejects(() => backupDb(db, dir, bad, 1000), /label/);
    }
    for (const bad of ['1; DROP', 1.5, NaN, -1, '../../x', null]) {
      await assert.rejects(() => backupDb(db, dir, 'after', bad), /time/);
    }
    for (const ok of ['during', 'after', 'manual']) await backupDb(db, dir, ok, 1000);
    assert.equal(readdirSync(dir).length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pruning keeps the newest files only and never touches anything else', async () => {
  const dir = tmp();
  try {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (x INTEGER)');
    const base = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      const f = await backupDb(db, dir, 'during', base + i * 1000);
      utimesSync(f, new Date(base + i * 1000), new Date(base + i * 1000));
    }
    // foreign things, including older-looking ones and a folder that looks like a backup
    writeFileSync(join(dir, 'notes.txt'), 'keep');
    writeFileSync(join(dir, 'showdown-extra.db'), 'keep');
    writeFileSync(join(dir, 'other-during-2020.db'), 'keep');
    writeFileSync(join(dir, 'showdown-during-2023-11-14T22-13-20-000Z.db-wal'), 'keep');
    mkdirSync(join(dir, 'showdown-during-2001-01-01T00-00-00-000Z.db'));
    writeFileSync(join(dir, 'showdown-during-2001-01-01T00-00-00-000Z.db', 'inner.db'), 'keep');
    utimesSync(join(dir, 'notes.txt'), new Date(1000), new Date(1000));
    assert.equal(pruneBackups(dir, 2), 2);
    const left = readdirSync(dir).sort();
    const kept = left.filter((f) => /^showdown-during-2023-.*Z\.db$/.test(f));
    assert.deepEqual(kept, ['showdown-during-2023-11-14T22-13-23-000Z.db', 'showdown-during-2023-11-14T22-13-24-000Z.db']);
    for (const f of ['notes.txt', 'showdown-extra.db', 'other-during-2020.db', 'showdown-during-2023-11-14T22-13-20-000Z.db-wal']) assert.ok(existsSync(join(dir, f)), f);
    assert.ok(existsSync(join(dir, 'showdown-during-2001-01-01T00-00-00-000Z.db', 'inner.db')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
