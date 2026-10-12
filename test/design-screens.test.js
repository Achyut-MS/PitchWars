import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync as rf } from 'node:fs';
import { renderLogin, renderScreen } from '../public/render.js';
import { PLAYER as P2 } from './fixtures/views.js';

const html = (name) => renderScreen(P2[name]);

test('login: the draft layout with the logo slot, a labelled field and no game messages', () => {
  const h = renderLogin('');
  assert.match(h, /<header class="topbar"><span class="logo" role="img" aria-label="Makerspace logo"><\/span>/);
  assert.match(h, /<span class="one">Future<\/span> <span class="two">Makers<\/span>/);
  assert.match(h, /<form id="login" class="card">/);
  assert.match(h, /<label class="field">[^]*<span class="sr-only">Admission ID<\/span><input name="id"/);
  assert.match(h, /<button type="submit" class="join">Join game<\/button>/);
  assert.match(h, /href="\/organizer\.html"/);
  assert.equal(h.includes('data-send'), false);
  assert.equal(h.includes('name="name"'), false); // the draft's readonly name field is not built
});

test('waiting screen: own company theme only when seated, the wait text, a locked graphs tile', () => {
  const seated = html('lobby');
  assert.match(seated, /<div class="screen" data-company="A">/);
  assert.match(seated, /Waiting for the organizer to start the game\./);
  assert.match(seated, /You are the CTO of Company A\./);
  assert.match(seated, /My graphs <span class="sr-only">\(locked\)<\/span>/);
  const unseated = html('lobby-unseated');
  assert.match(unseated, /<div class="screen">/);
  assert.match(unseated, /The organizer will give you a company and a role\./);
});

const gameFixtures = Object.entries(P2).filter(([, v]) => v.screen === 'game');

test('every game screen is wrapped with the viewer\'s own company and the phase', () => {
  for (const [name, v] of gameFixtures) {
    const h = renderScreen(v);
    assert.ok(h.startsWith(`<div class="screen" data-company="${v.me.company}" data-phase="${v.clock.phase}">`), name);
  }
});

test('a player never gets the rival company in the markup: no data-company, mark or name of the other side', () => {
  for (const [name, v] of Object.entries(P2)) {
    const own = v.me && v.me.company;
    if (!own) continue;
    const other = own === 'A' ? 'B' : 'A';
    const h = renderScreen(v);
    assert.equal(h.includes(`data-company="${other}"`), false, name);
    assert.equal(h.includes(`#i-mark-${other.toLowerCase()}"`), false, name);
    assert.equal(h.includes(`Company ${other}`), false, name);
  }
});

test('hostile company, role and phase values never reach an attribute', () => {
  const v = { ...P2['shop-cto'], me: { ...P2['shop-cto'].me, company: '"><b>', role: '<i>' }, clock: { phase: '"x', remainingSec: 5 } };
  const h = renderScreen(v);
  assert.equal(h.includes('data-company="&quot;'), false);
  assert.match(h, /<div class="screen" data-phase="">/);
});

test('the header strip keeps its hooks and adds the mark, the timer pill and the role chips', () => {
  const h = renderScreen(P2['shop-cmo']);
  assert.match(h, /<header class="bar compact">/);
  assert.match(h, /<span class="who"><svg class="mark"[^>]*><use href="\/img\/icons\.svg#i-mark-a"><\/use><\/svg>/);
  assert.match(h, /<span class="pill"><span id="clock">5:00<\/span><\/span>/);
  assert.match(h, /<span class="on" title="CMO">/);
  assert.match(h, /<span class="wallet">[^]*890 coins<\/span>/);
});

test('briefing: company card, role card with the full title, problem card, still no buttons', () => {
  const h = renderScreen(P2['briefing-cto']);
  assert.match(h, /<main class="brief">/);
  assert.match(h, /<span class="name">Company A<\/span>/);
  assert.match(h, /<span class="code">CTO<\/span>/);
  assert.match(h, /Chief Technology Officer/);
  assert.match(h, /Food waste/);
  assert.equal(h.includes('data-send'), false);
  assert.equal(h.includes('<button'), false);
});

