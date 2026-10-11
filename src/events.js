export function logEvent(db, { ts, gameId = null, admissionId = null, type, payload = {} }) {
  db.prepare(
    'INSERT INTO events (ts, game_id, admission_id, type, payload) VALUES (?, ?, ?, ?, ?)'
  ).run(ts, gameId, admissionId, type, JSON.stringify(payload));
}
