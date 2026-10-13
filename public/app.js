import { renderLogin, renderScreen, renderSuperseded, renderConnecting, renderOffline, fmtClock, clockClass } from './render.js';
import { humanError, viewKey, createSendGuard, redrawDecision, createConfirm, createPuzzleSession, shouldReconnect, puzzleNote, puzzleResultAction } from './glue.js';
import { UI } from './puzzles/ui.js';

const root = document.getElementById('app');
const toast = document.getElementById('toast');
const conn = document.getElementById('conn');
const guard = createSendGuard(600);
const confirmAttack = createConfirm(5000);
let ws = null;
let id = null;
let retry = 0;
let online = false;
let loggedIn = false;
let shownPhase = null; // phase of the view currently on screen
let syncedFor = null; // the tick phase we already asked a sync for
let shownKey = null;
let pointerDown = false;
let downAt = 0;
let pending = null; // a redraw waiting for the finger to lift
let pendingTimer = null;
let lastError = '';
let superseded = false; // a newer login took over: stay down until the player taps Use this device
const puzzle = createPuzzleSession(UI); // local tap state, kept across redraws, reset when the puzzle id changes
let puzzleView = null; // the open puzzle from the latest state push
let noteKind = null;
try { id = sessionStorage.getItem('admissionId'); } catch { /* storage may be blocked */ }

const sendMsg = (m) => { if (ws && ws.readyState === 1) { ws.send(typeof m === 'string' ? m : JSON.stringify(m)); return true; } return false; };

function showToast(text) {
  toast.textContent = text;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.textContent = ''; }, 4000);
}

function setOnline(on) {
  online = on;
  conn.innerHTML = on ? '' : renderOffline();
  applyOffline();
}
function applyOffline() {
  for (const b of root.querySelectorAll('button')) if (!online) b.disabled = true;
}

// Replaces the screen but keeps typed text, focus and open sections.
function paint(html) {
  const open = [...root.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]);
  const a = document.activeElement;
  const field = a && root.contains(a) && a.name === 'id' ? { v: a.value } : null;
  root.innerHTML = html;
  for (const [k, o] of open) { const d = [...root.querySelectorAll('details[data-key]')].find((x) => x.dataset.key === k); if (d) d.open = o; }
  const input = root.querySelector('input[name="id"]');
  if (field && input) { input.value = field.v; input.focus(); }
  guard.release();
  mountPuzzle();
  applyOffline();
}

function setNote(kind) {
  noteKind = kind;
  const n = document.getElementById('puzzle-note');
  if (n) n.textContent = puzzleNote(kind);
}

// Fills the slot from the retained local state; also shows any pending note.
function mountPuzzle() {
  const slot = document.getElementById('puzzle-slot');
  if (!slot || !puzzleView) { if (!slot) puzzle.sync(null); return; }
  puzzle.sync(puzzleView);
  slot.innerHTML = puzzle.render();
  const n = document.getElementById('puzzle-note');
  if (n) n.textContent = puzzleNote(noteKind);
}

function showLogin(err) {
  shownPhase = null; shownKey = null; loggedIn = false;
  paint(renderLogin(err));
}

function flushPending() {
  clearTimeout(pendingTimer);
  if (pending) { const v = pending; pending = null; shownKey = viewKey(v); paint(renderScreen(v)); }
}

