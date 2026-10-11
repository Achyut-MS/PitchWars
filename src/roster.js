export const normId = (s) => String(s).trim().toUpperCase();

export function addParticipant(db, admissionId, name) {
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
function parseCsvLine(line) {
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
    } else if (c === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

const isHeader = (fields) =>
  /^admission/i.test(fields[0].trim()) || (fields[1] ?? '').trim().toLowerCase() === 'name';

export function importRoster(db, text) {
  let added = 0;
  let skipped = 0;
  const rejected = [];
  let seenFirst = false;
  db.transaction(() => {
    text.split(/\r?\n/).forEach((raw, i) => {
      if (!raw.trim()) return;
      const fields = parseCsvLine(raw);
      if (!seenFirst) {
        seenFirst = true;
        if (isHeader(fields)) return;
      }
      const id = fields[0].trim();
      const name = fields.slice(1).join(',').trim();
      if (!id) rejected.push({ line: i + 1, reason: 'blank admission id' });
      else if (!name) rejected.push({ line: i + 1, reason: 'blank name' });
      else if (addParticipant(db, id, name)) added++;
      else skipped++;
    });
  })();
  return { added, skipped, rejected };
}
