import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/csv.js';
import { loadData } from '../src/data.js';

test('parseCsv handles quotes, commas inside quotes and doubled quotes', () => {
  const rows = parseCsv('a,b\n1,"x, y"\n2,"say ""hi"""\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y' }, { a: '2', b: 'say "hi"' }]);
});

test('parseCsv copes with Windows line endings and a missing final newline', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [{ a: '1', b: '2' }]);
});

const data = loadData('data');

test('there are 8 problem statements', () => {
  assert.equal(data.problems.length, 8);
  assert.equal(data.problems[0].title, 'Food waste');
});

test('every problem has 6 ideas: 3 hardware and 3 software, each with 3 risks, brands and taglines', () => {
  for (const p of data.problems) {
    const ideas = data.ideasFor(p.id);
    assert.equal(ideas.length, 6, `problem ${p.id}`);
    assert.equal(ideas.filter((i) => i.type === 'hardware').length, 3);
    assert.equal(ideas.filter((i) => i.type === 'software').length, 3);
    for (const i of ideas) {
      assert.equal(i.risks.length, 3);
      assert.equal(i.brands.length, 3);
      assert.equal(i.taglines.length, 3);
      assert.ok(i.description.length > 10);
    }
  }
});

test('the catalog has 50 items with tiers and families', () => {
  assert.equal(data.catalog.length, 50);
  const f01 = data.catalog.filter((i) => i.family === 'F01');
  assert.deepEqual(f01.map((i) => i.tierPoints), [1, 2, 3]);
  assert.equal(data.item('O06').cost, 150);
  assert.equal(data.item('HC01').tierPoints, null);
  assert.equal(data.item('O05-F').tierPoints, 2);
});

test('unknown ids are undefined, not an error', () => {
  assert.equal(data.item('NOPE'), undefined);
  assert.deepEqual(data.ideasFor(99), []);
});
