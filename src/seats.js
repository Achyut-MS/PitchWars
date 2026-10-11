import { logEvent } from './events.js';
import { normId } from './roster.js';
import { phaseAt } from './phases.js';

function requireBriefing(game, now) {
  if (phaseAt(game, now).phase !== 'briefing') throw new Error('seats are locked after the briefing');
}

function inGamePlayer(db, gameId, id) {
  const p = db.prepare("SELECT * FROM participants WHERE admission_id=? AND game_id=? AND status='in_game'").get(id, gameId);
  if (!p) throw new Error(`${id} is not in this game`);
  return p;
}

export function swapSeats(db, game, gameId, idA, idB, now) {
  requireBriefing(game, now);
  const a = inGamePlayer(db, gameId, normId(idA));
  const b = inGamePlayer(db, gameId, normId(idB));
  db.transaction(() => {
    const set = db.prepare('UPDATE participants SET company=?, role=? WHERE admission_id=?');
    set.run(b.company, b.role, a.admission_id);
    set.run(a.company, a.role, b.admission_id);
    logEvent(db, { ts: now, gameId, admissionId: a.admission_id, type: 'seat_swap',
      payload: { with: b.admission_id, from: [a.company, a.role], to: [b.company, b.role] } });
  })();
}

export function replacePlayer(db, game, gameId, outId, inId, now) {
  requireBriefing(game, now);
  const out = inGamePlayer(db, gameId, normId(outId));
  const incoming = db.prepare('SELECT * FROM participants WHERE admission_id=?').get(normId(inId));
  if (!incoming) throw new Error('unknown participant');
  if (incoming.status !== 'lobby') throw new Error('the new player is not in the lobby');
  db.transaction(() => {
    db.prepare("UPDATE participants SET status='in_game', game_id=?, company=?, role=? WHERE admission_id=?")
      .run(gameId, out.company, out.role, incoming.admission_id);
    db.prepare("UPDATE participants SET status='lobby', game_id=NULL, company=NULL, role=NULL WHERE admission_id=?")
      .run(out.admission_id);
    logEvent(db, { ts: now, gameId, admissionId: incoming.admission_id, type: 'seat_replace',
      payload: { replaced: out.admission_id, company: out.company, role: out.role } });
  })();
}
