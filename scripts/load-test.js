// Load test: real server, real WebSocket clients, real time. See docs/load-test.md.
//   npm run load-test                         full profiles (81 connections, then 14 devices)
//   LOAD_SMOKE=1 npm run load-test            14 clients, 10 s window (under 40 s)
//   LOAD_URL=ws://10.42.0.1 ORGANIZER_PASSWORD=... LOAD_PROFILE=full npm run load-test   against a running server
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import WebSocket from 'ws';
import { summarize, gapsOf, jitterOf, evaluate, fmtTable } from './load-stats.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const num = (k, d) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
const SMOKE = env.LOAD_SMOKE === '1';
const REMOTE = env.LOAD_URL || null;
const PASSWORD = env.ORGANIZER_PASSWORD || 'load-test-password';
const WINDOW_S = num('LOAD_WINDOW_S', SMOKE ? 10 : 90);
const SHOP_S = num('LOAD_SHOP_S', SMOKE ? 2 : 25);
const IDEATION_S = num('LOAD_IDEATION_S', SMOKE ? 1 : 6);
const LIMITS = {
  jitterP99: num('LOAD_MAX_JITTER_P99_MS', 500), pushP95: num('LOAD_MAX_PUSH_P95_MS', 1000),
  rssGrowthMb: num('LOAD_MAX_RSS_GROWTH_MB', 100), lagP99: num('LOAD_MAX_LAG_P99_MS', 200), reconnectMs: num('LOAD_MAX_RECONNECT_MS', 10000),
};
const PROFILES = SMOKE ? [{ name: 'smoke (14 devices)', idle: 3 }]
  : [{ name: 'full (10 players, organizer, 70 idle lobby clients)', idle: 70, key: 'full' }, { name: '14 devices (10 players, organizer, 3 spectators)', idle: 3, key: 'devices' }]
    .filter((p) => !env.LOAD_PROFILE || env.LOAD_PROFILE === p.key);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
const ITEMS = { CTO: ['F01-B', 'F02-B', 'HC01', 'SC01'], CMO: ['M01-N', 'M01-L', 'M02', 'M03'], COO: ['O01', 'O02', 'O03', 'O04-H', 'O06'], CFO: ['O01'], CEO: ['M02'] };
const IDEAS = ['H1', 'H2', 'H3', 'S1', 'S2', 'S3'];
// Error texts that mean the harness or server is broken, not a game rule refusing an invalid move.
const BROKEN = /^(bad_message|bad_password|too_many_attempts|unknown)/;

// ---------------------------------------------------------------- clients
class Client {
  constructor(name, url, role, rec) { Object.assign(this, { name, url, role, rec, view: null, phase: null, ticks: [], pending: null, ws: null }); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.on('message', (d) => this.onMessage(d));
      ws.on('error', (e) => { if (!this.closing && ws === this.ws) this.rec.errors.push(`${this.name}: socket ${e.message}`); reject(e); });
      ws.on('close', () => { if (!this.closing && ws === this.ws) this.rec.errors.push(`${this.name}: unexpected close`); });
      ws.once('open', () => resolve(this));
    });
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  async close() { this.closing = true; this.ws.terminate(); }
  onMessage(d) {
    const now = performance.now();
    const m = JSON.parse(d.toString());
    if (m.type === 'tick') {
      this.phase = m.phase;
      if (this.rec.measuring) this.ticks.push(now);
      return;
    }
    if (m.type === 'welcome') { this.welcomed = true; return; }
    if (m.type === 'state') {
      this.view = m.view;
      this.phase = (m.view.clock && m.view.clock.phase) || (m.view.game && m.view.game.clock && m.view.game.clock.phase) || this.phase;
      this.stateAt = now;
      for (const w of this.watches || []) if (!w.done && now >= w.t) { w.done = true; this.rec[w.bucket].push(now - w.t); }
    }
    if (m.type === 'error' && BROKEN.test(m.error)) this.rec.errors.push(`${this.name}: ${m.error}`);
    else if (m.type === 'error') this.rec.refused++;
    // A refused action changes nothing, so nobody else is pushed anything: do not time it.
    if (this.pending && m.type === 'error') for (const w of this.pending.mine) w.done = true;
    if (this.pending && (m.type === 'state' || m.type === 'error')) {
      this.rec.actor.push(now - this.pending.t);
      this.pending = null;
    }
  }
  // Sends an action, records when, and asks a few other clients to time their next state push.
  act(msg, peers) {
    if (this.pending) return; // one outstanding action per human
    const t = performance.now();
    const mine = [];
    this.pending = { t, msg: msg.type, mine };
    this.rec.sent++;
    const bucket = this.phase === 'competition' ? 'othersComp' : 'others';
    for (let i = 0; i < 3; i++) {
      const p = pick(peers);
      if (p === this) continue;
      const w = { t, bucket, done: false };
      mine.push(w);
      (p.watches ||= []).push(w);
      if (p.watches.length > 50) p.watches.shift();
    }
    this.send(msg);
  }
}

