const stmts = new WeakMap();
// Prepares each SQL text once per database handle.
export function prep(db, sql) {
  let m = stmts.get(db);
  if (!m) { m = new Map(); stmts.set(db, m); }
  let st = m.get(sql);
  if (!st) { st = db.prepare(sql); m.set(sql, st); }
  return st;
}

export const companyState = (db, gameId, company) =>
  prep(db, 'SELECT * FROM company_state WHERE game_id = ? AND company = ?').get(gameId, company);

export function ideaOf(ctx, game, company) {
  const cs = companyState(ctx.db, game.id, company);
  if (!cs || !cs.idea_id) return null;
  return ctx.data.ideasFor(game.problemId).find((i) => i.id === cs.idea_id) ?? null;
}

export const playerIn = (db, gameId, admissionId) =>
  prep(db, "SELECT * FROM participants WHERE admission_id = ? AND game_id = ? AND status = 'in_game'")
    .get(admissionId, gameId);

export const ownedRows = (db, gameId, company) =>
  prep(db, 'SELECT * FROM owned WHERE game_id = ? AND company = ?').all(gameId, company);
