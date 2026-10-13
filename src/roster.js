export const normId = (s) => String(s).trim().toUpperCase();

export function addParticipant(db, admissionId, name) {
  if (typeof admissionId !== 'string' || typeof name !== 'string') {
    throw new Error('admission id and name must be strings');
  }
  const id = normId(admissionId);
  const nm = String(name).trim();
  if (!id || !nm) throw new Error('admission id and name are required');
  const info = db
    .prepare('INSERT OR IGNORE INTO participants (admission_id, name) VALUES (?, ?)')
    .run(id, nm);
  return info.changes === 1;
}

// Splits one CSV line into raw fields. Commas inside double quotes stay in the
// field, and "" inside a quoted field becomes one quote. Records are one line each.
function parseCsvLine(line, delim = ',') {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"' && cur.trim() === '') {
      inQuotes = true;
      cur = '';
    } else if (c === delim) {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

const ID_HEADERS = ['id', 'student id', 'adm no', 's.no'];
const NAME_HEADERS = ['name', 'full name', 'student name'];
const isHeader = (fields) => {
  const a = fields[0].trim().toLowerCase();
  const b = (fields[1] ?? '').trim().toLowerCase();
  return a.startsWith('admission') || ID_HEADERS.includes(a) || NAME_HEADERS.includes(b);
};

function detectDelimiter(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
}

export function importRoster(db, text) {
  let added = 0;
  let skipped = 0;
  const rejected = [];
  let seenFirst = false;
  let delim = ',';
  if (typeof text !== 'string') throw new Error('roster must be a string');
  db.transaction(() => {
    text.split(/\r?\n/).forEach((raw, i) => {
      if (!raw.trim()) return;
      if (!seenFirst) delim = detectDelimiter(raw);
      const fields = parseCsvLine(raw, delim);
      if (!seenFirst) {
        seenFirst = true;
        if (isHeader(fields)) return;
      }
      const id = fields[0].trim();
      const name = fields.slice(1).join(delim).trim();
      if (!id) rejected.push({ line: i + 1, reason: 'blank admission id' });
      else if (!name) rejected.push({ line: i + 1, reason: 'blank name' });
      else if (addParticipant(db, id, name)) added++;
      else {
        const kept = db.prepare('SELECT name FROM participants WHERE admission_id = ?').get(normId(id)).name;
        if (kept === name) skipped++;
        else rejected.push({ line: i + 1, reason: `duplicate id, different name (kept "${kept}")` });
      }
    });
  })();
  return { added, skipped, rejected };
}