function playerAction(c, burst) {
  const v = c.view;
  if (!v || v.screen === 'lobby') return null;
  const ph = c.phase;
  if (ph === 'ideation') {
    return { type: 'vote', ideaId: pick(IDEAS) };
  }
  if (ph === 'shop') {
    const shop = v.shop || {};
    if (c.role === 'CFO' && shop.queue && shop.queue.length && Math.random() < 0.8) {
      const head = shop.queue.find((r) => r.head) || shop.queue[0];
      return { type: 'cfo_decide', requestId: head.id, approve: Math.random() < 0.8 };
    }
    if (c.role === 'CEO' && shop.awaitingCeo && shop.awaitingCeo.length && Math.random() < 0.8) return { type: 'ceo_decide', requestId: shop.awaitingCeo[0].id, approve: true };
    return { type: 'request', itemId: pick(ITEMS[c.role]) };
  }
  if (ph === 'competition') {
    if (c.role === 'CEO' && (burst || Math.random() < 0.3)) return { type: 'attack', key: pick(['price_squeeze', 'market_crash', 'ad_blackout']) };
    if (c.role === 'CFO' && !burst) {
      if (!(v.competition && v.competition.puzzle)) return { type: 'puzzle_next' };
      return Math.random() < 0.5 ? { type: 'puzzle_skip' } : { type: 'puzzle_submit', answer: { wrong: true } };
    }
    return { type: 'sync' };
  }
  return { type: 'sync' };
}

// ---------------------------------------------------------------- server process
async function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
const rssKb = (pid) => Number((readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/) || [0, 0])[1]);
const cpuSec = (pid) => { const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (Number(f[11]) + Number(f[12])) / 100; };

async function startServer(dir) {
  const port = await freePort();
  const dbFile = join(dir, 'data', 'load.db');
  const lagFile = join(dir, 'lag.json');
  const child = spawn(process.execPath, ['--import', join(ROOT, 'scripts', 'load-lag-preload.js'), join(ROOT, 'src', 'index.js')], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, ORGANIZER_PASSWORD: PASSWORD, PORT: String(port), DB_FILE: dbFile, BACKUP_DIR: join(dir, 'backups'), LOAD_LAG_FILE: lagFile },
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; ; i++) { // wait until the port accepts connections
    if (child.exitCode !== null) throw new Error(`server exited: ${log}`);
    if (i > 300) throw new Error(`server did not start: ${log}`);
    if (/listening/.test(log) && await new Promise((r) => { const s = net.connect(port, '127.0.0.1', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); })) break;
    await sleep(100);
  }
  return { child, port, dbFile, lagFile, url: `ws://127.0.0.1:${port}`, log: () => log };
}
const dbBytes = (f) => [f, `${f}-wal`].reduce((n, p) => n + (existsSync(p) ? statSync(p).size : 0), 0);

