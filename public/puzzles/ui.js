// Browser side of the seven puzzles. Pure functions, so they are tested in Node.
// Each puzzle: initial(puzzle) -> state, apply(puzzle, state, tap) -> state, render(puzzle, state) -> html, answer(puzzle, state) -> answer
const cell = (r, c, cls, text = '') => `<td class="${cls}" data-cell="${r},${c}">${text}</td>`;
const table = (rows) => `<table class="puzzle-grid">${rows.join('')}</table>`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Thick borders where two neighbouring cells belong to different regions, so regions never rely on colour alone.
const SIDES = [['bt', -1, 0], ['br', 0, 1], ['bb', 1, 0], ['bl', 0, -1]];
const edges = (regions, r, c) => SIDES
  .filter(([, dr, dc]) => regions[r + dr] && regions[r + dr][c + dc] !== undefined && regions[r + dr][c + dc] !== regions[r][c])
  .map(([name]) => name).join(' ');

const queens = {
  initial: (p) => ({ cols: Array(p.n).fill(null) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.cols[r] = n.cols[r] === c ? null : c; return n; },
  answer: (p, s) => s.cols,
  render: (p, s) => table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => cell(r, c, `reg reg-${reg} ${edges(p.regions, r, c)}${s.cols[r] === c ? ' on' : ''}`.replace(/  +/g, ' '), s.cols[r] === c ? '♛' : '')).join('')}</tr>`)),
};

const SHAPES = ['▲', '●', '■'];
const sets = {
  initial: () => ({ picked: [], groups: [] }),
  apply: (p, s, { card }) => {
    const n = clone(s);
    const g = n.groups.findIndex((grp) => grp.includes(card));
    if (g >= 0) { n.groups.splice(g, 1); return n; }
    const i = n.picked.indexOf(card);
    if (i >= 0) { n.picked.splice(i, 1); return n; }
    n.picked.push(card);
    if (n.picked.length === 3) { n.groups.push(n.picked); n.picked = []; }
    return n;
  },
  answer: (p, s) => s.groups,
  render: (p, s) => `<div class="cards">${p.cards.map(([shape, colour, count, fill], i) => {
    const g = s.groups.findIndex((grp) => grp.includes(i));
    const cls = `card c${colour} f${fill}${s.picked.includes(i) ? ' picked' : ''}${g >= 0 ? ` group g${g % 4}` : ''}`;
    return `<button class="${cls}" data-card="${i}" aria-label="Card ${i + 1}">${SHAPES[shape].repeat(count + 1)}</button>`;
  }).join('')}</div>`,
};

const tower = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(0)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = (n.grid[r][c] + 1) % (p.n + 1); return n; },
  answer: (p, s) => s.grid,
  render: (p, s) => {
    const edge = (v) => `<th>${v ?? ''}</th>`;
    const rows = [`<tr><th></th>${p.top.map(edge).join('')}<th></th></tr>`];
    s.grid.forEach((row, r) => rows.push(`<tr>${edge(p.left[r])}${row.map((v, c) => cell(r, c, 'num', v || '')).join('')}${edge(p.right[r])}</tr>`));
    rows.push(`<tr><th></th>${p.bottom.map(edge).join('')}<th></th></tr>`);
    return table(rows);
  },
};

const mosaic = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(false)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = !n.grid[r][c]; return n; },
  answer: (p, s) => s.grid,
  render: (p, s) => table(s.grid.map((row, r) => `<tr>${row.map((on, c) => cell(r, c, on ? 'fill on' : 'fill', p.clues[r][c] ?? '')).join('')}</tr>`)),
};

const GLYPH = { 0: ' ', 1: '╵', 2: '╶', 3: '└', 4: '╷', 5: '│', 6: '┌', 7: '├', 8: '╴', 9: '┘', 10: '─', 11: '┴', 12: '┐', 13: '┤', 14: '┬', 15: '┼' };
const turn = (mask, times) => { let m = mask; for (let i = 0; i < times; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const pipes = {
  initial: (p) => ({ turns: Array.from({ length: p.n }, () => Array(p.n).fill(0)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.turns[r][c] = (n.turns[r][c] + 1) % 4; return n; },
  answer: (p, s) => s.turns,
  render: (p, s) => table(p.tiles.map((row, r) => `<tr>${row.map((t, c) => cell(r, c, 'pipe', GLYPH[turn(t, s.turns[r][c])])).join('')}</tr>`)),
};

const shikaku = {
  initial: () => ({ rects: [], first: null }),
  apply: (p, s, { cell: [r, c] }) => {
    const n = clone(s);
    const inside = (q) => r >= q.r && r < q.r + q.h && c >= q.c && c < q.c + q.w;
    if (!n.first) {
      const hit = n.rects.findIndex(inside);
      if (hit >= 0) n.rects.splice(hit, 1); else n.first = [r, c];
      return n;
    }
    const [r0, c0] = n.first;
    const q = { r: Math.min(r0, r), c: Math.min(c0, c), h: Math.abs(r - r0) + 1, w: Math.abs(c - c0) + 1 };
    n.first = null;
    const overlaps = n.rects.some((o) => q.r < o.r + o.h && o.r < q.r + q.h && q.c < o.c + o.w && o.c < q.c + q.w);
    if (!overlaps) n.rects.push(q);
    return n;
  },
  answer: (p, s) => s.rects,
  render: (p, s) => table(p.clues.map((row, r) => `<tr>${row.map((v, c) => {
    const k = s.rects.findIndex((q) => r >= q.r && r < q.r + q.h && c >= q.c && c < q.c + q.w);
    const first = s.first && s.first[0] === r && s.first[1] === c;
    return cell(r, c, `rect${k >= 0 ? ` in r${k % 6}` : ''}${first ? ' first' : ''}`, v ?? '');
  }).join('')}</tr>`)),
};

const lits = {
  initial: (p) => ({ grid: Array.from({ length: p.n }, () => Array(p.n).fill(false)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.grid[r][c] = !n.grid[r][c]; return n; },
  answer: (p, s) => s.grid.flatMap((row, r) => row.map((on, c) => (on ? [r, c] : null)).filter(Boolean)),
  render: (p, s) => table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => cell(r, c, `reg reg-${reg % 8} ${edges(p.regions, r, c)}${s.grid[r][c] ? ' on' : ''}`.replace(/  +/g, ' '), '')).join('')}</tr>`)),
};

export const UI = { queens, sets, tower, mosaic, pipes, shikaku, lits };
export { esc };
