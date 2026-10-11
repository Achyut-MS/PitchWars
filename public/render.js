export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtClock = (sec) => {
  const t = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// A button that sends one message. The JSON sits in a single-quoted attribute. & < > and ' are entity-encoded
// (the browser decodes them back before dataset.send is read), so no value can leave the attribute. Plan fix: the
// plan only encoded ', which left raw < > & in the attribute.
const attr = (s) => s.replace(/[&<>']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[c]));
const send = (label, msg, cls = '') =>
  `<button class="${cls}" data-send='${attr(JSON.stringify(msg))}'>${esc(label)}</button>`;

export function renderLogin(error) {
  return `<form id="login" class="card">
  <h1>Startup Showdown</h1>
  <label>Admission ID <input name="id" autocomplete="off" autocapitalize="characters" autofocus></label>
  <button type="submit">Enter</button>
  ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
</form>`;
}

function header(v) {
  const { me, clock, wallet } = v;
  return `<header class="bar">
  <span class="who">Company ${esc(me.company)}: ${esc(me.role)}</span>
  <span class="phase">${esc(clock.phase)}</span>
  <span class="wallet">${esc(wallet)} coins</span>
  <span id="clock">${fmtClock(clock.remainingSec)}</span>
</header>`;
}

function ownedPanel(v) {
  if (!v.owned.length) return '<p class="muted">Nothing bought yet.</p>';
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
    <p class="votes">${esc(i.votes)} votes</p>
    ${picked ? '' : send(i.mine ? 'Your vote' : 'Vote', { type: 'vote', ideaId: i.id })}
    ${canPick ? send('Pick this idea', { type: 'pick', ideaId: i.id }, 'primary') : ''}
  </li>`).join('');
  return `${header(v)}<main><h2>${esc(v.problem.title)}</h2>
  ${picked ? `<p class="notice">Your company picked ${esc(ideas.find((i) => i.id === picked)?.name ?? picked)}. Waiting for the other company.</p>` : ''}
  <ul class="ideas">${cards}</ul></main>`;
}

function catalogItem(it) {
  const buy = [];
  if (it.canRequest) {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(c, { type: 'request', itemId: it.id, choice: n + 1 })));
    } else buy.push(send(`Request for ${it.price}`, { type: 'request', itemId: it.id }));
  }
  if (it.canRecommend) {
    if (it.choices) {
      it.choices.forEach((c, n) => buy.push(send(`Recommend ${c}`, { type: 'recommend', itemId: it.id, choice: n + 1 })));
    } else buy.push(send('Recommend', { type: 'recommend', itemId: it.id }));
  }
  return `<li class="item ${esc(it.state)}"><span class="name">${esc(it.label)}</span>
    <span class="cost">${esc(it.price)}</span>
    ${it.state === 'owned' ? '<em>Owned</em>' : it.state === 'requested' ? '<em>Requested</em>' : it.state === 'wait' ? `<em>${esc(it.note)}</em>` : ''}
    ${buy.join('')}</li>`;
}

function queueList(v) {
  const q = v.shop.queue;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req${r.head ? ' head' : ''}"><span>${esc(r.label)} for ${esc(r.price)}</span>
    <small>from ${esc(r.by)}${r.recommended ? ' (CEO recommends)' : ''}</small>
    ${r.head && v.me.role === 'CFO' ? send('Approve', { type: 'cfo_decide', requestId: r.id, approve: true }, 'primary') + send('Reject', { type: 'cfo_decide', requestId: r.id, approve: false }) : ''}</li>`).join('');
  return `<section class="card"><h3>CFO queue</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">No requests waiting.</p>'}</section>`;
}

function awaitingList(v) {
  const q = v.shop.awaitingCeo;
  if (!q) return '';
  const rows = q.map((r) => `<li class="req"><span>${esc(r.label)} for ${esc(r.price)}</span><small>suggested by ${esc(r.by)}</small>
    ${send('Approve feature', { type: 'ceo_decide', requestId: r.id, approve: true }, 'primary')}${send('Reject', { type: 'ceo_decide', requestId: r.id, approve: false })}</li>`).join('');
  return `<section class="card"><h3>Features waiting for you</h3>${rows ? `<ul>${rows}</ul>` : '<p class="muted">None.</p>'}</section>`;
}

function shop(v) {
  const sections = [...new Set(v.shop.catalog.map((i) => i.section))];
  const lists = sections.map((s) => `<section class="card"><h3>${esc(s)}</h3><ul>${v.shop.catalog.filter((i) => i.section === s).map(catalogItem).join('')}</ul></section>`).join('');
  const mine = v.shop.mine.length ? `<section class="card"><h3>My requests</h3><ul>${v.shop.mine.map((r) => `<li>${esc(r.label)}: ${esc(r.status)}</li>`).join('')}</ul></section>` : '';
  return `${header(v)}<main>
  ${v.idea ? `<p class="product">Product: ${esc(v.idea.name)}</p>` : ''}
  ${awaitingList(v)}${queueList(v)}${mine}${lists}
  <section class="card"><h3>Our product</h3>${ownedPanel(v)}</section></main>`;
}

function summary(v) {
  const s = v.summary;
  return `${header(v)}<main><section class="card"><h2>${esc(s.idea?.name ?? 'No idea picked')}</h2>
  ${s.owned.length ? `<ul class="owned">${s.owned.map((o) => `<li>${esc(o.label)} <span>${esc(o.charged)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing was bought.</p>'}
  <p class="big">${esc(s.wallet)} coins left</p></section></main>`;
}

export function renderScreen(v) {
  if (v.screen === 'lobby') return `<main><section class="card"><h2>Hello ${esc(v.me.name)}</h2><p>Waiting for the organizer to start the game.</p></section></main>`;
  if (v.screen === 'graphs') return '<main><section class="card"><h2>Thank you for playing</h2></section></main>';
  if (v.screen !== 'game') return '<main><section class="card"><p>Something went wrong. Please reload.</p></section></main>';
  switch (v.clock.phase) {
    case 'briefing': return briefing(v);
    case 'ideation': return ideation(v);
    case 'shop':
    case 'competition': return shop(v);
    case 'summary': return summary(v);
    default: return '<main><section class="card"><h2>Thank you for playing</h2></section></main>';
  }
}
