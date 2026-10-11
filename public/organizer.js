import { renderOrganizer, renderOrganizerLogin } from './render-organizer.js';
import { fmtClock } from './render.js';

const root = document.getElementById('app');
let ws = null;
let password = null;
let retry = 0;
let view = null;
let phaseShown = null;
let syncedFor = null;
let signedIn = false;
const ui = { importResult: null, confirm: null, error: '' };
try { password = sessionStorage.getItem('orgPassword'); } catch { /* ignore */ }

const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const KEEP = ['roster', 'add-id', 'add-name', 'problem', 'swap-a', 'swap-b', 'replace-out', 'replace-in'];

// Re-render without losing what the organizer is typing or choosing.
function draw() {
  if (!view) return;
  const saved = KEEP.map((k) => { const el = document.getElementById(k); return el && [k, el.value]; }).filter(Boolean);
  const focusId = document.activeElement && document.activeElement.id;
  root.innerHTML = renderOrganizer(view, ui);
  for (const [k, val] of saved) { const el = document.getElementById(k); if (el) el.value = val; }
  const f = focusId && document.getElementById(focusId);
  if (f) f.focus();
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'welcome') { signedIn = true; send({ type: 'sync' }); }
  else if (m.type === 'state') {
    if (!m.view || typeof m.view !== 'object') return;
    view = m.view;
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
    const e = typeof m.error === 'string' ? m.error : 'error';
    if (e === 'bad_password' || e === 'too_many_attempts') {
      password = null; signedIn = false;
      try { sessionStorage.removeItem('orgPassword'); } catch { /* ignore */ }
      root.innerHTML = renderOrganizerLogin(e === 'bad_password' ? 'Wrong password.' : 'Too many attempts. Wait a minute.');
    } else { ui.error = e; draw(); }
  }
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    retry = 0;
    if (password) send({ type: 'organizer', password }); else root.innerHTML = renderOrganizerLogin('');
  };
  ws.onclose = () => { signedIn = false; setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++)); };
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('bad server message', err); } };
}

const val = (i) => { const el = document.getElementById(i); return el ? el.value : ''; };

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const pw = new FormData(e.target).get('pw');
  if (typeof pw !== 'string' || !pw) return;
  password = pw;
  try { sessionStorage.setItem('orgPassword', pw); } catch { /* ignore */ }
  send({ type: 'organizer', password });
});

let confirmTimer = null;
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('button');
  if (!t) return;
  if (t.dataset.send) { ui.confirm = null; send(JSON.parse(t.dataset.send)); return; }
  if (t.dataset.confirm !== undefined) {
    ui.confirm = t.dataset.confirm || null;
    clearTimeout(confirmTimer);
    if (ui.confirm) confirmTimer = setTimeout(() => { ui.confirm = null; draw(); }, 8000);
    draw();
    return;
  }
  if (t.id === 'import') send({ type: 'roster_import', text: val('roster') });
  else if (t.id === 'add') {
    send({ type: 'add_participant', admissionId: val('add-id'), name: val('add-name') });
    for (const k of ['add-id', 'add-name']) { const el = document.getElementById(k); if (el) el.value = ''; }
  } else if (t.id === 'start') send({ type: 'start_game', problemId: Number(val('problem')) });
  else if (t.id === 'swap') send({ type: 'swap_seats', a: val('swap-a'), b: val('swap-b') });
  else if (t.id === 'replace') send({ type: 'replace_player', out: val('replace-out'), in: val('replace-in') });
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

connect();
