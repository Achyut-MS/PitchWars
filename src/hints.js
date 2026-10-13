import { logEvent } from './events.js';
import { phaseAt, phaseWindow } from './phases.js';
import { roleRates } from './levels.js';
import { applicable } from './shop.js';
import { ideaOf, ownedRows } from './state.js';

const GAP = 10;
const COOLDOWN_MS = 60_000;
const ROLES = ['CTO', 'CMO', 'COO'];
const FAMILIES = { CTO: ['Core Features'], CMO: ['Target User', 'Ad Campaign'] };
const GENERIC = 'Your part of the sales is holding the company back. Check your shop section.';

// Built from the company's own state only: nothing about the rival is read.
export function suggest(ctx, game, company, role) {
  if (role === 'COO') return GENERIC;
  const idea = ideaOf(ctx, game, company);
  if (!idea) return GENERIC;
  const owned = new Map(ctx.db.prepare('SELECT * FROM owned WHERE game_id=? AND company=?').all(game.id, company).map((o) => [o.family, ctx.data.item(o.item_id)]));
  let best = null;
  for (const item of ctx.data.catalog) {
    if (!FAMILIES[role].includes(item.section) || !applicable(item, idea) || item.tierPoints == null) continue;
    const have = owned.get(item.family);
    if (item.tierPoints !== (have ? have.tierPoints : 0) + 1) continue;
    const cost = item.cost - (have ? have.cost : 0);
    if (!best || cost < best.cost) best = { item, have, cost };
  }
  if (!best) return GENERIC;
  return best.have
    ? `Upgrade ${best.item.name} from ${best.have.option} to ${best.item.option} for ${best.cost} coins`
    : `Buy ${best.item.name} (${best.item.option}) for ${best.cost} coins`;
}

export function latestHint(db, gameId, company, role, t) {
  const h = db.prepare('SELECT id, text, ts FROM hints WHERE game_id=? AND company=? AND role=? ORDER BY ts DESC, id DESC LIMIT 1').get(gameId, company, role);
  return h && t >= h.ts && t - h.ts < COOLDOWN_MS ? h : null;
}

export function evaluateHints(ctx, game) {
  const t = ctx.now();
  if (phaseAt(game, t).phase !== 'competition') return;
  const start = phaseWindow(game, 'competition').start;

  // Base rates only: attack and market-event modifiers must not time a hint.
  const baseRates = (company) => roleRates(ctx.data, ownedRows(ctx.db, game.id, company).map((o) => o.item_id));
  const rates = { A: baseRates('A'), B: baseRates('B') };
  ctx.db.transaction(() => {
    for (const h of ctx.db.prepare('SELECT * FROM hints WHERE game_id=? AND acted IS NULL AND ts + ? <= ?').all(game.id, COOLDOWN_MS, t)) {
      const asked = ctx.db.prepare(
        `SELECT 1 FROM requests r JOIN participants p ON p.admission_id = r.requested_by AND p.game_id = r.game_id
         WHERE r.game_id=? AND r.company=? AND p.role=? AND r.requested_at >= ? AND r.requested_at < ?`
      ).get(game.id, h.company, h.role, h.ts, h.ts + COOLDOWN_MS);
      ctx.db.prepare('UPDATE hints SET acted=? WHERE id=?').run(asked ? 1 : 0, h.id);
      logEvent(ctx.db, { ts: t, gameId: game.id, type: 'hint_result', payload: { hintId: h.id, company: h.company, role: h.role, acted: !!asked } });
    }

    for (const company of ['A', 'B']) {
      const rival = company === 'A' ? 'B' : 'A';
      for (const role of ROLES) {
        if (rates[rival][role] - rates[company][role] < GAP - 1e-9) continue;
        if (latestHint(ctx.db, game.id, company, role, t)) continue;
        const key = `${company}:${role}:${Math.floor((t - start) / COOLDOWN_MS)}`;
        const text = suggest(ctx, game, company, role);
        const info = ctx.db.prepare('INSERT OR IGNORE INTO hints (game_id, company, role, ts, text, hint_key) VALUES (?, ?, ?, ?, ?, ?)').run(game.id, company, role, t, text, key);
        if (!info.changes) continue;
        logEvent(ctx.db, { ts: t, gameId: game.id, type: 'hint_shown', payload: { hintId: Number(info.lastInsertRowid), company, role, text } });
      }
    }
  })();
}
