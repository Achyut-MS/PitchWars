export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

export const renderConnecting = () => '<main><section class="card"><p>Connecting...</p></section></main>';
export const renderOffline = () => '<p class="offline" role="alert">Offline - reconnecting...</p>';

export const fmtClock = (sec) => {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// A button that sends one message. The JSON sits in a single-quoted attribute. & < > and ' are entity-encoded
// (the browser decodes them back before dataset.send is read), so no value can leave the attribute. Plan fix: the
// plan only encoded ', which left raw < > & in the attribute.
const attr = (s) => s.replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
const send = (label, msg, cls = '', off = false) =>
  `<button class="${cls}" data-send='${attr(JSON.stringify(msg))}'${off ? ' disabled' : ''}>${esc(label)}</button>`;

export function renderLogin(error) {
  return `<form id="login" class="card">
  <h1>Startup Showdown</h1>
  <label>Admission ID <input name="id" autocomplete="off" autocapitalize="characters" autofocus></label>
  <button type="submit">Enter</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form>`;
}

// The clock turns red in the last 10 seconds (server-sent remainingSec only).
export const clockClass = (sec) => (Number.isFinite(sec) && sec <= 10 ? 'red' : '');

function header(v) {
  const { me, clock, wallet } = v;
  const red = clockClass(clock.remainingSec) || (clock.warning === 'last10' ? 'red' : '');
  return `<header class="bar compact">
  <span class="who">Company ${esc(me.company)}: ${esc(me.role)} <small class="phase">${esc(clock.phase)}</small></span>
  <span class="wallet">${esc(plural(wallet, 'coin'))}</span>
  <span id="clock"${red ? ' class="red"' : ''}>${fmtClock(clock.remainingSec)}</span>
</header>`;
}

function ownedPanel(v) {
  if (!v.owned || !v.owned.length) return '<p class="muted">Nothing bought yet.</p>';
  return `<ul class="owned">${v.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>`;
}

function briefing(v) {
  return `${header(v)}<main><section class="card">
  <h2>You are the ${esc(v.me.role)}</h2>
  <h3>${esc(v.problem.title)}</h3><p>${esc(v.problem.statement)}</p>
  <p class="muted">The game starts when the countdown ends.</p></section></main>`;
}

function ideation(v) {
  const { ideas, picked, canPick } = v.ideation;
  const cards = ideas.map((i) => `<li class="idea${i.mine ? ' mine' : ''}">
    <h3>${esc(i.name)} <small>${esc(i.type)}</small></h3><p>${esc(i.description)}</p>
    <p class="votes">${esc(plural(i.votes, 'vote'))}</p>
    ${picked ? '' : send(i.mine ? 'Your vote' : 'Vote', { type: 'vote', ideaId: i.id })}
    ${canPick ? send('Pick this idea', { type: 'pick', ideaId: i.id }, 'primary') : ''}
  </li>`).join('');
  return `${header(v)}<main><h2>${esc(v.problem.title)}</h2>
  ${picked ? `<p class="notice">Your company picked ${esc(ideas.find((i) => i.id === picked)?.name ?? picked)}. Waiting for the other company.</p>` : ''}
  <ul class="ideas">${cards}</ul></main>`;
}

function catalogItem(it, locked = false, sale = false) {
  const buy = [];
  if (it.canRequest) {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(c, { type: 'request', itemId: it.id, choice: String(n + 1) }, '', locked)));
    } else buy.push(send(`Request for ${it.price}`, { type: 'request', itemId: it.id }, '', locked));
  }
  if (it.canRecommend && it.state === 'available') {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(`Recommend ${c}`, { type: 'recommend', itemId: it.id, choice: String(n + 1) }, '', locked)));
    } else buy.push(send('Recommend', { type: 'recommend', itemId: it.id }, '', locked));
  }
  return `<li class="item ${esc(it.state)}"><span class="name">${esc(it.label)}</span>
    <span class="cost"><span class="price">${esc(it.price)}</span>${sale && it.price != null && it.cost != null && Number(it.price) < Number(it.cost) ? ` <s class="list">${esc(it.cost)}</s>` : ''}</span>
    ${it.state === 'owned' ? '<em>Owned</em>' : it.state === 'requested' ? '<em>Requested</em>' : it.state === 'wait' ? `<em>${esc(it.note)}</em>` : ''}
    ${buy.join('')}</li>`;
}

