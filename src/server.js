import http from 'node:http';
import { fireWarnings, warningFor } from './warnings.js';
import { launchAttack } from './attacks.js';
import { triggerMarketEvent, injectCoins } from './marketEvents.js';
import { tickEconomy } from './economy.js';
import { evaluateHints } from './hints.js';
import { WebSocketServer } from 'ws';
import { participantLogin, organizerLogin } from './auth.js';
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';
import { loadData } from './data.js';
import { staticHandler } from './static.js';
import { runDirector } from './director.js';
import { logEvent } from './events.js';
import { importRoster, addParticipant } from './roster.js';
import { assign, unassign, startGame, endGame } from './lobby.js';
import { swapSeats, replacePlayer } from './seats.js';
import { castVote, pickIdea, endIdeationNow } from './ideation.js';
import { requestItem, recommendItem, ceoDecide, cfoDecide } from './shop.js';
import { viewFor, organizerView } from './views.js';

const MAX_FAILS = 5;
const WINDOW_MS = 60_000;
const LOCK_MS = 60_000;
const GLOBAL_FAILS = 10;
const GLOBAL_GAP_MS = 1000;
const SMALL_MSG = 4096;
const BIG_MSG = 262144;
const COALESCE_MS = 200;

const bad = () => new Error('bad_message');
const str = (v) => { if (typeof v !== 'string') throw bad(); return v; };
const optStr = (v) => { if (v === undefined || v === null) return null; return str(v); };
const int = (v) => { if (!Number.isSafeInteger(v)) throw bad(); return v; };
const bool = (v) => { if (typeof v !== 'boolean') throw bad(); return v; };
const has = (o, k) => Object.hasOwn(o, k);

export function createApp({
  db, organizerPassword, now = Date.now, data = loadData(), staticRoot = 'public', director = runDirector,
  setTimer = (fn, ms) => setTimeout(fn, ms).unref(), clearTimer = clearTimeout,
}) {
  const ctx = { db, data, now };
  const handler = staticRoot
    ? staticHandler(staticRoot)
    : (req, res) => { res.writeHead(404); res.end(); };
  const server = http.createServer(handler);
  const wss = new WebSocketServer({ server, maxPayload: BIG_MSG });
  const sessions = new Map(); // ws -> { kind: 'organizer' } | { kind: 'participant', admissionId }
  const attempts = new WeakMap(); // ws -> { fails: [ts], lockedUntil }
  const alive = new WeakMap();
  const global = { fails: [], lastAllowed: -Infinity };
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
      const id = startGame(db, int(m.problemId), now());
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
    end_game: () => {
      const g = needGame();
      endGame(db, g.id, now());
      logAct('end_game', {}, g.id);
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
  const participantActions = {
    vote: (id, m, g) => castVote(ctx, g, id, str(m.ideaId)),
    pick: (id, m, g) => pickIdea(ctx, g, id, str(m.ideaId)),
    request: (id, m, g) => requestItem(ctx, g, id, str(m.itemId), optStr(m.choice)),
    recommend: (id, m, g) => recommendItem(ctx, g, id, str(m.itemId), optStr(m.choice)),
    ceo_decide: (id, m, g) => ceoDecide(ctx, g, id, int(m.requestId), bool(m.approve)),
    cfo_decide: (id, m, g) => cfoDecide(ctx, g, id, int(m.requestId), bool(m.approve)),
    attack: (id, m, g) => launchAttack(ctx, g, id, str(m.key)),
  };

  // Plain Errors thrown by the game rules carry player-facing text; anything else
  // (type errors, database errors) is not shown to the user.
  const errorText = (e) => (e && e.constructor === Error ? e.message : 'bad_message');

  wss.on('connection', (ws) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    ws.on('close', () => sessions.delete(ws));
    ws.on('error', () => {
      sessions.delete(ws);
      ws.terminate();
    });
    ws.on('message', (raw) => {
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
    // Global limiter: after 10 failures in a minute (any connection) allow one attempt a second.
    global.fails = global.fails.filter((x) => t - x < WINDOW_MS);
    if (global.fails.length >= GLOBAL_FAILS && t - global.lastAllowed < GLOBAL_GAP_MS) return 'too_many_attempts';
    global.lastAllowed = t;
    a.fails = a.fails.filter((x) => t - x < WINDOW_MS);
    if (organizerLogin(password, organizerPassword)) return 'ok';
    global.fails.push(t);
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
      const r = participantLogin(db, msg.admissionId, now());
      if (!r.ok) return send(ws, { type: 'error', error: r.error });
      sessions.set(ws, { kind: 'participant', admissionId: r.participant.admissionId });
      return send(ws, { type: 'welcome', view: r.view, participant: r.participant });
    }
    if (msg.type === 'organizer') {
      if (typeof msg.password !== 'string') return send(ws, { type: 'error', error: 'bad_message' });
      const r = organizerAttempt(ws, msg.password);
      if (r !== 'ok') return send(ws, { type: 'error', error: r });
      sessions.set(ws, { kind: 'organizer' });
      return send(ws, { type: 'welcome', view: 'organizer' });
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
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) { sessions.delete(ws); ws.terminate(); continue; }
      alive.set(ws, false);
      try { ws.ping(); } catch { ws.terminate(); }
    }
  }

  return { server, wss, tickAll, pingAll, flush, ctx };
}
