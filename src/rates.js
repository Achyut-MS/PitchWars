import { roleRates } from './levels.js';
import { ownedRows } from './state.js';
import { activeAttacks, attackByKey } from './attacks.js';
import { activeEvent } from './marketEvents.js';

const clean = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export function effectiveRates(ctx, game, company, t, { attacks = true } = {}) {
  const ids = ownedRows(ctx.db, game.id, company).map((o) => o.item_id);
  const mods = {};
  let mult = 1;
  if (attacks) {
    for (const row of activeAttacks(ctx.db, game.id, company, t)) {
      const a = attackByKey(row.key);
      if (!a) continue;
      if (a.kind === 'ad_off') mods.adOff = true;
      if (a.kind === 'recall') mods.recallBest = true;
      if (a.kind === 'risk_off') mods.riskOff = true;
      if (a.kind === 'mult') mult *= a.value;
    }
  }
  const ev = activeEvent(ctx.db, game.id, t);
  if (ev && ev.salesMult) mult *= ev.salesMult;
  const base = roleRates(ctx.data, ids, mods);
  const CTO = clean(base.CTO * mult);
  const CMO = clean(base.CMO * mult);
  const COO = clean(base.COO * mult);
  return { CTO, CMO, COO, total: CTO + CMO + COO };
}
