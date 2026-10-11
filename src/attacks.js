export const ATTACKS = [
  { key: 'price_squeeze', name: 'Price Squeeze', cost: 300, kind: 'mult', value: 0.75, cover: 'Customer demand has softened' },
  { key: 'market_crash', name: 'Market Crash', cost: 450, kind: 'mult', value: 0.5, cover: 'Stock market prices have fallen' },
  { key: 'ad_blackout', name: 'Ad Blackout', cost: 350, kind: 'ad_off', cover: 'Ad platform outage' },
  { key: 'feature_recall', name: 'Feature Recall', cost: 450, kind: 'recall', cover: 'A component supplier issued a recall' },
  { key: 'safety_audit', name: 'Safety Audit', cost: 400, kind: 'risk_off', cover: 'A regulator is reviewing the industry' },
  { key: 'minigame_jam', name: 'Mini-Game Jam', cost: 300, kind: 'minigame_half', cover: 'Network congestion is slowing the system' },
  { key: 'supplier_delay', name: 'Supplier Delay', cost: 350, kind: 'cto_lock', cover: 'Supplier systems are down for maintenance' },
  { key: 'bank_freeze', name: 'Bank Freeze', cost: 350, kind: 'cfo_lock', cover: 'Bank systems are under maintenance' },
  { key: 'surprise_tax', name: 'Surprise Tax', cost: 400, kind: 'tax', value: 100, cover: 'An unexpected tax bill has arrived' },
];

export const attackByKey = (key) => ATTACKS.find((a) => a.key === key);

// Effect window is [launched_at, end_at): the end time is exclusive.
export function activeAttacks(db, gameId, victim, t) {
  return db
    .prepare('SELECT * FROM attacks WHERE game_id=? AND victim=? AND blocked=0 AND launched_at <= ? AND ? < end_at')
    .all(gameId, victim, t, t);
}
