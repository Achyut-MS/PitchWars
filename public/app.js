import { renderLogin, renderScreen, fmtClock } from './render.js';

const root = document.getElementById('app');
const toast = document.getElementById('toast');
let ws = null;
let id = null;
let retry = 0;
let shownPhase = null; // phase of the view currently on screen
let syncedFor = null; // the tick phase we already asked a sync for
let lastError = '';
try { id = sessionStorage.getItem('admissionId'); } catch { /* storage may be blocked */ }

const show = (html) => { root.innerHTML = html; };
const sendMsg = (m) => { if (ws && ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };

function showToast(text) {
  toast.textContent = text;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.textContent = ''; }, 4000);
}

function showLogin(err) {
  shownPhase = null;
  show(renderLogin(err));
}

function onState(view) {
  if (!view || typeof view !== 'object') return;
  shownPhase = view.screen === 'game' && view.clock ? view.clock.phase : null;
  show(renderScreen(view));
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'welcome') {
    const a = m.participant && m.participant.admissionId;
    if (typeof a === 'string') {
      id = a;
      try { sessionStorage.setItem('admissionId', a); } catch { /* ignore */ }
    }
    sendMsg({ type: 'sync' });
  } else if (m.type === 'state') {
    syncedFor = null;
    onState(m.view);
  } else if (m.type === 'tick') {
    const c = document.getElementById('clock');
    if (c && Number.isFinite(m.remainingSec)) c.textContent = fmtClock(m.remainingSec);
    // The phase moved on without a push: ask for the fresh screen once per phase.
    if (typeof m.phase === 'string' && m.phase !== shownPhase && m.phase !== syncedFor) {
      syncedFor = m.phase;
      sendMsg({ type: 'sync' });
    }
  } else if (m.type === 'error') {
    const e = typeof m.error === 'string' ? m.error : 'error';
    if (e === 'unknown_id') {
      id = null;
      try { sessionStorage.removeItem('admissionId'); } catch { /* ignore */ }
      lastError = 'That ID is not on the list.';
      showLogin(lastError);
    } else showToast(e.replaceAll('_', ' '));
  }
}

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => {
    retry = 0;
    if (id) sendMsg({ type: 'login', admissionId: id });
    else showLogin(lastError);
  };
  ws.onclose = () => {
    // Back off 1, 2, 4, 8 s up to 15 s; the server drops dead sockets after about a minute.
    const wait = Math.min(15000, 1000 * 2 ** retry++);
    setTimeout(connect, wait);
  };
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('bad server message', err); }
  };
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'login') return;
  e.preventDefault();
  const v = new FormData(e.target).get('id');
  if (typeof v === 'string' && v.trim()) { lastError = ''; id = v.trim(); sendMsg({ type: 'login', admissionId: id }); }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-send]');
  if (b) sendMsg(b.dataset.send);
});

connect();