test('ideation: idea cards keep their buttons, a type picture, the chosen mark and the live tally', () => {
  const h = renderScreen(P2['ideation-ceo']);
  assert.match(h, /<li class="idea mine">\s*<span class="pic dots"><svg class="i"[^>]*><use href="\/img\/icons\.svg#i-chip">/);
  assert.match(h, /#i-app"/);
  assert.match(h, /"type":"pick","ideaId":"S3"/);
  assert.match(h, /<aside class="card tally"><h2>Live vote count<\/h2>/);
  assert.match(h, /<span class="track"><i style="width:40%"><\/i><\/span><span class="v">2<\/span>/); // 2 of 5 votes
  assert.match(renderScreen(P2['ideation-picked']), /<li class="idea mine chosen">/);
});

test('each role sees its own workshop title, the hint line and the team budget', () => {
  const titles = { CTO: 'Product workshop', CMO: 'Brand studio', COO: 'Risk &amp; protection workshop', CFO: 'Treasury &amp; approval queue', CEO: 'Command center' };
  for (const [role, title] of Object.entries(titles)) {
    const h = renderScreen(P2[`shop-${role.toLowerCase()}`]);
    assert.match(h, new RegExp(`<div class="title2"><h1>${title}</h1>\\s*<p class="hint">`), role);
    assert.match(h, /<section class="budget"><span class="lab">Team budget<\/span><b class="amt"><svg[^]*?<\/svg>890<\/b><\/section>/, role);
  }
});

test('the CFO queue head and the shop item states keep their words', () => {
  const cfo = renderScreen(P2['shop-cfo']);
  assert.match(cfo, /<li class="req head">/);
  const cto = renderScreen(P2['shop-cto']);
  assert.match(cto, /<em>Owned<\/em>/);
  assert.match(cto, /<em>Requested<\/em>/);
});

test('summary: the receipt with the idea in the slab font and the coins left', () => {
  const h = renderScreen(P2.summary);
  assert.match(h, /<main class="summary"><section class="card receipt"><h2>Your product<\/h2><p class="product-name">Smart Fridge Sensor<\/p>/);
  assert.match(h, /<p class="big">890 coins left<\/p>/);
});

test('competition: the own company only, even for the CEO with the attack deck', () => {
  for (const name of ['competition-cto', 'competition-ceo', 'competition-coo', 'competition-cfo']) {
    const h = renderScreen(P2[name]);
    assert.match(h, /<section class="competition">/, name);
    assert.equal(h.includes('Company B'), false, name);
    assert.equal(h.includes('data-company="B"'), false, name);
  }
  assert.match(renderScreen(P2['competition-ceo']), /id="attack-deck" class="card attacks"/);
});

test('the competition styles cover the classes Plan 3 emits, scoped where names are shared', () => {
  const css = rf('public/css/player.css', 'utf8');
  for (const sel of ['.banner[class~="2min"]', '.banner[class~="30s"]', '.banner.last10', 'header.bar ~ p.notice', 'aside.hint', '.rates .meter .fill', '.rates .my-rate', '.rates .level',
    'button.attack-btn', 'button.attack-btn.armed', 'button.attack-btn[disabled]', '.launch.blocked', '.card.shield', 'p.sale-badge', 'p.locked', 'p.shop-closed']) assert.ok(css.includes(sel), sel);
  assert.equal(/(^|[,}])\s*\.fill\s*[{,]/m.test(css), false, 'an unscoped .fill would also paint Mosaic cells');
});

test('the puzzle styles cover every class Plan 4 emits, with 44 px cells', () => {
  const css = rf('public/css/player.css', 'utf8');
  for (const sel of ['.puzzle-grid td', '.puzzle-grid td.on', '.puzzle-grid td.bt', '.puzzle-grid td.br', '.puzzle-grid td.bb', '.puzzle-grid td.bl', '[data-card].picked', '[data-card].group', '#puzzle-slot']) {
    assert.ok(css.includes(sel), sel);
  }
  for (let n = 0; n < 8; n++) assert.ok(css.includes(`.reg-${n}`), `reg-${n}`);
  assert.match(css, /\.puzzle-grid td, \.puzzle-grid th \{ width: 44px; height: 44px;/);
  assert.equal(/\.card\.(c\d|f\d|picked|group)/.test(css), false, 'Sets cards are styled through [data-card], not .card');
});

test('ended before the reveal: the thank-you card only, in the own company theme', () => {
  const h = renderScreen(P2.ended);
  assert.match(h, /<div class="screen" data-company="A" data-phase="ended">/);
  assert.match(h, /<main class="thanks"><section class="card"><h2>Thank you for playing<\/h2>/);
  assert.match(h, /Please stay in your seat\./);
  assert.equal(/winner|won|lost|score/i.test(h), false);
});
