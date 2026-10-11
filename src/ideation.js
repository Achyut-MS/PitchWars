import { logEvent } from './events.js';
import { phaseAt, endIdeationEarly } from './phases.js';
import { companyState, playerIn } from './state.js';

function requireIdeation(ctx, game) {
  if (phaseAt(game, ctx.now()).phase !== 'ideation') throw new Error('ideation is not open');
}

function requireIdea(ctx, game, ideaId) {
  if (!ctx.data.ideasFor(game.problemId).some((i) => i.id === ideaId)) throw new Error('unknown idea');
}

function requirePlayer(ctx, game, admissionId) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  return p;
}

// Callers may hold a stale game snapshot (an earlier early end would be missing
// from it), so every rule re-reads the saved seconds from the database.
function freshGame(ctx, game) {
  const row = ctx.db.prepare('SELECT ideation_saved_sec AS s FROM games WHERE id = ?').get(game.id);
  return { ...game, ideationSavedSec: row ? row.s || 0 : game.ideationSavedSec || 0 };
}

export function tally(db, gameId, company) {
  const out = {};
  for (const r of db.prepare('SELECT idea_id, COUNT(*) AS n FROM votes WHERE game_id = ? AND company = ? GROUP BY idea_id').all(gameId, company)) {
    out[r.idea_id] = r.n;
  }
  return out;
}

export function castVote(ctx, game, admissionId, ideaId) {
  game = freshGame(ctx, game);
  const p = requirePlayer(ctx, game, admissionId);
  requireIdeation(ctx, game);
  requireIdea(ctx, game, ideaId);
  if (companyState(ctx.db, game.id, p.company).idea_id) throw new Error('your company has already picked');
  const prev = ctx.db.prepare('SELECT idea_id FROM votes WHERE game_id = ? AND admission_id = ?').get(game.id, admissionId);
  ctx.db.prepare(
    `INSERT INTO votes (game_id, admission_id, company, idea_id, ts) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (game_id, admission_id) DO UPDATE SET idea_id = excluded.idea_id, ts = excluded.ts`
  ).run(game.id, admissionId, p.company, ideaId, ctx.now());
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'vote',
    payload: { ideaId, previous: prev ? prev.idea_id : null, company: p.company } });
}

export function pickIdea(ctx, game, admissionId, ideaId) {
  game = freshGame(ctx, game);
  const p = requirePlayer(ctx, game, admissionId);
  if (p.role !== 'CEO') throw new Error('only the CEO can pick');
  requireIdeation(ctx, game);
  requireIdea(ctx, game, ideaId);
  let endedEarly = false;
  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    if (companyState(ctx.db, game.id, p.company).idea_id) throw new Error('your company has already picked');
    ctx.db.prepare(
      "UPDATE company_state SET idea_id=?, picked_by=?, picked_at=?, pick_source='ceo' WHERE game_id=? AND company=?"
    ).run(ideaId, admissionId, ctx.now(), game.id, p.company);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, admissionId, type: 'idea_pick', payload: { ideaId, company: p.company } });
    endedEarly = maybeEndEarly(ctx, game);
    ctx.db.exec('COMMIT');
  } catch (e) {
    ctx.db.exec('ROLLBACK');
    throw e;
  }
  return { endedEarly };
}

function maybeEndEarly(ctx, game) {
  const both = ['A', 'B'].every((c) => companyState(ctx.db, game.id, c).idea_id);
  if (!both) return false;
  const before = game.ideationSavedSec || 0;
  const next = endIdeationEarly(game, ctx.now()); // throws if ideation is already over
  ctx.db.prepare('UPDATE games SET ideation_saved_sec = ? WHERE id = ?').run(next.ideationSavedSec, game.id);
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'ideation_end_early', payload: { savedSec: next.ideationSavedSec - before } });
  return true;
}

export function resolveIdeation(ctx, game, rng = Math.random) {
  const ideas = ctx.data.ideasFor(game.problemId).map((i) => i.id);
  for (const company of ['A', 'B']) {
    if (companyState(ctx.db, game.id, company).idea_id) continue;
    const counts = tally(ctx.db, game.id, company);
    const best = Math.max(0, ...Object.values(counts));
    const candidates = best === 0 ? ideas : ideas.filter((id) => counts[id] === best);
    const chosen = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
    ctx.db.prepare(
      "UPDATE company_state SET idea_id=?, picked_at=?, pick_source='auto' WHERE game_id=? AND company=?"
    ).run(chosen, ctx.now(), game.id, company);
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'idea_auto_pick',
      payload: { company, ideaId: chosen, tied: candidates.length > 1, votes: counts } });
  }
}
