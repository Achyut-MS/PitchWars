import { phaseAt, phaseWindow } from './phases.js';
import { logEvent } from './events.js';

export const SHOP_CLOSES_AT_SEC = 30;

export function warningFor(clock) {
  if (clock.phase !== 'competition') return null;
  const s = clock.remainingSec;
  if (s <= 10) return 'last10';
  if (s <= 30) return '30s';
  if (s <= 120) return '2min';
  if (s <= 300) return '5min';
  return null;
}

// New requests are possible in the Shop phase and until 30 seconds are left.
export function shopOpenAt(game, t) {
  const p = phaseAt(game, t);
  return p.phase === 'shop' || (p.phase === 'competition' && p.remainingSec > SHOP_CLOSES_AT_SEC);
}

// Decisions on requests already sent (CEO, CFO) continue until 0:00 (guide, Section 2.0.2).
export const decisionsOpenAt = (game, t) => {
  const { phase } = phaseAt(game, t);
  return phase === 'shop' || phase === 'competition';
};

const NEXT_AT_SEC = { '5min': 120, '2min': 30, '30s': 10, last10: 0 };
export const WARNING_TEXTS = new Set();
const TEXT = {
  '5min': '5 minutes left.',
  '2min': '2 minutes left.',
  '30s': '30 seconds left. The shop is now closed for new requests.',
  last10: 'Last 10 seconds!',
};
for (const v of Object.values(TEXT)) WARNING_TEXTS.add(v);

// Keeps only the newest countdown warning among the notices (others pass through).
export function newestWarningOnly(notices) {
  const last = notices.map((n) => WARNING_TEXTS.has(n.text)).lastIndexOf(true);
  return notices.filter((n, i) => !WARNING_TEXTS.has(n.text) || i === last);
}

// Stores the CURRENT warning once per game (unique key, same transaction as the
// notices). A server that missed earlier marks never replays them: only the
// warning for the current remaining time can fire.
export function fireWarnings(ctx, game) {
  const t = ctx.now();
  const clock = phaseAt(game, t);
  const w = warningFor(clock);
  if (!w) return false;
  const end = phaseWindow(game, 'competition').end;
  // Visible only until the next warning would fire (or the end).
  const until = end - NEXT_AT_SEC[w] * 1000;
  return ctx.db.transaction(() => {
    const info = ctx.db.prepare('INSERT OR IGNORE INTO warnings_sent (game_id, warning, ts) VALUES (?, ?, ?)').run(game.id, w, t);
    if (!info.changes) return false;
    const ins = ctx.db.prepare('INSERT INTO notices (game_id, company, role, text, ts, until) VALUES (?, ?, NULL, ?, ?, ?)');
    for (const company of ['A', 'B']) ins.run(game.id, company, TEXT[w], t, until);
    logEvent(ctx.db, { ts: t, gameId: game.id, type: 'countdown_warning', payload: { warning: w } });
    return true;
  }).immediate();
}
