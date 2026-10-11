import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';

export const ORDER = ['briefing', 'ideation', 'shop', 'summary', 'competition'];
export const HOOKS = {};

// Fires each ended phase's hook once per game. The phase_done insert is the
// gate (primary key game_id+phase), so repeat ticks and restarts are no-ops.
export function runDirector(ctx, hooks = HOOKS, rng = Math.random) {
  const game = activeGame(ctx.db);
  if (!game) return false;
  const current = phaseAt(game, ctx.now()).phase;
  const upTo = current === 'ended' ? ORDER.length : ORDER.indexOf(current);
  let ran = false;
  for (let i = 0; i < upTo; i++) {
    const phase = ORDER[i];
    const fresh = ctx.db
      .prepare('INSERT OR IGNORE INTO phase_done (game_id, phase) VALUES (?, ?)')
      .run(game.id, phase).changes === 1;
    if (fresh && hooks[phase]) {
      hooks[phase](ctx, activeGame(ctx.db), rng);
      ran = true;
    }
  }
  return ran;
}

import { resolveIdeation } from './ideation.js';
HOOKS.ideation = resolveIdeation;
