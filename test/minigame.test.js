import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRunning, toCompetition, atSec } from './helpers.js';
import { levelFor, rewardFor, startPuzzle, submitPuzzle, skipPuzzle, openPuzzle, publicPuzzle } from '../src/minigame.js';
import { launchAttack } from '../src/attacks.js';
import { companyState } from '../src/state.js';
import { mulberry32 } from '../src/puzzles/rng.js';

const wallet = (h) => companyState(h.db, h.gameId, 'A').wallet;
const stored = (h) => JSON.parse(openPuzzle(h.db, h.gameId, 'A').solution);
const start = (h, seed = 1) => startPuzzle(h.ctx, h.game(), h.seat.A.CFO, mulberry32(seed));
const solve = (h) => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, stored(h));

test('difficulty rises one level for every two puzzles solved, up to level 4', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 20].map(levelFor), [1, 1, 2, 2, 3, 3, 4, 4, 4]);
});

test('levels 1 and 2 pay 20 coins, levels 3 and 4 pay 40', () => {
  assert.deepEqual([1, 2, 3, 4].map(rewardFor), [20, 20, 40, 40]);
});

test('only the CFO, CMO and COO can play, each with its own puzzle, and only during the competition', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => startPuzzle(h.ctx, h.game(), h.seat.A.CEO), /only the CFO, CMO and COO/);
  assert.throws(() => startPuzzle(h.ctx, h.game(), h.seat.A.CTO), /only the CFO, CMO and COO/);
  assert.equal(startPuzzle(h.ctx, h.game(), h.seat.A.CMO, mulberry32(5)).kind, 'logo');
  assert.equal(startPuzzle(h.ctx, h.game(), h.seat.A.COO, mulberry32(5)).kind, 'risks');
  atSec(h, 500);
  assert.throws(() => start(h), /only open during the competition/);
});

test('a puzzle starts at level 1 and asking again returns the same open puzzle', () => {
  const h = toCompetition(makeRunning());
  const a = start(h);
  assert.equal(a.level, 1);
  assert.equal(start(h, 99).id, a.id);
});

test('solving pays the reward into the wallet and into mini game coins', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const r = solve(h);
  assert.deepEqual(r, { ok: true, coins: 20 });
  assert.equal(wallet(h), 1020);
  assert.equal(companyState(h.db, h.gameId, 'A').mini_coins, 20);
});

test('submitting the same answer twice pays once', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const sol = stored(h);
  assert.equal(submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol).ok, true);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol), /no puzzle is open/);
  assert.equal(wallet(h), 1020);
});

test('a wrong answer pays nothing, costs nothing and keeps the puzzle open', () => {
  const h = toCompetition(makeRunning());
  start(h);
  assert.deepEqual(submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, null), { ok: false, coins: 0 });
  assert.equal(wallet(h), 1000);
  assert.equal(openPuzzle(h.db, h.gameId, 'A').wrong_tries, 1);
});

test('every second solved puzzle makes the next one harder, and level 3 pays 40', () => {
  const h = toCompetition(makeRunning());
  const levels = [];
  for (let i = 0; i < 5; i++) {
    levels.push(start(h, i + 1).level);
    solve(h);
  }
  assert.deepEqual(levels, [1, 1, 2, 2, 3]);
  start(h, 50); solve(h);
  start(h, 51);
  assert.equal(solve(h).coins, 40);
});

test('the next puzzle is a different kind from the one before', () => {
  const h = toCompetition(makeRunning());
  let last = null;
  for (let i = 0; i < 8; i++) {
    const p = start(h, i + 7);
    assert.notEqual(p.kind, last);
    last = p.kind;
    solve(h);
  }
});

test('the first two skips are free, the third costs 10 coins, for the whole game', () => {
  const h = toCompetition(makeRunning());
  const penalties = [];
  for (let i = 0; i < 4; i++) { start(h, i + 1); penalties.push(skipPuzzle(h.ctx, h.game(), h.seat.A.CFO).penalty); }
  assert.deepEqual(penalties, [0, 0, 10, 10]);
  assert.equal(wallet(h), 980);
});

test('skips do not make the next puzzle easier, and skipped puzzles do not raise the level', () => {
  const h = toCompetition(makeRunning());
  start(h); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  start(h, 2); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  assert.equal(start(h, 3).level, 1);
});

test('a paid skip is allowed with a nearly empty wallet and is charged once', () => {
  const h = toCompetition(makeRunning());
  h.db.prepare("UPDATE company_state SET wallet = -195 WHERE company='A'").run();
  for (let i = 0; i < 2; i++) { start(h, i + 1); skipPuzzle(h.ctx, h.game(), h.seat.A.CFO); }
  start(h, 3);
  assert.equal(skipPuzzle(h.ctx, h.game(), h.seat.A.CFO).penalty, 10);
  assert.equal(wallet(h), -205);
  assert.throws(() => skipPuzzle(h.ctx, h.game(), h.seat.A.CFO), /no puzzle is open/);
});

