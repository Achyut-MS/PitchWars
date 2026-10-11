import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';

export const ORDER = ['briefing', 'ideation', 'shop', 'summary', 'competition'];
export const HOOKS = {};

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
          hooks[phase](ctx, activeGame(ctx.db), rng);
          return true;
        }
        return false;
      }).immediate();
      if (fired) ran = true;
    } catch (e) {
      console.error(`director: ${phase} hook failed, will retry`, e);
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
