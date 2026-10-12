// Dev-only browser checks and screenshots (Plan 7 Task 15). NOT part of npm test and never needed on the Pi.
// Playwright is not a dependency of this repository: install playwright-core somewhere outside it and point PW_DIR at it.
//   mkdir -p /tmp/pw && (cd /tmp/pw && npm i playwright-core) && npx --prefix /tmp/pw playwright-core install chromium
//   PW_DIR=/tmp/pw node scripts/visual.mjs [gallery|live|all] [out-dir]
// gallery: every fixture of test/fixtures/render-all.js, rendered with the real stylesheets (no server).
// live:    boots the real app on a free port with a temporary database and plays one game with 10 browser pages
//          (organizer password testpass123, the clock is driven by this script).
// Both modes take full-page shots at 390x844 and 1280x800 and report sideways scrolling, text contrast,
// tap targets under 44 px (390 px only), focus rings and console errors.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const PW_DIR = process.env.PW_DIR || '/tmp/claude-1000/pw';
const { chromium } = createRequire(join(PW_DIR, 'package.json'))('playwright-core');
const MODE = process.argv[2] || 'all';
const OUT = process.argv[3] || '/tmp/claude-1000/ui7-shots';
mkdirSync(OUT, { recursive: true });
// SIZES=360x740,1280x800 to try other windows (tap targets are checked below 500 px).
const SIZES = (process.env.SIZES || '390x844,1280x800').split(',').map((x) => x.split('x').map(Number));
const report = [];

// ---- browser-side checks (sent to the page as source: no imports, browser APIs only) ----
function overflow() {
  const w = window.innerWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (sw <= w) return [];
  const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 1)
    .slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}#${e.id}`);
  return [`page is ${sw}px wide in a ${w}px window: ${wide.join(' ')}`];
}
function tapTargets() {
  const bad = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, td[data-cell]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    if (r.width < 44 || r.height < 44) bad.push(`${el.tagName.toLowerCase()}#${el.id} "${(el.textContent || el.name || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return bad;
}
function textContrast() {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      for (const pseudo of ['::after', '::before', null]) {
        const cs = getComputedStyle(e, pseudo);
        if (pseudo && (cs.content === 'none' || cs.position !== 'absolute' || cs.zIndex !== '-1')) continue;
        const c = rgb(cs.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c;
      }
    }
    return [255, 255, 255];
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('[aria-hidden="true"], .sr-only, svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.webkitTextStrokeWidth) >= 1.5) continue;
    const r0 = el.getBoundingClientRect();
    if (r0.width === 0 && r0.height === 0) continue;
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const r = ratio(rgb(cs.color), bgOf(el));
    if (r < (large ? 3 : 4.5)) bad.push(`"${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}:1`);
  }
  return bad;
}
function focusRing() {
  const el = document.activeElement;
  if (!el || el === document.body) return [];
  const ring = (e) => { const c = getComputedStyle(e); return parseFloat(c.outlineWidth) >= 3 && c.outlineStyle !== 'none'; };
  const cs = getComputedStyle(el);
  // a field inside a .field label shows the ring on the label (:focus-within)
  const ok = ring(el) || (el.closest('.field') && ring(el.closest('.field')));
  return ok ? [] : [`no visible focus ring on ${el.tagName.toLowerCase()} (${cs.outlineStyle} ${cs.outlineWidth})`];
}

async function check(page, name, consoleErrors) {
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const problems = {
      overflow: await page.evaluate(overflow),
      contrast: await page.evaluate(textContrast),
      taps: w < 500 ? await page.evaluate(tapTargets) : [],
    };
    await page.screenshot({ path: join(OUT, `${name}-${w}.png`), fullPage: true, animations: 'disabled' });
    if (w >= 1000) {
      await page.keyboard.press('Tab');
      problems.focus = await page.evaluate(focusRing);
    }
    const all = Object.entries(problems).filter(([, v]) => v && v.length);
    report.push({ name, w, problems: Object.fromEntries(all) });
    console.log(`${all.length ? 'FAIL' : 'ok  '} ${name} @${w}${all.length ? ` ${JSON.stringify(Object.fromEntries(all))}` : ''}`);
  }
  if (consoleErrors.length) { console.log(`console errors on ${name}: ${consoleErrors.join(' | ')}`); report.push({ name, console: [...consoleErrors] }); consoleErrors.length = 0; }
}

