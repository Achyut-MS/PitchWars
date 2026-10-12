import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { readWorkbook } from '../src/xlsx.js';
import { createExportHandler } from '../src/exportHttp.js';

const data = loadData('data');
async function boot(opts = {}) {
  const db = openDb();
  for (let i = 0; i < 10; i++) addParticipant(db, `S${i}`, `P${i}`);
  let i = 0;
  for (const c of ['A', 'B']) for (const r of ROLES) assign(db, `S${i++}`, c, r);
  startGame(db, 1, 0);
  const exportDir = opts.exportDir ?? mkdtempSync(join(tmpdir(), 'exp-http-'));
  const app = createApp({ db, organizerPassword: 'pw', now: () => 5000, data, staticRoot: null, exportDir });
  await new Promise((r) => app.server.listen(0, r));
  return { app, db, exportDir, port: app.server.address().port };
}
const connect = (port) => new Promise((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
const req = (port, path, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
  const r = http.request({ port, path, method, headers }, (res) => { const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
  r.on('error', reject); r.end();
});
const get = (port, path) => req(port, path);
// Sends a raw request line so odd bytes (NUL, %2e, ..) reach the server untouched.
const raw = (port, target) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => s.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
  let buf = ''; s.on('data', (d) => { buf += d; }); s.on('close', () => resolve(Number((buf.match(/^HTTP\/1\.1 (\d+)/) || [])[1] || 0))); s.on('error', () => resolve(0));
});
async function organizerToken(port) {
  const ws = await connect(port);
  const p = next(ws);
  ws.send(JSON.stringify({ type: 'organizer', password: 'pw' }));
  const m = await p;
  ws.terminate();
  return m.token;
}
const done = async (app) => { app.wss.clients.forEach((c) => c.terminate()); await new Promise((r) => app.server.close(r)); };

test('the organizer welcome carries a token, and a wrong password gets none', async () => {
  const { app, port } = await boot();
  assert.match(await organizerToken(port), /^[0-9a-f-]{36}$/);
  const ws = await connect(port);
  const p = next(ws);
  ws.send(JSON.stringify({ type: 'organizer', password: 'bad' }));
  const m = await p;
  assert.equal(m.token, undefined);
  ws.terminate();
  await done(app);
});

test('each organizer login gets a fresh token, and both work', async () => {
  const { app, port } = await boot();
  const a = await organizerToken(port);
  const b = await organizerToken(port);
  assert.notEqual(a, b);
  for (const t of [a, b]) assert.equal((await get(port, `/export/event.xlsx?token=${t}`)).status, 200);
  await done(app);
});

test('without the token every export is refused with 403 and an empty body', async () => {
  const { app, port } = await boot();
  const bad = ['', '?token=', '?token=nope', '?token=00000000-0000-4000-8000-000000000000', '?Token=x', '?token[]=x'];
  for (const path of ['/export/game/1.xlsx', '/export/event.xlsx', '/export/game/1/role-bars.png', '/export/game/1/role-bars.svg', '/export/game/99.xlsx', '/export/anything', '/export/']) {
    for (const q of bad) {
      const r = await get(port, path + q);
      assert.equal(r.status, 403, path + q);
      assert.equal(r.body.length, 0);
    }
  }
  await done(app);
});

test('a token in a header or cookie is not accepted, and a player gets no token', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  for (const h of [{ authorization: `Bearer ${token}` }, { 'x-token': token }, { cookie: `token=${token}` }]) {
    assert.equal((await req(port, '/export/event.xlsx', 'GET', h)).status, 403);
  }
  // a participant socket sees every message the server sends it while an organizer logs in
  const seen = [];
  const pws = await connect(port);
  pws.on('message', (d) => seen.push(d.toString()));
  pws.send(JSON.stringify({ type: 'login', admissionId: 'S0' }));
  pws.send(JSON.stringify({ type: 'organizer', password: 'wrong' }));
  const t2 = await organizerToken(port);
  pws.send(JSON.stringify({ type: 'sync' }));
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(seen.length >= 2);
  const welcome = JSON.parse(seen[0]);
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.token, undefined);
  for (const s of seen) { assert.equal(s.includes(token), false); assert.equal(s.includes(t2), false); assert.equal(/"token"/.test(s), false); }
  pws.terminate();
  await done(app);
});

