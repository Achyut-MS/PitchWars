export const curve = (points) => {
  if (points <= 0) return 0;
  if (points <= 1) return 13 * points;
  return Math.min(27, 13 + 7 * (points - 1));
};

// The tier points (0..3 averages, fix count for the COO) each role's curve is applied to.
export function rolePoints(data, ownedItemIds, mods = {}) {
  const items = ownedItemIds.map((id) => data.item(id)).filter(Boolean);
  const tier = (family) => items.find((i) => i.family === family)?.tierPoints ?? 0;
  const feats = items.filter((i) => i.section === 'Core Features').map((i) => i.tierPoints).sort((a, b) => b - a);
  if (mods.recallBest) feats.shift();
  const ad = mods.adOff ? 0 : tier('M04');
  const fixes = mods.riskOff ? 0 : items.filter((i) => /^O0[123]$/.test(i.id)).length;
  return { CTO: feats.slice(0, 3).reduce((x, y) => x + y, 0) / 3, CMO: (tier('M01') + ad) / 2, COO: fixes };
}

export function roleRates(data, ownedItemIds, mods = {}) {
  const items = ownedItemIds.map((id) => data.item(id)).filter(Boolean);
  const has = (family) => items.some((i) => i.family === family);
  const tier = (family) => items.find((i) => i.family === family)?.tierPoints ?? 0;

  const feats = items.filter((i) => i.section === 'Core Features').map((i) => i.tierPoints).sort((a, b) => b - a);
  if (mods.recallBest) feats.shift();
  const parts = items.filter((i) => i.section === 'Components').length;
  const CTO = curve(feats.slice(0, 3).reduce((a, b) => a + b, 0) / 3) + Math.min(4, parts);

  const ad = mods.adOff ? 0 : tier('M04');
  const CMO = curve((tier('M01') + ad) / 2) + (has('M02') ? 2 : 0) + (has('M03') ? 2 : 0);

  const fixes = mods.riskOff ? 0 : items.filter((i) => /^O0[123]$/.test(i.id)).length;
  const COO = [0, 13, 20, 27][fixes] + (has('O04') ? 2 : 0) + tier('O05');

  return { CTO, CMO, COO };
}