function onState(view) {
  if (!view || typeof view !== 'object') return;
  loggedIn = true;
  shownPhase = view.screen === 'game' && view.clock ? view.clock.phase : null;
  const pz = view.competition && view.competition.puzzle;
  puzzleView = pz || null;
  if (!pz) puzzle.sync(null);
  else if (pz.id !== puzzle.id) noteKind = null;
  const key = viewKey(view);
  const d = redrawDecision({ changed: key !== shownKey, pointerDown, downAt, now: Date.now() });
  if (d.action === 'skip') { guard.release(); return; }
  if (d.action === 'defer') {
    pending = view;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flushPending, d.wait);
    return;
  }
  pending = null;
  shownKey = key;
  paint(renderScreen(view));
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'welcome') {
    const a = m.participant && m.participant.admissionId;
    if (typeof a === 'string') {
      id = a;
      try { sessionStorage.setItem('admissionId', a); } catch { /* ignore */ }
    }
    lastError = '';
    sendMsg({ type: 'sync' });
  } else if (m.type === 'state') {
    syncedFor = null;
    onState(m.view);
  } else if (m.type === 'tick') {
    const c = document.getElementById('clock');
    if (c && Number.isFinite(m.remainingSec)) { c.textContent = fmtClock(m.remainingSec); c.className = clockClass(m.remainingSec); }
    // The phase moved on without a push: ask for the fresh screen once per phase.
    if (typeof m.phase === 'string' && m.phase !== shownPhase && m.phase !== syncedFor) {
      syncedFor = m.phase;
      sendMsg({ type: 'sync' });
    }
  } else if (m.type === 'puzzle_result') {
    guard.release();
    const b = document.getElementById('puzzle-submit');
    if (b) b.disabled = !online;
    const a = puzzleResultAction(m);
    if (m.closed !== true) setNote(a.note);
    if (a.toast) showToast(a.toast);
  } else if (m.type === 'attack_result') {
    guard.release();
    showToast(m.blocked ? 'Attack blocked' : 'Attack launched');
  } else if (m.type === 'error') {
    const e = typeof m.error === 'string' ? m.error : '';
    guard.release();
    if (e === 'logged_in_elsewhere') {
      superseded = true; loggedIn = false; shownKey = null; shownPhase = null; pending = null;
      paint(renderSuperseded());
    } else if (e === 'unknown_id') {
      id = null;
      try { sessionStorage.removeItem('admissionId'); } catch { /* ignore */ }
      lastError = humanError(e);
      showLogin(lastError);
    } else if (!loggedIn) {
      lastError = humanError(e);
      showLogin(lastError);
    } else {
      if (/try again/i.test(e) && /puzzle/i.test(e)) setNote('tryagain');
      showToast(humanError(e));
    }
  }
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    retry = 0;
    setOnline(true);
    if (id) sendMsg({ type: 'login', admissionId: id });
    else showLogin(lastError);
  };
  ws.onclose = () => {
    if (!shouldReconnect({ superseded })) return; // keep the message screen and its button as they are
    setOnline(false);
    // Back off 1, 2, 4, 8 s up to 15 s; the server drops dead sockets after about a minute.
    const wait = Math.min(15000, 1000 * 2 ** retry++);
    setTimeout(connect, wait);
  };
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('bad server message', err); }
  };
}

document.addEventListener('submit', (e) => {
  if (!e.target.matches || !e.target.matches('#login')) return; // not .id: the input named "id" shadows form.id
  e.preventDefault();
  const v = new FormData(e.target).get('id');
  if (typeof v !== 'string' || !v.trim()) return;
  if (!online) { showToast('Offline - reconnecting...'); return; }
  lastError = ''; id = v.trim(); sendMsg({ type: 'login', admissionId: id });
});

document.addEventListener('pointerdown', () => { pointerDown = true; downAt = Date.now(); }, true);
const lift = () => { pointerDown = false; if (pending) setTimeout(flushPending, 0); };
document.addEventListener('pointerup', lift, true);
document.addEventListener('pointercancel', lift, true);

document.addEventListener('click', (e) => {
  if (e.target.id === 'use-here') { superseded = false; root.innerHTML = renderConnecting(); connect(); return; }
  const slot = e.target.closest && e.target.closest('#puzzle-slot');
  if (slot) {
    const td = e.target.closest('[data-cell]');
    const card = e.target.closest('[data-card]');
    const tap = td ? { cell: td.dataset.cell.split(',').map(Number) } : card ? { card: Number(card.dataset.card) } : null;
    if (tap && puzzle.id !== null) { puzzle.tap(tap); slot.innerHTML = puzzle.render(); if (noteKind) setNote(null); }
    return;
  }
  if (e.target.id === 'puzzle-submit') {
    if (puzzle.id === null) return;
    if (!online) { showToast('Offline - reconnecting. Your tap was not sent.'); return; }
    if (!guard.allow('puzzle_submit:' + puzzle.id, Date.now())) return;
    e.target.disabled = true;
    if (!sendMsg({ type: 'puzzle_submit', answer: puzzle.answer() })) { e.target.disabled = false; guard.release(); showToast('Offline - reconnecting. Your tap was not sent.'); }
    return;
  }
  const b = e.target.closest && e.target.closest('[data-send]');
  if (!b) return;
  if (!online) { showToast('Offline - reconnecting. Your tap was not sent.'); return; }
  if (b.classList.contains('attack-btn') || b.dataset.confirm) {
    // Dangerous: the first tap only arms the button, the second tap launches.
    if (confirmAttack.tap(b.dataset.send, Date.now()) === 'armed') {
      const label = b.textContent;
      b.textContent = b.dataset.confirm ? 'Tap again: skip for 10 coins' : 'Tap again to launch';
      b.classList.add('armed');
      setTimeout(() => { if (b.isConnected && b.classList.contains('armed')) { b.textContent = label; b.classList.remove('armed'); } }, 5000);
      return;
    }
  }
  if (!guard.allow(b.dataset.send, Date.now())) return;
  b.disabled = true;
  if (!sendMsg(b.dataset.send)) { b.disabled = false; guard.release(); showToast('Offline - reconnecting. Your tap was not sent.'); }
});

root.innerHTML = renderConnecting();
connect();
