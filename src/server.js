import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createExportHandler } from './exportHttp.js';
import { fireWarnings, warningFor } from './warnings.js';
import { launchAttack } from './attacks.js';
import { triggerMarketEvent, injectCoins } from './marketEvents.js';
import { tickEconomy } from './economy.js';
import { evaluateHints } from './hints.js';
import { WebSocketServer } from 'ws';
import { normId } from './roster.js';
import { participantLogin, organizerLogin } from './auth.js';
import { activeGame, setPaused } from './persist.js';
import { practicePuzzle, practiceCheck } from './practice.js';
import { phaseAt } from './phases.js';
import { loadData } from './data.js';
import { staticHandler } from './static.js';
import { runDirector } from './director.js';
import { logEvent } from './events.js';
import { signPage, joinConfigFromEnv } from './sign.js';
import { importRoster, addParticipant } from './roster.js';
import { assign, unassign, startGame } from './lobby.js';
import { swapSeats, replacePlayer } from './seats.js';
import { castVote, pickIdea, endIdeationNow } from './ideation.js';
import { requestItem, recommendItem, ceoDecide, cfoDecide } from './shop.js';
import { skipToNextPhase } from './skip.js';
import { revealGame, nextGame } from './results.js';
import { backupDb, pruneBackups } from './backup.js';
import { viewFor, organizerView } from './views.js';
import { startPuzzle, submitPuzzle, probePuzzle, skipPuzzle, NoPuzzleOpenError } from './minigame.js';

const MAX_FAILS = 5;
const WINDOW_MS = 60_000;
const LOCK_MS = 60_000;
const GLOBAL_FAILS = 10;
const GLOBAL_GAP_MS = 1000;
const SMALL_MSG = 4096;
const BIG_MSG = 262144;
const COALESCE_MS = 200;
const LOGIN_FAILS = 10;
const RATE_PER_SEC = 30;
const RATE_BURST = 60;

const bad = () => new Error('bad_message');
const str = (v) => { if (typeof v !== 'string') throw bad(); return v; };
const optStr = (v) => { if (v === undefined || v === null) return null; return str(v); };
const int = (v) => { if (!Number.isSafeInteger(v)) throw bad(); return v; };
const bool = (v) => { if (typeof v !== 'boolean') throw bad(); return v; };
const has = (o, k) => Object.hasOwn(o, k);
const MAX_ANSWER_CHARS = 20000;
// A puzzle answer is an object or array of bounded size; checked before it reaches the engine.
const answerOf = (v) => {
  if (v === null || typeof v !== 'object') throw bad();
  let s;
  try { s = JSON.stringify(v); } catch { throw bad(); }
  if (typeof s !== 'string' || s.length > MAX_ANSWER_CHARS) throw bad();
  return v;
};
const TRY_AGAIN = 'could not make a puzzle just now, please try again';

