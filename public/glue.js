// Small pure helpers for the browser glue (tested in Node).
const MESSAGES = {
  bad_password: 'Wrong password',
  too_many_attempts: 'Too many tries, wait a minute',
  unknown_id: 'That ID is not on the list',
  bad_message: 'Something went wrong. Please try again',
};

export function humanError(e) {
  if (typeof e !== 'string' || !e) return 'Something went wrong. Please try again';
  return Object.hasOwn(MESSAGES, e) ? MESSAGES[e] : e;
}

// Stable serialization (sorted keys) of a view without the ticking clock seconds.
export function viewKey(view) {
  const walk = (x, top) => {
    if (Array.isArray(x)) return x.map((y) => walk(y, false));
    if (x && typeof x === 'object') {
      const o = {};
      for (const k of Object.keys(x).sort()) {
        if (top && k === 'clock' && x[k] && typeof x[k] === 'object') { const { remainingSec, ...rest } = x[k]; o[k] = walk(rest, false); } else o[k] = walk(x[k], false);
      }
      return o;
    }
    return x;
  };
  return JSON.stringify(walk(view, true));
}

// Stops double clicks: after one send, nothing else is sent for windowMs or until the next state
// (release), and the same message is never sent twice within windowMs.
export function createSendGuard(windowMs = 600) {
  let lockedUntil = -Infinity;
  let lastText = null;
  let lastAt = -Infinity;
  return {
    allow(text, now) {
      if (now < lockedUntil) return false;
      if (text === lastText && now - lastAt < windowMs) return false;
      lockedUntil = now + windowMs;
      lastText = text;
      lastAt = now;
      return true;
    },
    release() { lockedUntil = -Infinity; },
  };
}

export function redrawDecision({ changed, pointerDown, downAt = 0, now, maxDeferMs = 400 }) {
  if (!changed) return { action: 'skip', wait: 0 };
  if (pointerDown && now - downAt < maxDeferMs) return { action: 'defer', wait: downAt + maxDeferMs - now };
  return { action: 'draw', wait: 0 };
}

// Two-step confirm for dangerous buttons: the first tap arms, a second tap on the same key within windowMs confirms.
export function createConfirm(windowMs = 5000) {
  let key = null;
  let at = -Infinity;
  return {
    tap(k, now) {
      if (k === key && now - at <= windowMs) { key = null; return 'confirmed'; }
      key = k; at = now;
      return 'armed';
    },
    reset() { key = null; },
  };
}

// Quiet one-line messages for the puzzle panel (shown in #puzzle-note).
const NOTES = {
  wrong: 'Not quite, keep going. A wrong answer costs nothing.',
  tryagain: 'Could not make a puzzle just now. Please try again.',
};
export const puzzleNote = (kind) => (typeof kind === 'string' && Object.hasOwn(NOTES, kind) ? NOTES[kind] : '');

// The player's half-solved puzzle lives here, in the page, keyed by puzzle id. Server pushes (every second
// in a busy game) call sync() with the same id and change nothing; only a new id starts fresh.
export function createPuzzleSession(UI) {
  let id = null;
  let puzzle = null;
  let state = null;
  const ui = () => (puzzle && Object.hasOwn(UI, puzzle.kind) ? UI[puzzle.kind] : null);
  return {
    sync(p) {
      if (!p || typeof p !== 'object' || !Object.hasOwn(UI, p.kind)) { id = null; puzzle = null; state = null; return false; }
      if (id !== p.id) { id = p.id; puzzle = p; state = UI[p.kind].initial(p.puzzle); } else puzzle = p;
      return true;
    },
    tap(t) { const u = ui(); if (u) state = u.apply(puzzle.puzzle, state, t); },
    render() { const u = ui(); return u ? u.render(puzzle.puzzle, state) : ''; },
    answer() { const u = ui(); return u ? u.answer(puzzle.puzzle, state) : null; },
    get id() { return id; },
  };
}

// What a puzzle_result message should do in the page: a closed puzzle (double tap, already skipped) is silent.
export function puzzleResultAction(m) {
  if (!m || typeof m !== 'object' || m.closed === true) return { note: null, toast: null };
  if (m.ok) return { note: null, toast: `Solved! +${Number(m.coins) || 0} coins` };
  return { note: 'wrong', toast: 'Not quite yet' };
}