function queueList(v) {
  const lk = !!(v.shop && v.shop.locked);
  const q = v.shop && v.shop.queue;
  if (!Array.isArray(q)) return '';
  const rows = q.map((r) => `<li class="req${r.head ? ' head' : ''}"><span>${esc(r.label)} for ${esc(r.price)}</span>
    <small>from ${esc(r.by)}${r.recommended ? ' (CEO recommends)' : ''}</small>
    ${r.head && v.me.role === 'CFO' ? send('Approve', { type: 'cfo_decide', requestId: r.id, approve: true }, 'primary', lk) + send('Reject', { type: 'cfo_decide', requestId: r.id, approve: false }, '', lk) : ''}</li>`).join('');
  return `<section class="card"><h3>CFO queue</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">No requests waiting.</p>'}</section>`;
}

function awaitingList(v) {
  const q = v.shop && v.shop.awaitingCeo;
  if (!Array.isArray(q)) return '';
  const rows = q.map((r) => `<li class="req"><span>${esc(r.label)} for ${esc(r.price)}</span><small>suggested by ${esc(r.by)}</small>
    ${send('Approve feature', { type: 'ceo_decide', requestId: r.id, approve: true }, 'primary')}${send('Reject', { type: 'ceo_decide', requestId: r.id, approve: false })}</li>`).join('');
  return `<section class="card"><h3>Features waiting for you</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">None.</p>'}</section>`;
}

const HINTS = {
  CTO: 'Request features for the CEO to approve',
  CEO: 'Approve features and recommend items for the CFO',
  CFO: 'Approve or reject the oldest request first',
  CMO: 'Request target user, brand, tagline and ads for the CFO to approve',
  COO: 'Request operations items for the CFO to approve',
};

export function shopBody(v) {
  const sh = v.shop || {};
  const catalog = Array.isArray(sh.catalog) ? sh.catalog : [];
  const sections = [...new Set(catalog.map((i) => i.section))];
  const shopClosed = v.clock.phase === 'competition' && !!v.shop && sh.open === false;
  const saleOn = !!(sh.sale && sh.sale.active);
  const saleBadge = saleOn ? `<p class="sale-badge" role="status">Sale! ${esc(num(sh.sale.endsInSec))} s left</p>` : '';
  const lock = typeof sh.locked === 'string' && sh.locked ? sh.locked : '';
  const lists = sections.map((s) => {
    const items = catalog.filter((i) => i.section === s);
    const own = items.some((i) => i.role === v.me.role);
    return `<details class="card" data-key="${esc('sec-' + s)}"${own ? ' open' : ''}><summary>${esc(s)}</summary><ul>${items.map((i) => catalogItem(i, !!lock || shopClosed, saleOn)).join('')}</ul></details>`;
  }).join('');
  const mineRows = Array.isArray(sh.mine) ? sh.mine : [];
  const mine = mineRows.length ? `<section class="card"><h3>My requests</h3><ul>${mineRows.map((r) => `<li>${esc(r.label)}: ${esc(r.status)}</li>`).join('')}</ul></section>` : '';
  const closed = v.clock.phase === 'competition' && v.shop && sh.open === false ? '<p class="shop-closed" role="status">Shop closed: no new requests. Open requests can still be decided.</p>' : '';
  return `<main>
  <p class="hint">${esc(HINTS[v.me.role] ?? '')}</p>
  ${saleBadge}${lock ? `<p class="locked" role="status">${esc(lock)}</p>` : ''}${closed}
  ${v.idea ? `<p class="product">Product: ${esc(v.idea.name)}</p>` : ''}
  ${awaitingList(v)}${queueList(v)}${mine}${lists}
  <section class="card"><h3>Our product</h3>${ownedPanel(v)}</section></main>`;
}

