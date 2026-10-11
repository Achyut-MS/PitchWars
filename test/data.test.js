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

// --- robustness against hand-edited data files ---
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function withData(file, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'data-'));
  cpSync('data', dir, { recursive: true });
  writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf8')));
  return dir;
}
const lines = (t) => t.split(/\r?\n/);

test('the shipped data files load without error', () => {
  assert.doesNotThrow(() => loadData('data'));
});

test('parseCsv strips a leading UTF-8 BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\n1,2\n'), [{ a: '1', b: '2' }]);
});

test('parseCsv throws on an unterminated quote', () => {
  assert.throws(() => parseCsv('a,b\n1,"oops\n2,3\n'), /unterminated quote.*line 2/i);
});

test('a short row is rejected with file and line', () => {
  const dir = withData('shop_catalog.csv', (t) => { const l = lines(t); l[3] = 'F01-P,CTO'; return l.join('\n'); });
  assert.throws(() => loadData(dir), /shop_catalog\.csv.*line 4/);
});

test('a long row is rejected with file and line', () => {
  const dir = withData('idea_options.csv', (t) => { const l = lines(t); l[2] += ',extra'; return l.join('\n'); });
  assert.throws(() => loadData(dir), /idea_options\.csv.*line 3/);
});

test('a missing required column is rejected', () => {
  const dir = withData('shop_catalog.csv', (t) => t.replace('cost_coins', 'price'));
  assert.throws(() => loadData(dir), /shop_catalog\.csv.*cost_coins/);
});

test('blank or non-numeric cost is rejected', () => {
  for (const bad of ['', 'abc']) {
    const dir = withData('shop_catalog.csv', (t) => { const l = lines(t); const c = l[1].split(','); c[6] = bad; l[1] = c.join(','); return l.join('\n'); });
    assert.throws(() => loadData(dir), /shop_catalog\.csv.*line 2.*cost_coins/);
  }
});

test('duplicate shop item id and duplicate idea id are rejected', () => {
  const d1 = withData('shop_catalog.csv', (t) => { const l = lines(t); l[2] = l[2].replace('F01-S', 'F01-B'); return l.join('\n'); });
  assert.throws(() => loadData(d1), /shop_catalog\.csv.*line 3.*duplicate/i);
  const d2 = withData('idea_options.csv', (t) => { const l = lines(t); l[3] = l[3].replace(',H3,', ',H1,'); return l.join('\n'); });
  assert.throws(() => loadData(d2), /idea_options\.csv.*line 4.*duplicate/i);
});

test('an idea with a blank risk is rejected; a bad idea_id prefix is rejected', () => {
  const d1 = withData('idea_options.csv', (t) => { const l = lines(t); const c = l[1].split(','); c[6] = ''; l[1] = c.join(','); return l.join('\n'); });
  assert.throws(() => loadData(d1), /idea_options\.csv.*line 2.*risk_3/);
  const d2 = withData('idea_options.csv', (t) => { const l = lines(t); l[1] = l[1].replace(',H1,', ',X1,'); return l.join('\n'); });
  assert.throws(() => loadData(d2), /idea_options\.csv.*line 2.*idea_id/);
});

test('problems.json ids must be unique numbers', () => {
  const d1 = withData('problems.json', (t) => t.replace('"id": 2,', '"id": 1,'));
  assert.throws(() => loadData(d1), /problems\.json.*duplicate/i);
  const d2 = withData('problems.json', (t) => t.replace('"id": 2,', '"id": "two",'));
  assert.throws(() => loadData(d2), /problems\.json.*number/i);
});

test('ideasFor coerces its argument with Number()', () => {
  assert.equal(data.ideasFor('1').length, 6);
});