export function createApp({
  db, organizerPassword, now = Date.now, clock = null, data = loadData(), staticRoot = 'public', exportDir = 'data/graphs', director = runDirector,
  setTimer = (fn, ms) => setTimeout(fn, ms).unref(), clearTimer = clearTimeout,
  backupDir = 'backups', backup = backupDb, backupKeep = 50, backupTimeoutMs = 60_000, speed = 1,
  join = () => joinConfigFromEnv(process.env),
  mono = () => performance.now(),
  ipOf = (req) => req.socket.remoteAddress,
  maxUnauth = 300, loginWindowMs = 60_000,
  allowDuplicateSessions = false, // load tests only: many sockets as the same player
}) {
  const ctx = { db, data, now, exportDir, backupDir, speed };
  const handler = staticRoot
    ? staticHandler(staticRoot)
    : (req, res) => { res.writeHead(404); res.end(); };
  // Organizer download tokens: random, one per organizer login, memory only (oldest dropped past the cap).
  // A token stays valid while its organizer socket is open and for 30 minutes after it closes.
  const TOKEN_GRACE_MS = 30 * 60_000;
  const MAX_TOKENS = 50;
  const tokens = {
    map: new Map(), // token -> { ws, closedAt }
    get size() { return this.map.size; },
    add(token, ws) { this.map.set(token, { ws, closedAt: null }); },
    has(token) {
      const e = this.map.get(token);
      if (!e) return false;
      if (e.closedAt !== null && now() - e.closedAt >= TOKEN_GRACE_MS) { this.map.delete(token); return false; }
      return true;
    },
    release(ws) { for (const e of this.map.values()) if (e.ws === ws && e.closedAt === null) e.closedAt = now(); },
    oldest() { return this.map.keys().next().value; },
    delete(token) { this.map.delete(token); },
  };
  const exporter = createExportHandler({ db, data, ctx, tokens });
  const server = http.createServer(async (req, res) => {
    try {
      if (await exporter(req, res)) return;
    } catch {
      if (!res.headersSent) res.writeHead(500);
      return res.end();
    }
    if (/^\/join\/?(\?|$)/.test(req.url || '')) return serveJoin(req, res);
    if (/^\/practice\/api\/(puzzle|check)(\?|$)/.test(req.url || '')) return servePractice(req, res);
    return handler(req, res);
  });
  // Practice puzzles (see practice.js): GET a puzzle, or POST an answer to check. Nothing is stored.
  async function servePractice(req, res) {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET' && url.pathname === '/practice/api/puzzle') {
        return send(200, practicePuzzle({ kind: url.searchParams.get('kind'), level: url.searchParams.get('level'), seed: url.searchParams.get('seed') }));
      }
      if (req.method === 'POST' && url.pathname === '/practice/api/check') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 64 * 1024) return send(413, { error: 'too_big' });
        }
        return send(200, practiceCheck(JSON.parse(raw)));
      }
      return send(405, { error: 'method_not_allowed' });
    } catch (err) {
      return send(400, { error: err.message || 'bad_request' });
    }
  }
  // The join sign: public, read-only, built from server settings only (never from the request).
  function serveJoin(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); return res.end(); }
    const body = signPage(join());
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'self'",
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  const wss = new WebSocketServer({ server, maxPayload: BIG_MSG });
  const sessions = new Map(); // ws -> { kind: 'organizer' } | { kind: 'participant', admissionId }
  const attempts = new WeakMap(); // ws -> { fails: [ts], lockedUntil }
  const alive = new WeakMap();
  const buckets = new WeakMap(); // ws -> { tokens, at }
  const dropped = new WeakSet();
  const replaced = new Map(); // `${gameId}:${admissionId}` -> times a newer login replaced an older socket
  ctx.duplicateWarnings = (gameId) => [...replaced].filter(([k]) => k.startsWith(`${gameId ?? 0}:`))
    .map(([k, count]) => ({ type: 'duplicate_login', admissionId: k.slice(k.indexOf(':') + 1), count }));
  // Sockets that have not logged in yet: capped, and closed after loginWindowMs.
  const unauth = new Map(); // ws -> timer handle
  const settle = (ws) => { if (unauth.has(ws)) { clearTimer(unauth.get(ws)); unauth.delete(ws); } };
  const ipOfWs = new WeakMap();
  const ipLimits = new Map(); // ip -> { fails: [ts], lastAllowed }
  const loginLimits = new Map(); // ip -> { fails: [ts], lockedUntil }
  const normIp = (a) => String(a ?? '').replace(/^::ffff:/i, '');
  const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1';
  const sweep = (map, t) => {
    for (const [k, v] of map) {
      v.fails = v.fails.filter((x) => t - x < WINDOW_MS);
      if (!v.fails.length && !(v.lockedUntil > t)) map.delete(k);
    }
  };
  const lastPhase = new Map(); // gameId -> phase last seen by the tick
  let dirty = false;
  let timer = null;

  const sendRaw = (ws, text) => ws.readyState === 1 && ws.send(text);
  const send = (ws, msg) => sendRaw(ws, JSON.stringify(msg));
  const getStatus = db.prepare('SELECT status, game_id FROM participants WHERE admission_id = ?');

  // Pushes fresh state to every session; a failing view never stops the others.
  // One cache per push shares the per-company shop state between viewers.
  function pushAll(only = null, result = null) {
    const cache = new Map();
    for (const [ws, s] of sessions) {
      if (only && ws !== only) continue;
      try {
        const msg = { type: 'state', view: s.kind === 'organizer' ? organizerView(ctx, cache) : viewFor(ctx, s.admissionId, cache) };
        if (result) msg.result = result;
        send(ws, msg);
      } catch (e) {
        console.error('push failed:', e);
      }
    }
  }
  // The actor sees the result at once; everyone else is updated by one coalesced push.
  function flush() {
    if (timer) { clearTimer(timer); timer = null; }
    if (!dirty) return;
    dirty = false;
    pushAll();
  }
  function markDirty() {
    dirty = true;
    if (!timer) timer = setTimer(() => { timer = null; try { flush(); } catch (e) { console.error('flush failed:', e); } }, COALESCE_MS);
  }

  // Backups: one at a time, never throw, never wait forever; the organizer (only) sees the outcome.
  let backupStatus = null;
  let backupFlight = null;
  ctx.backupStatus = () => backupStatus;
  function runBackup(label) {
    if (backupFlight) return backupFlight;
    const flight = (async () => {
      let tm;
      try {
        const job = Promise.resolve().then(() => backup(db, ctx.backupDir, label, now()));
        job.catch(() => {});
        const file = await Promise.race([
          job,
          new Promise((_, rej) => { tm = setTimer(() => rej(new Error('backup timed out')), backupTimeoutMs); }),
        ]);
        try { pruneBackups(ctx.backupDir, backupKeep); } catch (e) { console.error('prune failed:', e); }
        backupStatus = { ok: true, at: now(), file, error: null };
      } catch (e) {
        const error = String(e?.message ?? e);
        backupStatus = { ok: false, at: now(), file: null, error };
        try { logEvent(db, { ts: now(), type: 'backup_failed', payload: { label, error } }); } catch { /* db unavailable */ }
        console.error('backup failed:', error);
      } finally {
        if (tm) clearTimer(tm);
        backupFlight = null;
      }
      try { markDirty(); } catch { /* ignore */ }
      return backupStatus;
    })();
    backupFlight = flight;
    return flight;
  }

  const needGame = () => { const g = activeGame(db); if (!g) throw new Error('no game is running'); return g; };
  const logAct = (action, args, gameId = null) =>
    logEvent(db, { ts: now(), gameId, type: 'organizer_action', payload: { action, args } });

  // Each organizer action validates its own input, runs, then logs. May return a result.
  const organizerActions = {
    roster_import: (m) => {
      const r = importRoster(db, str(m.text));
      logAct('roster_import', { chars: m.text.length, added: r.added, skipped: r.skipped, rejected: r.rejected.length });
      return r;
    },
    add_participant: (m) => {
      const added = addParticipant(db, str(m.admissionId), str(m.name));
      logAct('add_participant', { admissionId: m.admissionId, name: m.name, added });
    },
    assign: (m) => {
      assign(db, str(m.admissionId), str(m.company), str(m.role), now());
      logAct('assign', { admissionId: m.admissionId, company: m.company, role: m.role });
    },
    unassign: (m) => {
      unassign(db, str(m.admissionId), now());
      logAct('unassign', { admissionId: m.admissionId });
    },
    start_game: (m) => {
      const problemId = int(m.problemId);
      if (!data.problems.some((p) => p.id === problemId)) throw new Error('unknown problem');
      const id = startGame(db, problemId, now());
      if (speed > 1) logEvent(db, { ts: now(), gameId: id, type: 'rehearsal_speed', payload: { speed } });
      logAct('start_game', { problemId: m.problemId }, id);
    },
    swap_seats: (m) => {
      const g = needGame();
      swapSeats(db, g, g.id, str(m.a), str(m.b), now());
      logAct('swap_seats', { a: m.a, b: m.b }, g.id);
    },
    replace_player: (m) => {
      const g = needGame();
      replacePlayer(db, g, g.id, str(m.out), str(m.in), now());
      logAct('replace_player', { out: m.out, in: m.in }, g.id);
    },
    reveal: () => {
      const g = needGame();
      revealGame(ctx, g);
      logAct('reveal', {}, g.id);
    },
    next_game: () => {
      const g = needGame();
      nextGame(ctx, g);
      runBackup('after'); // fire and forget: never delays or fails this action
      logAct('next_game', {}, g.id);
    },
    skip_phase: () => {
      const g = needGame();
      const r = skipToNextPhase(db, g, now());
      logAct('skip_phase', { from: r.from, to: r.to }, g.id);
    },
    pause_clock: () => {
      const g = needGame();
      if (!clock) throw new Error('this server has no game clock');
      if (clock.paused()) throw new Error('the timer is already paused');
      clock.pause();
      setPaused(db, g.id, true, clock.pausedMs());
      logAct('pause_clock', {}, g.id);
    },
    resume_clock: () => {
      const g = needGame();
      if (!clock) throw new Error('this server has no game clock');
      if (!clock.paused()) throw new Error('the timer is not paused');
      clock.resume();
      setPaused(db, g.id, false, clock.pausedMs());
      logAct('resume_clock', {}, g.id);
    },
    end_ideation_early: () => {
      const g = needGame();
      endIdeationNow(ctx, g);
      logAct('end_ideation_early', {}, g.id);
    },
    market_event: (m) => {
      const g = needGame();
      const key = str(m.key);
      triggerMarketEvent(ctx, g, key);
      logAct('market_event', { key }, g.id);
    },
    inject: (m) => {
      const g = needGame();
      const company = str(m.company);
      const coins = int(m.coins);
      injectCoins(ctx, g, company, coins);
      logAct('inject', { company, coins }, g.id);
    },
  };
  // Players name a request by its per-company sequence number; it is resolved inside the sender's own company.
  const requestIdOf = (game, admissionId, seq) => {
    const p = db.prepare('SELECT company FROM participants WHERE admission_id = ?').get(admissionId);
    const row = p && seq >= 1
      ? db.prepare('SELECT id FROM requests WHERE game_id=? AND company=? ORDER BY id LIMIT 1 OFFSET ?').get(game.id, p.company, seq - 1)
      : null;
    if (!row) throw new Error('no such request');
    return row.id;
  };
  const participantActions = {
    vote: (id, m, g) => castVote(ctx, g, id, str(m.ideaId)),
    pick: (id, m, g) => pickIdea(ctx, g, id, str(m.ideaId)),
    request: (id, m, g) => requestItem(ctx, g, id, str(m.itemId), optStr(m.choice)),
    recommend: (id, m, g) => recommendItem(ctx, g, id, str(m.itemId), optStr(m.choice)),
    ceo_decide: (id, m, g) => ceoDecide(ctx, g, id, requestIdOf(g, id, int(m.requestId)), bool(m.approve)),
    cfo_decide: (id, m, g) => cfoDecide(ctx, g, id, requestIdOf(g, id, int(m.requestId)), bool(m.approve)),
    attack: (id, m, g) => launchAttack(ctx, g, id, str(m.key)),
    puzzle_next: (id, m, g) => {
      let row;
      try { row = startPuzzle(ctx, g, id); } catch (e) { if (e && e.constructor === Error && /^(only the CFO|puzzles are only|not in this game)/.test(e.message)) throw e; throw new Error(TRY_AGAIN); }
      if (!row) throw new Error(TRY_AGAIN);
    },
    // A double tap finds no open puzzle: answer quietly instead of showing an error.
    puzzle_submit: (id, m, g) => {
      const answer = answerOf(m.answer);
      try { return submitPuzzle(ctx, g, id, answer); } catch (e) {
        if (e instanceof NoPuzzleOpenError) return { ok: false, coins: 0, closed: true };
        throw e;
      }
    },
    // The automatic check after every tap: quiet when wrong, and never counted as a wrong try.
    puzzle_probe: (id, m, g) => {
      const answer = answerOf(m.answer);
      try { return probePuzzle(ctx, g, id, answer); } catch (e) {
        if (e instanceof NoPuzzleOpenError) return { ok: false, coins: 0, closed: true };
        throw e;
      }
    },
    puzzle_skip: (id, m, g) => {
      try { skipPuzzle(ctx, g, id); } catch (e) { if (!(e instanceof NoPuzzleOpenError)) throw e; }
    },
  };

  // Plain Errors thrown by the game rules carry player-facing text; anything else
  // (type errors, database errors) is not shown to the user.
  const errorText = (e) => (e && e.constructor === Error ? e.message : 'bad_message');

  // Forgets the socket's session and, for a participant, logs one `disconnect`. Never throws;
  // a socket with no session (unauthenticated, organizer, already ended) logs nothing.
  function endSession(ws) {
    const s = sessions.get(ws);
    sessions.delete(ws);
    if (!s || s.kind !== 'participant') return;
    try {
      const p = getStatus.get(s.admissionId);
      logEvent(db, { ts: now(), gameId: p ? p.game_id : null, admissionId: s.admissionId, type: 'disconnect' });
    } catch (e) { console.error('disconnect log failed:', e && e.message); }
  }

  wss.on('connection', (ws, req) => {
    if (unauth.size >= maxUnauth) { ws.on('error', () => {}); return ws.close(1013, 'busy'); }
    unauth.set(ws, setTimer(() => { unauth.delete(ws); try { ws.close(1008, 'login timeout'); } catch { ws.terminate(); } }, loginWindowMs));
    try { ipOfWs.set(ws, normIp(ipOf(req))); } catch { ipOfWs.set(ws, ''); }
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('close', () => { settle(ws); tokens.release(ws); endSession(ws); });
    ws.on('error', () => {
      endSession(ws);
      ws.terminate();
    });
    ws.on('message', (raw) => {
      if (dropped.has(ws)) return;
      // Token bucket per socket (infrastructure, so it uses the real monotonic clock, not game time).
      const tm = mono();
      const b = buckets.get(ws) || { tokens: RATE_BURST, at: tm };
      b.tokens = Math.min(RATE_BURST, b.tokens + ((tm - b.at) / 1000) * RATE_PER_SEC);
      b.at = tm;
      buckets.set(ws, b);
      if (b.tokens < 1) { dropped.add(ws); endSession(ws); return ws.terminate(); }
      b.tokens -= 1;
      const size = raw.byteLength ?? raw.length;
      const kind = (sessions.get(ws) || {}).kind;
      if (size > SMALL_MSG && kind !== 'organizer') return ws.terminate();
      try {
        handle(ws, raw);
      } catch {
        send(ws, { type: 'error', error: 'bad_message' });
      }
    });
  });

  // At most MAX_FAILS wrong passwords per minute per connection, then a 60 s lockout
  // during which even the right password is refused.
  function organizerAttempt(ws, password) {
    const t = now();
    const a = attempts.get(ws) || { fails: [], lockedUntil: 0 };
    attempts.set(ws, a);
    if (t < a.lockedUntil) return 'too_many_attempts';
    // Per-IP limiter: after 10 failures in a minute from one address, one attempt a second
    // from that address. Loopback (the organizer's own laptop) is never refused here.
    const ip = ipOfWs.get(ws) ?? '';
    let rec = ipLimits.get(ip);
    if (!rec) { rec = { fails: [], lastAllowed: -Infinity }; ipLimits.set(ip, rec); }
    rec.fails = rec.fails.filter((x) => t - x < WINDOW_MS);
    if (!isLoopback(ip)) {
      if (rec.fails.length >= GLOBAL_FAILS && t - rec.lastAllowed < GLOBAL_GAP_MS) return 'too_many_attempts';
      rec.lastAllowed = t;
    }
    a.fails = a.fails.filter((x) => t - x < WINDOW_MS);
    if (organizerLogin(password, organizerPassword)) return 'ok';
    rec.fails.push(t);
    a.fails.push(t);
    if (a.fails.length >= MAX_FAILS) { a.lockedUntil = t + LOCK_MS; a.fails = []; }
    return 'bad_password';
  }

  function handle(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', error: 'bad_message' });
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return send(ws, { type: 'error', error: 'bad_message' });

    if (msg.type === 'login') {
      if (typeof msg.admissionId !== 'string') return send(ws, { type: 'error', error: 'bad_message' });
      const t = now();
      const ip = ipOfWs.get(ws) ?? '';
      const lim = loginLimits.get(ip) || { fails: [], lockedUntil: 0 };
      loginLimits.set(ip, lim);
      if (!isLoopback(ip) && t < lim.lockedUntil) return send(ws, { type: 'error', error: 'too_many_attempts' });
      const prior = sessions.get(ws);
      const id = normId(msg.admissionId);
      const same = !!prior && prior.kind === 'participant' && prior.admissionId === id;
      const r = participantLogin(db, msg.admissionId, t, !same);
      if (!r.ok) {
        lim.fails = lim.fails.filter((x) => t - x < WINDOW_MS);
        if (!isLoopback(ip)) lim.fails.push(t); // loopback is the organizer's own machine and the test rigs
        if (lim.fails.length >= LOGIN_FAILS) { lim.lockedUntil = t + LOCK_MS; lim.fails = []; }
        return send(ws, { type: 'error', error: r.error });
      }
      // The newest login wins: an older live socket for the same id is told and closed.
      for (const [other, os] of sessions) {
        if (allowDuplicateSessions || other === ws || os.kind !== 'participant' || os.admissionId !== r.participant.admissionId) continue;
        sessions.delete(other);
        send(other, { type: 'error', error: 'logged_in_elsewhere' });
        try { other.close(); } catch { other.terminate(); }
        const key = `${r.participant.gameId ?? 0}:${r.participant.admissionId}`;
        replaced.set(key, (replaced.get(key) || 0) + 1);
        logEvent(db, { ts: t, gameId: r.participant.gameId ?? null, admissionId: r.participant.admissionId, type: 'login_replaced', payload: { count: replaced.get(key) } });
        markDirty();
      }
      sessions.set(ws, { kind: 'participant', admissionId: r.participant.admissionId });
      settle(ws);
      return send(ws, { type: 'welcome', view: r.view, participant: r.participant });
    }
    if (msg.type === 'organizer') {
      if (typeof msg.password !== 'string') return send(ws, { type: 'error', error: 'bad_message' });
      const r = organizerAttempt(ws, msg.password);
      if (r !== 'ok') return send(ws, { type: 'error', error: r });
      sessions.set(ws, { kind: 'organizer' });
      settle(ws);
      const token = randomUUID();
      tokens.add(token, ws);
      if (tokens.size > MAX_TOKENS) tokens.delete(tokens.oldest());
      return send(ws, { type: 'welcome', view: 'organizer', token });
    }

    const s = sessions.get(ws);
    if (!s) return send(ws, { type: 'error', error: 'bad_message' });
    if (msg.type === 'sync') return pushAll(ws);

    let result;
    try {
      if (s.kind === 'organizer' && has(organizerActions, msg.type)) {
        result = organizerActions[msg.type](msg);
      } else if (s.kind === 'participant' && has(participantActions, msg.type)) {
        const game = activeGame(db);
        if (!game) throw new Error('no game is running');
        const p = getStatus.get(s.admissionId);
        if (!p || p.status !== 'in_game' || p.game_id !== game.id) throw new Error('you are not in this game');
        const r = participantActions[msg.type](s.admissionId, msg, game);
        // Direct reply to the attacker only: never anything about the victim's state.
        if (msg.type === 'puzzle_submit') send(ws, { type: 'puzzle_result', ok: !!(r && r.ok), coins: r ? r.coins : 0, ...(r && r.closed ? { closed: true } : {}) });
        if (msg.type === 'puzzle_probe' && r && r.ok) send(ws, { type: 'puzzle_result', ok: true, coins: r.coins });
        if (msg.type === 'attack') send(ws, { type: 'attack_result', blocked: !!(r && r.blocked), endsAt: r && r.endsAt });
      } else {
        return send(ws, { type: 'error', error: 'bad_message' });
      }
    } catch (e) {
      return send(ws, { type: 'error', error: errorText(e) });
    }
    pushAll(ws, result);
    markDirty();
  }

  // The pipeline: director -> economy -> warnings -> hints -> ticks -> push. Each stage
  // has its own try/catch. The economy, hints and the competition push run at most once
  // per distinct server second, so two timers or duplicate calls cannot double-credit.
  let lastSecond = null;
  const guard = (name, fn) => { try { return fn(); } catch (e) { console.error(`${name} failed:`, e); return undefined; } };
  function tickAll() {
    let changed = !!guard('director', () => director(ctx));
    let game = null;
    guard('game lookup', () => { game = activeGame(db); });
    if (game) {
      const t = now();
      const sec = Math.floor(t / 1000);
      const newSecond = sec !== lastSecond;
      lastSecond = sec;
      const clock = phaseAt(game, t);
      if (newSecond) guard('economy', () => tickEconomy(ctx, game));
      changed = !!guard('warnings', () => fireWarnings(ctx, game)) || changed;
      if (newSecond) guard('hints', () => evaluateHints(ctx, game));
      guard('tick', () => {
        const warning = warningFor(clock);
        const tick = JSON.stringify({ type: 'tick', serverNow: t, ...clock, gameId: game.id, ...(warning ? { warning } : {}) });
        for (const [ws, s] of sessions) {
          if (s.kind === 'organizer') { sendRaw(ws, tick); continue; }
          const p = getStatus.get(s.admissionId);
          if (p && p.status === 'in_game' && p.game_id === game.id) sendRaw(ws, tick);
        }
      });
      const prev = lastPhase.get(game.id);
      lastPhase.set(game.id, clock.phase);
      if (prev !== undefined && prev !== clock.phase) changed = true;
      if (clock.phase === 'competition' && newSecond) changed = true;
    }
    if (changed) guard('push', () => { dirty = true; flush(); });
  }

  // Two-strike ping: a socket that did not answer the previous ping is terminated.
  function pingAll() {
    const nowT = now();
    sweep(ipLimits, nowT);
    sweep(loginLimits, nowT);
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { endSession(ws); ws.terminate(); continue; }
      alive.set(ws, false);
      try { ws.ping(); } catch { ws.terminate(); }
    }
  }

  return {
    server, wss, tickAll, pingAll, flush, ctx, runBackup,
    get backupStatus() { return backupStatus; },
    backupIdle: () => backupFlight ?? Promise.resolve(),
    runAction: (type, m = {}) => organizerActions[type](m),
  };
}
