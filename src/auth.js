import { logEvent } from './events.js';
import { normId } from './roster.js';

const VIEW_BY_STATUS = { lobby: 'lobby', in_game: 'game', completed: 'graphs' };

export function participantLogin(db, admissionId, now = Date.now(), log = true) {
  const id = normId(admissionId);
  const p = db.prepare('SELECT * FROM participants WHERE admission_id = ?').get(id);
  if (!p) return { ok: false, error: 'unknown_id' };
  if (log) logEvent(db, { ts: now, gameId: p.game_id, admissionId: id, type: 'login' });
  return {
    ok: true,
    view: VIEW_BY_STATUS[p.status],
    participant: {
      admissionId: id,
      name: p.name,
      status: p.status,
      gameId: p.game_id,
      company: p.company,
      role: p.role,
    },
  };
}

export function organizerLogin(password, expected) {
  return typeof password === 'string' && password.length > 0 && password === expected;
}
