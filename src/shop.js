import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { companyState, ideaOf, playerIn } from './state.js';
import { itemLabel } from './labels.js';

export const WALLET_FLOOR = -200;
export const RETRY_AFTER_MS = 60_000;
const ADDERS = ['CTO', 'CMO', 'COO'];

export const isShopOpen = (phase) => phase === 'shop' || phase === 'competition';
export const applicable = (item, idea) => item.appliesTo === 'both' || item.appliesTo === idea.type;

export function rejectionBlock(ctx, game, company, family, phase) {
  const last = ctx.db
    .prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND family=? AND status='rejected' ORDER BY decided_at DESC, id DESC LIMIT 1")
    .get(game.id, company, family);
  if (!last) return null;
  if (last.phase === 'shop' && phase === 'shop') return 'rejected in this phase; you can ask again in the next phase';
  if (last.phase === 'competition' && phase === 'competition' && ctx.now() - last.decided_at < RETRY_AFTER_MS) {
    return 'wait 60 seconds after a rejection';
  }
  return null;
}

export function chargeFor(ctx, game, company, item) {
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  return owned ? item.cost - ctx.data.item(owned.item_id).cost : item.cost;
}

function validate(ctx, game, company, item, choice) {
  const phase = phaseAt(game, ctx.now()).phase;
  if (!isShopOpen(phase)) throw new Error('the shop is closed');
  const idea = ideaOf(ctx, game, company);
  if (!idea) throw new Error('pick an idea first');
  if (!item || !applicable(item, idea)) throw new Error('that item is not available for this idea');
  if ((item.id === 'M02' || item.id === 'M03') && ![1, 2, 3].includes(Number(choice))) {
    throw new Error('pick one of the three options');
  }
  const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, company, item.family);
  if (owned) {
    const have = ctx.data.item(owned.item_id);
    if (item.tierPoints == null || item.tierPoints <= (have.tierPoints ?? 0)) throw new Error('already owned');
  }
  const open = ctx.db
    .prepare("SELECT 1 FROM requests WHERE game_id=? AND company=? AND family=? AND status IN ('awaiting_ceo','pending')")
    .get(game.id, company, item.family);
  if (open) throw new Error('already requested');
  const block = rejectionBlock(ctx, game, company, item.family, phase);
  if (block) throw new Error(block);
  return phase;
}

function insert(ctx, game, p, item, choice, status, recommended, phase) {
  return ctx.db.transaction(() => insertRow(ctx, game, p, item, choice, status, recommended, phase))();
}

