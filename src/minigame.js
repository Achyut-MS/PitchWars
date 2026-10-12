import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { playerIn } from './state.js';
import { isLocked } from './attacks.js';
import { PUZZLES, KINDS, NAMES } from './puzzles/index.js';
import { mulberry32 } from './puzzles/rng.js';

export const FREE_SKIPS = 2;
export const SKIP_PENALTY = 10;
const MAX_ATTEMPTS = 5;
const MAX_ANSWER_CHARS = 20000;

export const levelFor = (solved) => Math.min(4, 1 + Math.floor(solved / 2));
export const rewardFor = (level) => (level <= 2 ? 20 : 40);

export const openPuzzle = (db, gameId, company) =>
  db.prepare('SELECT * FROM puzzle_sessions WHERE game_id=? AND company=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1').get(gameId, company);

const count = (db, gameId, company, result) =>
  db.prepare('SELECT COUNT(*) AS n FROM puzzle_sessions WHERE game_id=? AND company=? AND result=?').get(gameId, company, result).n;

// Only what the player may see. The stored solution and seed never leave the server.
export function publicPuzzle(db, row) {
  const skipped = count(db, row.game_id, row.company, 'skipped');
  return {
    id: row.id, kind: row.kind, name: NAMES[row.kind], level: row.level, reward: rewardFor(row.level),
    puzzle: JSON.parse(row.puzzle), skipsFreeLeft: Math.max(0, FREE_SKIPS - skipped),
  };
}

function cfo(ctx, game, admissionId) {
  const p = playerIn(ctx.db, game.id, admissionId);
  if (!p) throw new Error('not in this game');
  if (p.role !== 'CFO') throw new Error('only the CFO can play puzzles');
  if (phaseAt(game, ctx.now()).phase !== 'competition') throw new Error('puzzles are only open during the competition');
  return p;
}

// Kinds verified never to throw (2000 seeds x 4 levels) and to take about 1 ms.
export const FALLBACK_KINDS = ['sets', 'tower', 'mosaic'];

export class NoPuzzleOpenError extends Error {
  constructor() { super('no puzzle is open'); this.name = 'NoPuzzleOpenError'; }
}

const attemptSeed = (base, attempt) => (Math.imul(base >>> 0, 2654435761) + attempt * 40503 + 1) >>> 0;

// Never throws and always returns a puzzle: every attempt has its own seed, Lits (which can be slow)
// is tried at most once, and if all attempts fail a cheap always-working kind is used.
function generateOne(level, base, kinds) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let kind = kinds[attempt < 2 ? 0 : (attempt - 1) % kinds.length];
    if (attempt === 1 && kind === 'lits') kind = kinds[1 % kinds.length];
    try {
      const made = PUZZLES[kind].generate(level, mulberry32(attemptSeed(base, attempt)));
      if (made && made.puzzle !== undefined && made.solution !== undefined) return { kind, made };
    } catch { /* try the next attempt */ }
  }
  for (let i = 0; i < FALLBACK_KINDS.length * 3; i++) {
    const kind = FALLBACK_KINDS[i % FALLBACK_KINDS.length];
    try {
      const made = PUZZLES[kind].generate(level, mulberry32(attemptSeed(base, MAX_ATTEMPTS + i)));
      if (made) return { kind, made };
    } catch { /* next */ }
  }
  // Unreachable in practice; level 1 sets as a last resort keeps the contract.
  return { kind: 'sets', made: PUZZLES.sets.generate(1, mulberry32(1)) };
}

