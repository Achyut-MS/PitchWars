import { logEvent } from './events.js';
import { phaseAt } from './phases.js';

export const EVENTS = {
  demand_surge: { name: 'Demand Surge', salesMult: 1.25, durationSec: 45 },
  demand_slump: { name: 'Demand Slump', salesMult: 0.75, durationSec: 45 },
  shop_sale: { name: 'Shop Sale', priceMult: 0.75, durationSec: 90 },
};

// Active window is [started_at, ends_at): the end time is exclusive.
export function activeEvent(db, gameId, t) {
  const e = db.prepare('SELECT * FROM market_events WHERE game_id=? AND started_at <= ? AND ? < ends_at').get(gameId, t, t);
  return e && EVENTS[e.key] ? { key: e.key, ...EVENTS[e.key] } : null;
}

export function saleMultiplier(db, gameId, t) {
  const e = activeEvent(db, gameId, t);
  return e && e.priceMult ? e.priceMult : 1;
}

// One event per game: market_events has game_id as PRIMARY KEY, and the insert,
// notices and log run in one immediate transaction so a double click or a second
// organizer tab cannot create or half-create a second one.
export function triggerMarketEvent(ctx, game, key) {
  const ev = Object.hasOwn(EVENTS, key) ? EVENTS[key] : null;
  if (!ev) throw new Error('unknown event');
  ctx.db.transaction(() => {
    const now = ctx.now();
    if (phaseAt(game, now).phase !== 'competition') throw new Error('events are only possible during the competition');
    const info = ctx.db
      .prepare('INSERT OR IGNORE INTO market_events (game_id, key, started_at, ends_at) VALUES (?, ?, ?, ?)')
      .run(game.id, key, now, now + ev.durationSec * 1000);
    if (info.changes === 0) throw new Error('an event was already used in this game');
    const notice = ctx.db.prepare('INSERT INTO notices (game_id, company, role, text, ts, until) VALUES (?, ?, NULL, ?, ?, ?)');
    for (const c of ['A', 'B']) notice.run(game.id, c, `Market news: ${ev.name}`, now, now + ev.durationSec * 1000);
    logEvent(ctx.db, { ts: now, gameId: game.id, type: 'market_event', payload: { key, name: ev.name, durationSec: ev.durationSec } });
  }).immediate();
}

export function injectCoins(ctx, game, company, coins) {
  if (!['A', 'B'].includes(company)) throw new Error('unknown company');
  if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 1 || coins > 500) {
    throw new Error('coins must be a whole number from 1 to 500');
  }
  ctx.db.transaction(() => {
    const now = ctx.now();
    const info = ctx.db.prepare('INSERT OR IGNORE INTO injections (game_id, company, coins, ts) VALUES (?, ?, ?, ?)').run(game.id, company, coins, now);
    if (info.changes === 0) throw new Error('coins were already injected in this game');
    ctx.db.prepare('UPDATE company_state SET wallet = wallet + ? WHERE game_id=? AND company=?').run(coins, game.id, company);
    // Only the funded company is told, with a market-style reason.
    ctx.db.prepare('INSERT INTO notices (game_id, company, role, text, ts, until) VALUES (?, ?, NULL, ?, ?, ?)')
      .run(game.id, company, 'Investor interest: bonus funding added to your wallet', now, now + 30_000);
    logEvent(ctx.db, { ts: now, gameId: game.id, type: 'coin_injection', payload: { company, coins } });
  }).immediate();
}
