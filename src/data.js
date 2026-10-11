import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.js';

export function loadData(dir = 'data') {
  const problems = JSON.parse(readFileSync(join(dir, 'problems.json'), 'utf8'));
  const ideasByProblem = new Map();
  for (const r of parseCsv(readFileSync(join(dir, 'idea_options.csv'), 'utf8'))) {
    const idea = {
      id: r.idea_id,
      type: r.idea_id.startsWith('H') ? 'hardware' : 'software',
      name: r.idea,
      description: r.description,
      risks: [r.risk_1, r.risk_2, r.risk_3],
      brands: [r.brand_1, r.brand_2, r.brand_3],
      taglines: [r.tagline_1, r.tagline_2, r.tagline_3],
    };
    const k = Number(r.game);
    if (!ideasByProblem.has(k)) ideasByProblem.set(k, []);
    ideasByProblem.get(k).push(idea);
  }
  const catalog = parseCsv(readFileSync(join(dir, 'shop_catalog.csv'), 'utf8')).map((r) => ({
    id: r.item_id,
    role: r.role,
    section: r.section,
    name: r.item_name,
    option: r.option_or_tier,
    appliesTo: r.applies_to,
    cost: Number(r.cost_coins),
    tierPoints: r.tier_points === '' ? null : Number(r.tier_points),
    family: r.item_id.split('-')[0],
    effect: r.effect_on_sales,
  }));
  return {
    problems,
    ideasFor: (problemId) => ideasByProblem.get(problemId) ?? [],
    item: (id) => catalog.find((i) => i.id === id),
    catalog,
  };
}
