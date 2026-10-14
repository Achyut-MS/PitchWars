import { esc, fmtClock, plural, renderOffline } from './render.js';
import { icon, logo, companyMark, ROLE_ICON } from './kit.js';

const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

// Same encoding as render.js: JSON sits in a single-quoted attribute, & < > ' entity-encoded.
const attr = (s) => s.replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
const send = (label, msg, cls = '') => `<button class="${cls}" data-send='${attr(JSON.stringify(msg))}'>${esc(label)}</button>`;
const dis = (ui) => (ui && ui.offline ? ' disabled' : '');
const arr = (a) => (Array.isArray(a) ? a : []);

export function renderOrganizerLogin(error) {
  return `<div class="login-page">
<header class="topbar">${logo()}<span class="brand">Makerspace</span><span class="tag">Manage.<br>Monitor.<br>Run the game.</span></header>
<main class="page">
  <div class="title"><h1><span class="one">Future</span> <span class="two">Makers</span></h1></div>
  <p class="sub">Startup Showdown</p>
  <form id="login" class="card"><h2>Organizer <b>Login</b></h2>
  <label class="field pw">${icon('i-lock')}<span class="sr-only">Password</span><input name="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus></label>
  <button type="submit" class="join">Login</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}</form>
  <aside class="card info">${icon('i-info', 'i big')}<p>Authorized organizers only. All actions are recorded.</p></aside>
  <a class="org-link" href="/">Back to participant login</a>
</main></div>`;
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

const hhmm = (ms) => { const d = new Date(Number(ms) || 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function backupLine(b) {
  if (!b || typeof b !== 'object') return '';
  return b.ok
    ? `<p class="muted" id="backup-status">Last backup ${hhmm(b.at)}, ok</p>`
    : `<p class="error" id="backup-status" role="alert">Backup failed: ${esc(b.error ?? 'unknown error')} (${hhmm(b.at)}). The game carries on; the next try is in 5 minutes.</p>`;
}

function seatBoards(v) {
  const ps = arr(v.participants);
  const board = (co) => `<section class="card company seats" data-company="${co}"><h3>${companyMark(co)}Company ${co} <span class="count">${ps.filter((p) => p.company === co && p.role).length} / 5</span></h3>
  <table><thead><tr><th>Role</th><th>Participant</th><th>Admission ID</th></tr></thead><tbody>${ROLES.map((r) => {
    const p = ps.find((x) => x.company === co && x.role === r);
    return `<tr><td>${icon(ROLE_ICON[r])} ${r}</td><td>${p ? esc(p.name) : '<span class="muted">Not assigned</span>'}</td><td>${p ? esc(p.admission_id) : '-'}</td></tr>`;
  }).join('')}</tbody></table></section>`;
  return `<div class="boards">${board('A')}${board('B')}</div>`;
}

const onlineDot = (p) => (p.online ? '<span class="on-dot on" role="img" aria-label="Online"></span> Online' : '<span class="on-dot" role="img" aria-label="Offline"></span> <span class="muted">Offline</span>');
const onlineCount = (ps) => `${ps.filter((p) => p.online).length} of ${ps.length} online`;

function playersPage(v) {
  const ps = arr(v.participants);
  const rows = ps.map((p) => `<tr><td>${esc(p.admission_id)}</td><td>${esc(p.name)}</td><td>${onlineDot(p)}</td><td>${esc(p.status)}</td><td>${esc(p.company ?? '')} ${esc(p.role ?? '')}</td></tr>`).join('');
  return ['sec-players', 'Players online', `<section class="card" id="sec-players"><h2>Players</h2><p>${onlineCount(ps)}</p>
  <table><thead><tr><th>ID</th><th>Name</th><th>Online</th><th>Status</th><th>Seat</th></tr></thead><tbody>${rows}</tbody></table></section>`];
}

function lobbyPages(v, ui) {
  const ps = arr(v.participants);
  const seated = ps.filter((p) => p.status === 'lobby' && p.company && p.role).length;
  const rows = ps.map((p) => `<tr><td>${esc(p.admission_id)}</td><td>${esc(p.name)}</td><td>${onlineDot(p)}</td><td>${esc(p.status)}</td>
    <td>${p.status === 'lobby' ? seatSelect(p) : `${esc(p.company ?? '')} ${esc(p.role ?? '')}`}</td></tr>`).join('');
  const problems = arr(v.problems).map((p) => `<option value="${esc(p.id)}">${esc(p.id)}. ${esc(p.title)}</option>`).join('');
  return [
    ['sec-roster', 'Roster', `<section class="card" id="sec-roster"><h2>Roster</h2>
  <p><a href="/join" target="_blank" rel="noopener" id="join-sign">Open the join sign</a></p>
  <textarea id="roster" rows="4" placeholder="admission_id,name (one per line)" aria-label="Roster"></textarea>
  <input type="file" id="roster-file" accept=".csv,.txt,text/csv,text/plain" aria-label="Roster file">
  <button id="import"${dis(ui)}>Import roster</button>
  ${importSummary(ui.importResult)}
  <p><input id="add-id" placeholder="Admission ID" aria-label="Admission ID"> <input id="add-name" placeholder="Name" aria-label="Name"> <button id="add"${dis(ui)}>Add participant</button></p></section>`],
    ['sec-lobby', 'Lobby & roles', `<section class="card" id="sec-lobby"><h2>Lobby</h2><p>${seated} of 10 seats filled. ${onlineCount(ps)}</p>
  <table><thead><tr><th>ID</th><th>Name</th><th>Online</th><th>Status</th><th>Seat</th></tr></thead><tbody>${rows}</tbody></table></section>
  ${seatBoards(v)}`],
    ['sec-start', 'Start', `<section class="card" id="sec-start"><h2>Start</h2><label>Problem statement <select id="problem">${problems}</select></label>
  ${ui.confirm === 'start_game'
    ? `<span class="confirm">The clock starts for everyone. <button id="start-yes" class="danger"${dis(ui)}>Yes, start game</button><button data-confirm="">Cancel</button></span>`
    : `<button id="start" class="primary" data-confirm="start_game"${dis(ui)}>Start game</button>`}</section>`],
  ];
}

function panel(name, c, ideas) {
  const co = name === 'B' ? 'B' : 'A';
  if (!c) return `<section class="card company" data-company="${co}"><h2>${companyMark(co)}Company ${esc(name)}</h2><p class="muted">No data.</p></section>`;
  const votes = Object.entries(c.votes ?? {}).map(([id, n]) => `${esc(arr(ideas).find((i) => i && i.id === id)?.name ?? id)}: ${esc(plural(n, 'vote'))}`).join(', ');
  const owned = arr(c.owned);
  const items = owned.length ? owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('') : '<li class="muted">Nothing bought</li>';
  const q = arr(c.queue);
  const queue = q.length ? q.map((r) => `<li>${esc(r.label)} for ${esc(r.price)} (${esc(r.by)})</li>`).join('') : '<li class="muted">Queue empty</li>';
  const aw = arr(c.awaitingCeo);
  const awaiting = aw.length ? `<h3>Waiting for CEO</h3><ul>${aw.map((r) => `<li>${esc(r.label)} (${esc(r.by)})</li>`).join('')}</ul>` : '';
  return `<section class="card company" data-company="${co}"><h2>${companyMark(co)}Company ${esc(name)}</h2>
  <p class="big">${esc(plural(c.wallet, 'coin'))}</p>
  <p>Idea: ${c.idea ? `${esc(c.idea.name)} (${esc(c.pickSource ?? '')})` : '<span class="muted">not picked</span>'}</p>
  ${votes ? `<p>Votes: ${votes}</p>` : ''}
  <h3>Bought</h3><ul>${items}</ul><h3>CFO queue</h3><ul>${queue}</ul>${awaiting}</section>`;
}

const confirmButton = (label, action, ui) => (ui.confirm === action
  ? `<span class="confirm">Are you sure? ${send(`Yes, ${label}`, { type: action }, 'danger')}<button data-confirm="">Cancel</button></span>`
  : `<button data-confirm="${esc(action)}"${dis(ui)}>${esc(label)}</button>`);

const EVENT_NAMES = { demand_surge: 'Demand Surge', demand_slump: 'Demand Slump', shop_sale: 'Shop Sale' };

function competitionPages(g, ui) {
  const eventPart = g.eventUsed
    ? `<p>Market event. Used: ${esc(EVENT_NAMES[g.eventUsed] ?? g.eventUsed)}</p>`
    : ui.confirm && ui.confirm.startsWith('event:') && Object.hasOwn(EVENT_NAMES, ui.confirm.slice(6))
      ? `<p>Market event: <span class="confirm">Are you sure? ${send(`Yes, start ${EVENT_NAMES[ui.confirm.slice(6)]}`, { type: 'market_event', key: ui.confirm.slice(6) }, 'danger')}<button data-confirm="">Cancel</button></span></p>`
      : `<p>Market event (one per game): ${Object.entries(EVENT_NAMES).map(([k, n]) => `<button data-confirm="event:${k}"${dis(ui)}>${esc(n)}</button>`).join(' ')}</p>`;
  const inj = g.injectionUsed;
  const d = ui.injectDraft;
  const injPart = inj
    ? `<p>Coin injection. Used: ${esc(inj.coins)} coins to Company ${esc(inj.company)}</p>`
    : ui.confirm === 'inject' && d
      ? `<p>Coin injection: <span class="confirm">Add ${esc(d.coins)} coins to Company ${esc(d.company)}? ${send('Yes, inject coins', { type: 'inject', company: d.company, coins: d.coins }, 'danger')}<button data-confirm="">Cancel</button></span></p>`
      : `<p>Coin injection (one per game): <label for="inj-company">Company <select id="inj-company"><option value="A">A</option><option value="B">B</option></select></label>
      <label for="inj-coins">Coins (1 to 500) <input id="inj-coins" type="number" min="1" max="500" step="1" value="${esc(d ? d.coins : '')}"></label>
      <button id="inj-ask"${dis(ui)}>Inject coins</button></p>`;
  const log = arr(g.attacks);
  const logPart = log.length
    ? `<ul>${log.map((a) => `<li>${esc(a.name)}: Company ${esc(a.attacker)} against ${esc(a.victim)}, cost ${esc(a.cost)}${a.blocked ? ', blocked by a shield' : ''}</li>`).join('')}</ul>`
    : '<p class="muted">No attacks yet.</p>';
  return [
    ['sec-attacks', 'Attacks', `<section class="card" id="sec-attacks"><h2>Attack log</h2>${logPart}</section>`],
    ['sec-event', 'Market event', `<section class="card" id="sec-event"><h2>Competition controls</h2>${eventPart}</section>`],
    ['sec-inject', 'Coin injection', `<section class="card" id="sec-inject"><h2>Coin injection</h2>${injPart}</section>`],
  ];
}

function seatTools(v, ui) {
  const players = arr(v.participants).filter((p) => p.status === 'in_game');
  const lobbyers = arr(v.participants).filter((p) => p.status === 'lobby');
  const opt = (p) => `<option value="${esc(p.admission_id)}">${esc(p.name)} (${esc(p.admission_id)}${p.company ? `, ${esc(p.company)} ${esc(p.role)}` : ''})</option>`;
  const sel = (id, label, list) => `<label for="${id}">${label} <select id="${id}">${list.map(opt).join('')}</select></label>`;
  return `<section class="card"><h2>Briefing seat changes</h2>
  <p>${sel('swap-a', 'Swap: first player', players)} ${sel('swap-b', 'Swap: second player', players)}
  <button id="swap"${dis(ui)}>Swap seats</button></p>
  <p>${sel('replace-out', 'Replace: who leaves', players)} ${sel('replace-in', 'Replace: who comes in', lobbyers)}
  <button id="replace"${dis(ui)}>Replace player</button></p></section>`;
}

const PNGS = [['company-vs-company', 'Company vs company'], ['coin-difference', 'Coin difference'], ['role-bars', 'Coins by role']];

function resultsControls(g, ui) {
  const id = esc(g.id);
  const reveal = g.ended && !g.revealed ? `<p><button id="reveal" class="primary"${dis(ui)}>Reveal graphs</button></p>` : '';
  return `<section class="card" id="sec-results"><h2>Results</h2>${reveal}<p><button id="next-game"${dis(ui)}>Next Game</button></p></section>`;
}

// Always shown (lobby, running, between games). organizer.js completes the links at click time.
function downloadsPanel(d) {
  if (!d || typeof d !== 'object') return '';
  const row = (g) => {
    const id = esc(g.id);
    const pngs = g.revealedAt != null
      ? PNGS.map(([stem, name]) => `<a href="/export/game/${id}/${stem}.png" data-export>${esc(name)} (PNG)</a>`).join(' ')
      : '<span class="muted">graphs appear after Reveal</span>';
    return `<li>Game ${id}${g.running ? ' (running)' : ''}: <a href="/export/game/${id}.xlsx" data-export>Excel</a> ${pngs}</li>`;
  };
  const games = arr(d.games);
  return `<section class="card" id="downloads"><h2>Downloads</h2>
  <p><a href="/export/event.xlsx" data-export>Whole event (Excel)</a></p>
  ${games.length ? `<ul>${games.map(row).join('')}</ul>` : '<p class="muted">No games yet.</p>'}</section>`;
}

// pages: [[id, label, html]]. With ui.page set (the URL hash), only that page is shown; without it, every page.
function shell(head, pages, current) {
  const links = pages.map(([id, label]) => `<a href="#${id}"${id === current ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('');
  const body = pages.filter(([id, , html]) => current === null || id === current).map(([, , html]) => html).join('');
  return `<div class="frame"><div class="brandbox">${logo()}</div>
  <div class="head"><p class="h1">Future <b>Makers</b></p><p class="sub2">Startup Showdown</p></div>
  <nav class="side" aria-label="Organizer sections"><p class="side-who">Organizer panel</p>${links}</nav>
  <div class="desk">${head.top}<main>${head.notes}${body}</main></div></div>`;
}

function renderOrganizerInner(v, ui = {}) {
  if (!v || typeof v !== 'object') return { top: '', notes: '', pages: [['sec-none', 'Organizer', '<p class="error">No data.</p>']] };
  ui = ui || {};
  const off = ui.offline ? renderOffline() : '';
  const err = off + (ui.error ? `<p class="error" role="alert" id="org-error">${esc(ui.error)}</p>` : '');
  const rehearsal = Number(v.rehearsalSpeed) > 1
    ? `<p class="warn" id="rehearsal-banner" role="alert">REHEARSAL SPEED x${esc(v.rehearsalSpeed)} — NOT FOR THE EVENT</p>` : '';
  const downloads = ['downloads', 'Downloads', downloadsPanel(v.downloads)];
  if (!v.game) return { top: '', notes: `${rehearsal}${err}${backupLine(v.backup)}`, pages: [...lobbyPages(v, ui), downloads] };
  const clock = v.game.clock ?? { phase: '?', remainingSec: 0 };
  const companies = v.game.companies ?? {};
  const stuck = arr(v.game.stuck);
  const banner = stuck.length
    ? `<p class="warn" role="alert">Warning: the ${stuck.map(esc).join(', ')} phase could not finish. Check the server log.</p>` : '';
  const controls = `<section class="card" id="sec-controls"><h2>Controls</h2>
  ${clock.phase === 'ideation' ? confirmButton('end ideation early', 'end_ideation_early', ui) : ''}
  ${['briefing', 'ideation', 'shop', 'summary'].includes(clock.phase)
    ? `<p class="muted">Rehearsal and testing only:</p>${confirmButton('skip to next phase', 'skip_phase', ui)}` : ''}
  ${['ideation', 'briefing', 'shop', 'summary'].includes(clock.phase) ? '' : '<p class="muted">The clock runs this phase on its own.</p>'}
  <h3>Reset</h3><p class="muted">Players stay connected and keep their teams.</p>
  <p>${confirmButton('restart this stage', 'reset_stage', ui)} ${confirmButton('reset whole game', 'reset_game', ui)}</p></section>`;
  const top = `<header class="bar"><span>Game ${esc(v.game.id)}</span><span class="phase">${esc(clock.phase)}</span><span class="timer"><span class="pill"><span id="clock">${fmtClock(clock.remainingSec)}</span></span></span></header>`;
  const live = `<div class="two" id="sec-companies">${panel('A', companies.A, v.game.ideas)}${panel('B', companies.B, v.game.ideas)}</div>`;
  return {
    top,
    notes: `${rehearsal}${banner}${err}${backupLine(v.backup)}`,
    pages: [
      ['sec-controls', 'Game control', controls + (clock.phase === 'briefing' ? seatTools(v, ui) : '')],
      ['sec-companies', 'Live monitor', live],
      ...(clock.phase === 'competition' ? competitionPages(v.game, ui) : []),
      playersPage(v),
      ['sec-results', 'Results', resultsControls(v.game, ui)],
      downloads,
    ],
  };
}

export function renderOrganizer(v, ui = {}) {
  const { top, notes, pages } = renderOrganizerInner(v, ui);
  const want = ui && ui.page;
  // An unknown or missing page in the URL falls back to the first one; no ui.page at all shows everything.
  const current = want === undefined ? null : (pages.some(([id]) => id === want) ? want : pages[0][0]);
  return shell({ top, notes }, pages, current);
}