test('with the token the game workbook downloads as an attachment and opens', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  const r = await get(port, `/export/game/1.xlsx?token=${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(r.headers['content-disposition'], /^attachment; filename="showdown-game-1\.xlsx"$/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal((await readWorkbook(r.body)).some((s) => s.name === 'Players'), true);
  const e = await get(port, `/export/event.xlsx?token=${token}`);
  assert.match(e.headers['content-disposition'], /filename="showdown-event\.xlsx"/);
  await done(app);
});

test('the event workbook and the graph images download too (a running game, no samples)', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  for (const stem of ['company-vs-company', 'coin-difference', 'role-bars']) {
    const png = await get(port, `/export/game/1/${stem}.png?token=${token}`);
    assert.equal(png.status, 200, stem);
    assert.equal(png.body.slice(0, 4).toString('hex'), '89504e47');
    assert.equal(png.headers['x-content-type-options'], 'nosniff');
    assert.equal(png.headers['cache-control'], 'no-store');
    const svg = await get(port, `/export/game/1/${stem}.svg?token=${token}`);
    assert.match(svg.headers['content-type'], /image\/svg\+xml/);
    assert.match(svg.headers['content-disposition'], /^attachment; filename="[a-z-]+-game-1\.svg"$/);
    assert.match(svg.body.toString(), /<svg/);
  }
  await done(app);
});

test('a saved image is served in preference to a generated one', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'exp-saved-'));
  mkdirSync(join(exportDir, 'game-1'));
  writeFileSync(join(exportDir, 'game-1', 'role-bars.svg'), '<svg>SAVED</svg>');
  const { app, port } = await boot({ exportDir });
  const token = await organizerToken(port);
  assert.equal((await get(port, `/export/game/1/role-bars.svg?token=${token}`)).body.toString(), '<svg>SAVED</svg>');
  assert.match((await get(port, `/export/game/1/coin-difference.svg?token=${token}`)).body.toString(), /<svg/);
  await done(app);
});

test('a symlink in the export dir that leaves it is never read', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'exp-link-'));
  const outside = mkdtempSync(join(tmpdir(), 'exp-out-'));
  writeFileSync(join(outside, 'secret.svg'), '<svg>SECRET</svg>');
  mkdirSync(join(exportDir, 'game-1'));
  symlinkSync(join(outside, 'secret.svg'), join(exportDir, 'game-1', 'role-bars.svg'));
  const { app, port } = await boot({ exportDir });
  const token = await organizerToken(port);
  const r = await get(port, `/export/game/1/role-bars.svg?token=${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.toString().includes('SECRET'), false);
  await done(app);
});

test('an unknown game or graph is a 404, not a crash', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  assert.equal((await get(port, `/export/game/99.xlsx?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/99/role-bars.png?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/1/nope.png?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/abc.xlsx?token=${token}`)).status, 404);
  assert.equal((await get(port, `/export/game/1.xlsx.bak?token=${token}`)).status, 404);
  await done(app);
});

test('the game id must be a strict positive integer; odd paths never reach a file', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  const ids = ['1e3', '01', '0', '-1', '1.0', '+1', '%31', '%2e', '%2e%2e', '..', '../1', '1%2f..%2f1', '1%00', '%00', '99999999999999999999', '9999999999', '1 ', '١'];
  for (const id of ids) {
    for (const suffix of ['.xlsx', '/role-bars.png']) {
      const s = await raw(port, `/export/game/${id}${suffix}?token=${token}`);
      assert.ok(s === 404 || s === 400, `${id}${suffix} -> ${s}`);
    }
  }
  for (const p of ['/export/../package.json', '/export/game/1/../../../package.json', '/export/game/1/%2e%2e/role-bars.png', '/export/game/1/role-bars.png%00.svg', '/export//event.xlsx', '/export/game/1/role-bars.png/', '/export/game/1/ROLE-BARS.png', '/export/game/1/role-bars.PNG']) {
    const s = await raw(port, `${p}?token=${token}`);
    assert.ok(s === 404 || s === 400, `${p} -> ${s}`);
  }
  await done(app);
});

