import * as queens from './queens.js';
import * as sets from './sets.js';
import * as tower from './tower.js';
import * as mosaic from './mosaic.js';
import * as pipes from './pipes.js';
import * as shikaku from './shikaku.js';
import * as lits from './lits.js';

// Plain (mutable) objects, so tests can stub a generator; module namespaces are frozen.
export const PUZZLES = Object.fromEntries(Object.entries({ queens, sets, tower, mosaic, pipes, shikaku, lits }).map(([k, m]) => [k, { ...m }]));
export const NAMES = { queens: 'Queens', sets: 'Sets', tower: 'Tower', mosaic: 'Mosaic', pipes: 'Pipes', shikaku: 'Shikaku', lits: 'Lits' };
export const KINDS = Object.keys(PUZZLES);
