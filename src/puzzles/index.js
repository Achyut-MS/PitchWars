import * as queens from './queens.js';
import * as pipes from './pipes.js';
import * as shikaku from './shikaku.js';
import * as lits from './lits.js';
import * as logo from './logo.js';
import * as risks from './risks.js';

// Plain (mutable) objects, so tests can stub a generator; module namespaces are frozen.
export const PUZZLES = Object.fromEntries(Object.entries({ queens, pipes, shikaku, lits }).map(([k, m]) => [k, { ...m }]));
// The CMO's and COO's own games, kept apart from the CFO's puzzles.
export const ROLE_PUZZLES = Object.fromEntries(Object.entries({ logo, risks }).map(([k, m]) => [k, { ...m }]));
export const NAMES = { queens: 'Queens', pipes: 'Pipes', shikaku: 'Shikaku', lits: 'Lits', logo: 'Logo brief', risks: 'Risk fixes' };
export const KINDS = Object.keys(PUZZLES);
export const ROLE_KINDS = { CFO: KINDS, CMO: ['logo'], COO: ['risks'] };
export const puzzleModule = (kind) => PUZZLES[kind] ?? ROLE_PUZZLES[kind];
