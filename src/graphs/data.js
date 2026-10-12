const START_WALLET = 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const roleCoins = (s) => ({
  CEO: round2(s.attack_coins),
  CTO: round2(s.cto_coins),
  CFO: round2(s.mini_coins),
  CMO: round2(s.cmo_coins),
  COO: round2(s.coo_coins),
});

// Wallet series per company from the 5-second samples of ONE game. A company
// with no sample at a time keeps its last known wallet (the start wallet before
// its first sample), so both series always have the same length as t.
export function graphData(db, gameId) {
  const state = (c) => db.prepare('SELECT * FROM company_state WHERE game_id = ? AND company = ?').get(gameId, c);
  const A = state('A');
  const B = state('B');
  if (!A || !B) throw new Error('no such game');

  const byTs = new Map();
  for (const r of db.prepare('SELECT ts, company, wallet FROM samples WHERE game_id = ? ORDER BY ts, company').all(gameId)) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, {});
    byTs.get(r.ts)[r.company] = r.wallet;
  }
  const times = [...byTs.keys()].sort((a, b) => a - b);
  let series;
  if (!times.length) {
    series = { t: [0], A: [A.wallet], B: [B.wallet] };
  } else {
    series = { t: [], A: [], B: [] };
    let lastA = START_WALLET;
    let lastB = START_WALLET;
    for (const ts of times) {
      const v = byTs.get(ts);
      lastA = v.A ?? lastA;
      lastB = v.B ?? lastB;
      series.t.push((ts - times[0]) / 1000);
      series.A.push(lastA);
      series.B.push(lastB);
    }
  }
  return { series, final: { A: roleCoins(A), B: roleCoins(B) } };
}
