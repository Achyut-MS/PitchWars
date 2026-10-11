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

export function importRoster(db, text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /^admission/i.test(l)));
  let added = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const line of lines) {
      const [id, ...rest] = line.split(',');
      if (addParticipant(db, id, rest.join(','))) added++;
      else skipped++;
    }
  })();
  return { added, skipped };
}
