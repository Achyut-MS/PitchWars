import { createHash } from 'node:crypto';
import { randInt } from './rng.js';

// The CMO's logo brief: each attribute has one target option. The brief names the targets; the player picks them.
// The targets are never sent: the puzzle carries only a digest of them, which the check compares with.
const ATTRIBUTES = [
  { label: 'Shape', options: ['round', 'square', 'triangle', 'leaf'], clue: (o) => `a ${o} shape` },
  { label: 'Colour', options: ['green', 'blue', 'orange', 'black'], clue: (o) => `${o} colours` },
  { label: 'Font', options: ['serif', 'rounded', 'bold', 'handwritten'], clue: (o) => `a ${o} font` },
  { label: 'Slogan', options: ['question', 'command', 'promise', 'fact'], clue: (o) => `a slogan that is a ${o}` },
];

const digest = (targets) => createHash('sha256').update(`logo:${JSON.stringify(targets)}`).digest('hex');

export function generate(level, rng) {
  const attrCount = level <= 1 ? 2 : level === 2 ? 3 : 4;
  const choices = level <= 2 ? 3 : 4;
  const attrs = ATTRIBUTES.slice(0, attrCount);
  const targets = attrs.map(() => randInt(rng, choices));
  const brief = attrs.map((a, i) => a.clue(a.options[targets[i]]));
  const puzzle = {
    brief: `The client wants ${brief.join(', ')}.`,
    rows: attrs.map((a) => ({ label: a.label, options: a.options.slice(0, choices) })),
    digest: digest(targets),
  };
  return { puzzle, solution: targets };
}

export function check(puzzle, answer) {
  if (!puzzle || !Array.isArray(answer) || answer.length !== puzzle.rows.length) return false;
  if (!answer.every((v) => Number.isInteger(v) && v >= 0)) return false;
  return digest(answer) === puzzle.digest;
}
