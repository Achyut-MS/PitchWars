import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { logEvent } from './events.js';

export const ORDER = ['briefing', 'ideation', 'shop', 'summary', 'competition'];
export const HOOKS = {};
export const STUCK_AFTER = 3;
const failures = new WeakMap(); // db -> Map('gameId:phase' -> consecutive failures)

// Phases whose hook keeps failing: a director_stuck event and no phase_done.
export const stuckPhases = (db, gameId) =>
  db.prepare("SELECT DISTINCT json_extract(payload, '$.phase') AS phase FROM events WHERE game_id=? AND type='director_stuck'").all(gameId)
    .map((r) => r.phase)
    .filter((p) => !db.prepare('SELECT 1 FROM phase_done WHERE game_id=? AND phase=?').get(gameId, p));

function noteFailure(ctx, game, phase, e) {
  if (!failures.has(ctx.db)) failures.set(ctx.db, new Map());
  const m = failures.get(ctx.db);
  const key = `${game.id}:${phase}`;
  const n = (m.get(key) ?? 0) + 1;
  m.set(key, n);
  if (n >= STUCK_AFTER && !stuckPhases(ctx.db, game.id).includes(phase)) {
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'director_stuck', payload: { phase, error: String(e?.message ?? e) } });
  }
}

// Fires each ended phase's hook once per game. The phase_done mark and the hook
// run in ONE transaction: a repeat tick or restart finds the mark and skips; a
// hook that throws rolls the mark and its writes back and is retried next tick.
// Hooks must therefore be idempotent.
export function runDirector(ctx, hooks = HOOKS, rng = Math.random) {
  const game = activeGame(ctx.db);
  if (!game) return false;
  const current = phaseAt(game, ctx.now()).phase;
  const upTo = current === 'ended' ? ORDER.length : ORDER.indexOf(current);
  let ran = false;
  for (let i = 0; i < upTo; i++) {
    const phase = ORDER[i];
    try {
      const fired = ctx.db.transaction(() => {
        const fresh = ctx.db
          .prepare('INSERT OR IGNORE INTO phase_done (game_id, phase) VALUES (?, ?)')
          .run(game.id, phase).changes === 1;
        if (fresh && hooks[phase]) {
          hooks[phase](ctx, activeGame(ctx.db), rng, phase);
          return true;
        }
        return false;
      }).immediate();
      failures.get(ctx.db)?.delete(`${game.id}:${phase}`);
      if (fired) ran = true;
    } catch (e) {
      console.error(`director: ${phase} hook failed, will retry`, e);
      noteFailure(ctx, game, phase, e);
      break; // keep phase order: later phases wait for this one
    }
  }
  return ran;
}

import { resolveIdeation } from './ideation.js';
HOOKS.ideation = resolveIdeation;
import { autoRejectAll } from './shop.js';
HOOKS.shop = autoRejectAll;
HOOKS.competition = autoRejectAll;
