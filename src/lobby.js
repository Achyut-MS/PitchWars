import { logEvent } from './events.js';
import { normId } from './roster.js';

export const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
const COMPANIES = ['A', 'B'];

export function assign(db, admissionId, company, role) {
  if (!COMPANIES.includes(company)) throw new Error('company must be A or B');
  if (!ROLES.includes(role)) throw new Error('unknown role');
  const id = normId(admissionId);
  const p = db.prepare('SELECT status FROM participants WHERE admission_id = ?').get(id);
  if (!p) throw new Error('unknown participant');
  if (p.status !== 'lobby') throw new Error('participant is not in the lobby');
  const taken = db
    .prepare(
      "SELECT 1 FROM participants WHERE status='lobby' AND company=? AND role=? AND admission_id<>?"
    )
    .get(company, role, id);
  if (taken) throw new Error(`${company} already has a ${role}`);
  db.prepare('UPDATE participants SET company = ?, role = ? WHERE admission_id = ?').run(company, role, id);
}

export function unassign(db, admissionId) {
  const id = normId(admissionId);
  const p = db.prepare('SELECT status FROM participants WHERE admission_id = ?').get(id);
  if (!p) throw new Error('unknown participant');
  if (p.status !== 'lobby') throw new Error('participant is not in the lobby');
  db.transaction(() => {
    db.prepare('UPDATE participants SET company = NULL, role = NULL WHERE admission_id = ?').run(id);
    logEvent(db, { ts: Date.now(), admissionId: id, type: 'unassign' });
  })();
}

export function startGame(db, problemId, now) {
  if (db.prepare('SELECT 1 FROM games WHERE ended_at IS NULL').get()) {
    throw new Error('a game is already running');
  }
  const seated = db
    .prepare("SELECT admission_id, company, role FROM participants WHERE status='lobby' AND company IS NOT NULL AND role IS NOT NULL")
    .all();
  const full = COMPANIES.every((c) => ROLES.every((r) => seated.some((p) => p.company === c && p.role === r)));
  if (!full) throw new Error('both companies need all five roles before the game can start');

  return db.transaction(() => {
    const gameId = db
      .prepare('INSERT INTO games (problem_id, started_at, heartbeat_at) VALUES (?, ?, ?)')
      .run(problemId, now, now).lastInsertRowid;
    const setGame = db.prepare("UPDATE participants SET status='in_game', game_id=? WHERE admission_id=?");
    for (const p of seated) {
      setGame.run(gameId, p.admission_id);
      logEvent(db, { ts: now, gameId, admissionId: p.admission_id, type: 'game_start', payload: { company: p.company, role: p.role, problemId } });
    }
    return Number(gameId);
  })();
}

export function endGame(db, gameId, now) {
  db.transaction(() => {
    const game = db.prepare('SELECT ended_at FROM games WHERE id = ?').get(gameId);
    if (!game) throw new Error('unknown game');
    if (game.ended_at !== null) throw new Error('game already ended');
    const players = db.prepare("SELECT admission_id FROM participants WHERE game_id = ? AND status='in_game'").all(gameId);
    db.prepare("UPDATE participants SET status='completed' WHERE game_id = ? AND status='in_game'").run(gameId);
    db.prepare('UPDATE games SET ended_at = ? WHERE id = ?').run(now, gameId);
    for (const p of players) logEvent(db, { ts: now, gameId, admissionId: p.admission_id, type: 'game_end' });
  })();
}
