import { renderOrganizer, renderOrganizerLogin } from './render-organizer.js';
import { renderConnecting, fmtClock } from './render.js';
import { humanError, viewKey, createSendGuard, redrawDecision } from './glue.js';

const root = document.getElementById('app');
const guard = createSendGuard(600);
let ws = null;
let password = null;
let retry = 0;
let view = null;
let phaseShown = null;
let syncedFor = null;
let shownKey = null;
let pointerDown = false;
let downAt = 0;
let pendingTimer = null;
let token = null; // download token from the organizer welcome; memory only, never put in the DOM
const pageFromHash = () => { try { return decodeURIComponent(location.hash.slice(1)) || null; } catch { return null; } };
const ui = { page: pageFromHash() ?? '', injectDraft: null, importResult: null, confirm: null, error: '', offline: true };
try { password = sessionStorage.getItem('orgPassword'); } catch { /* ignore */ }

// Returns false (and shows why) when the message could not be sent: nothing is dropped silently.
function send(m) {
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
  ui.error = 'Not connected to the server. Nothing was sent. Wait for the reconnect and try again.';
  draw(true);
  return false;
}
const KEEP = ['roster', 'add-id', 'add-name', 'problem', 'swap-a', 'swap-b', 'replace-out', 'replace-in'];
const assignKey = (el) => `${el.dataset.assign}|${el.dataset.field}`;

// Re-render without losing what the organizer is typing or choosing.
function paint() {
  if (!view) return;
  const saved = KEEP.map((k) => { const el = document.getElementById(k); return el && [k, el.value]; }).filter(Boolean);
  const seats = [...root.querySelectorAll('select[data-assign]')].map((el) => [assignKey(el), el.value]);
  const open = [...root.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]);
  const focusId = document.activeElement && document.activeElement.id;
  root.innerHTML = renderOrganizer(view, ui);
  for (const [k, val] of saved) { const el = document.getElementById(k); if (el) el.value = val; }
  for (const [k, val] of seats) { const el = [...root.querySelectorAll('select[data-assign]')].find((x) => assignKey(x) === k); if (el && !el.disabled) el.value = val; }
  for (const [k, o] of open) { const d = [...root.querySelectorAll('details[data-key]')].find((x) => x.dataset.key === k); if (d) d.open = o; }
  const f = focusId && document.getElementById(focusId);
  if (f) f.focus();
  guard.release();
}

// force: the UI itself changed (confirm, banner, error). Otherwise skip identical views and wait out a touch.
function draw(force = false) {
  if (!view) return;
  const key = viewKey(view) + JSON.stringify([ui.page, ui.confirm, ui.error, ui.offline, ui.importResult, ui.injectDraft]);
  const d = redrawDecision({ changed: force || key !== shownKey, pointerDown: force ? false : pointerDown, downAt, now: Date.now() });
  if (d.action === 'skip') { guard.release(); return; }
  if (d.action === 'defer') { clearTimeout(pendingTimer); pendingTimer = setTimeout(() => draw(), d.wait); return; }
  shownKey = key;
  paint();
}

const logoutBtn = document.getElementById('logout');
const showLogout = (on) => { if (logoutBtn) logoutBtn.hidden = !on; };
logoutBtn?.addEventListener('click', () => {
  try { sessionStorage.removeItem('orgPassword'); } catch { /* ignore */ }
  location.reload(); // a fresh page, no stored password: the login screen
});

function showLogin(msg) { showLogout(false); view = null; shownKey = null; root.innerHTML = renderOrganizerLogin(msg); }

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'welcome') { if (typeof m.token === 'string') token = m.token; ui.offline = false; send({ type: 'sync' }); }
  else if (m.type === 'state') {
    if (!m.view || typeof m.view !== 'object') return;
    view = m.view;
    showLogout(true);
    syncedFor = null;
    phaseShown = view.game && view.game.clock ? view.game.clock.phase : null;
    if (m.result && Array.isArray(m.result.rejected)) ui.importResult = m.result;
    ui.error = '';
    draw();
  } else if (m.type === 'tick') {
    const c = document.getElementById('clock');
    if (c && Number.isFinite(m.remainingSec)) c.textContent = fmtClock(m.remainingSec);
    if (typeof m.phase === 'string' && m.phase !== phaseShown && m.phase !== syncedFor) { syncedFor = m.phase; send({ type: 'sync' }); }
  } else if (m.type === 'error') {
    const e = typeof m.error === 'string' ? m.error : '';
    guard.release();
    if (e === 'bad_password' || e === 'too_many_attempts') {
      password = null;
      try { sessionStorage.removeItem('orgPassword'); } catch { /* ignore */ }
      showLogin(humanError(e));
    } else if (!view) {
      showLogin(humanError(e));
    } else { ui.error = humanError(e); draw(true); }
  }
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    retry = 0;
    if (password) ws.send(JSON.stringify({ type: 'organizer', password })); else showLogin('');
  };
  ws.onclose = () => {
    ui.offline = true;
    if (view) draw(true); else if (password) root.innerHTML = renderConnecting();
    setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
  };
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('bad server message', err); } };
}

