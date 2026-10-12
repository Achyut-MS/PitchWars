import { openDb } from '../src/db.js';
import { addParticipant } from '../src/roster.js';
import { ROLES, assign, startGame } from '../src/lobby.js';
import { activeGame } from '../src/persist.js';
import { pickIdea } from '../src/ideation.js';
import { loadData } from '../src/data.js';

export const data = loadData('data');

export function makeRunning({ problemId = 1, startAt = 0, file = ':memory:' } = {}) {
  const db = openDb(file);
  for (let i = 0; i < 12; i++) addParticipant(db, `S${i}`, `Player ${i}`);
  const seat = { A: {}, B: {} };
  let i = 0;
  for (const c of ['A', 'B']) {
    for (const r of ROLES) {
      assign(db, `S${i}`, c, r);
      seat[c][r] = `S${i}`;
      i++;
    }
  }
  const clock = { t: startAt };
  const ctx = { db, data, now: () => clock.t };
  const gameId = startGame(db, problemId, startAt);
  return { db, ctx, clock, gameId, seat, game: () => activeGame(db) };
}

export const atSec = (h, seconds) => { h.clock.t = seconds * 1000; };

export function give(h, company, itemIds) {
  const stmt = h.db.prepare(
    `INSERT OR REPLACE INTO owned (game_id, company, family, item_id, choice, bought_at, charged)
     VALUES (?, ?, ?, ?, NULL, 0, ?)`
  );
  for (const id of itemIds) {
    const item = h.ctx.data.item(id);
    stmt.run(h.gameId, company, item.family, id, item.cost);
  }
}

export function toCompetition(h, ideaA = 'H1', ideaB = 'S1') {
  atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, ideaA);
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, ideaB);
  atSec(h, 800);
  return h;
}

// ---- wait-for-condition helpers (replace fixed sleeps) ----
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll fn() until it returns a truthy value (awaited); resolves with that value. Rejects on timeout.
export async function waitFor(fn, { timeout = 5000, interval = 15, message = 'waitFor timed out' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    let v; let err;
    try { v = await fn(); } catch (e) { err = e; }
    if (v) return v;
    if (Date.now() >= end) throw err || new Error(message);
    await delay(interval);
  }
}

// Resolve with the next message on ws (parsed JSON) matching predicate; rejects on timeout.
export function nextMessage(ws, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { ws.off('message', f); reject(new Error('nextMessage timed out')); }, timeout);
    const f = (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (predicate(m)) { clearTimeout(t); ws.off('message', f); resolve(m); }
    };
    ws.on('message', f);
  });
}

// Wait until `count()` has moved past `since` (a message arrived) then stays unchanged for `quiet` ms.
export async function settleAfter(count, since, { quiet = 30, timeout = 5000, interval = 5 } = {}) {
  const end = Date.now() + timeout;
  while (count() === since && Date.now() < end) await delay(interval);
  let seen = count(); let stable = Date.now();
  while (Date.now() < end) {
    await delay(interval);
    const n = count();
    if (n !== seen) { seen = n; stable = Date.now(); } else if (Date.now() - stable >= quiet) break;
  }
}

// Send `m` on ws and resolve with the server's synchronous reply to it. The server handles one socket's messages
// in order and replies inline, so a trailing never-valid login ("barrier") is answered right after m's reply;
// everything received before the barrier reply belongs to m. The barrier reply is removed from `c.all`.
// `c.all` may hold parsed messages or raw JSON text. Returns the last message before the barrier (or the previous c.last).
export async function askBarrier(c, ws, m, { timeout = 5000 } = {}) {
  const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const start = c.all.length;
  const prev = c.last;
  ws.send(JSON.stringify(m));
  ws.send(JSON.stringify({ type: 'login', admissionId: '__barrier__' }));
  const isBarrier = (x) => { const p = parse(x); return p && p.type === 'error' && p.error === 'unknown_id'; };
  const idx = await waitFor(() => { for (let i = start; i < c.all.length; i++) if (isBarrier(c.all[i])) return i + 1; return 0; }, { timeout, message: 'askBarrier timed out' }) - 1;
  const before = idx > start ? parse(c.all[idx - 1]) : prev;
  c.all.splice(idx, 1);
  const tail = c.all.length ? parse(c.all[c.all.length - 1]) : prev;
  c.last = tail;
  return before;
}

// Resolve once the server has processed everything already sent on ws (see askBarrier). Messages sent earlier on
// this socket have been handled and replied to when this resolves.
export async function barrier(c, ws, { timeout = 5000 } = {}) {
  const parse = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const start = c.all.length;
  ws.send(JSON.stringify({ type: 'login', admissionId: '__barrier__' }));
  const isBarrier = (x) => { const p = parse(x); return p && p.type === 'error' && p.error === 'unknown_id'; };
  const idx = await waitFor(() => { for (let i = start; i < c.all.length; i++) if (isBarrier(c.all[i])) return i + 1; return 0; }, { timeout, message: 'barrier timed out' }) - 1;
  c.all.splice(idx, 1);
  if (c.all.length) c.last = parse(c.all[c.all.length - 1]);
}

// Raw-socket barrier: resolves once the server has handled everything already sent on ws, and (since the server
// writes to a socket in order) everything it had already pushed to ws has arrived. Works before login too.
export const isBarrierReply = (m) => !!m && m.type === 'error' && m.error === 'unknown_id';
export async function wsBarrier(ws, timeout = 5000) {
  if (ws.readyState !== 1) return;
  const p = nextMessage(ws, isBarrierReply, timeout);
  ws.send(JSON.stringify({ type: 'login', admissionId: '__barrier__' }));
  await p;
}
