import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec, toCompetition } from './helpers.js';
import { resetStage, resetAllGames } from '../src/reset.js';
import { phaseAt } from '../src/phases.js';
import { pickIdea, castVote } from '../src/ideation.js';
import { tickEconomy } from '../src/economy.js';
import { endGame } from '../src/lobby.js';

const phase = (h) => phaseAt(h.game(), h.clock.t);
const ctx = (h) => ({ ...h.ctx, exportDir: '/tmp/pw-reset-test-none' });
const wallet = (h, c) => h.db.prepare('SELECT wallet FROM company_state WHERE game_id=? AND company=?').get(h.gameId, c).wallet;

test('stage reset in ideation restarts its clock and clears votes and picks', () => {
  const h = makeRunning();
  atSec(h, 250);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  resetStage(ctx(h), h.game());
  assert.equal(phase(h).phase, 'ideation');
  assert.equal(phase(h).remainingSec, 180);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM votes').get().n, 0);
  assert.equal(h.db.prepare('SELECT idea_id FROM company_state WHERE company=?').get('A').idea_id, null);
});

test('stage reset in the competition keeps the shop spending and clears competition coins', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("INSERT INTO requests (game_id, company, item_id, family, requested_by, status, phase, price, charged, requested_at) VALUES (?, 'A', 'x', 'f', 'S0', 'approved', 'shop', 100, 100, 100000)").run(h.gameId);
  atSec(h, 900);
  tickEconomy(h.ctx, h.game());
  h.db.prepare('UPDATE company_state SET wallet = 5000, cto_coins = 9 WHERE game_id=?').run(h.gameId);
  resetStage(ctx(h), h.game());
  assert.equal(phase(h).phase, 'competition');
  assert.equal(phase(h).remainingSec, 960);
  assert.equal(wallet(h, 'A'), 900);
  assert.equal(wallet(h, 'B'), 1000);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM samples').get().n, 0);
  assert.equal(h.db.prepare('SELECT cto_coins FROM company_state WHERE company=?').get('A').cto_coins, 0);
});

test('stage reset after the game ended restarts the competition and un-reveals it', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 5000);
  h.db.prepare('UPDATE games SET revealed_at = 1 WHERE id=?').run(h.gameId);
  assert.equal(phase(h).phase, 'ended');
  resetStage(ctx(h), h.game());
  assert.equal(phase(h).phase, 'competition');
  assert.equal(h.db.prepare('SELECT revealed_at FROM games').get().revealed_at, null);
});

test('whole reset returns to Game 1 briefing, keeping every player and seat', () => {
  const h = toCompetition(makeRunning());
  atSec(h, 5000);
  const seatsBefore = h.db.prepare('SELECT admission_id, company, role FROM participants ORDER BY admission_id').all();
  const r = resetAllGames(ctx(h));
  assert.deepEqual(r, { games: 1, restarted: true });
  const g = h.game();
  assert.equal(g.id, 1);
  h.clock.t = 5000;
  assert.equal(phaseAt(g, 5000).phase, 'briefing');
  assert.deepEqual(h.db.prepare('SELECT admission_id, company, role FROM participants ORDER BY admission_id').all(), seatsBefore);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM participants WHERE status='in_game'").get().n, 10);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM samples').get().n, 0);
});

test('whole reset between games goes to the lobby with Game 1 teams seated', () => {
  const h = makeRunning();
  atSec(h, 5000);
  endGame(h.db, h.gameId, 5000);
  const r = resetAllGames(ctx(h));
  assert.deepEqual(r, { games: 1, restarted: false });
  assert.equal(h.game(), null);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM participants WHERE status='lobby' AND company IS NOT NULL").get().n, 10);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM games').get().n, 0);
});

test('whole reset with no games is refused', () => {
  const h = makeRunning();
  h.db.prepare('DELETE FROM games').run();
  assert.throws(() => resetAllGames(ctx(h)), /no game/);
});
