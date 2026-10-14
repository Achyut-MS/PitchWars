import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { logEvent } from './events.js';
import { phaseAt, phaseWindow } from './phases.js';
import { activeGame } from './persist.js';
import { startGame } from './lobby.js';
import { ORDER } from './director.js';
import { DEFAULT_EXPORT_DIR } from './results.js';

const GAME_TABLES = [
  'company_state', 'votes', 'requests', 'owned', 'phase_done', 'attacks', 'notices', 'warnings_sent',
  'market_events', 'injections', 'shield_use', 'samples', 'hints', 'puzzle_sessions',
];

const dropImages = (ctx, ids) => {
  for (const id of ids) {
    if (Number.isSafeInteger(id)) rmSync(join(ctx.exportDir ?? DEFAULT_EXPORT_DIR, `game-${id}`), { recursive: true, force: true });
  }
};

// Restarts the phase the game is in (or the competition, once it has ended): the clock goes back to the
// start of that phase and everything the players did in it is undone. Earlier phases, seats and the
// players' connections are untouched.
export function resetStage(ctx, game) {
  const { db } = ctx;
  const now = ctx.now();
  const shown = phaseAt(game, now).phase;
  const target = shown === 'ended' ? 'competition' : shown;
  const idx = ORDER.indexOf(target);
  db.transaction(() => {
    // Ending ideation early moves time into the shop; undo that when ideation or earlier restarts.
    const g = idx <= 1 ? { ...game, ideationSavedSec: 0 } : game;
    const w = phaseWindow(g, target);
    const since = w.start;
    db.prepare('UPDATE games SET started_at = ?, ideation_saved_sec = ?, revealed_at = NULL, heartbeat_at = ? WHERE id = ?')
      .run(now - (w.start - game.startedAt), g.ideationSavedSec, now, game.id);
    for (const p of ORDER.slice(idx)) db.prepare('DELETE FROM phase_done WHERE game_id = ? AND phase = ?').run(game.id, p);
    const del = (table, where = '', ...args) => db.prepare(`DELETE FROM ${table} WHERE game_id = ?${where}`).run(game.id, ...args);
    del('notices', ' AND ts >= ?', since);
    del('hints', ' AND ts >= ?', since);
    del('warnings_sent', ' AND ts >= ?', since);
    if (idx <= 1) {
      del('votes');
      db.prepare('UPDATE company_state SET idea_id = NULL, picked_by = NULL, picked_at = NULL, pick_source = NULL WHERE game_id = ?').run(game.id);
    }
    if (idx <= 2) {
      del('requests');
      del('owned');
      db.prepare('UPDATE company_state SET wallet = 1000 WHERE game_id = ?').run(game.id);
    }
    if (idx === 4) {
      del('requests', ' AND requested_at >= ?', since);
      del('owned', ' AND bought_at >= ?', since);
      for (const t of ['attacks', 'samples', 'puzzle_sessions', 'market_events', 'injections', 'shield_use']) del(t);
      db.prepare(
        `UPDATE company_state SET frac = 0, last_tick_at = NULL, last_sample_at = NULL, mini_coins = 0, attack_coins = 0,
           cto_coins = 0, cmo_coins = 0, coo_coins = 0,
           wallet = 1000 - COALESCE((SELECT SUM(charged) FROM requests r WHERE r.game_id = company_state.game_id
             AND r.company = company_state.company AND r.status = 'approved'), 0)
         WHERE game_id = ?`
      ).run(game.id);
    }
    logEvent(db, { ts: now, gameId: game.id, type: 'stage_reset', payload: { phase: target } });
  }).immediate();
  dropImages(ctx, [game.id]);
  return { phase: target };
}

// Wipes every game back to square one. Players stay registered and connected; Game 1's teams are seated
// again, and if a game was running a fresh Game 1 starts at its briefing with the same problem.
export function resetAllGames(ctx) {
  const { db } = ctx;
  const now = ctx.now();
  const first = db.prepare('SELECT id, problem_id FROM games ORDER BY id LIMIT 1').get();
  if (!first) throw new Error('there is no game to reset');
  const running = activeGame(db);
  const ids = db.prepare('SELECT id FROM games').all().map((r) => r.id);
  const seats = running && running.id === first.id
    ? db.prepare("SELECT admission_id, company, role FROM participants WHERE game_id = ? AND status = 'in_game'").all(first.id)
    : db.prepare("SELECT admission_id, json_extract(payload, '$.company') AS company, json_extract(payload, '$.role') AS role FROM events WHERE game_id = ? AND type = 'game_start'").all(first.id);
  db.transaction(() => {
    for (const t of GAME_TABLES) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare('DELETE FROM events WHERE game_id IS NOT NULL').run();
    db.prepare('DELETE FROM games').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'games'").run();
    db.prepare("UPDATE participants SET status = 'lobby', game_id = NULL, company = NULL, role = NULL").run();
    const seat = db.prepare('UPDATE participants SET company = ?, role = ? WHERE admission_id = ?');
    for (const s of seats) seat.run(s.company, s.role, s.admission_id);
    if (running) startGame(db, first.problem_id, now);
    logEvent(db, { ts: now, type: 'all_games_reset', payload: { games: ids.length, restarted: !!running } });
  }).immediate();
  dropImages(ctx, ids);
  return { games: ids.length, restarted: !!running };
}
