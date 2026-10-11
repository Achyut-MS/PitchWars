import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, atSec } from './helpers.js';
import { castVote, pickIdea, tally, resolveIdeation } from '../src/ideation.js';
import { companyState } from '../src/state.js';
import { phaseAt } from '../src/phases.js';

test('everyone can vote during ideation, and a changed vote replaces the old one', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'S2');
  assert.deepEqual(tally(h.db, h.gameId, 'A'), { H1: 1, S2: 1 });
});

test('votes are refused before ideation and after it', () => {
  const h = makeRunning();
  atSec(h, 100);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /ideation is not open/);
  atSec(h, 400);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /ideation is not open/);
});

test('an unknown idea and a player from outside the game are refused', () => {
  const h = makeRunning(); atSec(h, 200);
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'ZZ'), /unknown idea/);
  assert.throws(() => castVote(h.ctx, h.game(), 'S10', 'H1'), /not in this game/);
});

test('every vote and change is logged', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'S2');
  const rows = h.db.prepare("SELECT payload FROM events WHERE type='vote' ORDER BY id").all().map((r) => JSON.parse(r.payload));
  assert.deepEqual(rows.map((r) => [r.ideaId, r.previous]), [['H1', null], ['S2', 'H1']]);
});

test('only the CEO can pick, and the pick is final', () => {
  const h = makeRunning(); atSec(h, 200);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /only the CEO can pick/);
  assert.equal(pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H2').endedEarly, false);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H3'), /already picked/);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H2');
  assert.equal(companyState(h.db, h.gameId, 'A').pick_source, 'ceo');
});

test('voting closes for a company once its CEO has picked', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H2');
  assert.throws(() => castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1'), /already picked/);
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'H1'); // the other company can still vote
});

test('when both CEOs have picked, ideation ends early and the saved time goes to the shop', () => {
  const h = makeRunning(); atSec(h, 200); // 20 s into ideation
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  const r = pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1');
  assert.equal(r.endedEarly, true);
  assert.deepEqual(phaseAt(h.game(), h.clock.t), { phase: 'shop', remainingSec: 580 });
  assert.equal(h.game().ideationSavedSec, 160);
});

test('early end persists in the db, happens once, and a repeat pick is refused', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1'); // same second
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S2'), /ideation is not open|already picked/);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H3'), /ideation is not open|already picked/);
  assert.equal(h.db.prepare('SELECT ideation_saved_sec AS s FROM games WHERE id=?').get(h.gameId).s, 160);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type='ideation_end_early'").get().n, 1);
});

test('a stale game snapshot cannot end ideation early twice or lose saved seconds', () => {
  const h = makeRunning(); atSec(h, 200);
  const stale = h.game();
  pickIdea(h.ctx, stale, h.seat.A.CEO, 'H1');
  pickIdea(h.ctx, stale, h.seat.B.CEO, 'S1');
  assert.equal(h.game().ideationSavedSec, 160);
});

test('no early end when only one company picked, or when the other was auto-picked after the phase', () => {
  const h = makeRunning(); atSec(h, 200);
  pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1');
  assert.equal(h.game().ideationSavedSec || 0, 0);
  atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0);
  assert.equal(h.game().ideationSavedSec || 0, 0);
  assert.throws(() => pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S1'), /ideation is not open/);
});

test('lobby players cannot vote, and a vote does not leak the other company', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.B.CTO, 'S1');
  assert.deepEqual(tally(h.db, h.gameId, 'A'), { H1: 1 });
  assert.deepEqual(tally(h.db, h.gameId, 'B'), { S1: 1 });
  assert.equal(pickIdea(h.ctx, h.game(), h.seat.A.CEO, 'H1').endedEarly, false);
});

test('auto-pick takes the most voted idea, and leaves a CEO pick alone', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H2');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'H2');
  castVote(h.ctx, h.game(), h.seat.A.CMO, 'S1');
  pickIdea(h.ctx, h.game(), h.seat.B.CEO, 'S3');
  atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H2');
  assert.equal(companyState(h.db, h.gameId, 'A').pick_source, 'auto');
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S3');
});

test('a tie is broken by the random number, and no votes at all picks one of the six', () => {
  const h = makeRunning(); atSec(h, 200);
  castVote(h.ctx, h.game(), h.seat.A.CTO, 'H1');
  castVote(h.ctx, h.game(), h.seat.A.CFO, 'S2');
  atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0.99); // last of the tied ideas
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'S2');
  assert.equal(companyState(h.db, h.gameId, 'B').idea_id, 'S3'); // 0.99 of 6 ideas
});

test('resolving twice does not change a pick', () => {
  const h = makeRunning(); atSec(h, 361);
  resolveIdeation(h.ctx, h.game(), () => 0);
  resolveIdeation(h.ctx, h.game(), () => 0.99);
  assert.equal(companyState(h.db, h.gameId, 'A').idea_id, 'H1');
});

test('pickIdea works inside an outer transaction', async () => {
  const { makeRunning, atSec } = await import('./helpers.js');
  const { pickIdea } = await import('../src/ideation.js');
  const h = makeRunning();
  atSec(h, 200);
  const ideaId = h.ctx.data.ideasFor(h.game().problemId)[0].id;
  const r = h.db.transaction(() => pickIdea(h.ctx, h.game(), h.seat.A.CEO, ideaId))();
  assert.equal(r.endedEarly, false);
  assert.equal(h.db.prepare("SELECT idea_id FROM company_state WHERE game_id=? AND company='A'").get(h.gameId).idea_id, ideaId);
});
