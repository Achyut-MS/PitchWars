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
