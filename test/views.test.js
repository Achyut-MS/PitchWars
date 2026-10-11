import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec, data } from './helpers.js';
import { castVote, pickIdea } from '../src/ideation.js';
import { requestItem, cfoDecide } from '../src/shop.js';
import { viewFor, organizerView } from '../src/views.js';
import { endGame } from '../src/lobby.js';
import { openDb } from '../src/db.js';

test('a lobby player gets the lobby screen, a completed player the graphs screen', () => {
  const h = makeRunning();
  assert.equal(viewFor(h.ctx, 'S10').screen, 'lobby');
  endGame(h.db, h.gameId, 5);
  const v = viewFor(h.ctx, 'S0');
  assert.deepEqual([v.screen, v.gameId], ['graphs', h.gameId]);
});

test('an in-game player sees the problem, their role and the clock during the briefing', () => {
  const h = makeRunning(); atSec(h, 10);
  const v = viewFor(h.ctx, h.seat.A.CFO);
  assert.equal(v.screen, 'game');
  assert.equal(v.me.role, 'CFO');
  assert.deepEqual(v.clock, { phase: 'briefing', remainingSec: 170 });
  assert.equal(v.problem.title, 'Food waste');
  assert.equal(v.wallet, 1000);
});

test('ideation shows the six ideas, live votes of my own company and whether I can pick', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'S3');
  const ceo = viewFor(h.ctx, h.seat.A.CEO);
  assert.equal(ceo.ideation.ideas.length, 6);
  assert.equal(ceo.ideation.canPick, true);
  assert.equal(ceo.ideation.ideas.find((i) => i.id === 'H1').votes, 1);
  assert.equal(ceo.ideation.ideas.find((i) => i.id === 'S3').votes, 0); // the rival's vote is hidden
  const cto = viewFor(h.ctx, h.seat.A.CTO);
  assert.equal(cto.ideation.canPick, false);
  assert.equal(cto.ideation.ideas.find((i) => i.id === 'H1').mine, true);
});

test('the shop view marks owned, requested and waiting items and who can act', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const id = requestItem(h.ctx, h.game(), h.seat.A.CMO, 'M01-N');
  const cmo = viewFor(h.ctx, h.seat.A.CMO).shop;
  assert.equal(cmo.open, true);
  assert.equal(cmo.catalog.find((i) => i.id === 'M01-N').state, 'requested');
  assert.equal(cmo.catalog.find((i) => i.id === 'M01-M').canRequest, false); // same family is already requested
  assert.equal(cmo.catalog.find((i) => i.id === 'M04-S').canRequest, true);
  assert.equal(cmo.catalog.find((i) => i.id === 'F01-B').canRequest, false); // not my section
  assert.equal(cmo.catalog.find((i) => i.id === 'SC01'), undefined); // software part, hardware idea
  const cfo = viewFor(h.ctx, h.seat.A.CFO).shop;
  assert.equal(cfo.queue.length, 1);
  assert.equal(cfo.queue[0].head, true);
  assert.equal(cfo.catalog.every((i) => i.canRequest === false), true);
  cfoDecide(h.ctx, h.game(), h.seat.A.CFO, id, true);
  assert.equal(viewFor(h.ctx, h.seat.A.CMO).shop.catalog.find((i) => i.id === 'M01-N').state, 'owned');
});

test('the CEO sees features waiting for approval and can recommend anything', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  requestItem(h.ctx, h.game(), h.seat.A.CTO, 'F01-B');
  const ceo = viewFor(h.ctx, h.seat.A.CEO).shop;
  assert.equal(ceo.awaitingCeo.length, 1);
  assert.equal(ceo.catalog.find((i) => i.id === 'M01-N').canRecommend, true);
  assert.equal(viewFor(h.ctx, h.seat.A.CTO).shop.awaitingCeo, undefined);
});

test('the brand item offers the three names of the chosen idea', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const brand = viewFor(h.ctx, h.seat.A.CMO).shop.catalog.find((i) => i.id === 'M02');
  assert.deepEqual(brand.choices, h.ctx.data.ideasFor(1).find((i) => i.id === 'H1').brands);
});

test('a player never sees the rival company: no rival idea, wallet or items', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  h.db.prepare("UPDATE company_state SET wallet = 123 WHERE company = 'B'").run();
  const json = JSON.stringify(viewFor(h.ctx, h.seat.A.CFO));
  assert.equal(json.includes('123'), false);
  assert.equal(json.includes('"S1"'), false);
});

test('the summary card appears only during the summary phase', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).summary, null);
  atSec(h, 790);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).summary.wallet, 1000);
});

test('the organizer sees both companies and the whole roster', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  const o = organizerView(h.ctx);
  assert.equal(o.participants.length, 12);
  assert.equal(o.problems.length, 8);
  assert.equal(o.game.companies.A.idea.id, 'H1');
  assert.equal(o.game.companies.B.idea, null);
  assert.deepEqual(Object.keys(o.game.companies), ['A', 'B']);
});

test('with no game running the organizer view has no game', () => {
  const ctx = { db: openDb(), data, now: () => 0 };
  assert.equal(organizerView(ctx).game, null);
});

test('hidden products: neither player view contains anything of the rival company', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  h.db.prepare("UPDATE company_state SET wallet = 7777 WHERE company = 'B'").run();
  requestItem(h.ctx, h.game(), h.seat.B.CTO, 'F01-B');
  const ideas = h.ctx.data.ideasFor(1);
  const h1 = ideas.find((i) => i.id === 'H1');
  const s1 = ideas.find((i) => i.id === 'S1');
  const a = JSON.stringify(viewFor(h.ctx, h.seat.A.CEO));
  const b = JSON.stringify(viewFor(h.ctx, h.seat.B.CEO));
  for (const [json, own, rival] of [[a, h1, s1], [b, s1, h1]]) {
    assert.equal(json.includes(rival.name), false);
    assert.equal(json.includes(rival.description), false);
    assert.equal(json.includes(`"${rival.id}"`), false);
    assert.equal(json.includes(own.name), true);
  }
  assert.equal(a.includes('7777'), false);
  assert.equal(a.includes('Player 6'), false); // rival CEO name never appears
  assert.equal(JSON.parse(a).shop.awaitingCeo.length, 0);
  assert.equal(JSON.parse(b).shop.awaitingCeo.length, 1);
});

test('during ideation a player sees only their own company votes and no rival pick', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'S3');
  castVote(h.ctx, h.game(), h.seat.B.CMO, 'S3');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const v = viewFor(h.ctx, h.seat.A.CEO);
  assert.equal(v.idea, null);
  assert.equal(v.ideation.picked, null);
  assert.equal(v.ideation.ideas.every((i) => i.votes === 0 && i.mine === false), true);
});

test('no solution or internal fields leak into a player view', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  const json = JSON.stringify(viewFor(h.ctx, h.seat.A.CEO));
  for (const k of ['solution', 'secret', 'seed', 'pick_source', 'pickSource', 'company_state', 'game_id', 'requested_by']) {
    assert.equal(json.includes(`"${k}"`), false, k);
  }
});

test('a player summary card is built from their own company only', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  h.db.prepare("UPDATE company_state SET wallet = 7777 WHERE company = 'B'").run();
  atSec(h, 790);
  assert.equal(viewFor(h.ctx, h.seat.A.CEO).summary.wallet, 1000);
  assert.equal(JSON.stringify(viewFor(h.ctx, h.seat.A.CEO)).includes('7777'), false);
});
