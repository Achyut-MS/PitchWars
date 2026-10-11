import { randInt, shuffle } from './rng.js';

const GROUPS = [2, 3, 4, 4]; // how many sets to find at each level

const third = (a, b) => a.map((x, i) => (x === b[i] ? x : 3 - x - b[i]));
const same = (a, b) => a.every((x, i) => x === b[i]);
const key = (card) => card.join('');
const isSet = (a, b, c) => same(third(a, b), c);

function randomCard(rng) { return [0, 0, 0, 0].map(() => randInt(rng, 3)); }

export function generate(level, rng) {
  const k = GROUPS[level - 1];
  for (;;) {
    const cards = [];
    const seen = new Set();
    let ok = true;
    for (let g = 0; g < k && ok; g++) {
      let placed = false;
      for (let tries = 0; tries < 50 && !placed; tries++) {
        const a = randomCard(rng);
        const b = randomCard(rng);
        if (same(a, b)) continue;
        const c = third(a, b);
        const keys = [key(a), key(b), key(c)];
        if (keys.some((x) => seen.has(x))) continue;
        keys.forEach((x) => seen.add(x));
        cards.push(a, b, c);
        placed = true;
      }
      ok = placed;
    }
    if (!ok) continue;
    const order = shuffle(rng, cards.map((_, i) => i));
    const shown = order.map((i) => cards[i]);
    const solution = [];
    for (let g = 0; g < k; g++) solution.push([0, 1, 2].map((j) => order.indexOf(g * 3 + j)));
    return { puzzle: { cards: shown }, solution };
  }
}

// answer: a list of groups of three card numbers. Every card is used once and each group is a set.
export function check(puzzle, answer) {
  const { cards } = puzzle;
  if (!Array.isArray(answer) || answer.length * 3 !== cards.length) return false;
  const used = new Set();
  for (const g of answer) {
    if (!Array.isArray(g) || g.length !== 3) return false;
    for (const i of g) {
      if (!Number.isInteger(i) || i < 0 || i >= cards.length || used.has(i)) return false;
      used.add(i);
    }
    if (!isSet(cards[g[0]], cards[g[1]], cards[g[2]])) return false;
  }
  return used.size === cards.length;
}
