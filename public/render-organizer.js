import { esc, fmtClock } from './render.js';

const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

// Same encoding as render.js: JSON sits in a single-quoted attribute, & < > ' entity-encoded.
const attr = (s) => s.replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
const send = (label, msg, cls = '') => `<button class="${cls}" data-send='${attr(JSON.stringify(msg))}'>${esc(label)}</button>`;
const arr = (a) => (Array.isArray(a) ? a : []);

export function renderOrganizerLogin(error) {
  return `<form id="login" class="card"><h1>Organizer</h1>
  <label>Password <input name="pw" type="password" autofocus></label><button type="submit">Enter</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}</form>`;
}

function seatSelect(p) {
  const id = esc(p.admission_id);
  const co = ['A', 'B'].map((c) => `<option value="${c}"${p.company === c ? ' selected' : ''}>${c}</option>`).join('');
  const ro = ROLES.map((r) => `<option value="${r}"${p.role === r ? ' selected' : ''}>${r}</option>`).join('');
  return `<select data-assign="${id}" data-field="company" aria-label="Company"><option value="">-</option>${co}</select>
          <select data-assign="${id}" data-field="role" aria-label="Role"><option value="">-</option>${ro}</select>
          ${p.company || p.role ? send('Unassign', { type: 'unassign', admissionId: p.admission_id }) : ''}`;
}

function importSummary(r) {
  if (!r) return '';
  const rows = arr(r.rejected).map((x) => `<li>Line ${esc(x.line)}: ${esc(x.reason)}</li>`).join('');
  return `<div class="import-result"><p>${esc(r.added)} added, ${esc(r.skipped)} skipped, ${arr(r.rejected).length} rejected</p>
  ${rows ? `<ul class="rejected">${rows}</ul>` : ''}</div>`;
}

function lobby(v, ui) {
  const ps = arr(v.participants);
  const seated = ps.filter((p) => p.status === 'lobby' && p.company && p.role).length;
  const rows = ps.map((p) => `<tr><td>${esc(p.admission_id)}</td><td>${esc(p.name)}</td><td>${esc(p.status)}</td>
    <td>${p.status === 'lobby' ? seatSelect(p) : `${esc(p.company ?? '')} ${esc(p.role ?? '')}`}</td></tr>`).join('');
  const problems = arr(v.problems).map((p) => `<option value="${esc(p.id)}">${esc(p.id)}. ${esc(p.title)}</option>`).join('');
  return `<section class="card"><h2>Roster</h2>
  <textarea id="roster" rows="4" placeholder="admission_id,name (one per line)"></textarea>
  <input type="file" id="roster-file" accept=".csv,.txt,text/csv,text/plain" aria-label="Roster file">
  <button id="import">Import roster</button>
  ${importSummary(ui.importResult)}
  <p><input id="add-id" placeholder="Admission ID"> <input id="add-name" placeholder="Name"> <button id="add">Add participant</button></p></section>
  <section class="card"><h2>Lobby</h2><p>${seated} of 10 seats filled</p>
  <table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Seat</th></tr></thead><tbody>${rows}</tbody></table></section>
  <section class="card"><h2>Start</h2><label>Problem statement <select id="problem">${problems}</select></label>
  <button id="start" class="primary">Start game</button></section>`;
}

function panel(name, c) {
  if (!c) return `<section class="card"><h2>Company ${esc(name)}</h2><p class="muted">No data.</p></section>`;
  const votes = Object.entries(c.votes ?? {}).map(([id, n]) => `${esc(id)}: ${esc(n)}`).join(', ');
  const owned = arr(c.owned);
  const items = owned.length ? owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('') : '<li class="muted">Nothing bought</li>';
  const q = arr(c.queue);
  const queue = q.length ? q.map((r) => `<li>${esc(r.label)} for ${esc(r.price)} (${esc(r.by)})</li>`).join('') : '<li class="muted">Queue empty</li>';
  const aw = arr(c.awaitingCeo);
  const awaiting = aw.length ? `<h3>Waiting for CEO</h3><ul>${aw.map((r) => `<li>${esc(r.label)} (${esc(r.by)})</li>`).join('')}</ul>` : '';
  return `<section class="card"><h2>Company ${esc(name)}</h2>
  <p class="big">${esc(c.wallet)} coins</p>
  <p>Idea: ${c.idea ? `${esc(c.idea.name)} (${esc(c.pickSource ?? '')})` : '<span class="muted">not picked</span>'}</p>
  ${votes ? `<p>Votes: ${votes}</p>` : ''}
  <h3>Bought</h3><ul>${items}</ul><h3>CFO queue</h3><ul>${queue}</ul>${awaiting}</section>`;
}

const confirmButton = (label, action, ui) => (ui.confirm === action
  ? `<span class="confirm">Are you sure? ${send(`Yes, ${label}`, { type: action }, 'danger')}<button data-confirm="">Cancel</button></span>`
  : `<button data-confirm="${esc(action)}">${esc(label)}</button>`);

function seatTools(v) {
  const players = arr(v.participants).filter((p) => p.status === 'in_game');
  const lobbyers = arr(v.participants).filter((p) => p.status === 'lobby');
  const opt = (p) => `<option value="${esc(p.admission_id)}">${esc(p.name)} (${esc(p.admission_id)}${p.company ? `, ${esc(p.company)} ${esc(p.role)}` : ''})</option>`;
  return `<section class="card"><h2>Briefing seat changes</h2>
  <p><select id="swap-a" aria-label="Swap first">${players.map(opt).join('')}</select>
  <select id="swap-b" aria-label="Swap second">${players.map(opt).join('')}</select>
  <button id="swap">Swap seats</button></p>
  <p><select id="replace-out" aria-label="Replace this player">${players.map(opt).join('')}</select>
  <select id="replace-in" aria-label="With this lobby player">${lobbyers.map(opt).join('')}</select>
  <button id="replace">Replace player</button></p></section>`;
}

export function renderOrganizer(v, ui = {}) {
  if (!v || typeof v !== 'object') return '<main><p class="error">No data.</p></main>';
  ui = ui || {};
  const err = ui.error ? `<p class="error" role="alert" id="org-error">${esc(ui.error)}</p>` : '';
  if (!v.game) return `<main>${err}${lobby(v, ui)}</main>`;
  const clock = v.game.clock ?? { phase: '?', remainingSec: 0 };
  const companies = v.game.companies ?? {};
  const stuck = arr(v.game.stuck);
  const banner = stuck.length
    ? `<p class="warn" role="alert">Warning: the ${stuck.map(esc).join(', ')} phase could not finish. Check the server log.</p>` : '';
  const controls = `<section class="card"><h2>Controls</h2>
  ${clock.phase === 'ideation' ? confirmButton('end ideation early', 'end_ideation_early', ui) : ''}
  ${confirmButton('end game', 'end_game', ui)}</section>`;
  return `<header class="bar"><span>Game ${esc(v.game.id)}</span><span class="phase">${esc(clock.phase)}</span><span id="clock">${fmtClock(clock.remainingSec)}</span></header>
  <main>${banner}${err}${controls}${clock.phase === 'briefing' ? seatTools(v) : ''}</main>
  <main class="two">${panel('A', companies.A)}${panel('B', companies.B)}</main>`;
}
