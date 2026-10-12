import { loadData } from '../src/data.js';
import { roleRates } from '../src/levels.js';

const MANAGED_ROLES = ['CTO', 'CMO', 'COO'];

function offers(data, type) {
  const families = new Map();
  for (const item of data.catalog) {
    if (!MANAGED_ROLES.includes(item.role) || item.section === 'Protection') continue;
    if (item.appliesTo !== 'both' && item.appliesTo !== type) continue;
    if (!families.has(item.family)) families.set(item.family, []);
    families.get(item.family).push(item);
  }
  return families;
}

// A careful buyer: always takes the purchase that adds the most coins per minute for each coin spent,
// and never takes the wallet below `floor`.
export function simulateBuyer(data, type, wallet = 1000, floor = 0) {
  const families = offers(data, type);
  const owned = new Map();
  const total = (map) => {
    const r = roleRates(data, [...map.values()].map((i) => i.id));
    return r.CTO + r.CMO + r.COO;
  };
  for (;;) {
    const now = total(owned);
    let best = null;
    for (const [family, items] of families) {
      const have = owned.get(family);
      for (const item of items) {
        if (have && (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0))) continue;
        const cost = item.cost - (have ? have.cost : 0);
        if (wallet - cost < floor) continue;
        const gain = total(new Map(owned).set(family, item)) - now;
        const score = gain / cost;
        if (gain > 0 && (!best || score > best.score)) best = { family, item, cost, score };
      }
    }
    if (!best) break;
    owned.set(best.family, best.item);
    wallet -= best.cost;
  }
  const ids = [...owned.values()].map((i) => i.id);
  const roles = roleRates(data, ids);
  const rate = roles.CTO + roles.CMO + roles.COO;
  return { ids, walletLeft: wallet, roles, ratePerMinute: rate, earnedOver16Minutes: rate * 16 };
}

export function report(data) {
  const lines = ['type       floor   per minute   CTO    CMO    COO    earned in 16 min   coins left'];
  for (const type of ['hardware', 'software']) {
    for (const floor of [0, -200]) {
      const r = simulateBuyer(data, type, 1000, floor);
      lines.push(`${type.padEnd(10)} ${String(floor).padStart(5)}   ${r.ratePerMinute.toFixed(1).padStart(10)}   ${r.roles.CTO.toFixed(1).padStart(4)}   ${r.roles.CMO.toFixed(1).padStart(4)}   ${r.roles.COO.toFixed(1).padStart(4)}   ${r.earnedOver16Minutes.toFixed(0).padStart(16)}   ${String(r.walletLeft).padStart(10)}`);
    }
  }
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('simulate-balance.js')) console.log(report(loadData('data')));
