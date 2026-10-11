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
  assert.deepEqual(r, { added: 2, skipped: 1, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A001'").get().name, 'Asha');
});

test('uploading the same roster twice changes nothing', () => {
  const db = openDb();
  importRoster(db, 'A1,Asha\nB2,Ben');
  assert.deepEqual(importRoster(db, 'A1,Asha\nB2,Ben'), { added: 0, skipped: 2, rejected: [] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 2);
});

test('a late add for an existing id does not overwrite the name', () => {
  const db = openDb();
  addParticipant(db, 'A1', 'Asha');
  assert.equal(addParticipant(db, 'a1', 'Someone Else'), false);
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Asha');
});

test('a blank id or name is refused by addParticipant', () => {
  const db = openDb();
  assert.throws(() => addParticipant(db, '  ', 'Asha'));
  assert.throws(() => addParticipant(db, 'A1', ' '));
});

test('a name containing a comma is kept whole', () => {
  const db = openDb();
  importRoster(db, 'A1,Rao, Asha');
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A1'").get().name, 'Rao, Asha');
});

test('a quoted name containing a comma is stored without quotes', () => {
  const db = openDb();
  assert.deepEqual(importRoster(db, 'A001,"Rao, Asha"'), { added: 1, skipped: 0, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A001'").get().name, 'Rao, Asha');
});

test('a quoted ID and quoted name are both unquoted', () => {
  const db = openDb();
  assert.deepEqual(importRoster(db, '"a002","Rao, Asha"'), { added: 1, skipped: 0, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A002'").get().name, 'Rao, Asha');
});

test('doubled quotes inside a quoted field become one quote', () => {
  const db = openDb();
  importRoster(db, 'A003,"Dee ""Dx"" Lee"');
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A003'").get().name, 'Dee "Dx" Lee');
});

test('a plain unquoted file still imports as before', () => {
  const db = openDb();
  assert.deepEqual(importRoster(db, 'A1,Asha\nB2,Ben\nC3,Cara'), { added: 3, skipped: 0, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='C3'").get().name, 'Cara');
});

test('a bad row in the middle is rejected with its line number and the rest still import', () => {
  const db = openDb();
  const r = importRoster(db, 'A1,Asha\n,Nobody\nB2,\nC3,Cara');
  assert.deepEqual(r, {
    added: 2,
    skipped: 0,
    rejected: [
      { line: 2, reason: 'blank admission id' },
      { line: 3, reason: 'blank name' },
    ],
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 2);
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='C3'").get().name, 'Cara');
});

test('a header written as ID,Name is dropped, and line numbers count it', () => {
  const db = openDb();
  assert.deepEqual(importRoster(db, 'ID,Name\nA1,Asha\n,Nobody'), {
    added: 1,
    skipped: 0,
    rejected: [{ line: 3, reason: 'blank admission id' }],
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE admission_id='ID'").get().n, 0);
});

test('tab-separated Excel paste imports and drops the header', () => {
  const db = openDb();
  const r = importRoster(db, 'Admission ID\tName\nA001\tAsha\nA002\tBen');
  assert.deepEqual(r, { added: 2, skipped: 0, rejected: [] });
});

test('semicolon-separated file imports', () => {
  const db = openDb();
  const r = importRoster(db, 'A001;Asha\nA002;"Ben; Jr"');
  assert.deepEqual(r, { added: 2, skipped: 0, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A002'").get().name, 'Ben; Jr');
});

test('Student ID,Full Name header is dropped', () => {
  const db = openDb();
  const r = importRoster(db, 'Student ID,Full Name\nA001,Asha');
  assert.deepEqual(r, { added: 1, skipped: 0, rejected: [] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 1);
});

test('quoted comma name still works and plain comma file is unchanged', () => {
  const db = openDb();
  const r = importRoster(db, 'A001,"Rao, Asha"\nA002,Ben');
  assert.deepEqual(r, { added: 2, skipped: 0, rejected: [] });
  assert.equal(db.prepare("SELECT name FROM participants WHERE admission_id='A001'").get().name, 'Rao, Asha');
});

test('non-string input to addParticipant throws and creates no row', () => {
  const db = openDb();
  for (const bad of [undefined, null, 5, {}, ['x']]) {
    assert.throws(() => addParticipant(db, bad, 'x'), /must be strings/);
    assert.throws(() => addParticipant(db, 'A1', bad), /must be strings/);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 0);
});

test('importRoster rejects non-string input', () => {
  const db = openDb();
  assert.throws(() => importRoster(db, undefined), /must be a string/);
  assert.throws(() => importRoster(db, 42), /must be a string/);
});
