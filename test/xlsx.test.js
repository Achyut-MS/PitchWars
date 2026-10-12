import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook, readWorkbook } from '../src/xlsx.js';

test('a workbook round-trips sheets, headers, numbers and text', async () => {
  const buf = await buildWorkbook([
    { name: 'Players', columns: ['game', 'admission_id', 'name'], rows: [[1, 'A001', 'Asha'], [1, 'A002', 'Ben, Jr.']] },
    { name: 'Samples', columns: ['ts', 'wallet'], rows: [[800000, 1000.5]] },
  ]);
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  const sheets = await readWorkbook(buf);
  assert.deepEqual(sheets.map((s) => s.name), ['Players', 'Samples']);
  assert.deepEqual(sheets[0].rows, [['game', 'admission_id', 'name'], [1, 'A001', 'Asha'], [1, 'A002', 'Ben, Jr.']]);
  assert.equal(sheets[1].rows[1][1], 1000.5);
});

test('long sheet names are cut to the 31 characters Excel allows, and empty sheets still exist', async () => {
  const buf = await buildWorkbook([{ name: 'A very long sheet name that goes past thirty one', columns: ['x'], rows: [] }]);
  const sheets = await readWorkbook(buf);
  assert.equal(sheets[0].name.length, 31);
  assert.deepEqual(sheets[0].rows, [['x']]);
});

test('a formula-looking text stays text', async () => {
  const buf = await buildWorkbook([{ name: 'T', columns: ['v'], rows: [['=1+1'], ['@cmd']] }]);
  const sheets = await readWorkbook(buf);
  assert.equal(typeof sheets[0].rows[1][0], 'string');
  assert.equal(sheets[0].rows[1][0], '=1+1');
});

test('hostile strings are stored as text cells, never as formulas or hyperlinks', async () => {
  const hostile = ['=HYPERLINK("http://evil","x")', "+cmd|' /C calc'!A0", '@SUM(1)', '-2+3', '\t=1+1', '\r=1+1'];
  const buf = await buildWorkbook([{ name: 'T', columns: ['v'], rows: hostile.map((h) => [h]) }]);
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(!/<f[ >]/.test(sheetXml), 'no formula elements');
  assert.ok(!sheetXml.includes('hyperlink'), 'no hyperlinks');
  assert.ok(!zip.file(/hyperlink|rels\/sheet1/i).some((f) => /hyperlink/i.test(f.name)));
  const sheets = await readWorkbook(buf);
  assert.deepEqual(sheets[0].rows.slice(1).map((r) => r[0]), hostile.map((h) => h.replace('\r', '\n'))); // XML turns a bare CR into LF; still text
  for (const r of sheets[0].rows.slice(1)) assert.equal(typeof r[0], 'string');
});

test('overlong text is cut to the Excel cell limit instead of corrupting the file', async () => {
  const buf = await buildWorkbook([{ name: 'T', columns: ['v'], rows: [['x'.repeat(40000)]] }]);
  assert.equal((await readWorkbook(buf))[0].rows[1][0].length, 32767);
});
