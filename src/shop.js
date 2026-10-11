import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { ideaOf, playerIn } from './state.js';

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
