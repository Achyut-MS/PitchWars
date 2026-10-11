import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtClock, renderLogin, renderScreen } from '../public/render.js';

const base = (over = {}) => ({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role: 'CTO', status: 'in_game' },
  screen: 'game',
  clock: { phase: 'briefing', remainingSec: 125 },
  problem: { id: 1, title: 'Food waste', statement: 'Too much food is wasted.' },
  wallet: 1000, idea: null, ideation: null, shop: null, owned: [], summary: null, ...over,
});

test('esc escapes the five dangerous characters', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
});

test('fmtClock pads seconds', () => {
  assert.equal(fmtClock(125), '2:05');
  assert.equal(fmtClock(0), '0:00');
});

test('the login screen has the admission id field and shows an error', () => {
  assert.match(renderLogin(), /name="id"/);
  assert.match(renderLogin('That ID is not on the list.'), /not on the list/);
});

test('the briefing shows the role, the problem and a countdown only', () => {
  const html = renderScreen(base());
  assert.match(html, /CTO/);
  assert.match(html, /Food waste/);
  assert.match(html, /id="clock">2:05</);
  assert.equal(html.includes('data-send'), false);
});

test('the lobby screen asks the player to wait', () => {
  assert.match(renderScreen({ screen: 'lobby', me: { name: 'Asha' } }), /Waiting for the organizer/);
});

test('ideation: vote buttons for everyone, a pick button only for the CEO', () => {
  const ideation = (canPick) => ({
    ideas: [{ id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: 'A sensor.', votes: 2, mine: true }],
    picked: null, canPick,
  });
  const cto = renderScreen(base({ clock: { phase: 'ideation', remainingSec: 100 }, ideation: ideation(false) }));
  assert.match(cto, /Smart Fridge Sensor/);
  assert.match(cto, /"type":"vote"/);
  assert.equal(cto.includes('"type":"pick"'), false);
  const ceo = renderScreen(base({ me: { ...base().me, role: 'CEO' }, clock: { phase: 'ideation', remainingSec: 100 }, ideation: ideation(true) }));
  assert.match(ceo, /"type":"pick"/);
});

test('a hostile idea name is escaped', () => {
  const html = renderScreen(base({
    clock: { phase: 'ideation', remainingSec: 100 },
    ideation: { ideas: [{ id: 'H1', type: 'hardware', name: '<script>alert(1)</script>', description: 'x', votes: 0, mine: false }], picked: null, canPick: false },
  }));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.match(html, /&lt;script&gt;/);
});

const shopView = (role, over = {}) => base({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role },
  clock: { phase: 'shop', remainingSec: 300 }, idea: { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: '' },
  shop: {
    open: true, mine: [],
    catalog: [
      { id: 'M01-N', name: 'Target User', label: 'Target User (Small niche)', option: 'Small niche', section: 'Target User', role: 'CMO', cost: 50, price: 50, state: 'available', note: '', canRequest: role === 'CMO', canRecommend: role === 'CEO', choices: null },
      { id: 'M02', name: 'Brand Name Pack', label: 'Brand name', option: 'Pick 1 of 3', section: 'Brand', role: 'CMO', cost: 40, price: 40, state: 'available', note: '', canRequest: role === 'CMO', canRecommend: false, choices: ['FreshSense', 'ChillWatch', 'KeepFresh'] },
      { id: 'M04-S', name: 'Ad Campaign', label: 'Ad Campaign (Social posts)', option: 'Social posts', section: 'Ad Campaign', role: 'CMO', cost: 80, price: 80, state: 'owned', note: '', canRequest: false, canRecommend: false, choices: null },
    ],
    ...(role === 'CFO' ? { queue: [{ id: 7, itemId: 'M01-N', label: 'Target User (Small niche)', price: 50, by: 'Mira', recommended: false, head: true }] } : {}),
    ...(role === 'CEO' ? { queue: [], awaitingCeo: [{ id: 3, itemId: 'F01-B', label: 'Core Function (Basic)', price: 100, by: 'Asha', recommended: false, head: false }] } : {}),
    ...over,
  },
});

test('the shop shows the wallet, the items and a request button only for my own section', () => {
  const cmo = renderScreen(shopView('CMO'));
  assert.match(cmo, /1000/);
  assert.match(cmo, /"type":"request"/);
  assert.match(cmo, /"choice":"2"/); // brand choices are separate buttons
  assert.match(cmo, /FreshSense/);
  const cto = renderScreen(shopView('CTO'));
  assert.equal(cto.includes('"type":"request"'), false);
});

