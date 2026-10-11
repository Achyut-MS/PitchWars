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

// Server time continues from the last heartbeat; downtime is ignored.
export function resumeActiveGame(db, clock) {
  const g = db.prepare('SELECT * FROM games WHERE ended_at IS NULL').get();
  if (!g) return null;
  const real = clock.now() - clock.offset();
  clock.setOffset((g.heartbeat_at ?? g.started_at) - real);
  return rowToGame(g);
}
