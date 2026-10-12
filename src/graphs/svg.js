import { THEME } from './theme.js';

const W = 720;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (v) => Math.round(v * 10) / 10;
const fin = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const DEFAULT_NAMES = { A: 'Company A', B: 'Company B' };
const namesOf = (names) => ({ A: String(names?.A ?? DEFAULT_NAMES.A), B: String(names?.B ?? DEFAULT_NAMES.B) });

// Makes a series safe to draw: finite numbers, equal lengths, never empty.
function clean(series) {
  const t = (series?.t ?? []).map(fin);
  if (!t.length) return { t: [0], A: [0], B: [0] };
  const col = (k) => t.map((_, i) => fin(series[k]?.[i]));
  return { t, A: col('A'), B: col('B') };
}

function frame(height, title, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(label)}">
<rect width="${W}" height="${height}" fill="${THEME.panel}"/>
<text x="24" y="34" fill="${THEME.text}" font-family="${THEME.font}" font-size="24" font-weight="700">${esc(title)}</text>
${body}
</svg>`;
}

const txt = (x, y, fill, size, anchor, s, bold = false) =>
  `<text x="${n1(x)}" y="${n1(y)}" fill="${fill}" font-family="${THEME.font}" font-size="${size}"${bold ? ' font-weight="700"' : ''}${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;

function axes(plot, maxSec, yTicks, yMap, fmt) {
  const { x0, x1, y1 } = plot;
  let out = '';
  for (const v of yTicks) {
    const y = n1(yMap(v));
    out += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${THEME.line}" stroke-width="1"/>`;
    out += txt(x0 - 8, y + 4, THEME.muted, 13, 'end', fmt(v));
  }
  for (let m = 0; m * 60 <= maxSec; m += 2) {
    out += txt(x0 + ((x1 - x0) * m * 60) / maxSec, y1 + 20, THEME.muted, 13, 'middle', `${m}:00`);
  }
  return out;
}

const pathOf = (pts) => 'M' + pts.map(([x, y]) => `${n1(x)},${n1(y)}`).join('L');
const sec = (maxSec) => (Number.isFinite(maxSec) && maxSec > 0 ? maxSec : 960);

// series = { t: [seconds from the start of the competition], A: [coins], B: [coins] }
export function companyVsCompany(series, maxSec = 960, names) {
  maxSec = sec(maxSec);
  series = clean(series);
  const nm = namesOf(names);
  const plot = { x0: 64, x1: 696, y0: 56, y1: 236 };
  const all = [...series.A, ...series.B, 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all, lo + 1);
  const pad = (hi - lo) * 0.08;
  const yMap = (v) => plot.y1 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (plot.y1 - plot.y0);
  const xMap = (t) => plot.x0 + ((plot.x1 - plot.x0) * Math.max(0, Math.min(t, maxSec))) / maxSec;
  const step = Math.max(50, Math.ceil((hi - lo) / 4 / 50) * 50);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi && ticks.length < 12; v += step) ticks.push(v);
  const pts = (vals) => series.t.map((t, i) => [xMap(t), yMap(vals[i])]);
  const line = (vals, colour, dash) => `<path d="${pathOf(pts(vals))}" fill="none" stroke="${colour}" stroke-width="3" stroke-linejoin="round"${dash ? ' stroke-dasharray="10 6"' : ''}/>`;
  const last = series.t.length - 1;
  const [ax, ay] = pts(series.A)[last];
  const [bx, by] = pts(series.B)[last];
  const body = axes(plot, maxSec, ticks, yMap, (v) => String(v))
    + line(series.A, THEME.A, false) + line(series.B, THEME.B, true)
    + `<circle cx="${n1(ax)}" cy="${n1(ay)}" r="5" fill="${THEME.A}"/>`
    + `<rect x="${n1(bx - 5)}" y="${n1(by - 5)}" width="10" height="10" fill="${THEME.B}"/>`
    + txt(plot.x1, ay - 10, THEME.A, 16, 'end', `${nm.A} ${Math.round(series.A[last])}`, true)
    + txt(plot.x1, by + 24, THEME.B, 16, 'end', `${nm.B} ${Math.round(series.B[last])}`, true);
  return frame(268, 'Coins over time', body, 'Coins of each company over the competition');
}

