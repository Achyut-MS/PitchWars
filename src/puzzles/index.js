import * as queens from './queens.js';
import * as sets from './sets.js';
import * as tower from './tower.js';
import * as mosaic from './mosaic.js';

export const PUZZLES = { queens, sets, tower, mosaic };
export const NAMES = { queens: 'Queens', sets: 'Sets', tower: 'Tower', mosaic: 'Mosaic' };
export const KINDS = Object.keys(PUZZLES);
