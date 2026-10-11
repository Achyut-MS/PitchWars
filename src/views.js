import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { companyState, ideaOf, ownedRows } from './state.js';
import { tally } from './ideation.js';
import { applicable, chargeFor, isShopOpen, queueHead, rejectionBlock, summaryCard } from './shop.js';
import { itemLabel } from './labels.js';

const ADDERS = ['CTO', 'CMO', 'COO'];

const meOf = (p) => ({ admissionId: p.admission_id, name: p.name, status: p.status, company: p.company, role: p.role, gameId: p.game_id });

function ownedList(ctx, game, company, idea) {
  return ownedRows(ctx.db, game.id, company).map((o) => ({
    itemId: o.item_id, label: itemLabel(ctx.data.item(o.item_id), idea, o.choice), charged: o.charged,
  }));
}

function requestView(ctx, idea, r, headId) {
  const item = ctx.data.item(r.item_id);
  const by = ctx.db.prepare('SELECT name FROM participants WHERE admission_id=?').get(r.requested_by);
  return {
    id: r.id, itemId: r.item_id, label: itemLabel(item, idea, r.choice), price: r.price,
    by: by ? by.name : r.requested_by, recommended: !!r.recommended, head: r.id === headId,
  };
}

function queues(ctx, game, company, idea) {
  const head = queueHead(ctx.db, game.id, company);
  const pending = ctx.db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='pending' ORDER BY id").all(game.id, company);
  const waiting = ctx.db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='awaiting_ceo' ORDER BY id").all(game.id, company);
  return {
    queue: pending.map((r) => requestView(ctx, idea, r, head && head.id)),
    awaitingCeo: waiting.map((r) => requestView(ctx, idea, r, null)),
  };
}

function itemState(ctx, game, company, item, phase) {
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  if (owned) {
    const have = ctx.data.item(owned.item_id);
    if (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0)) return { state: 'owned', note: '' };
  }
  const open = ctx.db.prepare("SELECT 1 FROM requests WHERE game_id=? AND company=? AND family=? AND status IN ('awaiting_ceo','pending')").get(game.id, company, item.family);
  if (open) return { state: 'requested', note: '' };
  const block = rejectionBlock(ctx, game, company, item.family, phase);
  if (block) return { state: 'wait', note: block };
  return { state: 'available', note: '' };
}

function shopView(ctx, game, p, idea, phase) {
  const open = isShopOpen(phase) && !!idea;
  const catalog = idea
    ? ctx.data.catalog.filter((i) => applicable(i, idea)).map((item) => {
        const st = itemState(ctx, game, p.company, item, phase);
        const mineRole = ADDERS.includes(p.role) && item.role === p.role;
        return {
          id: item.id, name: item.name, label: itemLabel(item, idea), option: item.option, section: item.section, role: item.role,
          cost: item.cost, price: chargeFor(ctx, game, p.company, item), state: st.state, note: st.note,
          canRequest: open && mineRole && st.state === 'available',
          canRecommend: open && p.role === 'CEO' && st.state === 'available',
          choices: item.id === 'M02' ? idea.brands : item.id === 'M03' ? idea.taglines : null,
        };
      })
    : [];
  const mine = ctx.db.prepare('SELECT * FROM requests WHERE game_id=? AND company=? AND requested_by=? ORDER BY id DESC LIMIT 8')
    .all(game.id, p.company, p.admission_id)
    .map((r) => ({ id: r.id, itemId: r.item_id, label: itemLabel(ctx.data.item(r.item_id), idea, r.choice), status: r.status }));
  const shop = { open, catalog, mine };
  if (p.role === 'CEO' || p.role === 'CFO') shop.queue = queues(ctx, game, p.company, idea).queue;
  if (p.role === 'CEO') shop.awaitingCeo = queues(ctx, game, p.company, idea).awaitingCeo;
  return shop;
}

export function viewFor(ctx, admissionId) {
  const p = ctx.db.prepare('SELECT * FROM participants WHERE admission_id = ?').get(admissionId);
  if (!p) return { screen: 'unknown' };
  const me = meOf(p);
  if (p.status === 'lobby') return { me, screen: 'lobby' };
  if (p.status === 'completed') return { me, screen: 'graphs', gameId: p.game_id };
  const game = activeGame(ctx.db);
  const clock = phaseAt(game, ctx.now());
  const cs = companyState(ctx.db, game.id, p.company);
  const idea = ideaOf(ctx, game, p.company);
  const problem = ctx.data.problems.find((x) => x.id === game.problemId);
  let ideation = null;
  if (clock.phase === 'ideation' || clock.phase === 'briefing') {
    const counts = tally(ctx.db, game.id, p.company);
    const mineVote = ctx.db.prepare('SELECT idea_id FROM votes WHERE game_id=? AND admission_id=?').get(game.id, admissionId);
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
    me, screen: 'game', clock, problem, wallet: cs.wallet,
    idea: idea && { id: idea.id, type: idea.type, name: idea.name, description: idea.description },
    ideation,
    shop: clock.phase === 'shop' || clock.phase === 'competition' ? shopView(ctx, game, p, idea, clock.phase) : null,
    owned: ownedList(ctx, game, p.company, idea),
    summary: clock.phase === 'summary' ? summaryCard(ctx, game, p.company) : null,
  };
}

export function organizerView(ctx) {
  const participants = ctx.db.prepare('SELECT admission_id, name, status, company, role, game_id FROM participants ORDER BY admission_id').all();
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
      ...queues(ctx, game, company, idea),
    };
  };
  return {
    screen: 'organizer', participants, problems,
    game: { id: game.id, problemId: game.problemId, clock: phaseAt(game, ctx.now()), companies: { A: panel('A'), B: panel('B') } },
  };
}
