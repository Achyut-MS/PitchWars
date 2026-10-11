import { effectiveRates } from './rates.js';
import { phaseWindow } from './phases.js';
import { companyState } from './state.js';

const MAX_DT_MS = 5000;
const SAMPLE_EVERY_MS = 5000;
const COMPANIES = ['A', 'B'];

// Integrates coins by elapsed server time. Safe to call any number of times
// per instant: each call only credits the time since last_tick_at (at most
// 5 s, never negative) and then advances last_tick_at.
export function tickEconomy(ctx, game) {
  const w = phaseWindow(game, 'competition');
  const now = ctx.now();
  if (now < w.start) return;
  const upTo = Math.min(now, w.end);
  ctx.db.transaction(() => {
    for (const company of COMPANIES) tickCompany(ctx, game, company, upTo, w.start);
    sample(ctx, game, upTo, w.start);
  }).immediate();
}

function tickCompany(ctx, game, company, upTo, start) {
  const rival = company === 'A' ? 'B' : 'A';
  const cs = companyState(ctx.db, game.id, company);
  const last = cs.last_tick_at ?? start;
  const dtMs = Math.max(0, Math.min(upTo - last, MAX_DT_MS));
  if (dtMs <= 0) {
    // First run (or a clock that stepped back): never move last_tick_at backwards.
    if (cs.last_tick_at == null) {
      ctx.db.prepare('UPDATE company_state SET last_tick_at = ? WHERE game_id=? AND company=?').run(upTo, game.id, company);
    }
    return;
  }
  const dt = dtMs / 1000;
  // Rates are read at the end of the interval.
  const withAttacks = effectiveRates(ctx, game, company, upTo, { attacks: true });
  const without = effectiveRates(ctx, game, company, upTo, { attacks: false });
  const gain = (rate) => (rate / 60) * dt;
  const total = cs.frac + gain(withAttacks.total);
  const whole = Math.floor(total + 1e-9);
  ctx.db.prepare(
    `UPDATE company_state SET wallet = wallet + ?, frac = ?, last_tick_at = ?,
       cto_coins = cto_coins + ?, cmo_coins = cmo_coins + ?, coo_coins = coo_coins + ?
     WHERE game_id=? AND company=?`
  ).run(whole, Math.max(0, total - whole), upTo, gain(withAttacks.CTO), gain(withAttacks.CMO), gain(withAttacks.COO), game.id, company);
  const lost = gain(without.total - withAttacks.total);
  if (lost > 0) {
    ctx.db.prepare('UPDATE company_state SET attack_coins = attack_coins + ? WHERE game_id=? AND company=?').run(lost, game.id, rival);
  }
}

// Samples sit on a fixed grid (competition start + k * 5 s) and are written at
// most once per grid slot, so ragged ticks or a restart never duplicate them.
function sample(ctx, game, t, start) {
  const slot = start + Math.floor((t - start) / SAMPLE_EVERY_MS) * SAMPLE_EVERY_MS;
  for (const company of COMPANIES) {
    const cs = companyState(ctx.db, game.id, company);
    if (cs.last_sample_at != null && slot <= cs.last_sample_at) continue;
    const r = effectiveRates(ctx, game, company, t);
    ctx.db.prepare(
      `INSERT INTO samples (game_id, ts, company, wallet, cto_rate, cmo_rate, coo_rate, cto_coins, cmo_coins, coo_coins, mini_coins, attack_coins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(game.id, slot, company, cs.wallet, r.CTO, r.CMO, r.COO, cs.cto_coins, cs.cmo_coins, cs.coo_coins, cs.mini_coins, cs.attack_coins);
    ctx.db.prepare('UPDATE company_state SET last_sample_at = ? WHERE game_id=? AND company=?').run(slot, game.id, company);
  }
}
