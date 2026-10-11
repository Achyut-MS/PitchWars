import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { companyState, ideaOf, ownedRows, prep } from './state.js';
import { tally } from './ideation.js';
import { applicable, blockFromLast, summaryCard, priceWithSale, chargeFor } from './shop.js';
import { shopOpenAt, warningFor } from './warnings.js';
import { saleMultiplier } from './marketEvents.js';
import { itemLabel } from './labels.js';
import { stuckPhases } from './director.js';

const ADDERS = ['CTO', 'CMO', 'COO'];

const meOf = (p) => ({ admissionId: p.admission_id, name: p.name, status: p.status, company: p.company, role: p.role, gameId: p.game_id });

function ownedList(ctx, game, company, idea) {
  return ownedRows(ctx.db, game.id, company).map((o) => ({
    itemId: o.item_id, label: itemLabel(ctx.data.item(o.item_id), idea, o.choice), charged: o.charged,
  }));
}

function requestView(ctx, game, idea, r, headId) {
  const item = ctx.data.item(r.item_id);
  const by = prep(ctx.db, 'SELECT name FROM participants WHERE admission_id=?').get(r.requested_by);
  return {
    id: r.id, itemId: r.item_id, label: itemLabel(item, idea, r.choice), price: chargeFor(ctx, game, r.company, item),
    by: by ? by.name : r.requested_by, recommended: !!r.recommended, head: r.id === headId,
  };
}

// Everything in the shop that depends only on the company (not on who is looking)
// is computed once per push and kept in `cache`.
function companyShop(ctx, game, company, idea, phase, cache) {
  const key = `${game.id}:${company}:${phase}`;
  if (cache && cache.has(key)) return cache.get(key);
  const db = ctx.db;
  const saleMult = saleMultiplier(db, game.id, ctx.now());
  const pendingRows = prep(db, "SELECT * FROM requests WHERE game_id=? AND company=? AND status='pending' ORDER BY id").all(game.id, company);
  const waitingRows = prep(db, "SELECT * FROM requests WHERE game_id=? AND company=? AND status='awaiting_ceo' ORDER BY id").all(game.id, company);
  const headId = pendingRows.length ? pendingRows[0].id : null;
  const queue = pendingRows.map((r) => requestView(ctx, game, idea, r, headId));
  const awaitingCeo = waitingRows.map((r) => requestView(ctx, game, idea, r, null));
  let catalog = [];
  if (idea) {
    const owned = new Map(prep(db, 'SELECT family, item_id FROM owned WHERE game_id=? AND company=?').all(game.id, company).map((o) => [o.family, o.item_id]));
    const open = new Set([...pendingRows, ...waitingRows].map((r) => r.family));
    const lastRejected = new Map();
    for (const r of prep(db, "SELECT * FROM requests WHERE game_id=? AND company=? AND status='rejected' ORDER BY decided_at DESC, id DESC").all(game.id, company)) {
      if (!lastRejected.has(r.family)) lastRejected.set(r.family, r);
    }
    catalog = ctx.data.catalog.filter((i) => applicable(i, idea)).map((item) => {
      const ownedId = owned.get(item.family);
      let state = null;
      let note = '';
      if (ownedId) {
        const have = ctx.data.item(ownedId);
        if (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0)) state = 'owned';
      }
      if (!state && open.has(item.family)) state = 'requested';
      if (!state) {
        const block = blockFromLast(ctx, lastRejected.get(item.family), phase);
        if (block) { state = 'wait'; note = block; } else state = 'available';
      }
      return {
        id: item.id, name: item.name, label: itemLabel(item, idea), option: item.option, section: item.section, role: item.role,
        cost: item.cost, price: priceWithSale(ownedId ? item.cost - ctx.data.item(ownedId).cost : item.cost, saleMult), state, note,
        choices: item.id === 'M02' ? idea.brands : item.id === 'M03' ? idea.taglines : null,
      };
    });
  }
  const out = { catalog, queue, awaitingCeo };
  if (cache) cache.set(key, out);
  return out;
}

