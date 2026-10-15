// The practice page: the same puzzle boards, rules and tap logic as the game, with no server state.
import { UI } from './puzzles/ui.js';
import { createPuzzleSession } from './glue.js';
import { puzzleHelp } from './render.js';

const NAMES = { queens: 'Queens', pipes: 'Pipes', lits: 'Lits', logo: 'Logo brief', risks: 'Risk fixes' };
const LEVELS = [1, 2, 3, 4];
const session = createPuzzleSession(UI);
const state = { kind: null, level: 1, loading: false, solved: null };
const NEXT_DELAY_MS = 350; // time to see "Solved" before the next puzzle
let checkSeq = 0; // only the latest board's check may act

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, text = '') => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
};

function paintPickers() {
  const kinds = $('kinds');
  kinds.replaceChildren(...Object.keys(NAMES).map((k) => {
    const b = el('button', { type: 'button', 'data-kind': k, 'aria-pressed': String(state.kind === k), class: state.kind === k ? 'on' : '' }, NAMES[k]);
    return b;
  }));
  const levels = $('levels');
  levels.replaceChildren(...LEVELS.map((l) => el('button', { type: 'button', 'data-level': String(l), 'aria-pressed': String(state.level === l), class: state.level === l ? 'on' : '' }, `Level ${l}`)));
}

function paintBoard() {
  const has = session.id !== null;
  $('board').innerHTML = has ? session.render() : '';
  $('clear').disabled = !has;
  $('title').textContent = has ? `${NAMES[state.kind]}, level ${state.level}` : 'Choose a puzzle to start';
  $('meta').textContent = has ? 'Tap the board to play. The board is checked as you go: a solved board moves on to the next puzzle.' : '';
  $('help').innerHTML = state.kind ? puzzleHelp(state.kind) : '';
}

function setResult(text, ok = false) {
  const r = $('result');
  r.textContent = text;
  r.className = `practice-result${ok ? ' ok' : ''}`;
}

async function newPuzzle() {
  if (!state.kind) { setResult('Pick a puzzle first.'); return; }
  state.loading = true;
  state.solved = null;
  setResult('Making a puzzle...');
  try {
    const res = await fetch(`/practice/api/puzzle?kind=${encodeURIComponent(state.kind)}&level=${state.level}`, { cache: 'no-store' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'could not make a puzzle');
    const p = await res.json();
    session.sync(p);
    setResult('');
  } catch (err) {
    session.sync(null);
    setResult(`Could not make a puzzle: ${err.message}`);
  } finally {
    state.loading = false;
    paintBoard();
  }
}

// Asks the server whether the board is solved. Only the newest board's answer is used.
async function verify() {
  const mine = ++checkSeq;
  const id = session.id;
  const res = await fetch('/practice/api/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: state.kind, puzzle: session.data, answer: session.answer() }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'check failed');
  return { ok: body.ok, current: mine === checkSeq && session.id === id, id };
}

// After every tap: a solved board is announced and the next puzzle follows on its own.
async function checkAfterTap() {
  if (session.id === null || state.solved === session.id) return;
  try {
    const r = await verify();
    if (!r.current || !r.ok) return;
    state.solved = r.id;
    setResult('Solved! Next puzzle coming up...', true);
    setTimeout(() => { if (session.id === r.id) newPuzzle(); }, NEXT_DELAY_MS);
  } catch (err) {
    setResult(`Could not check: ${err.message}`);
  }
}

document.addEventListener('click', (e) => {
  const kind = e.target.closest('[data-kind]');
  if (kind) { state.kind = kind.dataset.kind; session.sync(null); paintPickers(); paintBoard(); newPuzzle(); return; }
  const level = e.target.closest('[data-level]');
  if (level) { state.level = Number(level.dataset.level); paintPickers(); if (state.kind) newPuzzle(); return; }
  if (e.target.closest('#new')) { newPuzzle(); return; }
  if (e.target.closest('#clear') && session.id !== null) {
    session.reset();
    state.solved = null;
    paintBoard();
    setResult('');
    return;
  }
  const board = e.target.closest('#board');
  if (board && session.id !== null) {
    const td = e.target.closest('[data-cell]');
    const card = e.target.closest('[data-card]');
    const tap = td ? { cell: td.dataset.cell.split(',').map(Number), clicks: e.detail } : card ? { card: Number(card.dataset.card) } : null;
    if (tap && state.solved !== session.id) { session.tap(tap); paintBoard(); setResult(''); checkAfterTap(); }
  }
});

paintPickers();
paintBoard();
