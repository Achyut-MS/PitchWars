import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvRecords } from './csv.js';

function readCsv(dir, file, required) {
  let parsed;
  try { parsed = parseCsvRecords(readFileSync(join(dir, file), 'utf8')); }
  catch (e) { throw new Error(`${file}: ${e.message}`); }
  const { header, records } = parsed;
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`${file}: missing required column ${col}`);
  }
  return records.map(({ line, cells }) => {
    if (cells.length !== header.length) {
      throw new Error(`${file} line ${line}: expected ${header.length} columns but found ${cells.length}`);
    }
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    Object.defineProperty(row, 'line', { value: line });
    return row;
  });
}

function fail(file, row, msg) { throw new Error(`${file} line ${row.line}: ${msg}`); }
function uniq(file, seen, row, id, key = id) {
  if (seen.has(key)) fail(file, row, `duplicate id ${id}`);
  seen.add(key);
}

export function loadData(dir = 'data') {
  const problems = JSON.parse(readFileSync(join(dir, 'problems.json'), 'utf8'));
  const pids = new Set();
  for (const p of problems) {
    if (typeof p.id !== 'number' || !Number.isFinite(p.id)) throw new Error(`problems.json: id ${JSON.stringify(p.id)} must be a number`);
    if (pids.has(p.id)) throw new Error(`problems.json: duplicate id ${p.id}`);
    pids.add(p.id);
  }
  const ideasByProblem = new Map();
  const IDEAS = 'idea_options.csv';
  const ideaIds = new Set();
  const ideaCols = ['game', 'idea_id', 'idea', 'description', ...[1, 2, 3].flatMap((n) => [`risk_${n}`, `brand_${n}`, `tagline_${n}`])];
  for (const r of readCsv(dir, IDEAS, ideaCols)) {
    if (!/^[HS]/.test(r.idea_id)) fail(IDEAS, r, `idea_id ${JSON.stringify(r.idea_id)} must start with H or S`);
    uniq(IDEAS, ideaIds, r, `${r.idea_id} (game ${r.game})`, `${r.game}:${r.idea_id}`);
    if (!Number.isFinite(Number(r.game)) || r.game.trim() === '') fail(IDEAS, r, `game ${JSON.stringify(r.game)} is not a number`);
    for (const c of ideaCols.slice(4)) if (r[c].trim() === '') fail(IDEAS, r, `blank ${c}`);
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
  const SHOP = 'shop_catalog.csv';
  const itemIds = new Set();
  const shopCols = ['item_id', 'role', 'section', 'item_name', 'option_or_tier', 'applies_to', 'cost_coins', 'tier_points', 'effect_on_sales'];
  const catalog = readCsv(dir, SHOP, shopCols).map((r) => {
    if (r.item_id.trim() === '') fail(SHOP, r, 'blank item_id');
    uniq(SHOP, itemIds, r, r.item_id);
    if (r.cost_coins.trim() === '' || !Number.isFinite(Number(r.cost_coins))) fail(SHOP, r, `cost_coins ${JSON.stringify(r.cost_coins)} is not a number`);
    if (r.tier_points !== '' && !Number.isFinite(Number(r.tier_points))) fail(SHOP, r, `tier_points ${JSON.stringify(r.tier_points)} is not a number`);
    return r;
  }).map((r) => ({
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
    ideasFor: (problemId) => ideasByProblem.get(Number(problemId)) ?? [],
    item: (id) => catalog.find((i) => i.id === id),
    catalog,
  };
}
