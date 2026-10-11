import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { playerIn } from './state.js';

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

const COOLDOWN_MS = 60_000;
const LOCK_LAST_SEC = 60;

export function attackCooldownUntil(db, gameId, company) {
  const last = db.prepare('SELECT end_at FROM attacks WHERE game_id=? AND attacker=? ORDER BY id DESC LIMIT 1').get(gameId, company);
  return last ? last.end_at + COOLDOWN_MS : 0;
}

export function hasShield(db, gameId, company) {
  const owns = db.prepare("SELECT 1 FROM owned WHERE game_id=? AND company=? AND family='O06'").get(gameId, company);
  const used = db.prepare('SELECT 1 FROM shield_use WHERE game_id=? AND company=?').get(gameId, company);
  return !!owns && !used;
}

export function isLocked(ctx, game, company, kind, t = ctx.now()) {
  return activeAttacks(ctx.db, game.id, company, t).some((r) => attackByKey(r.key).kind === kind);
}

export function launchAttack(ctx, game, admissionId, key, rng = Math.random) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can attack');
  const a = attackByKey(key);
  if (!a) throw new Error('unknown attack');
  const victim = p.company === 'A' ? 'B' : 'A';
  const db = ctx.db;
  // Every check and write happens in one immediate transaction, so two racing
  // launches cannot both pass the cooldown or shield check and charge twice.
  return db.transaction(() => {
    const now = ctx.now();
    const clock = phaseAt(game, now);
    if (clock.phase !== 'competition') throw new Error('attacks are only possible during the competition');
    if (clock.remainingSec <= LOCK_LAST_SEC) throw new Error('attacks are locked in the last 60 seconds');
    if (now < attackCooldownUntil(db, game.id, p.company)) throw new Error('attack on cooldown');

    const blocked = hasShield(db, game.id, victim);
    const duration = a.kind === 'tax' || blocked ? 0 : 30_000 + Math.floor(Math.min(Math.max(Number(rng()) || 0, 0), 0.999999) * 15_001);
    const endsAt = now + duration;

    db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(a.cost, game.id, p.company);
    db.prepare(
      `INSERT INTO attacks (game_id, attacker, victim, key, cost, launched_by, launched_at, end_at, blocked, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(game.id, p.company, victim, a.key, a.cost, admissionId, now, endsAt, blocked ? 1 : 0, a.cover);
    const notice = db.prepare('INSERT INTO notices (game_id, company, role, text, ts, until) VALUES (?, ?, ?, ?, ?, ?)');
    if (blocked) {
      db.prepare('INSERT INTO shield_use (game_id, company, used_at) VALUES (?, ?, ?)').run(game.id, victim, now);
      notice.run(game.id, victim, 'COO', 'Insurance claim used', now, now + 30_000);
    } else {
      if (a.kind === 'tax') {
        db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(a.value, game.id, victim);
        db.prepare('UPDATE company_state SET wallet = wallet + ?, attack_coins = attack_coins + ? WHERE game_id=? AND company=?').run(a.value, a.value, game.id, p.company);
      }
      notice.run(game.id, victim, null, a.cover, now, a.kind === 'tax' ? now + 30_000 : endsAt);
    }
    logEvent(db, { ts: now, gameId: game.id, admissionId, type: 'attack',
      payload: { key: a.key, name: a.name, cost: a.cost, victim, blocked, endsAt, cover: a.cover } });
    return { blocked, endsAt };
  }).immediate();
}