// The coin difference, like a gold-difference graph: above zero A leads, below zero B leads.
export function coinDifference(series, maxSec = 960, names) {
  maxSec = sec(maxSec);
  series = clean(series);
  const nm = namesOf(names);
  const plot = { x0: 64, x1: 696, y0: 56, y1: 236 };
  const diff = series.A.map((a, i) => a - series.B[i]);
  const range = Math.max(50, Math.ceil(Math.max(...diff.map(Math.abs)) / 50) * 50);
  const mid = (plot.y0 + plot.y1) / 2;
  const yMap = (v) => mid - (v / range) * ((plot.y1 - plot.y0) / 2);
  const xMap = (t) => plot.x0 + ((plot.x1 - plot.x0) * Math.max(0, Math.min(t, maxSec))) / maxSec;
  const pts = series.t.map((t, i) => [xMap(t), yMap(diff[i])]);
  const line = pathOf(pts);
  const area = `${line}L${n1(pts[pts.length - 1][0])},${n1(mid)}L${n1(pts[0][0])},${n1(mid)}Z`;
  const body = axes(plot, maxSec, [-range, -range / 2, 0, range / 2, range], yMap, (v) => (v > 0 ? `+${v}` : String(v)))
    + `<defs><clipPath id="up"><rect x="${plot.x0}" y="${plot.y0}" width="${plot.x1 - plot.x0}" height="${n1(mid - plot.y0)}"/></clipPath>`
    + `<clipPath id="dn"><rect x="${plot.x0}" y="${n1(mid)}" width="${plot.x1 - plot.x0}" height="${n1(plot.y1 - mid)}"/></clipPath></defs>`
    + `<path d="${area}" fill="${THEME.A}" fill-opacity="0.85" clip-path="url(#up)"/>`
    + `<path d="${area}" fill="${THEME.B}" fill-opacity="0.85" clip-path="url(#dn)"/>`
    + `<line x1="${plot.x0}" x2="${plot.x1}" y1="${n1(mid)}" y2="${n1(mid)}" stroke="${THEME.text}" stroke-width="2"/>`
    + `<path d="${line}" fill="none" stroke="${THEME.text}" stroke-width="2"/>`
    + txt(plot.x0 + 8, plot.y0 + 14, THEME.A, 14, '', `${nm.A} leads`, true)
    + txt(plot.x0 + 8, plot.y1 - 6, THEME.B, 14, '', `${nm.B} leads`, true);
  return frame(268, 'Coin difference', body, 'Coin difference between the companies over the competition');
}

export const ROLE_ORDER = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];

// final = { A: { CEO, CTO, CFO, CMO, COO }, B: { ... } } in coins.
export function roleBars(final, names) {
  const nm = namesOf(names);
  const v = (c, r) => Math.max(0, fin(final?.[c]?.[r]));
  const top = Math.max(1, ...ROLE_ORDER.flatMap((r) => [v('A', r), v('B', r)]));
  const half = 230;
  const cx = W / 2;
  const rowH = 38;
  let body = txt(cx - 30, 52, THEME.A, 14, 'end', nm.A, true) + txt(cx + 30, 52, THEME.B, 14, 'start', nm.B, true);
  ROLE_ORDER.forEach((role, i) => {
    const y = 66 + i * rowH;
    const wa = (v('A', role) / top) * half;
    const wb = (v('B', role) / top) * half;
    body += `<rect x="${n1(cx - 30 - wa)}" y="${y}" width="${n1(wa)}" height="22" fill="${THEME.A}"/>`;
    body += `<rect x="${cx + 30}" y="${y}" width="${n1(wb)}" height="22" fill="${THEME.B}" stroke="${THEME.text}" stroke-width="1" stroke-dasharray="4 3"/>`;
    body += txt(cx, y + 17, THEME.text, 18, 'middle', role, true);
    body += txt(cx - 36 - wa, y + 17, THEME.text, 16, 'end', Math.round(v('A', role)));
    body += txt(cx + 36 + wb, y + 17, THEME.text, 16, 'start', Math.round(v('B', role)));
  });
  body += txt(24, 66 + 5 * rowH + 14, THEME.muted, 13, '', 'CTO, CMO and COO: sales. CFO: mini games. CEO: coins taken by attacks.');
  return frame(66 + 5 * rowH + 30, 'Where the coins came from', body, 'Coins earned by each role in each company');
}
