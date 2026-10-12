import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// Pages may load only their own scripts, styles, images and fonts and talk only to this server.
export const PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const inside = (base, file) => file === base || file.startsWith(base + sep);

export function staticHandler(rootDir) {
  const base = resolve(rootDir);
  const reply = (res, status, headers = {}) => { res.writeHead(status, headers); res.end(); };
  return async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { allow: 'GET, HEAD' });
      let path;
      try {
        path = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
      } catch {
        return reply(res, 400);
      }
      if (path.includes('\0') || path.includes('\\')) return reply(res, 400);
      if (path === '/' || path === '') path = '/index.html';
      if (path.split('/').some((seg) => seg.startsWith('.') && seg !== '')) {
        // '..' segments and dotfiles: refuse outright rather than normalising.
        return reply(res, path.split('/').includes('..') ? 403 : 404);
      }
      let file = resolve(join(base, normalize(path)));
      if (!inside(base, file)) return reply(res, 403);
      // Follow symlinks before trusting the path: the real file must be inside the real root.
      let realBase;
      try {
        realBase = await realpath(base);
        file = await realpath(file);
      } catch {
        return reply(res, 404);
      }
      if (!inside(realBase, file)) return reply(res, 403);
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, 'index.html');
        try {
          file = await realpath(file);
          if (!inside(realBase, file)) return reply(res, 403);
          info = await stat(file);
        } catch {
          return reply(res, 404);
        }
      }
      if (!info.isFile()) return reply(res, 404);
      const headers = {
        'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
      };
      if (headers['content-type'].startsWith('text/html')) headers['content-security-policy'] = PAGE_CSP;
      if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
      const body = await readFile(file);
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      if (!res.headersSent) reply(res, 404); else res.end();
    }
  };
}
