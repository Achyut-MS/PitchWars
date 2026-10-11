import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen, clockClass } from '../public/render.js';
import { createConfirm } from '../public/glue.js';
import { makeRunning, give, toCompetition, atSec } from './helpers.js';
import { viewFor } from '../src/views.js';
import { requestItem } from '../src/shop.js';
import { launchAttack } from '../src/attacks.js';
import { triggerMarketEvent } from '../src/marketEvents.js';

const XSS = '<img src=x onerror=alert(1)>';
const item = (o = {}) => ({ id: 'X1', name: 'X', label: 'Thing', option: null, section: 'Build', role: 'CTO', cost: 100, price: 100, state: 'available', note: '', choices: null, canRequest: true, canRecommend: false, ...o });
const view = (role, comp = {}, over = {}) => ({
  me: { admissionId: 'S1', name: 'Asha', company: 'A', role, status: 'in_game' },
  screen: 'game', clock: { phase: 'competition', remainingSec: 500 }, problem: { id: 1, title: 'Food waste', statement: '' }, wallet: 1234,
  idea: { id: 'H1', type: 'hardware', name: 'Fridge', description: '' }, ideation: null, owned: [], summary: null,
  shop: { open: true, catalog: [item()], mine: [], ...(role === 'CFO' || role === 'CEO' ? { queue: [] } : {}) },
  competition: { rates: { CTO: 6.5, CMO: 13, COO: 20, total: 39.5 }, notices: [], hint: null, shield: null, attack: null, ...comp },
  ...over,
});
const atk = (o = {}) => ({ options: [{ key: 'market_crash', name: 'Market Crash', cost: 450 }, { key: 'price_squeeze', name: 'Price Squeeze', cost: 300 }], cooldownLeftSec: 0, lockedReason: null, launches: [], ...o });

test('every role sees its own sales meter, rate and level, plus wallet', () => {
  for (const role of ['CTO', 'CMO', 'COO']) {
    const h = renderScreen(view(role));
    assert.match(h, /id="sales-meter"/);
    assert.match(h, /1234/);
    assert.match(h, /per minute/);
  }
  assert.match(renderScreen(view('CMO')), /class="my-rate">13</);
  assert.match(renderScreen(view('CTO', { level: { CTO: 1.5 } })), /Level 1\.5/);
  assert.match(renderScreen(view('COO', { level: { COO: 2 } })), /Level 2</);
  assert.match(renderScreen(view('CFO')), /39\.5/);
});

test('notices, hint, and hostile text are escaped', () => {
  const h = renderScreen(view('COO', { notices: [XSS, 'Ad platform outage'], hint: { text: XSS } }));
  assert.match(h, /Ad platform outage/);
  assert.equal(h.includes('<img'), false);
  assert.match(h, /aria-label="Hint"/);
});

test('countdown red state at 10 seconds or less and banners', () => {
  assert.match(renderScreen(view('CTO', {}, { clock: { phase: 'competition', remainingSec: 10 } })), /id="clock" class="red"/);
  assert.equal(/id="clock" class="red"/.test(renderScreen(view('CTO', {}, { clock: { phase: 'competition', remainingSec: 11 } }))), false);
  assert.match(renderScreen(view('CTO', {}, { clock: { phase: 'competition', remainingSec: 25, warning: '30s' } })), /30 seconds left: the shop is closed/);
  assert.match(renderScreen(view('CTO', {}, { clock: { phase: 'competition', remainingSec: 5, warning: 'last10' } })), /Last 10 seconds/);
  assert.equal(clockClass(10), 'red');
  assert.equal(clockClass(11), '');
  assert.equal(clockClass(undefined), '');
});

test('open shop with a sale shows sale price against list price consistently', () => {
  const h = renderScreen(view('CTO', {}, { shop: { open: true, sale: { active: true, mult: 0.75, endsInSec: 40 }, catalog: [item({ price: 75, cost: 100 })], mine: [] } }));
  assert.match(h, /Sale! 40 s left/);
  assert.equal(renderScreen(view('CTO', {}, { shop: { open: true, sale: null, catalog: [item({ price: 60, cost: 100 })], mine: [] } })).includes('class="list"'), false);
  assert.match(h, /class="price">75</);
  assert.match(h, /<s class="list">100</);
  const plain = renderScreen(view('CTO'));
  assert.equal(plain.includes('class="list"'), false);
  assert.match(plain, /Request for 100/);
});

