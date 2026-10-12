import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOrganizer, renderOrganizerLogin } from '../public/render-organizer.js';

const HOSTILE = '<script>alert(1)</script>"\'&';
const lobby = () => ({
  screen: 'organizer',
  problems: [{ id: 1, title: 'Food waste' }, { id: 2, title: 'Water shortage' }],
  participants: [
    { admission_id: 'S0', name: 'Asha', status: 'lobby', company: 'A', role: 'CEO', game_id: null },
    { admission_id: 'S1', name: '<b>Ben</b>', status: 'lobby', company: null, role: null, game_id: null },
  ],
  game: null,
});
const running = (phase = 'shop') => {
  const v = lobby();
  v.participants = [
    { admission_id: 'S0', name: 'Asha', status: 'in_game', company: 'A', role: 'CEO', game_id: 1 },
    { admission_id: 'S1', name: 'Ben', status: 'in_game', company: 'B', role: 'CEO', game_id: 1 },
    { admission_id: 'S2', name: 'Cy', status: 'lobby', company: null, role: null, game_id: null },
  ];
  v.game = {
    id: 1, problemId: 1, clock: { phase, remainingSec: 200 },
    companies: {
      A: { wallet: 900, idea: { id: 'H1', name: 'Smart Fridge Sensor' }, pickSource: 'ceo', votes: { H1: 3 }, owned: [{ label: 'Brand name: FreshSense', charged: 40 }], queue: [], awaitingCeo: [] },
      B: { wallet: 1000, idea: null, pickSource: null, votes: {}, owned: [], queue: [], awaitingCeo: [] },
    },
  };
  return v;
};

test('the lobby has a roster box, a participant table and a start button with a problem choice', () => {
  const html = renderOrganizer(lobby());
  assert.match(html, /id="roster"/);
  assert.match(html, /data-assign="S0"/);
  assert.match(html, /Food waste/);
  assert.match(html, /id="start"/);
  assert.match(html, /id="add-id"/);
});

test('names are escaped', () => {
  const html = renderOrganizer(lobby());
  assert.equal(html.includes('<b>Ben</b>'), false);
  assert.match(html, /&lt;b&gt;Ben/);
});

test('hostile strings never appear raw in the lobby or a running game', () => {
  const l = lobby();
  l.participants[1].name = HOSTILE; l.participants[1].admission_id = HOSTILE;
  l.problems[0].title = HOSTILE;
  const r = running(); r.participants[0].name = HOSTILE; r.participants[0].admission_id = HOSTILE;
  r.game.companies.A.idea.name = HOSTILE;
  r.game.companies.A.owned[0].label = HOSTILE;
  r.game.companies.A.queue = [{ id: 1, label: HOSTILE, by: HOSTILE, price: 5 }];
  for (const html of [renderOrganizer(l), renderOrganizer(r, { importResult: { added: 0, skipped: 0, rejected: [{ line: 1, reason: HOSTILE }] }, error: HOSTILE }), renderOrganizerLogin(HOSTILE)]) {
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes("'&"), false);
  }
});

test('data-send JSON in an attribute cannot be broken out of by an admission id', () => {
  const l = lobby();
  l.participants[0].admission_id = `x'><img src=x onerror=alert(1)>`;
  const html = renderOrganizer(l);
  assert.equal(html.includes('<img'), false);
});

test('the lobby shows how many seats are filled and an unassign button', () => {
  const html = renderOrganizer(lobby());
  assert.match(html, /1 of 10 seats/);
  assert.match(html, /"type":"unassign"/);
});

test('import result shows added, skipped and every rejected row with its line and reason', () => {
  const html = renderOrganizer(lobby(), { importResult: { added: 2, skipped: 1, rejected: [{ line: 3, reason: 'blank name' }, { line: 7, reason: 'blank admission id' }] } });
  assert.match(html, /2 added/);
  assert.match(html, /1 skipped/);
  assert.match(html, /Line 3: blank name/);
  assert.match(html, /Line 7: blank admission id/);
});

test('a running game shows both companies, their wallets, ideas and the clock', () => {
  const html = renderOrganizer(running());
  assert.match(html, /Company A/);
  assert.match(html, /Company B/);
  assert.match(html, /900/);
  assert.match(html, /Smart Fridge Sensor/);
  assert.match(html, /3:20/);
  assert.equal(html.includes('id="start"'), false);
});

test('there is no separate end game button: Next Game is the one end action', () => {
  const html = renderOrganizer(running());
  assert.equal(html.includes('end_game'), false);
  assert.match(html, /id="next-game"/);
});

test('end ideation early only shows during ideation', () => {
  assert.match(renderOrganizer(running('ideation')), /data-confirm="end_ideation_early"/);
  assert.equal(renderOrganizer(running('shop')).includes('end_ideation_early'), false);
});

test('swap and replace controls show only in the briefing', () => {
  const b = renderOrganizer(running('briefing'));
  assert.match(b, /id="swap-a"/);
  assert.match(b, /id="replace-out"/);
  assert.match(b, /id="replace-in"/);
  assert.equal(renderOrganizer(running('shop')).includes('id="swap-a"'), false);
});

test('a stuck phase shows a warning banner', () => {
  const v = running(); v.game.stuck = ['ideation'];
  assert.match(renderOrganizer(v), /role="alert"[^>]*>[^]*ideation/);
  assert.equal(renderOrganizer(running()).includes('role="alert"'), false);
});

