// Returns { header, records: [{ line, cells }] }; line is the 1-based physical start line.
export function parseCsvRecords(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let quoteLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else { if (ch === '\n') line++; field += ch; }
    } else if (ch === '"') { quoted = true; quoteLine = line; }
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push({ line: rowLine, cells: row });
      row = []; line++; rowLine = line;
    } else field += ch;
  }
  if (quoted) throw new Error(`CSV: unterminated quote starting on line ${quoteLine}`);
  if (field !== '' || row.length) { row.push(field); rows.push({ line: rowLine, cells: row }); }
  const kept = rows.filter((r) => !(r.cells.length === 1 && r.cells[0] === ''));
  const [head, ...records] = kept;
  return { header: head ? head.cells : [], records };
}

export function parseCsv(text) {
  const { header, records } = parseCsvRecords(text);
  return records.map((r) => Object.fromEntries(header.map((h, i) => [h, r.cells[i] ?? ''])));
}