const val = (i) => { const el = document.getElementById(i); return el ? el.value : ''; };

document.addEventListener('submit', (e) => {
  if (!e.target.matches || !e.target.matches('#login')) return;
  e.preventDefault();
  const pw = new FormData(e.target).get('pw');
  if (typeof pw !== 'string' || !pw) return;
  if (!ws || ws.readyState !== 1) { root.innerHTML = renderOrganizerLogin('Not connected yet. Try again in a moment.'); return; }
  password = pw;
  try { sessionStorage.setItem('orgPassword', pw); } catch { /* ignore */ }
  ws.send(JSON.stringify({ type: 'organizer', password }));
});

document.addEventListener('pointerdown', () => { pointerDown = true; downAt = Date.now(); }, true);
const lift = () => { pointerDown = false; };
document.addEventListener('pointerup', lift, true);
document.addEventListener('pointercancel', lift, true);

// One send per click burst: the guard ignores a second tap, and the same message twice within 600 ms.
const guarded = (m) => { const text = JSON.stringify(m); if (!guard.allow(text, Date.now())) return; ui.confirm = null; send(m); };

// Download links carry the token only for the instant of the click, then the plain href is restored.
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-export], a[data-graph]');
  if (!a || !token) return;
  const plain = a.getAttribute('href').split('?')[0];
  a.setAttribute('href', `${plain}?token=${encodeURIComponent(token)}`);
  setTimeout(() => a.setAttribute('href', plain), 0);
}, true);

let confirmTimer = null;
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('button');
  if (!t || t.disabled) return;
  if (t.dataset.send) { t.disabled = true; guarded(JSON.parse(t.dataset.send)); return; }
  if (t.dataset.confirm !== undefined) {
    ui.confirm = t.dataset.confirm || null;
    clearTimeout(confirmTimer);
    if (ui.confirm) confirmTimer = setTimeout(() => { ui.confirm = null; draw(true); }, 8000);
    draw(true);
    return;
  }
  if (t.id === 'inj-ask') {
    const coins = Number(val('inj-coins'));
    if (!Number.isInteger(coins) || coins < 1 || coins > 500) { ui.error = 'Coins must be a whole number from 1 to 500.'; draw(true); return; }
    ui.error = ''; ui.injectDraft = { company: val('inj-company') === 'B' ? 'B' : 'A', coins }; ui.confirm = 'inject';
    clearTimeout(confirmTimer); confirmTimer = setTimeout(() => { ui.confirm = null; draw(true); }, 8000);
    draw(true);
    return;
  }
  if (t.id === 'reveal') guarded({ type: 'reveal' });
  else if (t.id === 'next-game') { if (confirm('End this game and mark the players Game Completed?')) guarded({ type: 'next_game' }); }
  else if (t.id === 'start-yes') guarded({ type: 'start_game', problemId: Number(val('problem')) });
  else if (t.id === 'import') guarded({ type: 'roster_import', text: val('roster') });
  else if (t.id === 'add') {
    guarded({ type: 'add_participant', admissionId: val('add-id'), name: val('add-name') });
    for (const k of ['add-id', 'add-name']) { const el = document.getElementById(k); if (el) el.value = ''; }
  } else if (t.id === 'swap') guarded({ type: 'swap_seats', a: val('swap-a'), b: val('swap-b') });
  else if (t.id === 'replace') guarded({ type: 'replace_player', out: val('replace-out'), in: val('replace-in') });
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'roster-file' && el.files && el.files[0]) {
    el.files[0].text().then((txt) => { const r = document.getElementById('roster'); if (r) r.value = txt; });
    return;
  }
  const a = el.dataset && el.dataset.assign;
  if (!a) return;
  const sel = [...document.querySelectorAll('[data-assign]')].filter((s) => s.dataset.assign === a);
  const company = (sel.find((s) => s.dataset.field === 'company') || {}).value;
  const role = (sel.find((s) => s.dataset.field === 'role') || {}).value;
  if (company && role) send({ type: 'assign', admissionId: a, company, role });
});

window.addEventListener('hashchange', () => { ui.page = pageFromHash() ?? ''; draw(true); window.scrollTo(0, 0); });

root.innerHTML = renderConnecting();
connect();