function shopView(ctx, game, p, idea, phase, cache) {
  const open = shopOpenAt(game, ctx.now()) && !!idea;
  const shared = companyShop(ctx, game, p.company, idea, phase, cache);
  const catalog = shared.catalog.map((c) => ({
    ...c,
    canRequest: open && ADDERS.includes(p.role) && c.role === p.role && c.state === 'available',
    canRecommend: open && p.role === 'CEO' && c.state === 'available',
  }));
  const mine = prep(ctx.db, 'SELECT * FROM requests WHERE game_id=? AND company=? AND requested_by=? ORDER BY id DESC LIMIT 8')
    .all(game.id, p.company, p.admission_id)
    .map((r) => ({ id: r.id, itemId: r.item_id, label: itemLabel(ctx.data.item(r.item_id), idea, r.choice), status: r.status }));
  const shop = { open, catalog, mine };
  if (p.role === 'CEO' || p.role === 'CFO') shop.queue = shared.queue;
  if (p.role === 'CEO') shop.awaitingCeo = shared.awaitingCeo;
  return shop;
}

export function viewFor(ctx, admissionId, cache = null) {
  const p = prep(ctx.db, 'SELECT * FROM participants WHERE admission_id = ?').get(admissionId);
  if (!p) return { screen: 'unknown' };
  const me = meOf(p);
  if (p.status === 'lobby') return { me, screen: 'lobby' };
  if (p.status === 'completed') return { me, screen: 'graphs', gameId: p.game_id };
  const game = activeGame(ctx.db);
  if (!game) return { me, screen: 'lobby' };
  const clock = phaseAt(game, ctx.now());
  const cs = companyState(ctx.db, game.id, p.company);
  const idea = ideaOf(ctx, game, p.company);
  const problem = ctx.data.problems.find((x) => x.id === game.problemId);
  let ideation = null;
  if (clock.phase === 'ideation' || clock.phase === 'briefing') {
    const counts = tally(ctx.db, game.id, p.company);
    const mineVote = prep(ctx.db, 'SELECT idea_id FROM votes WHERE game_id=? AND admission_id=?').get(game.id, admissionId);
    ideation = {
      ideas: ctx.data.ideasFor(game.problemId).map((i) => ({
        id: i.id, type: i.type, name: i.name, description: i.description,
        votes: counts[i.id] ?? 0, mine: !!mineVote && mineVote.idea_id === i.id,
      })),
      picked: cs.idea_id,
      canPick: p.role === 'CEO' && !cs.idea_id,
    };
  }
  return {
    me, screen: 'game', clock: warningFor(clock) ? { ...clock, warning: warningFor(clock) } : clock, problem, wallet: cs.wallet,
    idea: idea && { id: idea.id, type: idea.type, name: idea.name, description: idea.description },
    ideation,
    shop: clock.phase === 'shop' || clock.phase === 'competition' ? shopView(ctx, game, p, idea, clock.phase, cache) : null,
    owned: ownedList(ctx, game, p.company, idea),
    summary: clock.phase === 'summary' ? summaryCard(ctx, game, p.company) : null,
  };
}

export function organizerView(ctx, cache = null) {
  const participants = prep(ctx.db, 'SELECT admission_id, name, status, company, role, game_id FROM participants ORDER BY admission_id').all();
  const problems = ctx.data.problems.map(({ id, title }) => ({ id, title }));
  const game = activeGame(ctx.db);
  if (!game) return { screen: 'organizer', participants, problems, game: null };
  const panel = (company) => {
    const cs = companyState(ctx.db, game.id, company);
    const idea = ideaOf(ctx, game, company);
    return {
      wallet: cs.wallet,
      idea: idea && { id: idea.id, type: idea.type, name: idea.name },
      pickSource: cs.pick_source,
      votes: tally(ctx.db, game.id, company),
      owned: ownedList(ctx, game, company, idea),
      queue: companyShop(ctx, game, company, idea, phaseAt(game, ctx.now()).phase, cache).queue,
      awaitingCeo: companyShop(ctx, game, company, idea, phaseAt(game, ctx.now()).phase, cache).awaitingCeo,
    };
  };
  return {
    screen: 'organizer', participants, problems,
    game: { id: game.id, problemId: game.problemId, stuck: stuckPhases(ctx.db, game.id), clock: phaseAt(game, ctx.now()), companies: { A: panel('A'), B: panel('B') } },
  };
}
