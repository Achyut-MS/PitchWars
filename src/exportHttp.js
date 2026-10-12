// Organizer-only downloads. Everything under /export/ needs the per-login token in
// ?token= (and nothing else: no header, no cookie). The token is never logged.
// Paths are matched on the raw request target with strict patterns; file names come
// only from an integer game id and a whitelist of stems, never from user text.
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { exportGame, exportEvent } from './exportData.js';
import { graphsFor, DEFAULT_EXPORT_DIR } from './results.js';
import { pngOf } from './graphs/png.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STEMS = { 'company-vs-company': 'companyVsCompany', 'coin-difference': 'coinDifference', 'role-bars': 'roleBars' };
const TYPES = { png: 'image/png', svg: 'image/svg+xml' };
const GAME_XLSX = /^\/export\/game\/([1-9][0-9]{0,8})\.xlsx$/;
const GAME_IMG = /^\/export\/game\/([1-9][0-9]{0,8})\/(company-vs-company|coin-difference|role-bars)\.(png|svg)$/;
const SAFE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

// A saved image, only if it is a regular file (not a symlink) whose real path stays inside the export dir.
function savedImage(dir, id, stem, ext) {
  try {
    const base = realpathSync(dir);
    const file = join(base, `game-${id}`, `${stem}.${ext}`);
    if (!lstatSync(file).isFile()) return null;
    const real = realpathSync(file);
    if (!real.startsWith(base + sep)) return null;
    return readFileSync(real);
  } catch { return null; }
}

export function createExportHandler({ db, data, ctx, tokens }) {
  // The synchronous part (all the queries) runs inside one read transaction: a consistent snapshot.
  const snapshot = (fn) => {
    if (db.inTransaction) return fn();
    db.exec('BEGIN');
    try { return fn(); } finally { try { db.exec('COMMIT'); } catch { /* nothing open */ } }
  };
  const gameExists = (id) => !!db.prepare('SELECT 1 FROM games WHERE id = ?').get(id);

  return async (req, res) => {
    const target = typeof req.url === 'string' ? req.url : '';
    const q = target.indexOf('?');
    const path = q < 0 ? target : target.slice(0, q);
    if (!path.startsWith('/export/')) return false;
    const send = (status, type, body, extra = {}) => {
      res.writeHead(status, { 'content-type': type, ...SAFE, ...extra });
      res.end(body);
      return true;
    };
    const plain = (status) => send(status, 'text/plain; charset=utf-8', '');
    const token = new URLSearchParams(q < 0 ? '' : target.slice(q + 1)).get('token');
    if (typeof token !== 'string' || !tokens.has(token)) return plain(403);
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405);
    const head = req.method === 'HEAD';
    try {
      if (path === '/export/event.xlsx') {
        const cd = { 'content-disposition': 'attachment; filename="showdown-event.xlsx"' };
        if (head) return send(200, XLSX, undefined, cd);
        return send(200, XLSX, await snapshot(() => exportEvent(db, data)), cd);
      }
      let m = path.match(GAME_XLSX);
      if (m) {
        const id = Number(m[1]);
        if (!gameExists(id)) return plain(404);
        const cd = { 'content-disposition': `attachment; filename="showdown-game-${id}.xlsx"` };
        if (head) return send(200, XLSX, undefined, cd);
        return send(200, XLSX, await snapshot(() => exportGame(db, data, id)), cd);
      }
      m = path.match(GAME_IMG);
      if (m) {
        const id = Number(m[1]);
        const stem = m[2];
        const ext = m[3];
        if (!gameExists(id)) return plain(404);
        const cd = { 'content-disposition': `attachment; filename="${stem}-game-${id}.${ext}"` };
        if (head) return send(200, TYPES[ext], undefined, cd);
        let buf = savedImage(ctx.exportDir ?? DEFAULT_EXPORT_DIR, id, stem, ext);
        if (!buf) {
          const svg = snapshot(() => graphsFor(ctx, id)[STEMS[stem]]);
          buf = ext === 'svg' ? svg : pngOf(svg);
        }
        return send(200, TYPES[ext], buf, cd);
      }
      return plain(404);
    } catch (e) {
      console.error('export failed:', e && e.message ? String(e.message) : 'error');
      if (res.headersSent) { res.end(); return true; }
      return plain(500);
    }
  };
}