test('the CFO sees the queue with approve and reject for the head only', () => {
  const html = renderScreen(shopView('CFO'));
  assert.match(html, /"type":"cfo_decide"/);
  assert.match(html, /"approve":true/);
  assert.match(html, /"approve":false/);
});

test('the CEO sees the features waiting for approval and recommend buttons', () => {
  const html = renderScreen(shopView('CEO'));
  assert.match(html, /"type":"ceo_decide"/);
  assert.match(html, /"type":"recommend"/);
});

test('the summary card shows the idea, items and coins left', () => {
  const html = renderScreen(base({
    clock: { phase: 'summary', remainingSec: 12 },
    summary: { idea: { id: 'H1', name: 'Smart Fridge Sensor' }, owned: [{ itemId: 'M02', label: 'Brand name: FreshSense', charged: 40 }], wallet: 960 },
  }));
  assert.match(html, /Smart Fridge Sensor/);
  assert.match(html, /Brand name: FreshSense/);
  assert.match(html, /960/);
});

test('after the game ends players see only a thank you', () => {
  const html = renderScreen(base({ clock: { phase: 'ended', remainingSec: 0 } }));
  assert.match(html, /Thank you for playing/);
});

// Hostile strings must never reach the output raw, in any screen or attribute.
const EVIL = `<script>alert(1)</script>"onerror="x' javascript:& <img src=x onerror=1>`;
const hostileView = (phase, role = 'CEO', over = {}) => {
  const v = shopView(role);
  return {
    ...v,
    me: { admissionId: 'S1', name: EVIL, company: EVIL, role },
    clock: { phase, remainingSec: 50 },
    problem: { id: 1, title: EVIL, statement: EVIL },
    idea: { id: 'H1', type: 'hardware', name: EVIL, description: EVIL },
    owned: [{ itemId: 'M02', label: EVIL, charged: EVIL }],
    ideation: {
      ideas: [{ id: 'H1', type: EVIL, name: EVIL, description: EVIL, votes: 1, mine: true }],
      picked: 'H1', canPick: true,
    },
    summary: { idea: { id: 'H1', name: EVIL }, owned: [{ itemId: 'M02', label: EVIL, charged: 1 }], wallet: EVIL },
    shop: {
      open: true,
      mine: [{ id: 1, label: EVIL, status: EVIL }],
      catalog: [{ id: "M02'x", name: EVIL, label: EVIL, option: EVIL, section: EVIL, role: 'CMO', cost: 1, price: EVIL, state: EVIL, note: EVIL, canRequest: true, canRecommend: true, choices: [EVIL, "o'k"] }],
      queue: [{ id: 7, itemId: 'x', label: EVIL, price: EVIL, by: EVIL, recommended: true, head: true }],
      awaitingCeo: [{ id: 3, itemId: 'x', label: EVIL, price: EVIL, by: EVIL, recommended: false, head: false }],
    },
    ...over,
  };
};

function assertSafe(html) {
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('"onerror="'), false);
  // Every tag must be one of ours: no raw angle bracket may come from the hostile text.
  // Strip every well-formed tag (quoted attributes with no raw < or >); nothing angle-bracketed may remain.
  const rest = html.replace(/<\/?[a-z0-9]+(?:\s+[\w-]+(?:=(?:"[^"<>]*"|'[^'<>]*'|[\w-]+))?)*\s*\/?>/g, '');
  assert.equal(/[<>]/.test(rest), false);
  // data-send attribute values must stay inside their single quotes.
  for (const m of html.matchAll(/data-send='([^']*)'/g)) {
    assert.doesNotThrow(() => JSON.parse(m[1].replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')));
  }
  assert.equal((html.match(/data-send='/g) || []).length, (html.match(/data-send='[^']*'/g) || []).length);
}

test('hostile strings are escaped on every screen and attribute', () => {
  assertSafe(renderLogin(EVIL));
  for (const phase of ['briefing', 'ideation', 'shop', 'competition', 'summary', 'ended']) {
    for (const role of ['CEO', 'CFO', 'CMO', 'CTO']) assertSafe(renderScreen(hostileView(phase, role)));
  }
  assertSafe(renderScreen({ screen: 'lobby', me: { name: EVIL } }));
  assertSafe(renderScreen({ screen: 'graphs', me: { name: EVIL } }));
  assertSafe(renderScreen({ screen: EVIL }));
});

test('a quote in a choice cannot break out of data-send', () => {
  const html = renderScreen(hostileView('shop', 'CMO'));
  assert.match(html, /o&#39;k/);
});
