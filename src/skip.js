import { phaseAt, phaseWindow } from './phases.js';
import { rowToGame } from './persist.js';

// Rehearsal/testing control: moves started_at earlier so the next phase begins at `now`.
// Never skips out of the Competition (use End game there). The game row is re-read
// inside one immediate transaction, so a racing end_game or second skip is seen.
export function skipToNextPhase(db, game, now) {
  if (!game) throw new Error('no game is running');
  return db.transaction(() => {
    const row = db.prepare('SELECT * FROM games WHERE id = ? AND ended_at IS NULL').get(game.id);
    if (!row) throw new Error('no game is running');
    const g = rowToGame(row);
    const { phase } = phaseAt(g, now);
    if (phase === 'ended') throw new Error('the game has already ended');
    if (phase === 'competition') throw new Error('cannot skip out of the competition; use End game');
    const next = { briefing: 'ideation', ideation: 'shop', shop: 'summary', summary: 'competition' }[phase];
    const shiftMs = phaseWindow(g, phase).end - now;
    db.prepare('UPDATE games SET started_at = ? WHERE id = ?').run(g.startedAt - shiftMs, g.id);
    return { from: phase, to: next };
  }).immediate();
}