test('HEAD gets headers only; POST and others are refused', async () => {
  const { app, port } = await boot();
  const token = await organizerToken(port);
  const h = await req(port, `/export/game/1.xlsx?token=${token}`, 'HEAD');
  assert.equal(h.status, 200);
  assert.equal(h.body.length, 0);
  assert.match(h.headers['content-disposition'], /attachment/);
  assert.equal((await req(port, `/export/game/1.xlsx?token=${token}`, 'POST')).status, 405);
  assert.equal((await req(port, `/export/game/1.xlsx?token=${token}`, 'DELETE')).status, 405);
  assert.equal((await req(port, '/export/game/1.xlsx', 'POST')).status, 403);
  assert.equal((await req(port, `/export/game/99.xlsx?token=${token}`, 'HEAD')).status, 404);
  await done(app);
});

test('the static handler is untouched: other paths still go to it', async () => {
  const db = openDb();
  const app = createApp({ db, organizerPassword: 'pw', data, staticRoot: 'public' });
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  assert.equal((await get(port, '/')).status, 200);
  assert.equal((await get(port, '/exports')).status, 404);
  assert.equal((await raw(port, '/%2e%2e/package.json')) >= 400, true);
  assert.equal((await raw(port, '/export')) >= 400, true);
  await done(app);
});

test('a failing export answers 500 with no detail and never logs the token', async () => {
  const logs = [];
  const orig = [console.error, console.log, console.warn];
  console.error = console.log = console.warn = (...a) => logs.push(a.map(String).join(' '));
  try {
    const tokens = new Set(['tok-secret']);
    const db = { prepare() { throw new Error('boom'); }, exec() {}, inTransaction: false };
    const h = createExportHandler({ db, data, ctx: { db, data, now: () => 0 }, tokens });
    const out = { head: null, body: null };
    const res = { writeHead(s, hd) { out.head = [s, hd]; }, end(b) { out.body = b; }, headersSent: false };
    assert.equal(await h({ method: 'GET', url: '/export/game/1.xlsx?token=tok-secret' }, res), true);
    assert.ok([404, 500].includes(out.head[0]));
    assert.equal(String(out.body || '').includes('boom'), false);
  } finally { [console.error, console.log, console.warn] = orig; }
  assert.equal(logs.some((l) => l.includes('tok-secret')), false);
});

test('a big event workbook does not hold the event loop for long', async () => {
  const { app, port, db } = await boot();
  const token = await organizerToken(port);
  const ins = db.prepare("INSERT INTO events (ts, game_id, admission_id, type, payload) VALUES (?, 1, 'S0', 'login', '{}')");
  db.exec('BEGIN'); for (let i = 0; i < 5000; i++) ins.run(i); db.exec('COMMIT');
  let worst = 0; let last = Date.now();
  const iv = setInterval(() => { const n = Date.now(); worst = Math.max(worst, n - last); last = n; }, 10);
  const r = await get(port, `/export/event.xlsx?token=${token}`);
  clearInterval(iv);
  assert.equal(r.status, 200);
  assert.ok(worst < 1500, `event loop stalled ${worst} ms`);
  await done(app);
});

test('browser: the token is added to download links only at click time and never rendered', async () => {
  const { readFileSync } = await import('node:fs');
  const org = readFileSync('public/organizer.js', 'utf8');
  const render = readFileSync('public/render-organizer.js', 'utf8');
  assert.match(org, /a\[data-export\], a\[data-graph\]/);
  assert.match(org, /\?token=/);
  assert.match(org, /setTimeout\(\(\) => a\.setAttribute\('href', plain\), 0\)/); // restored right after the click
  assert.equal(/token/i.test(render), false); // the renderer never sees the token
});