test('closed shop shows a closed state with no request buttons', () => {
  const h = renderScreen(view('CTO', {}, { clock: { phase: 'competition', remainingSec: 25, warning: '30s' }, shop: { open: false, catalog: [item({ canRequest: false })], mine: [] } }));
  assert.match(h, /class="shop-closed"/);
  assert.equal(h.includes('"type":"request"'), false);
});

test('locked by a cover story: disabled request buttons and the cover message', () => {
  const h = renderScreen(view('CTO', { notices: ['Supplier systems are down for maintenance'] }, { shop: { open: true, locked: 'Supplier systems are down for maintenance', catalog: [item()], mine: [] } }));
  assert.match(h, /class="locked"[^>]*>Supplier systems are down for maintenance/);
  const btn = h.split('"type":"request"')[1].split('</button>')[0];
  assert.match(btn, /disabled/);
  assert.equal(/attack|rival/i.test(h), false);
});

test('CFO queue: rows with approve, and the empty state', () => {
  const q = [{ id: 7, label: 'Thing', price: 80, by: XSS, recommended: true, head: true }];
  const h = renderScreen(view('CFO', {}, { shop: { open: true, catalog: [], mine: [], queue: q } }));
  assert.match(h, /"type":"cfo_decide"/);
  assert.equal(h.includes('<img'), false);
  assert.match(renderScreen(view('CFO')), /No requests waiting/);
});