const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.js': 'text/javascript' };

async function gallery(browser) {
  const { renderAll } = await import('../test/fixtures/render-all.js');
  const shots = renderAll();
  const doc = (body, org) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${['tokens', 'fonts', 'base', org ? 'organizer' : 'player'].map((c) => `<link rel="stylesheet" href="/css/${c}.css">`).join('')}</head>
<body><div id="app">${body}</div></body></html>`;
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('http://gallery.test/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/g/')) {
      const n = decodeURIComponent(u.pathname.slice(3));
      return route.fulfill({ contentType: 'text/html', body: doc(shots[n], n.startsWith('org')) });
    }
    const file = join('public', u.pathname);
    return existsSync(file) ? route.fulfill({ contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) }) : route.fulfill({ status: 404, body: '' });
  });
  for (const n of Object.keys(shots)) {
    await page.goto(`http://gallery.test/g/${encodeURIComponent(n)}`);
    await check(page, `fx-${n}`, errs);
  }
  await page.close();
}

async function live(browser) {
  const WebSocket = (await import('ws')).default;
  const { openDb } = await import('../src/db.js');
  const { createApp } = await import('../src/server.js');
  const dir = mkdtempSync(join(tmpdir(), 'ui7-'));
  const db = openDb(join(dir, 'game.db'));
  let t = Date.parse('2026-10-20T09:00:00Z');
  const app = createApp({ db, organizerPassword: 'testpass123', now: () => t, exportDir: join(dir, 'graphs'), backupDir: join(dir, 'backups') });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const tick = async (sec = 1) => { for (let i = 0; i < sec; i++) { t += 1000; app.tickAll(); } app.flush(); await new Promise((r) => setTimeout(r, 300)); };
  const timer = setInterval(() => app.tickAll(), 1000);

  const o = new WebSocket(base.replace('http', 'ws'));
  await new Promise((r) => o.once('open', r));
  const ask = (m) => new Promise((res) => { o.once('message', (raw) => res(JSON.parse(raw.toString()))); o.send(JSON.stringify(m)); });
  await ask({ type: 'organizer', password: 'testpass123' });

  const errs = [];
  const open = async (path) => {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${path}: ${m.text()}`); });
    p.on('pageerror', (e) => errs.push(`${path}: ${e.message}`));
    await p.goto(base + path);
    return p;
  };
  const shot = (p, n) => check(p, n, errs);
  const click = async (p, sel) => { await p.locator(sel).first().click(); await new Promise((r) => setTimeout(r, 300)); };

  const login = await open('/'); await shot(login, 'login');
  await login.fill('input[name=id]', 'NOPE'); await login.press('input[name=id]', 'Enter'); await login.waitForTimeout(400); await shot(login, 'login-error');
  await login.close();
  const sign = await open('/join'); await shot(sign, 'join'); await sign.close();
  const org = await open('/organizer.html'); await shot(org, 'org-login');
  await org.fill('input[name=pw]', 'testpass123'); await org.press('input[name=pw]', 'Enter'); await org.waitForTimeout(500);

  const NAMES = ['Aarav Sharma', 'Diya Nair', 'Rohan Mehta', 'Sneha Iyer', 'Karthik Rao', 'Ananya Gupta', 'Vivaan Singh', 'Ishita Verma', 'Aditya Kulkarni', 'Meera Reddy', 'Kabir Das'];
  await ask({ type: 'roster_import', text: NAMES.map((n, i) => `DSA${String(i + 1).padStart(3, '0')},${n}`).join('\n') });
  await org.waitForTimeout(300); await shot(org, 'org-lobby-empty');
  const ROLES = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
  const seat = (i) => ({ id: `DSA${String(i + 1).padStart(3, '0')}`, company: i < 5 ? 'A' : 'B', role: ROLES[i % 5] });
  for (let i = 0; i < 10; i++) { const s = seat(i); await ask({ type: 'assign', admissionId: s.id, company: s.company, role: s.role }); }
  const players = {};
  for (let i = 0; i < 10; i++) {
    const s = seat(i);
    const p = await open('/');
    await p.fill('input[name=id]', s.id); await p.press('input[name=id]', 'Enter');
    players[`${s.company}-${s.role}`] = p;
  }
  await players['A-CTO'].waitForTimeout(600);
  await shot(players['A-CTO'], 'waiting-seated');
  const spare = await open('/'); await spare.fill('input[name=id]', 'DSA011'); await spare.press('input[name=id]', 'Enter'); await spare.waitForTimeout(400);
  await shot(spare, 'waiting-unseated'); await spare.close();
  await org.waitForTimeout(300); await shot(org, 'org-lobby');

  await ask({ type: 'start_game', problemId: 1 }); await tick(2);
  await shot(players['A-CTO'], 'briefing-a-cto'); await shot(players['B-CEO'], 'briefing-b-ceo'); await shot(org, 'org-briefing');

  await ask({ type: 'skip_phase' }); await tick(2);
  await click(players['A-CTO'], `button[data-send*='"type":"vote"']`);
  await click(players['A-CMO'], `button[data-send*='"type":"vote"']`);
  await shot(players['A-CTO'], 'ideation-a-cto'); await shot(players['A-CEO'], 'ideation-a-ceo');
  await click(players['A-CEO'], `button[data-send*='"type":"pick"']`);
  await shot(players['A-CMO'], 'ideation-a-picked'); await shot(org, 'org-ideation');

  await ask({ type: 'skip_phase' }); await tick(2);
  for (const r of ROLES) await shot(players[`A-${r}`], `shop-a-${r.toLowerCase()}`);
  await shot(players['B-CTO'], 'shop-b-cto');
  await click(players['A-CMO'], `button[data-send*='"type":"request"']`);
  await click(players['A-CTO'], `button[data-send*='"type":"request"']`);
  await players['A-CFO'].waitForTimeout(300);
  await shot(players['A-CFO'], 'shop-a-cfo-queue'); await shot(players['A-CEO'], 'shop-a-ceo-awaiting'); await shot(org, 'org-shop');

  await ask({ type: 'skip_phase' }); await tick(2);
  await shot(players['A-CTO'], 'summary-a-cto');
  await ask({ type: 'skip_phase' }); await tick(3);
  for (const r of ROLES) await shot(players[`A-${r}`], `competition-a-${r.toLowerCase()}`);
  await shot(players['B-CEO'], 'competition-b-ceo');
  const atk = players['A-CEO'].locator(`button[data-send*='"type":"attack"']:not([disabled])`);
  if (await atk.count()) { await atk.first().click(); await players['A-CEO'].waitForTimeout(200); await atk.first().click(); await tick(2); await shot(players['A-CEO'], 'competition-a-ceo-attacked'); await shot(players['B-CTO'], 'competition-b-cto-under-attack'); }
  const cfo = players['A-CFO'];
  if (await cfo.locator(`button[data-send*='"type":"puzzle_next"']`).count()) {
    for (let k = 0; k < 4; k++) {
      await click(cfo, `button[data-send*='"type":"puzzle_next"'], button[data-send*='"type":"puzzle_skip"']`);
      const kind = await cfo.locator('[data-kind]').first().getAttribute('data-kind').catch(() => `k${k}`);
      await shot(cfo, `puzzle-${k}-${kind}`);
      const skip = cfo.locator(`button[data-send*='"type":"puzzle_skip"']`);
      if (await skip.count()) { await skip.first().click(); await cfo.waitForTimeout(300); }
    }
  }
  await shot(org, 'org-competition');
  await org.locator('button[data-confirm^="event:"]').first().click().catch(() => {}); await org.waitForTimeout(200); await shot(org, 'org-event-confirm');

  await tick(17 * 60); await tick(2);
  await shot(players['A-CTO'], 'thanks-a-cto'); await shot(players['B-CMO'], 'thanks-b-cmo'); await shot(org, 'org-ended');
  await click(org, '#reveal'); await tick(2); await players['A-CTO'].waitForTimeout(800);
  await shot(players['A-CTO'], 'results-a-cto'); await shot(players['B-COO'], 'results-b-coo'); await shot(org, 'org-revealed');

  clearInterval(timer);
  o.close(); app.wss.close(); app.server.close(); db.close();
  rmSync(dir, { recursive: true, force: true });
}

const browser = await chromium.launch();
try {
  if (MODE === 'gallery' || MODE === 'all') await gallery(browser);
  if (MODE === 'live' || MODE === 'all') await live(browser);
} finally {
  await browser.close();
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
const failed = report.filter((r) => r.console || Object.keys(r.problems || {}).length);
console.log(`${report.length} checks, ${failed.length} with problems. Shots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
