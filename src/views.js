import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { companyState, ideaOf, ownedRows, prep } from './state.js';
import { tally } from './ideation.js';
import { applicable, blockFromLast, summaryCard, priceWithSale, chargeFor } from './shop.js';
import { shopOpenAt, warningFor, newestWarningOnly } from './warnings.js';
import { saleMultiplier } from './marketEvents.js';
import { itemLabel } from './labels.js';
import { stuckPhases } from './director.js';
import { ATTACKS, attackByKey, attackCooldownUntil, hasShield } from './attacks.js';
import { effectiveRates } from './rates.js';
import { rolePoints } from './levels.js';
import { activeEvent } from './marketEvents.js';
import { activeAttacks } from './attacks.js';
import { latestHint } from './hints.js';

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
        cost: item.cost, price: state === 'owned' ? null : Math.max(1, priceWithSale(ownedId ? item.cost - ctx.data.item(ownedId).cost : item.cost, saleMult)), state, note,
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
  const shop = { open, catalog, mine, locked: null, sale: null };
  if (phase === 'competition') {
    const kind = p.role === 'CTO' ? 'cto_lock' : p.role === 'CFO' ? 'cfo_lock' : null;
    if (kind) {
      const row = activeAttacks(ctx.db, game.id, p.company, ctx.now()).find((r) => attackByKey(r.key).kind === kind);
      if (row) shop.locked = attackByKey(row.key).cover;
    }
    const ev = activeEvent(ctx.db, game.id, ctx.now());
    if (ev && ev.priceMult) {
      const e = prep(ctx.db, 'SELECT ends_at FROM market_events WHERE game_id=?').get(game.id);
      shop.sale = { active: true, mult: ev.priceMult, endsInSec: Math.max(0, Math.ceil((e.ends_at - ctx.now()) / 1000)) };
    }
  }
  if (p.role === 'CEO' || p.role === 'CFO') shop.queue = shared.queue;
  if (p.role === 'CEO') shop.awaitingCeo = shared.awaitingCeo;
  return shop;
}

const round1 = (n) => Math.round(n * 10) / 10;

// Per-company part of the competition block, computed once per push.
function companyCompetition(ctx, game, company, t, cache) {
  const key = `${game.id}:${company}:comp`;
  if (cache && cache.has(key)) return cache.get(key);
  const r = effectiveRates(ctx, game, company, t);
  const notices = prep(ctx.db, 'SELECT role, text FROM notices WHERE game_id=? AND company=? AND ts <= ? AND ? < until ORDER BY id').all(game.id, company, t, t);
  const pts = rolePoints(ctx.data, ownedRows(ctx.db, game.id, company).map((o) => o.item_id));
  const level = { CTO: round1(Math.min(3, pts.CTO)), CMO: round1(Math.min(3, pts.CMO)), COO: Math.min(3, pts.COO) };
  const out = { level, rates: { CTO: round1(r.CTO), CMO: round1(r.CMO), COO: round1(r.COO), total: round1(r.total) }, notices };
  if (cache) cache.set(key, out);
  return out;
}

function competitionView(ctx, game, p, clock, cache) {
  const t = ctx.now();
  const shared = companyCompetition(ctx, game, p.company, t, cache);
  const notices = newestWarningOnly(shared.notices.filter((n) => n.role == null || n.role === p.role)).map((n) => n.text);
  const hint = ['CTO', 'CMO', 'COO'].includes(p.role) ? latestHint(ctx.db, game.id, p.company, p.role, t) : null;
  let shield = null;
  if (p.role === 'COO') {
    const owns = !!prep(ctx.db, "SELECT 1 FROM owned WHERE game_id=? AND company=? AND family='O06'").get(game.id, p.company);
    shield = { owned: owns, used: owns && !hasShield(ctx.db, game.id, p.company) };
  }
  let attack = null;
  if (p.role === 'CEO') {
    const cooldownLeftSec = Math.max(0, Math.ceil((attackCooldownUntil(ctx.db, game.id, p.company) - t) / 1000));
    const lockedReason = clock.remainingSec <= 60 ? 'last minute' : cooldownLeftSec > 0 ? 'cooldown' : null;
    // Own launches only: name, cost and whether it landed; nothing of the target's internals.
    const launches = prep(ctx.db, 'SELECT key, cost, launched_at, blocked FROM attacks WHERE game_id=? AND attacker=? ORDER BY id').all(game.id, p.company)
      .map((a) => ({ name: attackByKey(a.key)?.name ?? a.key, cost: a.cost, at: a.launched_at, status: a.blocked ? 'blocked' : 'landed' }));
    attack = { options: ATTACKS.map(({ key, name, cost }) => ({ key, name, cost })), cooldownLeftSec, lockedReason, launches };
  }
  return { rates: shared.rates, level: shared.level, notices, hint: hint && { text: hint.text }, shield, attack };
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
      picked: cs?.idea_id ?? null,
      canPick: p.role === 'CEO' && !cs?.idea_id,
    };
  }
  return {
    me, screen: 'game', clock: warningFor(clock) ? { ...clock, warning: warningFor(clock) } : clock, problem, wallet: cs?.wallet ?? 0,
    idea: idea && { id: idea.id, type: idea.type, name: idea.name, description: idea.description },
    ideation,
    shop: clock.phase === 'shop' || clock.phase === 'competition' ? shopView(ctx, game, p, idea, clock.phase, cache) : null,
    owned: ownedList(ctx, game, p.company, idea),
    ...(clock.phase === 'competition' ? { competition: competitionView(ctx, game, p, clock, cache) } : {}),
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
      wallet: cs?.wallet ?? 0,
      idea: idea && { id: idea.id, type: idea.type, name: idea.name },
      pickSource: cs?.pick_source ?? null,
      votes: tally(ctx.db, game.id, company),
      owned: ownedList(ctx, game, company, idea),
      queue: companyShop(ctx, game, company, idea, phaseAt(game, ctx.now()).phase, cache).queue,
      awaitingCeo: companyShop(ctx, game, company, idea, phaseAt(game, ctx.now()).phase, cache).awaitingCeo,
    };
  };
  return {
    screen: 'organizer', participants, problems,
    game: { id: game.id, problemId: game.problemId, stuck: stuckPhases(ctx.db, game.id), clock: phaseAt(game, ctx.now()), companies: { A: panel('A'), B: panel('B') },
      attacks: prep(ctx.db, 'SELECT * FROM attacks WHERE game_id=? ORDER BY id').all(game.id).map((a) => ({
        id: a.id, attacker: a.attacker, victim: a.victim, name: attackByKey(a.key)?.name ?? a.key,
        cost: a.cost, at: a.launched_at, endsAt: a.end_at, blocked: !!a.blocked, by: a.launched_by,
      })),
      eventUsed: (prep(ctx.db, 'SELECT key FROM market_events WHERE game_id=?').get(game.id) || {}).key ?? null,
      injectionUsed: (() => { const i = prep(ctx.db, 'SELECT company, coins FROM injections WHERE game_id=?').get(game.id); return i ? { company: i.company, coins: i.coins } : null; })(),
    },
  };
}
