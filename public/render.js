import { icon, companyAttr, companyMark, companyOf, roleOf, phaseOf, roleChips, logo, ROLE_ICON, ROLE_TITLE } from './kit.js';
import { LIT_SHAPES } from './puzzles/ui.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const plural = (n, word) => `${n} ${word}${Number(n) === 1 ? '' : 's'}`;

export const renderConnecting = () => '<main><section class="card"><p>Connecting...</p></section></main>';
export const renderSuperseded = () => '<main><section class="card"><h2>Signed in elsewhere</h2><p>You logged in on another device. Use this device instead?</p><button id="use-here" class="primary">Use this device</button></section></main>';
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
  return `<div class="login-page">
<header class="topbar">${logo()}<span class="brand">Makerspace</span><span class="tag">Create.<br>Ideate.<br>Innovate.</span></header>
<main class="page">
  <div class="title"><h1><span class="one">Future</span> <span class="two">Makers</span></h1></div>
  <p class="sub">Startup Showdown</p>
  <form id="login" class="card">
  <h2>Participant <b>Login</b></h2>
  <label class="field">${icon('i-user')}<span class="sr-only">Admission ID</span><input name="id" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Admission ID" autofocus></label>
  <button type="submit" class="join">Join game</button>
  <button type="button" class="back" data-back>Go back</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form>
  <aside class="card info">${icon('i-info', 'i big')}<ul><li>Use your registered Admission ID.</li><li>Only IDs from the official roster are allowed.</li></ul></aside>
  <a class="org-link" href="/organizer.html">Organizer login</a>
</main></div>`;
}

// The clock turns red in the last 10 seconds (server-sent remainingSec only).
export const clockClass = (sec) => (Number.isFinite(sec) && sec <= 10 ? 'red' : '');

function header(v) {
  const { me, clock, wallet } = v;
  const red = clockClass(clock.remainingSec) || (clock.warning === 'last10' ? 'red' : '');
  return `<header class="bar compact">
  <span class="who">${companyMark(me.company)}<span><b>Company ${esc(me.company)}</b> ${esc(me.role)} <small class="phase">${esc(clock.phase)}</small></span></span>
  <span class="timer"><span class="pill"><span id="clock"${red ? ' class="red"' : ''}>${fmtClock(clock.remainingSec)}</span></span></span>
  <span class="wallet">${roleChips(roleOf(me.role))}${icon('i-coins')}${esc(plural(wallet, 'coin'))}</span>
</header>`;
}

function ownedPanel(v) {
  if (!v.owned || !v.owned.length) return '<p class="muted">Nothing bought yet.</p>';
  return `<ul class="owned">${v.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>`;
}

const ROLE_JOB = {
  CEO: 'Lead the team. Make the final idea pick, approve the CTO\'s features and recommend items to the CFO.',
  CTO: 'Build the product. Request the features and parts that make it sell.',
  CFO: 'Guard the coins. Approve or reject each request, oldest first.',
  CMO: 'Build the brand. Pick who to sell to, the name, the tagline and the ads.',
  COO: 'Keep it running. Fix the idea\'s risks and buy protection.',
};

function briefing(v) {
  const role = roleOf(v.me.role);
  return `${header(v)}<main class="brief">
  <section class="card company-card">${companyMark(v.me.company)}<div><span class="words">Your company</span><span class="name">Company ${esc(v.me.company)}</span></div></section>
  <section class="card role-card"><h2>You are the ${esc(v.me.role)}</h2>
    <div class="head2">${icon(ROLE_ICON[role] || 'i-user', 'chip')}<span class="code">${esc(role)}</span></div>
    <p class="full">${esc(ROLE_TITLE[role] || '')}</p><p>${esc(ROLE_JOB[role] || '')}</p></section>
  <section class="card problem-card"><h2>Problem statement</h2>
  <h3>${esc(v.problem.title)}</h3><p>${esc(v.problem.statement)}</p>
  <p class="muted">The game starts when the countdown ends.</p></section></main>`;
}

