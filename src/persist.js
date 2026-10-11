export const rowToGame = (g) => ({
  id: g.id,
  problemId: g.problem_id,
  startedAt: g.started_at,
  ideationSavedSec: g.ideation_saved_sec,
});

export function activeGame(db) {
  const g = db.prepare('SELECT * FROM games WHERE ended_at IS NULL').get();
  return g ? rowToGame(g) : null;
}

export function heartbeat(db, gameId, now) {
  db.prepare('UPDATE games SET heartbeat_at = ? WHERE id = ?').run(now, gameId);
}

export function resumeActiveGame(db, now) {
  const g = db.prepare('SELECT * FROM games WHERE ended_at IS NULL').get();
  if (!g) return null;
  const elapsed = Math.max(0, (g.heartbeat_at ?? g.started_at) - g.started_at);
  const startedAt = now - elapsed;
  db.prepare('UPDATE games SET started_at = ?, heartbeat_at = ? WHERE id = ?').run(startedAt, now, g.id);
  return rowToGame({ ...g, started_at: startedAt });
}