test('malformed views do not throw', () => {
  assert.doesNotThrow(() => renderOrganizer({}));
  assert.doesNotThrow(() => renderOrganizer(null));
  const v = running(); delete v.game.companies.B;
  assert.doesNotThrow(() => renderOrganizer(v));
});

test('start game needs a two-step confirm like end game', () => {
  const first = renderOrganizer(lobby());
  assert.match(first, /id="start"[^>]*data-confirm="start_game"|data-confirm="start_game"[^>]*id="start"/);
  assert.equal(first.includes('id="start-yes"'), false);
  const second = renderOrganizer(lobby(), { confirm: 'start_game' });
  assert.match(second, /id="start-yes"/);
  assert.match(second, /data-confirm=""/);
});

test('the monitor shows idea names with plural-correct vote counts', () => {
  const v = running();
  v.game.ideas = [{ id: 'H1', name: 'Smart Fridge Sensor' }, { id: 'H2', name: 'Canteen Waste Scale' }];
  v.game.companies.A.votes = { H1: 1, H2: 2 };
  const html = renderOrganizer(v);
  assert.match(html, /Smart Fridge Sensor: 1 vote\b(?!s)/);
  assert.match(html, /Canteen Waste Scale: 2 votes/);
  assert.equal(html.includes('H2: 2'), false);
  v.game.ideas = [{ id: 'H1', name: '<script>x</script>' }];
  assert.equal(renderOrganizer(v).includes('<script>x'), false);
});

test('swap and replace selects have visible labels', () => {
  const b = renderOrganizer(running('briefing'));
  for (const t of ['Swap: first player', 'Swap: second player', 'Replace: who leaves', 'Replace: who comes in']) assert.match(b, new RegExp(`<label[^>]*for="[^"]+"[^>]*>${t}`));
});

test('organizer login error is a sentence', () => {
  assert.match(renderOrganizerLogin('Wrong password'), /Wrong password/);
});

test('the organizer shows an offline banner and disabled controls when offline', () => {
  const html = renderOrganizer(lobby(), { offline: true });
  assert.match(html, /Offline - reconnecting/);
  assert.match(html, /id="start"[^>]*disabled|disabled[^>]*id="start"/);
});

test('skip to next phase: a rehearsal control with a two-step confirm, hidden in the competition and the lobby', () => {
  for (const ph of ['briefing', 'ideation', 'shop', 'summary']) {
    const first = renderOrganizer(running(ph));
    assert.match(first, /data-confirm="skip_phase"/, ph);
    assert.match(first, /skip to next phase/i);
    assert.match(first, /rehearsal|testing/i);
    assert.equal(first.includes('"type":"skip_phase"'), false);
  }
  const second = renderOrganizer(running('shop'), { confirm: 'skip_phase' });
  assert.match(second, /"type":"skip_phase"/);
  assert.match(second, /data-confirm=""/);
  assert.equal(renderOrganizer(running('competition')).includes('skip_phase'), false);
  assert.equal(renderOrganizer(lobby()).includes('skip_phase'), false);
});

const comp = (extra = {}) => { const v = running('competition'); v.game = { ...v.game, attacks: [], eventUsed: null, injectionUsed: null, ...extra }; return v; };

test('competition controls: only in the competition', () => {
  assert.match(renderOrganizer(comp()), /Competition controls/);
  assert.equal(renderOrganizer(running('shop')).includes('Competition controls'), false);
  assert.equal(renderOrganizer(lobby()).includes('Competition controls'), false);
});

test('market event picker offers the three server keys with a two-step confirm', () => {
  const first = renderOrganizer(comp());
  for (const k of ['demand_surge', 'demand_slump', 'shop_sale']) assert.match(first, new RegExp(`data-confirm="event:${k}"`));
  assert.equal(first.includes('"type":"market_event"'), false);
  const second = renderOrganizer(comp(), { confirm: 'event:shop_sale' });
  assert.match(second, /"type":"market_event","key":"shop_sale"/);
  assert.match(second, /data-confirm=""/);
});

test('a used market event disables the picker and says which', () => {
  const html = renderOrganizer(comp({ eventUsed: 'demand_surge' }));
  assert.match(html, /Used: Demand Surge/);
  assert.equal(html.includes('data-confirm="event:'), false);
});

test('coin injection: form, validated draft, confirm sends exact message, used state', () => {
  const first = renderOrganizer(comp());
  assert.match(first, /id="inj-company"/);
  assert.match(first, /id="inj-coins"/);
  assert.match(first, /id="inj-ask"/);
  const second = renderOrganizer(comp(), { confirm: 'inject', injectDraft: { company: 'B', coins: 250 } });
  assert.match(second, /"type":"inject","company":"B","coins":250/);
  assert.match(second, /250 coins to Company B/);
  const used = renderOrganizer(comp({ injectionUsed: { company: 'A', coins: 300 } }));
  assert.match(used, /Used: 300 coins to Company A/);
  assert.equal(used.includes('id="inj-ask"'), false);
});

test('the live attack log lists attacks', () => {
  const html = renderOrganizer(comp({ attacks: [{ id: 1, attacker: 'A', victim: 'B', name: 'Price Squeeze', cost: 300, at: 1, endsAt: 2, blocked: true, by: 'S0' }] }));
  assert.match(html, /Attack log/);
  assert.match(html, /Price Squeeze/);
  assert.match(html, /blocked/i);
});
