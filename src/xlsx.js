import ExcelJS from 'exceljs';

const MAX_CELL = 32767; // Excel's per-cell text limit

// Every string is stored as a plain string cell (never a formula object), so text such as
// =HYPERLINK(...), +cmd|..., @SUM(1) or a leading tab/CR opens as inert text in Excel.
function safe(v) {
  if (v === undefined) return null;
  if (typeof v === 'string') return v.length > MAX_CELL ? v.slice(0, MAX_CELL) : v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v !== null && typeof v === 'object') return String(JSON.stringify(v)).slice(0, MAX_CELL);
  return v;
}

// sheets: [{ name, columns: ['a', 'b'], rows: [[1, 2], ...] }]
export async function buildWorkbook(sheets, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Startup Showdown';
  wb.created = new Date(meta.createdAt ?? 0);
  wb.modified = wb.created;
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.columns = s.columns.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(40, c.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of s.rows) ws.addRow(r.map(safe));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function readWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: ws.getSheetValues().slice(1).map((r) => r.slice(1)) }));
}
