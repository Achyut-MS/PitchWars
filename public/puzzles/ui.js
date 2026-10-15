// Browser side of the seven puzzles. Pure functions, so they are tested in Node.
// Each puzzle: initial(puzzle) -> state, apply(puzzle, state, tap) -> state, render(puzzle, state) -> html, answer(puzzle, state) -> answer
const cell = (r, c, cls, text = '') => `<td class="${esc(cls)}" data-cell="${r},${c}">${esc(text)}</td>`;
const table = (rows) => `<table class="puzzle-grid">${rows.join('')}</table>`;
// Option boards (logo brief, risk fixes): wide cells that wrap their text.
const choiceTable = (rows) => `<table class="puzzle-grid choices">${rows.join('')}</table>`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Thick borders where two neighbouring cells belong to different regions, so regions never rely on colour alone.
const SIDES = [['bt', -1, 0], ['br', 0, 1], ['bb', 1, 0], ['bl', 0, -1]];
const edges = (regions, r, c) => SIDES
  .filter(([, dr, dc]) => regions[r + dr] && regions[r + dr][c + dc] !== undefined && regions[r + dr][c + dc] !== regions[r][c])
  .map(([name]) => name).join(' ');

// Queens: a single tap marks a dot, a double tap places a queen (a second double tap on it removes it).
// Every square a queen rules out (its row, column, region and the eight around it) is blocked: no queen goes there.
const blockedBy = (p, cols) => {
  const n = p.n;
  const out = new Set();
  cols.forEach((qc, r) => {
    if (qc === null || qc === undefined) return;
    for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) {
      if (rr === r || cc === qc || p.regions[rr][cc] === p.regions[r][qc] || (Math.abs(rr - r) <= 1 && Math.abs(cc - qc) <= 1)) out.add(`${rr},${cc}`);
    }
  });
  return out;
};
const queens = {
  initial: (p) => ({ cols: Array(p.n).fill(null), dots: [] }),
  apply: (p, s, { cell: [r, c], clicks = 1 }) => {
    const n = clone(s);
    const key = `${r},${c}`;
    if (clicks === 2) {
      if (n.cols[r] === c) { n.cols[r] = null; return n; }
      if (blockedBy(p, n.cols).has(key)) return n;
      n.cols[r] = c;
      n.dots = n.dots.filter((d) => d !== key);
      return n;
    }
    if (clicks !== 1 || n.cols[r] === c || blockedBy(p, n.cols).has(key)) return n;
    n.dots = n.dots.includes(key) ? n.dots.filter((d) => d !== key) : [...n.dots, key];
    return n;
  },
  answer: (p, s) => s.cols,
  render: (p, s) => {
    const blocked = blockedBy(p, s.cols);
    return table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => {
      const key = `${r},${c}`;
      const queen = s.cols[r] === c;
      const cls = `reg reg-${reg} ${edges(p.regions, r, c)}${queen ? ' on' : ''}${!queen && blocked.has(key) ? ' blocked' : ''}${!queen && !blocked.has(key) && s.dots.includes(key) ? ' dot' : ''}`.replace(/  +/g, ' ');
      const text = queen ? '♛' : blocked.has(key) ? '×' : s.dots.includes(key) ? '•' : '';
      return cell(r, c, cls, text);
    }).join('')}</tr>`));
  },
};

const turn = (mask, times) => { let m = mask; for (let i = 0; i < times; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
const pipes = {
  initial: (p) => ({ turns: Array.from({ length: p.n }, () => Array(p.n).fill(0)) }),
  apply: (p, s, { cell: [r, c] }) => { const n = clone(s); n.turns[r][c] = (n.turns[r][c] + 1) % 4; return n; },
  answer: (p, s) => s.turns,
  // Each open side is drawn as a bar from the middle of the tile to its edge (CSS), so the board reads as pipes.
  render: (p, s) => table(p.tiles.map((row, r) => `<tr>${row.map((t, c) => {
    const m = turn(t, s.turns[r][c]);
    const arms = [[1, 'n'], [2, 'e'], [4, 's'], [8, 'w']].filter(([bit]) => m & bit).map(([, d]) => `<span class="arm ${d}"></span>`).join('');
    return cell(r, c, 'pipe', '').replace('</td>', `${arms}<span class="hub"></span></td>`);
  }).join('')}</tr>`)),
};

// The accepted shapes (every turn and mirror image of each is accepted too).
export const LIT_SHAPES = {
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
  S: [[0, 1], [0, 2], [1, 0], [1, 1]],
};

// Lits: a single tap marks a dot, a double tap shades a cell (a second double tap unshades it).
// A cell is blocked when shading it would make a 2 x 2 shaded block or fill a region that already has four shaded cells.
const litsBlocked = (p, shaded) => {
  const n = p.n;
  const out = new Set();
  const on = (r, c) => shaded.has(`${r},${c}`);
  const perRegion = {};
  for (const k of shaded) { const [r, c] = k.split(',').map(Number); const id = p.regions[r][c]; perRegion[id] = (perRegion[id] || 0) + 1; }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (on(r, c)) continue;
    if ((perRegion[p.regions[r][c]] || 0) >= 4) { out.add(`${r},${c}`); continue; }
    const squares = [[-1, -1], [-1, 0], [0, -1], [0, 0]].map(([dr, dc]) => [[r + dr, c + dc], [r + dr + 1, c + dc], [r + dr, c + dc + 1], [r + dr + 1, c + dc + 1]]);
    if (squares.some((cells) => cells.every(([a, b]) => (a === r && b === c) || on(a, b)))) out.add(`${r},${c}`);
  }
  return out;
};
const lits = {
  initial: () => ({ shaded: [], dots: [] }),
  apply: (p, s, { cell: [r, c], clicks = 1 }) => {
    const n = clone(s);
    const k = `${r},${c}`;
    const shaded = new Set(n.shaded);
    if (clicks === 2) {
      if (shaded.has(k)) { n.shaded = n.shaded.filter((x) => x !== k); return n; }
      if (litsBlocked(p, shaded).has(k)) return n;
      n.shaded = [...n.shaded, k];
      n.dots = n.dots.filter((d) => d !== k);
      return n;
    }
    if (clicks !== 1 || shaded.has(k) || litsBlocked(p, shaded).has(k)) return n;
    n.dots = n.dots.includes(k) ? n.dots.filter((d) => d !== k) : [...n.dots, k];
    return n;
  },
  answer: (p, s) => s.shaded.map((k) => k.split(',').map(Number)),
  render: (p, s) => {
    const shaded = new Set(s.shaded);
    const blocked = litsBlocked(p, shaded);
    return table(p.regions.map((row, r) => `<tr>${row.map((reg, c) => {
      const k = `${r},${c}`;
      const on = shaded.has(k);
      const cls = `reg reg-${reg % 8} ${edges(p.regions, r, c)}${on ? ' on' : ''}${!on && blocked.has(k) ? ' blocked' : ''}${!on && !blocked.has(k) && s.dots.includes(k) ? ' dot' : ''}`.replace(/  +/g, ' ');
      return cell(r, c, cls, !on && blocked.has(k) ? '×' : !on && s.dots.includes(k) ? '•' : '');
    }).join('')}</tr>`));
  },
};

// The CMO's logo brief: one row per attribute, tap an option to pick it (tap it again to clear).
const logo = {
  initial: (p) => ({ picks: Array(p.rows.length).fill(null) }),
  apply: (p, s, { cell: [a, o] }) => {
    const n = clone(s);
    if (a < 0 || a >= p.rows.length || o < 0 || o >= p.rows[a].options.length) return n; // labels are not options
    n.picks[a] = n.picks[a] === o ? null : o;
    return n;
  },
  answer: (p, s) => s.picks,
  render: (p, s) => `<p class="brief">${esc(p.brief)}</p>${choiceTable(p.rows.map((row, a) => `<tr>${cell(a, -1, 'label', row.label)}${row.options.map((opt, o) => cell(a, o, `opt${s.picks[a] === o ? ' on' : ''}`, opt)).join('')}</tr>`))}`,
};

// The COO's risk fixes: one row per risk, tap the fix that handles it (tap it again to clear).
const risks = {
  initial: (p) => ({ picks: Array(p.rows.length).fill(null) }),
  apply: (p, s, { cell: [r, c] }) => {
    const n = clone(s);
    if (r < 0 || r >= p.rows.length || c < 0 || c >= p.rows[r].choices.length) return n; // labels are not choices
    n.picks[r] = n.picks[r] === c ? null : c;
    return n;
  },
  answer: (p, s) => s.picks,
  render: (p, s) => choiceTable(p.rows.map((row, r) => `<tr>${cell(r, -1, 'label', row.text)}${row.choices.map((ch, c) => cell(r, c, `opt${s.picks[r] === c ? ' on' : ''}`, ch)).join('')}</tr>`)),
};

export const UI = { queens, pipes, lits, logo, risks };
export { esc };
