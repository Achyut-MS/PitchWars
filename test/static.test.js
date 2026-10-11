import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staticHandler } from '../src/static.js';

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'static-'));
  mkdirSync(join(dir, 'public', 'sub'), { recursive: true });
  mkdirSync(join(dir, 'public', 'emptydir'));
  mkdirSync(join(dir, 'outside'));
  writeFileSync(join(dir, 'public', 'index.html'), '<h1>hi</h1>');
  writeFileSync(join(dir, 'public', 'app.js'), 'x');
  writeFileSync(join(dir, 'public', 'styles.css'), 'x');
  writeFileSync(join(dir, 'public', 'sub', 'index.html'), 'sub index');
  writeFileSync(join(dir, 'public', '.env'), 'dotfile');
  writeFileSync(join(dir, 'secret.txt'), 'top secret');
  writeFileSync(join(dir, 'outside', 'secret.txt'), 'top secret');
  symlinkSync(join(dir, 'secret.txt'), join(dir, 'public', 'link.txt'));
  symlinkSync(join(dir, 'outside'), join(dir, 'public', 'linkdir'));
  const server = http.createServer(staticHandler(join(dir, 'public')));
  await new Promise((r) => server.listen(0, r));
  try { await fn(server.address().port); } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}
const get = (port, path, method = 'GET') => new Promise((resolve) => {
  http.request({ port, path, method }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: b })); }).end();
});

test('the root serves index.html with the right type', async () => {
  await withServer(async (port) => {
    const r = await get(port, '/');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/html/);
    assert.equal(r.body, '<h1>hi</h1>');
  });
});

test('scripts, styles get the right type and unknown files are 404', async () => {
  await withServer(async (port) => {
    assert.match((await get(port, '/app.js')).type, /javascript/);
    assert.match((await get(port, '/styles.css')).type, /text\/css/);
    assert.equal((await get(port, '/nope.css')).status, 404);
  });
});

test('paths that try to leave the folder never return the secret file', async () => {
  await withServer(async (port) => {
    const paths = [
      '/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '//../secret.txt', '/../../etc/passwd',
      '/%2e%2e%2fsecret.txt', '/%252e%252e/secret.txt', '/%252e%252e%252fsecret.txt', '/..%5csecret.txt',
      '/..\\secret.txt', '/%2e%2e%5csecret.txt', '/sub/../../secret.txt', '/etc/passwd', '/%2fetc%2fpasswd',
      '//etc/passwd', '/a%00/../../secret.txt', '/index.html%00.png', '/link.txt', '/linkdir/secret.txt',
      'http://x/../secret.txt', '/.env',
    ];
    for (const p of paths) {
      const r = await get(port, p);
      assert.ok(!/top secret|root:|dotfile/.test(r.body), p);
      assert.ok([400, 403, 404].includes(r.status), `${p} gave ${r.status}`);
    }
  });
});

test('NUL bytes and backslashes are 400', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/app.js%00.png')).status, 400);
    assert.equal((await get(port, '/..%5csecret.txt')).status, 400);
  });
});

test('symlinks that point outside the root are refused', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/link.txt')).status, 403);
    assert.equal((await get(port, '/linkdir/secret.txt')).status, 403);
  });
});

test('directories serve their index.html or 404, never a listing', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/sub')).body, 'sub index');
    assert.equal((await get(port, '/sub/')).body, 'sub index');
    const e = await get(port, '/emptydir/');
    assert.equal(e.status, 404);
    assert.equal(e.body, '');
  });
});

test('query strings are ignored, other methods are refused, HEAD has no body', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/app.js?v=3')).status, 200);
    assert.equal((await get(port, '/app.js', 'POST')).status, 405);
    assert.equal(await new Promise((r) => http.request({ port, path: '/', method: 'POST' }, (res) => { res.resume(); r(res.headers.allow); }).end()), 'GET, HEAD');
    const h = await get(port, '/app.js', 'HEAD');
    assert.equal(h.status, 200);
    assert.equal(h.body, '');
  });
});

test('a malformed escape is a 400, not a crash', async () => {
  await withServer(async (port) => {
    assert.equal((await get(port, '/%E0%A4%A')).status, 400);
    assert.equal((await get(port, '/')).status, 200);
  });
});
