import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

test('sqlite works in memory', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (x INTEGER)');
  db.prepare('INSERT INTO t VALUES (?)').run(7);
  assert.equal(db.prepare('SELECT x FROM t').get().x, 7);
});