// ---------------------------------------------------------------- one profile
async function runProfile(profile) {
  const dir = mkdtempSync(join(tmpdir(), 'load-test-'));
  let srv = null;
  const rec = { measuring: false, errors: [], refused: 0, sent: 0, actor: [], others: [], othersComp: [] };
  const clients = [];
  try {
    if (!REMOTE) srv = await startServer(dir);
    const url = REMOTE || srv.url;
    const pid = srv && srv.child.pid;
    const tag = (i) => `LT${String(i).padStart(2, '0')}`;
    const total = 10 + profile.idle;

    const org = new Client('organizer', url, 'ORG', rec);
    await org.connect();
    org.send({ type: 'organizer', password: PASSWORD });
    await sleep(300);
    org.send({ type: 'roster_import', text: Array.from({ length: total }, (_, i) => `${tag(i)},Load ${i}`).join('\n') });
    await sleep(300);
    for (let i = 0; i < 10; i++) org.send({ type: 'assign', admissionId: tag(i), company: i < 5 ? 'A' : 'B', role: ROLES[i % 5] });
    await sleep(500);
    org.send({ type: 'start_game', problemId: 1 });
    await sleep(300);

    const players = [];
    const idle = [];
    for (let i = 0; i < total; i++) {
      const c = new Client(tag(i), url, i < 10 ? ROLES[i % 5] : null, rec);
      c.company = i < 5 ? 'A' : 'B';
      await c.connect();
      c.send({ type: 'login', admissionId: tag(i) });
      (i < 10 ? players : idle).push(c);
      if (i % 10 === 9) await sleep(50);
    }
    clients.push(org, ...players, ...idle);
    await sleep(500);
    for (const c of [...players, ...idle]) c.send({ type: 'sync' });
    await sleep(1500);
    const orgOnly = rec.errors.slice();
    if (orgOnly.length) throw new Error(`setup failed: ${orgOnly.slice(0, 3).join('; ')}`);
    const everyone = clients;

    // ---- measurement starts
    let rss0 = pid ? rssKb(pid) : null; let rssMax = rss0; const cpu0 = pid ? cpuSec(pid) : null; const db0 = srv ? dbBytes(srv.dbFile) : null;
    if (pid) process.kill(pid, 'SIGUSR2');
    rec.measuring = true;
    const t0 = performance.now();
    const sampler = setInterval(() => { if (pid) try { rssMax = Math.max(rssMax, rssKb(pid)); } catch { /* gone */ } }, 1000);

    let running = true;
    const loops = players.map(async (c) => {
      await sleep(rand(0, 2000));
      while (running) {
        const a = playerAction(c, false);
        if (a) c.act(a, everyone);
        await sleep(rand(2000, 5000));
      }
    });
    const idleLoops = idle.map(async (c) => { while (running) { await sleep(rand(8000, 20000)); if (running && Math.random() < 0.3) c.send({ type: 'sync' }); } });
    const burst = async (label) => {
      await Promise.all(players.map(async (c) => { await sleep(rand(0, 900)); const a = playerAction(c, true); if (a) c.act(a, everyone); }));
      console.log(`  burst: ${label}`);
    };
    const waitPhase = async (ph, ms) => { const end = performance.now() + ms; while (performance.now() < end && !(org.phase === ph)) await sleep(100); };

    org.send({ type: 'skip_phase' }); // briefing -> ideation
    await waitPhase('ideation', 3000);
    await burst('all 10 vote');
    await sleep(IDEATION_S * 1000);
    for (const c of players.filter((x) => x.role === 'CEO')) { c.pending = null; c.act({ type: 'pick', ideaId: c.company === 'A' ? 'H1' : 'S1' }, everyone); } // both CEOs pick: ideation ends
    await sleep(800);
    if (org.phase === 'ideation') org.send({ type: 'skip_phase' });
    await waitPhase('shop', 3000);
    console.log(`  phase: ${org.phase}`);
    await burst('all 10 request/decide in the shop');
    await sleep(SHOP_S * 1000);
    org.send({ type: 'skip_phase' }); await sleep(600); // shop -> summary
    org.send({ type: 'skip_phase' }); // summary -> competition
    await waitPhase('competition', 3000);
    console.log(`  phase: ${org.phase}; measured window ${WINDOW_S} s in the competition`);
    const wStart = performance.now();
    const cpuW0 = pid ? cpuSec(pid) : null;
    for (const f of [0.25, 0.5, 0.75]) {
      await sleep(Math.max(0, wStart + WINDOW_S * 1000 * f - performance.now()));
      await burst(`competition at ${Math.round(f * 100)}% (all clients sync, both CEOs attack, CFOs puzzle)`);
    }
    await sleep(Math.max(0, wStart + WINDOW_S * 1000 - performance.now()));
    const wEnd = performance.now();
    const cpuW1 = pid ? cpuSec(pid) : null;
    running = false;
    rec.measuring = false;
    clearInterval(sampler);
    await Promise.all([...loops, ...idleLoops]);
    await sleep(1000); // let in-flight replies land
    const lag = srv && existsSync(srv.lagFile) ? JSON.parse(readFileSync(srv.lagFile, 'utf8')) : null;
    const rss1 = pid ? rssKb(pid) : null;
    const dbGrowth = srv ? dbBytes(srv.dbFile) - db0 : null;

    let dropped = 0;
    for (const c of clients) if (c.pending) dropped++; // sent, never answered
    for (const c of clients) for (const w of c.watches || []) if (!w.done && performance.now() - w.t > 5000) dropped++;
    const tickClients = clients.filter((c) => c.ticks.length > 1);
    const gaps = tickClients.flatMap((c) => gapsOf(c.ticks));
    const jitter = jitterOf(gaps, 1000);

    // ---- reconnect storm: everybody drops and comes back at once
    const storm0 = performance.now();
    clients.forEach((c) => { c.closing = true; c.ws.terminate(); });
    const recovered = [];
    await Promise.all(clients.map(async (c) => {
      c.closing = false; c.view = null; c.stateAt = 0; c.pending = null;
      const nc = c;
      for (let attempt = 0; attempt < 20; attempt++) {
        try { await nc.connect(); break; } catch { await sleep(250); }
      }
      if (c === org) nc.send({ type: 'organizer', password: PASSWORD }); else nc.send({ type: 'login', admissionId: c.name });
      await sleep(50);
      nc.send({ type: 'sync' });
      for (let i = 0; i < 200 && !nc.stateAt; i++) await sleep(50);
      if (nc.stateAt) recovered.push(performance.now() - storm0); else rec.errors.push(`${c.name}: no state after reconnect`);
    }));
    const stormMs = recovered.length ? Math.max(...recovered) : null;

    const jit = summarize(jitter);
    const gapS = summarize(gaps);
    const actor = summarize(rec.actor);
    const oth = summarize(rec.others);
    const othC = summarize(rec.othersComp);
    const push = summarize([...rec.actor, ...rec.others, ...rec.othersComp]);
    const win = (wEnd - wStart) / 1000;
    const result = evaluate({
      jitterP99: tickClients.length ? jit.p99 : 1e9, pushP95: push.count ? push.p95 : 1e9, errors: rec.errors.length, dropped,
      rssGrowthMb: pid ? (Math.max(rssMax, rss1) - rss0) / 1024 : null, lagP99: lag ? lag.p99 : null, reconnectMs: stormMs,
    }, LIMITS);
    const f = (x) => Math.round(x);
    const body = [
      ['metric', 'value', 'limit', 'verdict'],
      ...result.rows.map((r) => [r.name, r.value, r.limit, r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'FAIL']),
    ];
    const detail = [
      ['detail', 'p50', 'p95', 'p99', 'max', 'samples'],
      ['tick gap (ms, ideal 1000)', f(gapS.p50), f(gapS.p95), f(gapS.p99), f(gapS.max), gapS.count],
      ['tick jitter |gap-1000| (ms)', f(jit.p50), f(jit.p95), f(jit.p99), f(jit.max), jit.count],
      ['push: action -> actor (ms)', f(actor.p50), f(actor.p95), f(actor.p99), f(actor.max), actor.count],
      ['push: action -> others, shop (ms)', f(oth.p50), f(oth.p95), f(oth.p99), f(oth.max), oth.count],
      ['push: action -> others, competition (ms)', f(othC.p50), f(othC.p95), f(othC.p99), f(othC.max), othC.count],
    ];
    const lines = [
      `\n=== ${profile.name}: ${clients.length} connections, ${win.toFixed(0)} s competition window ===`,
      fmtTable(body), '', fmtTable(detail), '',
      `actions sent ${rec.sent}, refused by game rules (normal) ${rec.refused}, dropped ${dropped}, errors ${rec.errors.length}`,
      pid ? `server: RSS ${(rss0 / 1024).toFixed(0)} -> ${(rss1 / 1024).toFixed(0)} MB (peak ${(rssMax / 1024).toFixed(0)}), CPU ${(cpuW1 - cpuW0).toFixed(1)} s in the window (${(((cpuW1 - cpuW0) / win) * 100).toFixed(0)}% of one core), event-loop lag p50 ${lag ? lag.p50.toFixed(1) : '?'} ms / max ${lag ? lag.max.toFixed(0) : '?'} ms, DB grew ${(dbGrowth / 1024).toFixed(0)} KB`
        : 'server: process metrics not available for a remote URL (watch top on the Pi)',
      `reconnect storm: ${recovered.length}/${clients.length} clients had state again, slowest after ${stormMs == null ? 'n/a' : f(stormMs)} ms`,
    ];
    if (rec.errors.length) lines.push('first errors: ' + rec.errors.slice(0, 5).join(' | '));
    console.log(lines.join('\n'));
    return { name: profile.name, ok: result.ok, result, push, jit };
  } finally {
    for (const c of clients) { c.closing = true; try { c.ws.terminate(); } catch { /* ignore */ } }
    if (srv) {
      srv.child.kill('SIGTERM');
      await new Promise((r) => { const tm = setTimeout(() => { srv.child.kill('SIGKILL'); }, 4000); srv.child.once('exit', () => { clearTimeout(tm); r(); }); if (srv.child.exitCode !== null) r(); });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- main
console.log(`Load test ${SMOKE ? '(smoke) ' : ''}${REMOTE ? `against ${REMOTE}` : 'against a local server on a temporary database'}. Limits: ${JSON.stringify(LIMITS)}`);
const results = [];
for (const p of PROFILES) {
  try { results.push(await runProfile(p)); } catch (e) { console.error(`profile "${p.name}" crashed:`, e); results.push({ name: p.name, ok: false, crashed: true }); }
}
const ok = results.every((r) => r.ok);
console.log('\n' + results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`).join('\n'));
console.log(ok
  ? '\nSummary: every check is within its limit. The one-second tick stayed steady, actions were answered quickly, nothing was dropped and the server recovered from everybody reconnecting at once.'
  : '\nSummary: at least one check failed (see the FAIL rows above). Read docs/load-test.md, "If it fails", before the event.');
process.exit(ok ? 0 : 1);
