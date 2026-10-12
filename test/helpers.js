import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { activeGame } from '../src/persist.js';
import { pickIdea } from '../src/ideation.js';
import { loadData } from '../src/data.js';

export const data = loadData('data');

export function makeRunning({ problemId = 1, startAt = 0, file = ':memory:' } = {}) {
  const db = openDb(file);
  for (let i = 0; i < 12; i++) addParticipant(db, `S${i}`, `Player ${i}`);
  const seat = { A: {}, B: {} };
  let i = 0;
  for (const c of ['A', 'B']) {
    for (const r of ROLES) {
      assign(db, `S${i}`, c, r);
      seat[c][r] = `S${i}`;
      i++;
    }
  }
  const clock = { t: startAt };
  const ctx = { db, data, now: () => clock.t };
  const gameId = startGame(db, problemId, startAt);
  return { db, ctx, clock, gameId, seat, game: () => activeGame(db) };
}

export const atSec = (h, seconds) => { h.clock.t = seconds * 1000; };

export function give(h, company, itemIds) {
  const stmt = h.db.prepare(
    `INSERT OR REPLACE INTO owned (game_id, company, family, item_id, choice, bought_at, charged)
     VALUES (?, ?, ?, ?, NULL, 0, ?)`
  );
  for (const id of itemIds) {
    const item = h.ctx.data.item(id);
    stmt.run(h.gameId, company, item.family, id, item.cost);
  }
}

export function toCompetition(h, ideaA = 'H1', ideaB = 'S1') {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, ideaA);
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, ideaB);
  atSec(h, 800);
  return h;
}