const shop = (v) => `${header(v)}${shopBody(v)}`;

const BANNERS = {
  '5min': '5 minutes left',
  '2min': '2 minutes left',
  '30s': '30 seconds left: the shop is closed',
  last10: 'Last 10 seconds',
};
const MAX_RATE = 27; // a role's top coins per minute at level 3
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

function ratesPanel(v, c) {
  const r = c.rates;
  if (!r) return '';
  const role = v.me.role;
  const mine = ['CTO', 'CMO', 'COO'].includes(role) ? num(r[role]) : null;
  const lv = c.level && c.level[role];
  const level = Number.isFinite(Number(lv)) && lv != null ? (Number.isInteger(Number(lv)) ? String(Number(lv)) : Number(lv).toFixed(1)) : '';
  const meter = mine == null ? '' : `<div id="sales-meter" class="meter" role="meter" aria-valuemin="0" aria-valuemax="${MAX_RATE}" aria-valuenow="${esc(mine)}" aria-label="Your sales">
  <div class="fill" style="width:${Math.min(100, Math.round((mine / MAX_RATE) * 100))}%"></div></div>
  <p>Your sales: <b class="my-rate">${esc(mine)}</b> coins per minute ${level === '' ? '' : `<small class="level">Level ${esc(level)}</small>`}</p>`;
  return `<section class="card rates"><h3>Sales per minute</h3>${meter}
  <ul><li>CTO <b>${esc(num(r.CTO))}</b></li><li>CMO <b>${esc(num(r.CMO))}</b></li><li>COO <b>${esc(num(r.COO))}</b></li></ul>
  <p class="big">${esc(num(r.total))} coins per minute</p></section>`;
}

function attackPanel(c) {
  const a = c.attack;
  if (!a) return '';
  const lock = a.lockedReason === 'cooldown' ? `Ready in ${num(a.cooldownLeftSec)} s` : a.lockedReason === 'last minute' ? 'Attacks are closed for the last minute' : '';
  const buttons = (Array.isArray(a.options) ? a.options : []).map((o) => `<li>${send(`${o.name} (${o.cost})`, { type: 'attack', key: o.key }, 'attack-btn danger', !!a.lockedReason)}</li>`).join('');
  const launches = (Array.isArray(a.launches) ? a.launches : []).map((l) => `<li class="launch ${esc(l.status)}">${esc(l.name)} (${esc(l.cost)}): ${l.status === 'blocked' ? 'Attack blocked' : 'Attack launched'}</li>`).join('');
  return `<section id="attack-deck" class="card attacks"><h3>Command centre</h3>${lock ? `<p class="muted">${esc(lock)}</p>` : ''}
  <ul class="deck">${buttons}</ul>${launches ? `<h4>Your launches</h4><ul class="launches">${launches}</ul>` : ''}</section>`;
}

function shieldPanel(c) {
  if (!c.shield) return '';
  const t = !c.shield.owned ? 'No shield' : c.shield.used ? 'Shield used' : 'Shield ready';
  return `<section class="card shield"><h3>${esc(t)}</h3></section>`;
}

function hintCard(c) {
  if (!c.hint || !c.hint.text) return '';
  return `<aside class="hint" aria-label="Hint"><details open><summary>Hint</summary><p>${esc(c.hint.text)}</p></details></aside>`;
}

const nz = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