function ideation(v) {
  const { ideas, picked, canPick } = v.ideation;
  const cards = ideas.map((i) => `<li class="idea${i.mine ? ' mine' : ''}${picked === i.id ? ' chosen' : ''}">
    <span class="pic dots">${icon(i.type === 'software' ? 'i-app' : 'i-chip')}</span>
    <h3>${esc(i.name)} <small>${esc(i.type)}</small></h3><p>${esc(i.description)}</p>
    <p class="votes">${esc(plural(i.votes, 'vote'))}</p>
    ${picked ? '' : send(i.mine ? 'Your vote' : 'Vote', { type: 'vote', ideaId: i.id })}
    ${canPick ? send('Pick this idea', { type: 'pick', ideaId: i.id }, 'primary') : ''}
  </li>`).join('');
  const total = ideas.reduce((n, i) => n + (Number(i.votes) || 0), 0) || 1;
  const tally = `<aside class="card tally"><h2>Live vote count</h2><ol>${ideas.map((i, n) => `<li><span class="n">${n + 1}</span><span class="track"><i class="w-${Math.round(100 * (Number(i.votes) || 0) / total)}"></i></span><span class="v">${esc(i.votes)}</span></li>`).join('')}</ol></aside>`;
  const pickedCard = picked
    ? `<p class="notice">Your company picked ${esc(ideas.find((i) => i.id === picked)?.name ?? picked)}. Waiting for the other company.</p>`
    : '';
  return `${header(v)}<main class="ideation"><div class="title2"><h1>Base idea selection</h1><p class="desc">Vote for one idea. The CEO makes the final pick.</p></div><h2>${esc(v.problem.title)}</h2>
  ${pickedCard}
  <div class="idea-grid"><ul class="ideas">${cards}</ul>${tally}</div></main>`;
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

const TITLES = { CTO: 'Product workshop', CMO: 'Brand studio', COO: 'Risk & protection workshop', CFO: 'Treasury & approval queue', CEO: 'Command center' };

// One tab bar and its panels. Every panel is in the markup; app.js shows the chosen one.
function tabs(scope, items, fallback) {
  const nav = `<nav class="tabs" role="tablist" aria-label="${esc(scope)} sections" data-tabs="${esc(scope)}" data-default="${esc(fallback)}">${items.map((t) => `<button type="button" role="tab" class="tab" data-tab="${esc(t.key)}" data-scope="${esc(scope)}" aria-selected="false">${esc(t.label)}</button>`).join('')}</nav>`;
  const panels = items.map((t) => `<div class="tab-panel" role="tabpanel" data-scope="${esc(scope)}" data-panel="${esc(t.key)}" hidden>${t.html}</div>`).join('');
  return `<div class="tab-set">${nav}${panels}</div>`;
}

// The parts of the shop, shared by the shop phase and the competition tabs.
function shopParts(v) {
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
  const closed = shopClosed ? '<p class="shop-closed" role="status">Shop closed: no new requests. Open requests can still be decided.</p>' : '';
  return {
    notes: `${saleBadge}${lock ? `<p class="locked" role="status">${esc(lock)}</p>` : ''}${closed}`,
    requests: `${awaitingList(v)}${queueList(v)}${mine}`,
    catalog: lists,
    product: `${v.idea ? `<p class="product">Product: ${esc(v.idea.name)}</p>` : ''}<section class="card"><h3>Our product</h3>${ownedPanel(v)}</section>`,
  };
}

export function shopBody(v) {
  const p = shopParts(v);
  const items = [
    { key: 'requests', label: 'Requests', html: p.requests },
    { key: 'catalog', label: 'Catalog', html: p.catalog },
    { key: 'product', label: 'Our product', html: p.product },
  ];
  return `<main class="shop">
  <div class="ws-top"><div class="title2"><h1>${esc(TITLES[v.me.role] ?? 'Shop')}</h1>
  <p class="hint">${esc(HINTS[v.me.role] ?? '')}</p></div>
  <section class="budget"><span class="lab">Team budget</span><b class="amt">${icon('i-coins')}${esc(v.wallet)}</b></section></div>
  ${p.notes}
  ${tabs('shop', items, ['CEO', 'CFO'].includes(v.me.role) ? 'requests' : 'catalog')}</main>`;
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
  <div class="fill w-${Math.min(100, Math.max(0, Math.round((mine / MAX_RATE) * 100)))}"></div></div>
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

// The roles that play puzzles: the CFO's puzzles, the CMO's logo brief and the COO's risk fixes.
const PUZZLE_ROLES = ['CFO', 'CMO', 'COO'];

// Rules and controls for each puzzle kind (the kinds are the server's puzzle names).
const PUZZLE_HELP = {
  queens: {
    rules: ['Put exactly one queen in every row, every column and every coloured region.', 'No two queens may touch, not even diagonally.'],
    play: ['Single tap a cell to mark a dot. Double tap a cell to place a queen, and double tap the queen to remove it.', 'Grey cells with a × are blocked by the queens already placed: a queen blocks its row, column, region and the eight squares around it.'],
  },
  pipes: {
    rules: ['Turn the pipe tiles so every pipe meets a pipe on the next tile.', 'No pipe may point off the edge of the board, and all tiles must join one network that starts at the top-left corner.'],
    play: ['Tap a tile to turn it 90 degrees clockwise.'],
  },
  logo: {
    rules: ['The client brief names one option for each part of the logo.', 'Pick the option the brief asks for in every row, then the logo is ready.'],
    play: ['Tap an option to pick it. Tap it again to clear it.'],
  },
  risks: {
    rules: ['Every risk needs one fix. Pick the fix that handles it.', 'Test it: the risk is about accuracy. Protect it: the device can be damaged. Train the users: people forget or skip. Back it up: data or supplies can be lost.'],
    play: ['Tap one fix per risk. Tap it again to clear it.'],
  },
  lits: {
    rules: ['In each coloured region, shade exactly four connected cells. Together they make one of the four shapes below.', 'Any turn or mirror image of a shape is fine.', 'No 2 x 2 block may be shaded.', 'Two shaded pieces of the same shape may not touch edge to edge.', 'All shaded cells must join up into one group.'],
    play: ['Single tap a cell to mark a dot. Double tap a cell to shade it, and double tap a shaded cell to unshade it.', 'Grey cells with a × cannot be shaded: they would make a 2 x 2 block, or the region already has four shaded cells.'],
    diagram: true,
  },
};

const PUZZLE_GENERAL = {
  rules: ['Each puzzle has one correct answer. The board is checked as you play: when it is right, the reward is paid and the next puzzle starts.', 'A correct answer pays the reward shown on the puzzle.'],
  play: ['Start a puzzle, then tap the grid to play. Skip gives up on the puzzle: the first skip is free, then each skip costs 10 coins.'],
};

// The accepted Lits shapes, drawn as small grids (filled squares are the piece).
const shapeDiagram = () => `<div class="shape-diagram" aria-label="Accepted shapes">${Object.entries(LIT_SHAPES).map(([letter, cells]) => {
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  const grid = Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, (__, c) => `<td class="${cells.some(([a, b]) => a === r && b === c) ? 'on' : ''}"></td>`).join('')}</tr>`).join('');
  return `<figure><table class="shape">${grid}</table><figcaption>${esc(letter)}</figcaption></figure>`;
}).join('')}</div>`;

export function puzzleHelp(kind) {
  const h = PUZZLE_HELP[kind] || PUZZLE_GENERAL;
  const list = (items) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  return `<details class="puzzle-help" open><summary>Rules and how to play</summary><h4>Rules</h4>${list(h.rules)}${h.diagram ? shapeDiagram() : ''}<h4>How to play</h4>${list(h.play)}</details>`;
}

// The CFO's puzzle panel. Plain markup; #puzzle-slot is filled by the browser from its local puzzle state.
export function renderPuzzlePanel(v) {
  const c = v.competition || {};
  if (!PUZZLE_ROLES.includes(v.me.role) || !('puzzle' in c)) return '';
  const pp = c.puzzlePanel || {};
  const done = c.puzzlesDone || {};
  const solved = nz(pp.solved ?? done.solved);
  const note = '<p id="puzzle-note" class="puzzle-note muted" role="status"></p>';
  if (!c.puzzle) {
    const lvl = pp.level != null ? `<p class="puzzle-stats">Level ${esc(pp.level)} | Solved: ${esc(solved)}${pp.nextReward != null ? ` | Next reward: ${esc(pp.nextReward)} coins` : ''}</p>` : '';
    return `<section class="card puzzle" id="puzzle-panel"><h3>Puzzles</h3><p class="muted">Puzzles are optional. Solved puzzles earn coins.</p>${lvl}${puzzleHelp(null)}${send('Start a puzzle', { type: 'puzzle_next' }, 'primary')}${note}</section>`;
  }
  const p = c.puzzle;
  const free = nz(p.skipsFreeLeft);
  const skipText = free > 0 ? `Free skips left: ${free}` : 'Skipping now costs 10 coins';
  const skipBtn = free > 0
    ? send('Skip', { type: 'puzzle_skip' }, 'skip')
    : send('Skip', { type: 'puzzle_skip' }, 'skip skip-paid').replace('<button ', '<button data-confirm="1" ');
  return `<section class="card puzzle" id="puzzle-panel"><h3>${esc(p.name)} <small>level ${esc(p.level)}, ${esc(p.reward)} coins</small></h3>
  <p class="puzzle-stats">Solved: ${esc(solved)}</p>
  ${puzzleHelp(p.kind)}
  <div id="puzzle-slot" data-puzzle-id="${esc(p.id)}" data-kind="${esc(p.kind)}"></div>
  ${skipBtn}
  <p class="muted">${esc(skipText)}</p>${note}</section>`;
}

export function renderCompetition(v) {
  const c = v.competition || {};
  const w = v.clock.warning;
  const banner = w && BANNERS[w] ? `<p class="banner ${esc(w)}" role="status">${esc(BANNERS[w])}</p>` : '';
  const notices = (Array.isArray(c.notices) ? c.notices : []).map((n) => `<p class="notice">${esc(n)}</p>`).join('');
  const p = shopParts(v);
  const items = [
    { key: 'sales', label: 'Sales', html: `${hintCard(c)}${ratesPanel(v, c)}${shieldPanel(c)}` },
    { key: 'requests', label: 'Requests', html: p.requests },
    { key: 'catalog', label: 'Catalog', html: p.catalog },
    { key: 'product', label: 'Our product', html: p.product },
  ];
  if (c.attack) items.push({ key: 'attacks', label: 'Attacks', html: attackPanel(c) });
  if (PUZZLE_ROLES.includes(v.me.role) && 'puzzle' in c) items.push({ key: 'puzzles', label: 'Puzzles', html: renderPuzzlePanel(v) });
  const hint = `<p class="hint">${esc(HINTS[v.me.role] ?? '')}</p>`;
  return `${header(v)}${banner}${notices}${p.notes}${hint}<section class="competition">${tabs('competition', items, 'sales')}</section>`;
}

function summary(v) {
  const s = v.summary;
  return `${header(v)}<main class="summary"><section class="card receipt"><h2>Your product</h2><p class="product-name">${esc(s.idea?.name ?? 'No idea picked')}</p>
  ${s.owned.length ? `<ul class="owned">${s.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing was bought.</p>'}
  <p class="big">${esc(plural(s.wallet, 'coin'))} left</p></section></main>`;
}

