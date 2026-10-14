export const rowToGame = (g) => ({
  id: g.id,
  problemId: g.problem_id,
  startedAt: g.started_at,
  ideationSavedSec: g.ideation_saved_sec,
  paused: !!g.paused,
  pausedMs: g.paused_ms || 0,
});

// Saves the pause state of the game so a restart comes back paused.
export function setPaused(db, gameId, paused, pausedMs) {
  db.prepare('UPDATE games SET paused = ?, paused_ms = ? WHERE id = ?').run(paused ? 1 : 0, pausedMs, gameId);
}

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
  clock.restore(g.heartbeat_at ?? g.started_at, g.paused_ms || 0, !!g.paused);
  return rowToGame(g);
}