test('CEO command centre: deck, disabled while locked, cooldown seconds, own launches', () => {
  const ready = renderScreen(view('CEO', { attack: atk() }));
  assert.match(ready, /id="attack-deck"/);
  assert.match(ready, /"type":"attack","key":"market_crash"/);
  assert.equal(/disabled/.test(ready.split('"type":"attack"')[1].split('</button>')[0]), false);
  assert.match(ready, /class="attack-btn/);
  const cd = renderScreen(view('CEO', { attack: atk({ lockedReason: 'cooldown', cooldownLeftSec: 42 }) }));
  assert.match(cd, /Ready in 42 s/);
  assert.match(cd.split('"type":"attack"')[1].split('</button>')[0], /disabled/);
  const last = renderScreen(view('CEO', { attack: atk({ lockedReason: 'last minute' }) }));
  assert.match(last, /closed for the last minute/);
  const l = renderScreen(view('CEO', { attack: atk({ launches: [{ name: XSS, cost: 450, at: 1, status: 'blocked' }, { name: 'Market Crash', cost: 450, at: 2, status: 'landed' }] }) }));
  assert.match(l, /Attack blocked/);
  assert.match(l, /class="launch landed"/);
  assert.equal(l.includes('<img'), false);
  assert.equal(renderScreen(view('CTO')).includes('"type":"attack"'), false);
});

test('COO shield status', () => {
  assert.match(renderScreen(view('COO', { shield: { owned: true, used: false } })), /Shield ready/);
  assert.match(renderScreen(view('COO', { shield: { owned: false, used: false } })), /No shield/);
});

test('no crash when sections are missing', () => {
  for (const role of ['CEO', 'CTO', 'CMO', 'COO', 'CFO']) {
    assert.doesNotThrow(() => renderScreen(view(role, { rates: undefined, notices: undefined, attack: { options: undefined, launches: undefined } })));
    assert.doesNotThrow(() => renderScreen(view(role, null, { competition: undefined, shop: null })));
    assert.doesNotThrow(() => renderScreen(view(role, {}, { competition: { notices: null, rates: null, attack: {}, shield: {}, hint: {} }, shop: { catalog: null, mine: null } })));
  }
});

test('confirm helper: needs a second tap on the same attack within the window', () => {
  const c = createConfirm(5000);
  assert.equal(c.tap('a', 1000), 'armed');
  assert.equal(c.tap('b', 1100), 'armed');
  assert.equal(c.tap('b', 1300), 'confirmed');
  assert.equal(c.tap('b', 1400), 'armed'); // consumed
  assert.equal(c.tap('b', 7000), 'armed'); // expired
});

test('smoke: every role renders from a real viewFor with hostile names and live attack and sale', () => {
  const h = toCompetition(makeRunning());
  give(h, 'A', ['O01', 'M01-L', 'HC01']);
  h.db.prepare('UPDATE participants SET name=? WHERE admission_id=?').run(XSS, h.seat.A.CEO);
  triggerMarketEvent(h.ctx, h.game(), 'shop_sale');
  launchAttack(h.ctx, h.game(), h.seat.B.CEO, 'market_crash', () => 0);
  atSec(h, 801);
  for (const role of ['CEO', 'CTO', 'CMO', 'COO', 'CFO']) {
    const v = viewFor(h.ctx, h.seat.A[role]);
    const html = renderScreen(v);
    assert.match(html, /id="clock"/, role);
    assert.match(html, /Stock market prices have fallen/, role);
    assert.equal(html.includes('<img'), false, role);
    // the catalog itself lists the COO's Attack Shield item (data, not a view leak); everything else must be clean
    assert.equal(role !== 'CEO' && /attack|rival/i.test(html.replace(/<details[\s\S]*?<\/details>/g, '')), false, role);
    if (['CTO', 'CMO', 'COO'].includes(role)) assert.match(html, /id="sales-meter"/);
  }
  assert.match(renderScreen(viewFor(h.ctx, h.seat.B.CEO)), /id="attack-deck"/);
  atSec(h, 1780);
  for (const role of ['CEO', 'CTO', 'CFO']) assert.doesNotThrow(() => renderScreen(viewFor(h.ctx, h.seat.A[role])));
});

test('closed shop with open requests: CFO and CEO can still decide, new requests are blocked', () => {
  const q = [{ id: 7, label: 'Thing', price: 80, by: 'Bo', recommended: false, head: true }];
  const clock = { phase: 'competition', remainingSec: 20, warning: '30s' };
  const cfo = renderScreen(view('CFO', {}, { clock, shop: { open: false, catalog: [], mine: [], queue: q } }));
  assert.match(cfo, /Shop closed/);
  for (const a of ['true', 'false']) assert.equal(/disabled/.test(cfo.split(`"approve":${a}`)[1].split('</button>')[0]), false);
  const ceo = renderScreen(view('CEO', {}, { clock, shop: { open: false, catalog: [item({ role: 'CTO', canRequest: false, canRecommend: true })], mine: [], queue: q, awaitingCeo: [{ id: 8, label: 'Feat', price: 5, by: 'Cy' }] } }));
  assert.match(ceo, /Shop closed/);
  assert.equal(/disabled/.test(ceo.split('"type":"cfo_decide"')[0] ? ceo.split('"type":"ceo_decide"')[1].split('</button>')[0] : ''), false);
  assert.match(ceo.split('"type":"recommend"')[1].split('</button>')[0], /disabled/);
});

test('real views: a cfo_lock disables the CFO decide buttons, a cto_lock disables CTO requests', () => {
  const h = toCompetition(makeRunning());
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'HC01');
  launchAttack(h.ctx, h.game(), h.seat.B.CEO, 'bank_freeze', () => 0);
  const cfo = renderScreen(viewFor(h.ctx, h.seat.A.CFO));
  assert.match(cfo, /Bank systems are under maintenance/);
  assert.match(cfo, /"type":"cfo_decide"/);
  for (const a of ['true', 'false']) assert.match(cfo.split(`"approve":${a}`)[1].split('</button>')[0], /disabled/);
  atSec(h, 1000); // lock over
  const h2 = toCompetition(makeRunning());
  launchAttack(h2.ctx, h2.game(), h2.seat.B.CEO, 'supplier_delay', () => 0);
  const cto = renderScreen(viewFor(h2.ctx, h2.seat.A.CTO));
  assert.match(cto, /Supplier systems are down/);
  assert.match(cto.split('"type":"request"')[1].split('</button>')[0], /disabled/);
});
