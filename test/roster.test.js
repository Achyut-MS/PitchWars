import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { normId, addParticipant, importRoster } from '../src/roster.js';

test('normId trims and upper-cases', () => {
  assert.equal(normId('  a001 '), 'A001');
});

test('import adds new ids, skips duplicates, and ignores the header', () => {
  const db = openDb();
  const r = importRoster(db, 'admission_id,name\n a001 ,Asha\nA001,Asha Again\nB002,Ben');
  assert.deepEqual(r, { added: 2, skipped: 1 });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A001'").get().name, 'Asha');
});

test('uploading the same roster twice changes nothing', () => {
  const db = openDb();
  importRoster(db, 'A1,Asha\nB2,Ben');
  assert.deepEqual(importRoster(db, 'A1,Asha\nB2,Ben'), { added: 0, skipped: 2 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 2);
});

test('a late add for an existing id does not overwrite the name', () => {
  const db = openDb();
  addParticipant(db, 'A1', 'Asha');
  assert.equal(addParticipant(db, 'a1', 'Someone Else'), false);
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Asha');
});

test('a blank id or name is refused', () => {
  const db = openDb();
  assert.throws(() => addParticipant(db, '  ', 'Asha'));
  assert.throws(() => addParticipant(db, 'A1', ' '));
});

test('a name containing a comma is kept whole', () => {
  const db = openDb();
  importRoster(db, 'A1,Rao, Asha');
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Rao, Asha');
});
