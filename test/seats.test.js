import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { swapSeats, replacePlayer } from '../src/seats.js';

function running() {
  const db = openDb();
  for (let i = 0; i < 11; i++) addParticipant(db, `S${i}`, `Player ${i}`); // S10 waits in the lobby
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  const gameId = startGame(db, 1, 0);
  return { db, gameId, game: { startedAt: 0, ideationSavedSec: 0 } };
}
const seat = (db, id) => db.prepare('SELECT company, role, status FROM participants WHERE admission_id=?').get(id);

test('two players can swap seats during the briefing', () => {
  const { db, game, gameId } = running();
  swapSeats(db, game, gameId, 'S0', 'S6', 60_000); // A/CEO <-> B/CTO
  assert.deepEqual(seat(db, 'S0'), { company: 'B', role: 'CTO', status: 'in_game' });
  assert.deepEqual(seat(db, 'S6'), { company: 'A', role: 'CEO', status: 'in_game' });
});

test('swaps are refused once Ideation has started', () => {
  const { db, game, gameId } = running();
  assert.throws(() => swapSeats(db, game, gameId, 'S0', 'S1', 180_000), /locked after the briefing/);
  assert.deepEqual(seat(db, 'S0'), { company: 'A', role: 'CEO', status: 'in_game' });
});

test('a lobby participant can replace an in-game player during the briefing', () => {
  const { db, game, gameId } = running();
  replacePlayer(db, game, gameId, 'S2', 'S10', 10_000);
  assert.deepEqual(seat(db, 'S10'), { company: 'A', role: 'CFO', status: 'in_game' });
  assert.deepEqual(seat(db, 'S2'), { company: null, role: null, status: 'lobby' });
});

test('replacement is refused after the briefing and when the new player is not in the lobby', () => {
  const { db, game, gameId } = running();
  assert.throws(() => replacePlayer(db, game, gameId, 'S2', 'S10', 200_000), /locked after the briefing/);
  assert.throws(() => replacePlayer(db, game, gameId, 'S2', 'S3', 10_000), /not in the lobby/);
});

test('every seat change is logged', () => {
  const { db, game, gameId } = running();
  swapSeats(db, game, gameId, 'S0', 'S1', 10_000);
  replacePlayer(db, game, gameId, 'S2', 'S10', 20_000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE type IN ('seat_swap','seat_replace')").get().n, 2);
});
