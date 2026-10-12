import { mkdirSync, existsSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { logEvent } from './events.js';
import { phaseAt } from './phases.js';
import { endGame } from './lobby.js';
import { graphData } from './graphs/data.js';
import { companyVsCompany, coinDifference, roleBars } from './graphs/svg.js';
import { pngOf } from './graphs/png.js';

export const DEFAULT_EXPORT_DIR = 'data/graphs';

export function graphsFor(ctx, gameId) {
  const { series, final } = graphData(ctx.db, gameId);
  return { companyVsCompany: companyVsCompany(series), coinDifference: coinDifference(series), roleBars: roleBars(final) };
}

const STEMS = { companyVsCompany: 'company-vs-company', coinDifference: 'coin-difference', roleBars: 'role-bars' };

// Temp file in the same folder, then rename: a reader never sees half a file.
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
    throw e;
  }
}

// Node's recursive mkdir can spin forever under /proc, so make folders one level at a time.
function ensureDir(dir, depth = 0) {
  if (existsSync(dir)) return;
  if (depth > 8) throw new Error('folder is too deep');
  ensureDir(dirname(dir), depth + 1);
  mkdirSync(dir);
}

// File names come only from an integer game id and fixed stems, never from user text.
export function saveGameImages(ctx, gameId, dir) {
  if (!Number.isSafeInteger(gameId) || gameId < 1) throw new Error('game id must be a positive integer');
  const graphs = graphsFor(ctx, gameId);
  const folder = join(dir, `game-${gameId}`);
  ensureDir(folder);
  const files = [];
  for (const [key, svg] of Object.entries(graphs)) {
    const svgFile = join(folder, `${STEMS[key]}.svg`);
    const pngFile = join(folder, `${STEMS[key]}.png`);
    writeAtomic(svgFile, svg);
    writeAtomic(pngFile, pngOf(svg));
    files.push(svgFile, pngFile);
  }
  return files;
}

function markRevealed(ctx, game) {
  const info = ctx.db.prepare('UPDATE games SET revealed_at = ? WHERE id = ? AND revealed_at IS NULL').run(ctx.now(), game.id);
  if (info.changes === 0) return false;
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'graphs_revealed' });
  try {
    saveGameImages(ctx, game.id, ctx.exportDir ?? DEFAULT_EXPORT_DIR);
  } catch (e) {
    logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'image_save_failed', payload: { message: String(e && e.message) } });
    console.error('image save failed:', e);
  }
  return true;
}

export function revealGame(ctx, game) {
  if (phaseAt(game, ctx.now()).phase !== 'ended') throw new Error('the competition is still running');
  markRevealed(ctx, game);
}

export function nextGame(ctx, game) {
  markRevealed(ctx, game);
  endGame(ctx.db, game.id, ctx.now());
  logEvent(ctx.db, { ts: ctx.now(), gameId: game.id, type: 'next_game' });
}
