import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { activeGame } from '../src/persist.js';
import { loadData } from '../src/data.js';

export const data = loadData('data');

export function makeRunning({ problemId = 1, startAt = 0 } = {}) {
  const db = openDb();
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