export function startPuzzle(ctx, game, admissionId, rng) {
  const p = cfo(ctx, game, admissionId);
  return ctx.db.transaction(() => {
    const open = openPuzzle(ctx.db, game.id, p.company);
    if (open) return open;
    const total = ctx.db.prepare('SELECT COUNT(*) AS n FROM puzzle_sessions WHERE game_id=? AND company=?').get(game.id, p.company).n;
    // Seeded per game, company and session number so a restart re-serves the same puzzle.
    const base = rng ? Math.floor(rng() * 4294967296) : (game.id * 7919 + (p.company === 'A' ? 1 : 2) * 104729 + total * 15485863) >>> 0;
    const pick = rng ?? mulberry32(base);
    const level = levelFor(count(ctx.db, game.id, p.company, 'solved'));
    const last = ctx.db.prepare('SELECT kind FROM puzzle_sessions WHERE game_id=? AND company=? ORDER BY id DESC LIMIT 1').get(game.id, p.company);
    const others = KINDS.filter((k) => !last || k !== last.kind);
    const first = Math.floor(pick() * others.length);
    const order = [...others.slice(first), ...others.slice(0, first)];
    if (last) order.push(last.kind);
    // Lits is slow and can fail: never try it before the other kinds in the retry order.
    const lits = order.indexOf('lits');
    if (lits > 0) { order.splice(lits, 1); order.push('lits'); }
    const got = generateOne(level, base, order);
    const now = ctx.now();
    const info = ctx.db.prepare(
      'INSERT INTO puzzle_sessions (game_id, company, admission_id, kind, level, puzzle, solution, shown_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(game.id, p.company, admissionId, got.kind, level, JSON.stringify(got.made.puzzle), JSON.stringify(got.made.solution), now);
    logEvent(ctx.db, { ts: now, gameId: game.id, admissionId, type: 'puzzle_shown', payload: { sessionId: Number(info.lastInsertRowid), kind: got.kind, level } });
    return ctx.db.prepare('SELECT * FROM puzzle_sessions WHERE id=?').get(info.lastInsertRowid);
  }).immediate();
}

function sane(answer) {
  try {
    const s = JSON.stringify(answer);
    return typeof s === 'string' && s.length <= MAX_ANSWER_CHARS;
  } catch { return false; }
}

export function submitPuzzle(ctx, game, admissionId, answer) {
  const p = cfo(ctx, game, admissionId);
  return ctx.db.transaction(() => {
    const now = ctx.now();
    const row = openPuzzle(ctx.db, game.id, p.company);
    if (!row) throw new NoPuzzleOpenError();
    let ok = false;
    if (sane(answer)) {
      try { ok = PUZZLES[row.kind].check(JSON.parse(row.puzzle), JSON.parse(JSON.stringify(answer))) === true; } catch { ok = false; }
    }
    if (!ok) {
      ctx.db.prepare('UPDATE puzzle_sessions SET wrong_tries = wrong_tries + 1 WHERE id=?').run(row.id);
      logEvent(ctx.db, { ts: now, gameId: game.id, admissionId, type: 'puzzle_wrong', payload: { sessionId: row.id, kind: row.kind, level: row.level, wrongTries: row.wrong_tries + 1 } });
      return { ok: false, coins: 0 };
    }
    const halved = isLocked(ctx, game, p.company, 'minigame_half', now);
    const reward = rewardFor(row.level);
    const coins = halved ? Math.floor(reward / 2) : reward;
    ctx.db.prepare("UPDATE puzzle_sessions SET ended_at=?, result='solved', coins=? WHERE id=?").run(now, coins, row.id);
    ctx.db.prepare('UPDATE company_state SET wallet = wallet + ?, mini_coins = mini_coins + ? WHERE game_id=? AND company=?').run(coins, coins, game.id, p.company);
    logEvent(ctx.db, { ts: now, gameId: game.id, admissionId, type: 'puzzle_solved',
      payload: { sessionId: row.id, kind: row.kind, level: row.level, coins, halved, seconds: Math.round((now - row.shown_at) / 1000), wrongTries: row.wrong_tries } });
    return { ok: true, coins };
  }).immediate();
}

export function skipPuzzle(ctx, game, admissionId) {
  const p = cfo(ctx, game, admissionId);
  return ctx.db.transaction(() => {
    const now = ctx.now();
    const row = openPuzzle(ctx.db, game.id, p.company);
    if (!row) throw new NoPuzzleOpenError();
    const penalty = count(ctx.db, game.id, p.company, 'skipped') >= FREE_SKIPS ? SKIP_PENALTY : 0;
    ctx.db.prepare("UPDATE puzzle_sessions SET ended_at=?, result='skipped', penalty=? WHERE id=?").run(now, penalty, row.id);
    if (penalty) ctx.db.prepare('UPDATE company_state SET wallet = wallet - ? WHERE game_id=? AND company=?').run(penalty, game.id, p.company);
    logEvent(ctx.db, { ts: now, gameId: game.id, admissionId, type: 'puzzle_skipped',
      payload: { sessionId: row.id, kind: row.kind, level: row.level, penalty, free: penalty === 0, seconds: Math.round((now - row.shown_at) / 1000) } });
    return { penalty };
  }).immediate();
}