test('Mini-Game Jam halves the reward while it is active against the CFO company', () => {
  const h = toCompetition(makeRunning());
  launchAttack(h.ctx, h.game(), h.seat.B.CEO, 'minigame_jam', () => 0); // B attacks A for 30 s
  start(h);
  assert.equal(solve(h).coins, 10);
  atSec(h, 835);
  start(h, 2);
  assert.equal(solve(h).coins, 20);
});

test('the public puzzle never contains the solution, and shows the free skips left', () => {
  const h = toCompetition(makeRunning());
  const row = start(h);
  const pub = publicPuzzle(h.db, row);
  assert.equal(pub.skipsFreeLeft, 2);
  assert.equal(JSON.stringify(pub).includes(JSON.stringify(stored(h))), false);
  assert.deepEqual(Object.keys(pub).sort(), ['id', 'kind', 'level', 'name', 'puzzle', 'reward', 'skipsFreeLeft']);
});

test('after the competition ends nothing can be submitted', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const sol = stored(h);
  atSec(h, 1762);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol), /only open during the competition/);
});

test('a generator that fails is retried instead of leaving the CFO without a puzzle', async () => {
  const h = toCompetition(makeRunning());
  const { PUZZLES } = await import('../src/puzzles/index.js');
  const original = PUZZLES.queens.generate;
  let calls = 0;
  PUZZLES.queens.generate = (...a) => { calls++; if (calls < 3) throw new Error('boom'); return original(...a); };
  try {
    for (let seed = 1; seed < 40 && calls === 0; seed++) {
      h.db.prepare('DELETE FROM puzzle_sessions').run();
      start(h, seed);
    }
    assert.ok(openPuzzle(h.db, h.gameId, 'A'));
  } finally { PUZZLES.queens.generate = original; }
});

test('shown, solved and skipped puzzles are logged with the time taken', () => {
  const h = toCompetition(makeRunning());
  start(h);
  atSec(h, 812);
  solve(h);
  start(h, 2);
  skipPuzzle(h.ctx, h.game(), h.seat.A.CFO);
  const types = h.db.prepare("SELECT type, payload FROM events WHERE type LIKE 'puzzle_%' ORDER BY id").all();
  assert.deepEqual(types.map((t) => t.type), ['puzzle_shown', 'puzzle_solved', 'puzzle_shown', 'puzzle_skipped']);
  assert.equal(JSON.parse(types[1].payload).seconds, 12);
});

test('garbage answers are refused without crashing or charging', () => {
  const h = toCompetition(makeRunning());
  start(h);
  const huge = new Array(200000).fill(1);
  for (const g of [null, undefined, 5, 'x', {}, [[]], [[1, 2, 3]], huge, { a: huge }, () => 1]) {
    assert.deepEqual(submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, g), { ok: false, coins: 0 });
  }
  assert.equal(wallet(h), 1000);
  assert.ok(openPuzzle(h.db, h.gameId, 'A'));
});

test('a wrong answer is logged', () => {
  const h = toCompetition(makeRunning());
  start(h);
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, null);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM events WHERE type='puzzle_wrong'").get().n, 1);
});

test('unknown players and the other company cannot touch the puzzle', () => {
  const h = toCompetition(makeRunning());
  assert.throws(() => startPuzzle(h.ctx, h.game(), 'nobody'), /not in this game/);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CEO, null), /only the CFO/);
  assert.throws(() => skipPuzzle(h.ctx, h.game(), h.seat.A.CTO), /only the CFO/);
  assert.throws(() => skipPuzzle(h.ctx, h.game(), h.seat.A.CFO), /no puzzle is open/);
  start(h);
  assert.equal(openPuzzle(h.db, h.gameId, 'B'), undefined);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.B.CFO, null), /no puzzle is open/);
});

test('submitting and skipping are refused outside the competition and in the last moment', () => {
  const h = toCompetition(makeRunning());
  start(h);
  atSec(h, 1760);
  assert.throws(() => skipPuzzle(h.ctx, h.game(), h.seat.A.CFO), /only open during the competition/);
  assert.equal(wallet(h), 1000);
});