function insertRow(ctx, game, p, item, choice, status, recommended, phase) {
  const info = ctx.db
    .prepare(
      `INSERT INTO requests (game_id, company, item_id, family, choice, requested_by, recommended, status, phase, price, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(game.id, p.company, item.id, item.family, choice ?? null, p.admission_id, recommended, status, phase, item.cost, ctx.now());
  logEvent(ctx.db, {
    ts: ctx.now(), gameId: game.id, admissionId: p.admission_id,
    type: recommended ? 'shop_recommend' : 'shop_request',
    payload: { requestId: Number(info.lastInsertRowid), itemId: item.id, choice: choice ?? null, status },
  });
  return Number(info.lastInsertRowid);
}

export function requestItem(ctx, game, admissionId, itemId, choice = null) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (!ADDERS.includes(p.role)) throw new Error('only the CTO, CMO and COO can add items; the CEO can recommend');
  const item = ctx.data.item(itemId);
  if (item && item.role !== p.role) throw new Error('that item is not in your section');
  const phase = validate(ctx, game, p.company, item, choice);
  const status = p.role === 'CTO' && item.section === 'Core Features' ? 'awaiting_ceo' : 'pending';
  return insert(ctx, game, p, item, choice, status, 0, phase);
}

export function recommendItem(ctx, game, admissionId, itemId, choice = null) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can recommend');
  const item = ctx.data.item(itemId);
  const phase = validate(ctx, game, p.company, item, choice);
  return insert(ctx, game, p, item, choice, 'pending', 1, phase);
}

function requireOpen(ctx, game) {
  if (!isShopOpen(phaseAt(game, ctx.now()).phase)) throw new Error('the shop is closed');
}

export const queueHead = (db, gameId, company) =>
  db.prepare("SELECT * FROM requests WHERE game_id=? AND company=? AND status='pending' ORDER BY id LIMIT 1").get(gameId, company);

function ownRequest(ctx, game, company, requestId) {
  const r = ctx.db.prepare('SELECT * FROM requests WHERE id=? AND game_id=? AND company=?').get(requestId, game.id, company);
  if (!r) throw new Error('no such request');
  return r;
}

export function ceoDecide(ctx, game, admissionId, requestId, approve) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CEO') throw new Error('only the CEO can decide');
  requireOpen(ctx, game);
  ctx.db.transaction(() => {
    const r = ownRequest(ctx, game, p.company, requestId);
    if (r.status !== 'awaiting_ceo') throw new Error('that request is not waiting for the CEO');
    if (approve) {
      ctx.db.prepare("UPDATE requests SET status='pending' WHERE id=?").run(r.id);
    } else {
      ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=?, reject_reason='ceo' WHERE id=?")
        .run(ctx.now(), admissionId, r.id);
    }
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'ceo_decision', payload: { requestId: r.id, approve } });
  })();
}

export function cfoDecide(ctx, game, admissionId, requestId, approve) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CFO') throw new Error('only the CFO can decide');
  requireOpen(ctx, game);
  // Everything is re-read and checked inside the transaction so a repeat click
  // or a stale request cannot charge twice or break the family rule.
  ctx.db.transaction(() => {
    const r = ownRequest(ctx, game, p.company, requestId);
    const head = queueHead(ctx.db, game.id, p.company);
    if (!head || head.id !== r.id) throw new Error('decide the oldest request first');
    const wallet = companyState(ctx.db, game.id, p.company).wallet;
    const item = ctx.data.item(r.item_id);
    let charge = 0;
    if (approve) {
      const owned = ctx.db.prepare('SELECT item_id FROM owned WHERE game_id=? AND company=? AND family=?').get(game.id, p.company, item.family);
      if (owned && (item.tierPoints == null || item.tierPoints <= (ctx.data.item(owned.item_id).tierPoints ?? 0))) {
        throw new Error('already owned');
      }
      charge = chargeFor(ctx, game, p.company, item);
      if (wallet - charge < WALLET_FLOOR) throw new Error('this would take the wallet below -200');
      ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(charge, game.id, p.company);
      ctx.db.prepare(
        `INSERT INTO owned (game_id, company, family, item_id, choice, bought_at, charged) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (game_id, company, family) DO UPDATE SET item_id=excluded.item_id, choice=excluded.choice, bought_at=excluded.bought_at, charged=owned.charged + excluded.charged`
      ).run(game.id, p.company, item.family, item.id, r.choice, ctx.now(), charge);
      ctx.db.prepare("UPDATE requests SET status='approved', charged=?, decided_at=?, decided_by=? WHERE id=?")
        .run(charge, ctx.now(), admissionId, r.id);
    } else {
      ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, decided_by=?, reject_reason='cfo' WHERE id=?")
        .run(ctx.now(), admissionId, r.id);
    }
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'cfo_decision',
      payload: { requestId: r.id, itemId: item.id, approve, charged: charge, walletBefore: wallet, walletAfter: wallet - charge } });
  })();
}

export function autoRejectAll(ctx, game) {
  ctx.db.transaction(() => {
    const open = ctx.db.prepare("SELECT id, company, item_id FROM requests WHERE game_id=? AND status IN ('awaiting_ceo','pending')").all(game.id);
    for (const r of open) {
      ctx.db.prepare("UPDATE requests SET status='rejected', decided_at=?, reject_reason='auto' WHERE id=?").run(ctx.now(), r.id);
      logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'shop_auto_reject', payload: { requestId: r.id, company: r.company, itemId: r.item_id } });
    }
  })();
}

export function summaryCard(ctx, game, company) {
  const idea = ideaOf(ctx, game, company);
  const owned = ctx.db.prepare('SELECT * FROM owned WHERE game_id=? AND company=? ORDER BY bought_at, family').all(game.id, company)
    .map((o) => ({ itemId: o.item_id, label: itemLabel(ctx.data.item(o.item_id), idea, o.choice), charged: o.charged }));
  return { idea, owned, wallet: companyState(ctx.db, game.id, company).wallet };
}
