import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen, renderPuzzlePanel } from '../public/render.js';
import { createPuzzleSession, puzzleNote } from '../public/glue.js';
import { UI } from '../public/puzzles/ui.js';
import { PUZZLES, KINDS } from '../src/puzzles/index.js';
import { mulberry32 } from '../src/puzzles/rng.js';

const cfo = (puzzle, over = {}) => ({
  me: { admissionId: 'S2', name: 'Mira', company: 'A', role: 'CFO', status: 'in_game' },
  screen: 'game', clock: { phase: 'competition', remainingSec: 500 }, problem: { id: 1, title: 'Food waste', statement: '' }, wallet: 900,
  idea: { id: 'H1', type: 'hardware', name: 'Smart Fridge Sensor', description: '' }, ideation: null, owned: [], summary: null,
  shop: { open: true, catalog: [], mine: [], queue: [] },
  competition: { rates: { CTO: 0, CMO: 0, COO: 0, total: 0 }, notices: [], hint: null, shield: null, attack: null, puzzle, puzzlesDone: { solved: 1, skipped: 0 }, ...over },
});
const open = (o = {}) => ({ id: 7, kind: 'queens', name: 'Queens', level: 2, reward: 20, puzzle: { n: 1, count: 1, regions: [[0]] }, skipsFreeLeft: 2, ...o });

test('the CFO sees a start button when no puzzle is open', () => {
  const html = renderScreen(cfo(null));
  assert.match(html, /"type":"puzzle_next"/);
  assert.match(html, /Puzzles are optional. Solved puzzles earn coins./);
});

test('an open puzzle shows its name, level, reward, a slot, check and skip', () => {
  const html = renderScreen(cfo(open()));
  assert.match(html, /Queens/);
  assert.match(html, /20 coins/);
  assert.match(html, /id="puzzle-slot" data-puzzle-id="7" data-kind="queens"/);
  assert.equal(html.includes('id="puzzle-submit"'), false, 'the board is checked as you play; there is no Check button');
  assert.match(html, /"type":"puzzle_skip"/);
  assert.match(html, /Free skips left: 2/);
  assert.match(html, /id="puzzle-note"/);
});

test('after the free skips the skip button warns about the cost and needs a second tap', () => {
  const html = renderScreen(cfo(open({ id: 8, kind: 'queens', name: 'Queens', level: 3, reward: 40, skipsFreeLeft: 0 })));
  assert.match(html, /Skipping now costs 10 coins/);
  assert.match(html, /data-confirm="1"/);
  assert.equal(/data-confirm/.test(renderScreen(cfo(open()))), false);
});

test('level and solved count show, with the next reward when idle', () => {
  const html = renderScreen(cfo(null, { puzzlePanel: { level: 3, solved: 4, skipsFreeLeft: 1, nextReward: 40, miniCoins: 80 } }));
  assert.match(html, /Level 3/);
  assert.match(html, /Solved: 4/);
  assert.match(html, /40 coins/);
});

test('other roles never get a puzzle panel', () => {
  const v = cfo(null);
  v.me.role = 'CTO';
  delete v.competition.puzzle;
  assert.equal(renderScreen(v).includes('puzzle_next'), false);
});

test('everything from the server is escaped', () => {
  const html = renderPuzzlePanel(cfo(open({ name: '<img onerror=x>', kind: 'q"><b>', id: '"><script>' })));
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<b>'), false);
});

test('notes: wrong answers are quiet, try-again is friendly, nothing else leaks', () => {
  assert.equal(puzzleNote('wrong'), 'Not quite, keep going. A wrong answer costs nothing.');
  assert.match(puzzleNote('tryagain'), /try again/i);
  assert.equal(puzzleNote('zzz'), '');
  assert.equal(puzzleNote(null), '');
});

test('the local puzzle state survives repeated syncs and resets only when the id changes', () => {
  const s = createPuzzleSession(UI);
  const p = open({ puzzle: { n: 2, count: 2, regions: [[0, 0], [1, 1]] } });
  s.sync(p);
  s.tap({ cell: [0, 1], clicks: 2 });
  for (let i = 0; i < 5; i++) s.sync(JSON.parse(JSON.stringify(p))); // a push every second
  assert.deepEqual(s.answer(), [1, null]);
  s.sync({ ...p, id: 8 });
  assert.deepEqual(s.answer(), [null, null]);
  s.tap({ cell: [1, 0], clicks: 2 });
  s.sync(null);
  assert.equal(s.answer(), null);
  s.sync({ ...p, id: 8 }); // a closed puzzle's id coming back is a fresh start
  assert.deepEqual(s.answer(), [null, null]);
});

test('every kind: tapping the stored solution through the panel session builds an answer check() accepts', () => {
  const taps = {
    queens: (sol) => sol.map((c, r) => ({ cell: [r, c], clicks: 2 })),
    pipes: (sol) => sol.flatMap((row, r) => row.flatMap((t, c) => Array(t).fill({ cell: [r, c] }))),
    lits: (sol) => sol.map(([r, c]) => ({ cell: [r, c], clicks: 2 })),
  };
  for (const kind of KINDS) for (let level = 1; level <= 4; level++) {
    const { puzzle, solution } = PUZZLES[kind].generate(level, mulberry32(level * 17));
    const view = cfo({ id: level, kind, name: kind, level, reward: 20, puzzle, skipsFreeLeft: 2 });
    const html = renderScreen(view);
    assert.match(html, new RegExp(`data-kind="${kind}"`));
    const s = createPuzzleSession(UI);
    s.sync(view.competition.puzzle);
    for (const t of taps[kind](solution)) s.tap(t);
    // the submitted message is exactly what the server validates
    const msg = JSON.parse(JSON.stringify({ type: 'puzzle_submit', answer: s.answer() }));
    assert.equal(PUZZLES[kind].check(puzzle, msg.answer), true, `${kind} level ${level}`);
    assert.ok(s.render().length > 0);
  }
});

test('the panel and the slot never read a solution field', () => {
  const guard = (o) => new Proxy(o, { get(t, k) { if (k === 'solution') throw new Error('read solution'); return t[k]; } });
  for (const kind of KINDS) {
    const { puzzle } = PUZZLES[kind].generate(1, mulberry32(3));
    const p = guard({ id: 1, kind, name: kind, level: 1, reward: 20, puzzle: guard(puzzle), skipsFreeLeft: 1 });
    const v = cfo(p);
    assert.doesNotThrow(() => renderPuzzlePanel(v));
    const s = createPuzzleSession(UI);
    assert.doesNotThrow(() => { s.sync(p); s.render(); });
  }
});

test('a closed-puzzle result is silent; solved and wrong are not', async () => {
  const { puzzleResultAction } = await import('../public/glue.js');
  assert.deepEqual(puzzleResultAction({ ok: false, coins: 0, closed: true }), { note: null, toast: null });
  assert.equal(puzzleResultAction({ ok: true, coins: 20 }).toast, 'Solved! +20 coins');
  assert.equal(puzzleResultAction({ ok: false, coins: 0 }).note, 'wrong');
});