test('a generator that always fails falls back to another kind, never throws, never loops forever', async () => {
  const h = toCompetition(makeRunning());
  const { PUZZLES } = await import('../src/puzzles/index.js');
  const origs = Object.fromEntries(Object.entries(PUZZLES).map(([k, v]) => [k, v.generate]));
  let calls = 0;
  PUZZLES.queens.generate = () => { calls++; throw new Error('boom'); };
  try {
    for (let seed = 1; seed < 30; seed++) {
      h.db.prepare('DELETE FROM puzzle_sessions').run();
      const row = start(h, seed);
      assert.ok(row);
      assert.notEqual(row.kind, 'queens');
    }
    assert.ok(calls < 30 * 8);
    for (const k of Object.keys(PUZZLES)) if (k !== 'shikaku') PUZZLES[k].generate = () => { throw new Error('boom'); };
    for (let seed = 1; seed < 20; seed++) {
      h.db.prepare('DELETE FROM puzzle_sessions').run();
      assert.equal(start(h, seed).kind, 'shikaku');
    }
  } finally { for (const k of Object.keys(origs)) PUZZLES[k].generate = origs[k]; }
});

test('the same session id and seed re-serve the same puzzle after a restart', () => {
  const a = toCompetition(makeRunning());
  const b = toCompetition(makeRunning());
  assert.equal(startPuzzle(a.ctx, a.game(), a.seat.A.CFO).puzzle, startPuzzle(b.ctx, b.game(), b.seat.A.CFO).puzzle);
  const open = openPuzzle(a.db, a.gameId, 'A');
  assert.equal(startPuzzle(a.ctx, a.game(), a.seat.A.CFO).id, open.id);
});

test('the server clock is used, never Date.now', () => {
  const h = toCompetition(makeRunning());
  start(h);
  assert.equal(openPuzzle(h.db, h.gameId, 'A').shown_at, 800000);
});

test('a failed generation is not sticky: the default seed differs per attempt and a puzzle always comes out', async () => {
  const h = toCompetition(makeRunning());
  const { PUZZLES } = await import('../src/puzzles/index.js');
  const origs = Object.fromEntries(Object.entries(PUZZLES).map(([k, v]) => [k, v.generate]));
  const seeds = new Set();
  try {
    for (const k of Object.keys(PUZZLES)) PUZZLES[k].generate = (l, r) => {
      seeds.add(r());
      if (seeds.size < 4) throw new Error('boom');
      return origs.queens(l, r);
    };
    const row = startPuzzle(h.ctx, h.game(), h.seat.A.CFO);
    assert.ok(row);
    assert.equal(seeds.size, 4);
  } finally { for (const k of Object.keys(origs)) PUZZLES[k].generate = origs[k]; }
});

test('the fallback kinds never throw and always check out, at every level', async () => {
  const { PUZZLES } = await import('../src/puzzles/index.js');
  const { FALLBACK_KINDS } = await import('../src/minigame.js');
  for (const k of FALLBACK_KINDS) for (const level of [1, 2, 3, 4]) {
    for (let seed = 1; seed <= 2000; seed++) {
      const g = PUZZLES[k].generate(level, mulberry32(seed));
      assert.equal(PUZZLES[k].check(g.puzzle, g.solution), true);
    }
  }
});

test('Lits at level 4 stays inside its node budget over 100 seeds and either generates or fails', async () => {
  const { PUZZLES } = await import('../src/puzzles/index.js');
  let made = 0;
  let slowest = 0; // the budget itself is a deterministic node count (NODE_CAP); wall clock is only a generous sanity bound
  for (let seed = 1; seed <= 100; seed++) {
    const t = performance.now();
    try { PUZZLES.lits.generate(4, mulberry32(seed)); made++; } catch (e) { assert.match(e.message, /LITS/); }
    slowest = Math.max(slowest, performance.now() - t);
  }
  assert.ok(made > 40, `only ${made} made`);
  assert.ok(slowest < 5000, `slowest ${slowest} ms`);
});

test('a closed puzzle answered again throws the distinguishable NoPuzzleOpenError', async () => {
  const { NoPuzzleOpenError } = await import('../src/minigame.js');
  const h = toCompetition(makeRunning());
  start(h);
  const sol = stored(h);
  submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol);
  assert.throws(() => submitPuzzle(h.ctx, h.game(), h.seat.A.CFO, sol), NoPuzzleOpenError);
});

test('after a restart the same DB file re-serves the same open row', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { openDb } = await import('../src/db.js');
  const { activeGame } = await import('../src/persist.js');
  const dir = mkdtempSync(join(tmpdir(), 'mg-'));
  const file = join(dir, 'g.db');
  const a = makeRunning({ file });
  toCompetition(a);
  const first = startPuzzle(a.ctx, a.game(), a.seat.A.CFO);
  a.db.close();
  const db2 = openDb(file);
  const ctx2 = { ...a.ctx, db: db2 };
  const again = startPuzzle(ctx2, activeGame(db2), a.seat.A.CFO);
  assert.equal(again.id, first.id);
  assert.equal(again.puzzle, first.puzzle);
  assert.equal(again.solution, first.solution);
  assert.equal(db2.prepare('SELECT COUNT(*) n FROM puzzle_sessions').get().n, 1);
});