// The CFO's puzzle panel. Plain markup; #puzzle-slot is filled by the browser from its local puzzle state.
export function renderPuzzlePanel(v) {
  const c = v.competition || {};
  if (v.me.role !== 'CFO' || !('puzzle' in c)) return '';
  const pp = c.puzzlePanel || {};
  const done = c.puzzlesDone || {};
  const solved = nz(pp.solved ?? done.solved);
  const note = '<p id="puzzle-note" class="puzzle-note muted" role="status"></p>';
  if (!c.puzzle) {
    const lvl = pp.level != null ? `<p class="puzzle-stats">Level ${esc(pp.level)} | Solved: ${esc(solved)}${pp.nextReward != null ? ` | Next reward: ${esc(pp.nextReward)} coins` : ''}</p>` : '';
    return `<section class="card puzzle" id="puzzle-panel"><h3>Puzzles</h3><p class="muted">Puzzles are optional. Solved puzzles earn coins.</p>${lvl}${send('Start a puzzle', { type: 'puzzle_next' }, 'primary')}${note}</section>`;
  }
  const p = c.puzzle;
  const free = nz(p.skipsFreeLeft);
  const skipText = free > 0 ? `Free skips left: ${free}` : 'Skipping now costs 10 coins';
  const skipBtn = free > 0
    ? send('Skip', { type: 'puzzle_skip' }, 'skip')
    : send('Skip', { type: 'puzzle_skip' }, 'skip skip-paid').replace('<button ', '<button data-confirm="1" ');
  return `<section class="card puzzle" id="puzzle-panel"><h3>${esc(p.name)} <small>level ${esc(p.level)}, ${esc(p.reward)} coins</small></h3>
  <p class="puzzle-stats">Solved: ${esc(solved)}</p>
  <div id="puzzle-slot" data-puzzle-id="${esc(p.id)}" data-kind="${esc(p.kind)}"></div>
  <button id="puzzle-submit" class="primary">Check answer</button>${skipBtn}
  <p class="muted">${esc(skipText)}</p>${note}</section>`;
}

export function renderCompetition(v) {
  const c = v.competition || {};
  const w = v.clock.warning;
  const banner = w && BANNERS[w] ? `<p class="banner ${esc(w)}" role="status">${esc(BANNERS[w])}</p>` : '';
  const notices = (Array.isArray(c.notices) ? c.notices : []).map((n) => `<p class="notice">${esc(n)}</p>`).join('');
  return `${header(v)}${banner}${notices}<section class="competition">${hintCard(c)}${ratesPanel(v, c)}${attackPanel(c)}${shieldPanel(c)}${renderPuzzlePanel(v)}</section>${shopBody(v)}`;
}

function summary(v) {
  const s = v.summary;
  return `${header(v)}<main><section class="card"><h2>${esc(s.idea?.name ?? 'No idea picked')}</h2>
  ${s.owned.length ? `<ul class="owned">${s.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing was bought.</p>'}
  <p class="big">${esc(plural(s.wallet, 'coin'))} left</p></section></main>`;
}

const THANKS = '<main><section class="card"><h2>Thank you for playing</h2></section></main>';

// The SVG strings come from the server and are built from numbers and fixed labels only
// (no player text), so they are inserted as markup.
function graphsHtml(g) {
  return `<main class="results"><section class="card">${g.companyVsCompany}</section><section class="card">${g.coinDifference}</section><section class="card">${g.roleBars}</section></main>`;
}

export function renderScreen(v) {
  if (v.screen === 'lobby') return `<main><section class="card"><h2>Hello ${esc(v.me.name)}</h2><p>Waiting for the organizer to start the game.</p></section></main>`;
  if (v.screen === 'graphs') return v.graphs ? `<main><h2>Game ${esc(v.gameId)}</h2></main>${graphsHtml(v.graphs)}` : THANKS;
  if (v.screen !== 'game') return '<main><section class="card"><p>Something went wrong. Please reload.</p></section></main>';
  switch (v.clock.phase) {
    case 'briefing': return briefing(v);
    case 'ideation': return ideation(v);
    case 'shop': return shop(v);
    case 'competition': return renderCompetition(v);
    case 'summary': return summary(v);
    default: return v.results ? graphsHtml(v.results) : THANKS;
  }
}