const THANKS = '<main class="thanks"><section class="card"><h2>Thank you for playing</h2><p>The game is over. Please stay in your seat.</p><p>The organizer will show the graphs in a moment.</p></section></main>';

const RESULTS_TITLE = '<div class="title2"><h1>Final results</h1><p class="desc">How both companies played. Compare the graphs and talk about what you would do differently.</p></div>';

// The SVG strings come from the server and are built from numbers and fixed labels only
// (no player text), so they are inserted as markup.
function graphsHtml(g) {
  return `<main class="results">${RESULTS_TITLE}<section class="card">${g.companyVsCompany}</section><section class="card">${g.coinDifference}</section><section class="card">${g.roleBars}</section></main>`;
}

function renderHome(v) {
  const me = v.me || {};
  const seat = roleOf(me.role) && companyOf(me.company) ? `You are the ${esc(me.role)} of Company ${esc(me.company)}.` : 'The organizer will give you a company and a role.';
  return `<div class="screen"${companyAttr(me.company)}><main class="home">
  <section class="hero"><h1>Startup <span>Showdown</span></h1><p class="flow">Ideas &rarr; Teams &rarr; Solutions &rarr; Impact</p></section>
  <section class="card tile main"><h2>Hello ${esc(me.name)}</h2><p><span class="status-dot"></span>Waiting for the organizer to start the game.</p><p>${seat}</p></section>
  <section class="card"><h2>How to play</h2><ol class="hsteps"><li>1. Briefing: meet your team and your role</li><li>2. Ideation: vote, then the CEO picks the idea</li><li>3. Shop: spend 1,000 shared coins together</li><li>4. Competition: 16 minutes against another company</li><li>5. Graphs: see how both companies played</li></ol></section>
  <section class="card tile locked"><h2>${icon('i-lock')} My graphs <span class="sr-only">(locked)</span></h2><p>Opens after the organizer shows the results.</p></section>
</main></div>`;
}

export function renderScreen(v) {
  if (v.screen === 'lobby') return renderHome(v);
  if (v.screen === 'graphs') return `<div class="screen"${companyAttr(v.me && v.me.company)} data-phase="ended">${v.graphs ? `<main><h2>Game ${esc(v.gameId)}</h2></main>${graphsHtml(v.graphs)}` : THANKS}</div>`;
  if (v.screen !== 'game') return '<main><section class="card"><p>Something went wrong. Please reload.</p></section></main>';
  return `<div class="screen"${companyAttr(v.me && v.me.company)} data-phase="${phaseOf(v.clock && v.clock.phase)}">${gameScreen(v)}</div>`;
}

function gameScreen(v) {
  switch (v.clock.phase) {
    case 'briefing': return briefing(v);
    case 'ideation': return ideation(v);
    case 'shop': return shop(v);
    case 'competition': return renderCompetition(v);
    case 'summary': return summary(v);
    default: return v.results ? graphsHtml(v.results) : THANKS;
  }
}
