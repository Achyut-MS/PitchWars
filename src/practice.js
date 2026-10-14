// Practice puzzles: anyone can try any puzzle at any level. Nothing is stored, no coins are paid,
// and the solution is never sent (the page only gets the puzzle; the check is done here).
import { KINDS, NAMES, puzzleModule } from './puzzles/index.js';
import { mulberry32 } from './puzzles/rng.js';

const LEVELS = [1, 2, 3, 4];
const ALL_KINDS = [...KINDS, 'logo', 'risks'];

export function practicePuzzle({ kind, level, seed }) {
  if (!ALL_KINDS.includes(kind)) throw new Error('unknown puzzle');
  const lv = Number(level);
  if (!LEVELS.includes(lv)) throw new Error('level must be 1 to 4');
  const s = Number.isInteger(Number(seed)) && seed !== '' ? Number(seed) >>> 0 : Math.floor(Math.random() * 2 ** 31);
  const { puzzle } = puzzleModule(kind).generate(lv, mulberry32(s));
  return { id: `${kind}-${lv}-${s}`, kind, name: NAMES[kind], level: lv, puzzle };
}

export function practiceCheck({ kind, puzzle, answer }) {
  if (!ALL_KINDS.includes(kind)) throw new Error('unknown puzzle');
  let ok = false;
  try { ok = puzzleModule(kind).check(puzzle, answer) === true; } catch { ok = false; }
  return { ok };
}
