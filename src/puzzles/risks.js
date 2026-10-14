import { createHash } from 'node:crypto';
import { randInt, shuffle } from './rng.js';

// The COO's risk fixes, in a generic form: each risk is matched to one of four fix types.
// The fix type is picked from the words of the risk; the answer is kept as a digest, never sent.
const FIXES = ['Test it', 'Protect it', 'Train the users', 'Back it up'];
const FALLBACK_RISKS = ['The sensor may give wrong readings', 'The device may break in use', 'People may forget to use it'];

// Which fix type a risk calls for (first match wins; the last is the default).
export function fixFor(text) {
  if (/wrong|miscount|reading|calibrat|accura|error|miss/i.test(text)) return 0;
  if (/damage|tilt|wet|spill|knock|moisture|break|device|dust|heat/i.test(text)) return 1;
  if (/forget|skip|user|staff|people|train|learn|rush|charge|battery/i.test(text)) return 2;
  return 3;
}

const digest = (answers) => createHash('sha256').update(`risks:${JSON.stringify(answers)}`).digest('hex');

export function generate(level, rng, extra = {}) {
  const risks = (Array.isArray(extra.risks) && extra.risks.length === 3 ? extra.risks : FALLBACK_RISKS).map(String);
  const count = level <= 2 ? 3 : 4;
  const answers = [];
  const rows = risks.map((text) => {
    const correct = fixFor(text);
    const others = shuffle(rng, FIXES.map((_, i) => i).filter((i) => i !== correct)).slice(0, count - 1);
    const order = shuffle(rng, [correct, ...others]);
    answers.push(order.indexOf(correct));
    return { text, choices: order.map((i) => FIXES[i]) };
  });
  const puzzle = { rows, digest: digest(answers) };
  return { puzzle, solution: answers };
}

export function check(puzzle, answer) {
  if (!puzzle || !Array.isArray(answer) || answer.length !== puzzle.rows.length) return false;
  if (!answer.every((v) => Number.isInteger(v) && v >= 0)) return false;
  return digest(answer) === puzzle.digest;
}
