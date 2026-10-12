import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/server.js';
import { loadData } from '../src/data.js';
import { readWorkbook } from '../src/xlsx.js';

const data = loadData('data');
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A real WebSocket client that keeps every raw message it ever received.
class Bot {
  constructor(ws) {
    this.ws = ws; this.raw = []; this.latest = {};
    ws.on('message', (d) => {
      const text = d.toString();
      const m = JSON.parse(text);
      this.raw.push(text);
      this.latest[m.type] = m;
    });
  }
  static async connect(port) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return new Bot(ws);
  }
  // Sends one message and returns the messages that came back.
  async say(msg) {
    await settle();
    const mark = this.raw.length;
    this.ws.send(JSON.stringify(msg));
    // Every request gets a reply; a slow one (puzzle generation) is waited for.
    for (let i = 0; i < 300 && this.raw.length === mark; i++) await settle(10);
    await settle();
    return this.raw.slice(mark).map((x) => JSON.parse(x));
  }
  state() { return this.latest.state && this.latest.state.view; }
}
const errors = (msgs) => msgs.filter((m) => m.type === 'error').map((m) => m.error);

const get = (port, path) => new Promise((resolve) => {
  http.get({ port, path }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); });
});

const sheetsOf = async (buf) => Object.fromEntries((await readWorkbook(buf)).map((s) => [s.name, s.rows]));

test('a whole game from the roster to the Excel export, then a second game', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
  const db = openDb();
  let t = 0;
  const app = createApp({ db, organizerPassword: 'pw', now: () => t, data, staticRoot: null, exportDir: join(dir, 'exports'), backupDir: join(dir, 'backups') });
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const bots = [];
  const bot = async () => { const b = await Bot.connect(port); bots.push(b); return b; };

  async function advanceTo(sec) {
    for (let s = Math.floor(t / 1000) + 1; s <= sec; s++) {
      t = s * 1000;
      app.tickAll();
      if (s % 25 === 0) await new Promise((r) => setImmediate(r));
    }
    await settle(60);
  }
  const wallet = (c, g = 1) => db.prepare('SELECT wallet FROM company_state WHERE game_id=? AND company=?').get(g, c).wallet;
  const solutionOpen = () => JSON.parse(db.prepare('SELECT solution FROM puzzle_sessions WHERE ended_at IS NULL').get().solution);

  try {
    // ---- Organizer, roster and seats
    const org = await bot();
    const welcome = (await org.say({ type: 'organizer', password: 'pw' })).find((m) => m.type === 'welcome');
    assert.ok(welcome.token);
    let roster = '';
    for (let i = 0; i < 12; i++) roster += `S${i},Player ${i}\n`;
    assert.deepEqual(errors(await org.say({ type: 'roster_import', text: roster })), []);
    const roles = ['CEO', 'CTO', 'CFO', 'CMO', 'COO'];
    for (let i = 0; i < 10; i++) assert.deepEqual(errors(await org.say({ type: 'assign', admissionId: `S${i}`, company: i < 5 ? 'A' : 'B', role: roles[i % 5] })), []);
    assert.deepEqual(errors(await org.say({ type: 'start_game', problemId: 1 })), []);

    const p = [];
    for (let i = 0; i < 10; i++) {
      const b = await bot();
      assert.equal((await b.say({ type: 'login', admissionId: `S${i}` })).find((m) => m.type === 'welcome').view, 'game');
      await b.say({ type: 'sync' });
      p.push(b);
    }
    const [aCeo, aCto, aCfo, aCmo, aCoo, bCeo, bCto, bCfo, bCmo, bCoo] = p;
    const victims = [bCeo, bCto, bCfo, bCmo, bCoo];

    // ---- Briefing: two players swap seats and swap back
    await advanceTo(10);
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S6' })), []);
    assert.deepEqual(db.prepare("SELECT company, role FROM participants WHERE admission_id='S1'").get(), { company: 'B', role: 'CTO' });
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S6' })), []);
    assert.deepEqual(db.prepare("SELECT company, role FROM participants WHERE admission_id='S1'").get(), { company: 'A', role: 'CTO' });

    // ---- Ideation: votes, picks, early end
    await advanceTo(190);
    await org.say({ type: 'sync' });
    assert.equal(org.state().game.clock.phase, 'ideation');
    assert.deepEqual(errors(await aCto.say({ type: 'vote', ideaId: 'H1' })), []);
    assert.deepEqual(errors(await bCmo.say({ type: 'vote', ideaId: 'S1' })), []);
    assert.deepEqual(errors(await aCto.say({ type: 'pick', ideaId: 'H1' })), ['only the CEO can pick']);
    assert.deepEqual(errors(await aCeo.say({ type: 'pick', ideaId: 'H1' })), []);
    assert.deepEqual(errors(await bCeo.say({ type: 'pick', ideaId: 'S1' })), []);
    await org.say({ type: 'sync' });
    assert.equal(org.state().game.clock.phase, 'shop');
    assert.deepEqual(errors(await org.say({ type: 'swap_seats', a: 'S1', b: 'S2' })), ['seats are locked after the briefing']);

    // ---- Shop: request, approve, in order
    const approveHead = async (cfo) => {
      await cfo.say({ type: 'sync' });
      const head = cfo.state().shop.queue.find((r) => r.head);
      return errors(await cfo.say({ type: 'cfo_decide', requestId: head.id, approve: true }));
    };
    assert.deepEqual(errors(await aCmo.say({ type: 'request', itemId: 'M01-L' })), []);
    assert.deepEqual(await approveHead(aCfo), []);
    for (const id of ['O01', 'O02', 'O03']) {
      assert.deepEqual(errors(await aCoo.say({ type: 'request', itemId: id })), []);
      assert.deepEqual(await approveHead(aCfo), []);
    }
    assert.deepEqual(errors(await aCto.say({ type: 'request', itemId: 'F01-B' })), []);
    await aCeo.say({ type: 'sync' });
    const waiting = aCeo.state().shop.awaitingCeo[0];
    assert.deepEqual(errors(await aCeo.say({ type: 'ceo_decide', requestId: waiting.id, approve: true })), []);
    assert.deepEqual(await approveHead(aCfo), []);
    assert.deepEqual(errors(await bCoo.say({ type: 'request', itemId: 'O06' })), []);
    assert.deepEqual(await approveHead(bCfo), []);
    assert.deepEqual(errors(await aCmo.say({ type: 'request', itemId: 'M04-S' })), []); // left open on purpose: auto-reject at the end
    assert.equal(wallet('A'), 1000 - 150 - 60 - 100 - 150 - 100);
    assert.equal(wallet('B'), 850);
    assert.deepEqual(db.prepare("SELECT item_id, charged FROM owned WHERE game_id=1 AND company='A' ORDER BY item_id").all().map((o) => [o.item_id, o.charged]),
      [['F01-B', 100], ['M01-L', 150], ['O01', 60], ['O02', 100], ['O03', 150]]);
    assert.deepEqual(db.prepare("SELECT item_id, charged FROM owned WHERE game_id=1 AND company='B'").all().map((o) => [o.item_id, o.charged]), [['O06', 150]]);

    // ---- Summary card: a late request is refused, the open one was auto-rejected
    await advanceTo(790);
    await aCmo.say({ type: 'sync' });
    assert.ok(aCmo.state().summary);
    assert.deepEqual(errors(await aCoo.say({ type: 'request', itemId: 'O04-H' })), ['the shop is closed']);
    assert.equal(db.prepare("SELECT reject_reason FROM requests WHERE item_id='M04-S'").get().reject_reason, 'auto');

    // ---- Competition: puzzles (a solve, then three skips, the third paid)
    await advanceTo(805);
    const walletBeforePuzzles = wallet('A');
    await aCfo.say({ type: 'puzzle_next' });
    assert.ok(aCfo.state().competition.puzzle, 'a puzzle is open');
    const solved = (await aCfo.say({ type: 'puzzle_submit', answer: solutionOpen() })).find((m) => m.type === 'puzzle_result');
    assert.deepEqual([solved.ok, solved.coins], [true, 20]);
    for (let i = 0; i < 3; i++) {
      const nx = await aCfo.say({ type: 'puzzle_next' });
      assert.ok(aCfo.state().competition.puzzle, `a puzzle is open ${JSON.stringify(nx).slice(0,300)}`);
      assert.deepEqual(errors(await aCfo.say({ type: 'puzzle_skip' })), []);
    }
    assert.equal(db.prepare("SELECT SUM(penalty) AS n FROM puzzle_sessions WHERE company='A'").get().n, 10);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM puzzle_sessions WHERE company='A' AND result='skipped'").get().n, 3);
    assert.ok(wallet('A') >= walletBeforePuzzles + 20 - 10);

    // ---- Attacks: blocked by the shield, then on cooldown
    await advanceTo(820);
    const blocked = (await aCeo.say({ type: 'attack', key: 'market_crash' })).find((m) => m.type === 'attack_result');
    assert.equal(blocked.blocked, true);
    await bCoo.say({ type: 'sync' });
    assert.ok(bCoo.state().competition.notices.includes('Insurance claim used'));
    assert.deepEqual(errors(await aCeo.say({ type: 'attack', key: 'price_squeeze' })), ['attack on cooldown']);

    // ---- Market event, a landing attack, injection, a wrong answer
    await advanceTo(900);
    assert.deepEqual(errors(await org.say({ type: 'market_event', key: 'demand_surge' })), []);
    const landed = (await aCeo.say({ type: 'attack', key: 'market_crash' })).find((m) => m.type === 'attack_result');
    assert.equal(landed.blocked, false);
    await bCto.say({ type: 'sync' });
    assert.ok(bCto.state().competition.notices.includes('Stock market prices have fallen'));
    assert.equal(JSON.stringify(bCto.state()).includes('market_crash'), false);

    await advanceTo(950);
    assert.deepEqual(errors(await org.say({ type: 'inject', company: 'A', coins: 500 })), []);
    await bCfo.say({ type: 'puzzle_next' });
    const wrong = (await bCfo.say({ type: 'puzzle_submit', answer: { wrong: true } })).find((m) => m.type === 'puzzle_result');
    assert.deepEqual([wrong.ok, wrong.coins], [false, 0]);
    assert.deepEqual(db.prepare('SELECT company, coins FROM injections').get(), { company: 'A', coins: 500 });

    // ---- The end: thank you, no graph data anywhere yet
    await advanceTo(1762);
    await aCeo.say({ type: 'sync' });
    assert.equal(aCeo.state().clock.phase, 'ended');
    assert.equal(aCeo.state().results, undefined);
    assert.equal(aCeo.state().wallet, 0, 'no numbers after the end until the reveal');
    for (const b of p) await b.say({ type: 'sync' });
    const GRAPHY = /companyVsCompany|coinDifference|roleBars|"results"|"graphs"|<svg/;
    for (const [i, b] of p.entries()) {
      for (const text of b.raw) assert.equal(GRAPHY.test(text), false, `player ${i} received graph data before the reveal`);
    }
    const marks = p.map((b) => b.raw.length);

    // Recorded numbers, before the organizer reveals
    for (const c of ['A', 'B']) {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM samples WHERE game_id=1 AND company=?').get(c).n, 193, `193 samples for company ${c}`);
    }
    const ts = db.prepare("SELECT ts FROM samples WHERE game_id=1 AND company='A' ORDER BY ts").all().map((r) => r.ts);
    assert.equal(ts[0], 800_000);
    assert.equal(ts.at(-1), 1_760_000);
    ts.forEach((v, i) => assert.equal(v, 800_000 + i * 5000));
    const w = (c) => db.prepare('SELECT * FROM company_state WHERE game_id=1 AND company=?').get(c);
    const lastSample = (c) => db.prepare('SELECT * FROM samples WHERE game_id=1 AND company=? ORDER BY ts DESC LIMIT 1').get(c);
    for (const c of ['A', 'B']) {
      assert.ok(Math.abs(lastSample(c).wallet - w(c).wallet) <= 2, `last sample equals the wallet for ${c}`);
    }
    // Wallet bookkeeping: purchases, sales, puzzles, attacks and the injection add up.
    const sales = (r) => r.cto_coins + r.cmo_coins + r.coo_coins;
    const A = w('A'); const B = w('B');
    const expectA = 440 + sales(A) + A.mini_coins + A.attack_coins - 10 - 450 - 450 + 500;
    const expectB = 850 + sales(B) + B.mini_coins + B.attack_coins;
    assert.ok(Math.abs(A.wallet - expectA) <= 2, `A wallet ${A.wallet} vs ${expectA}`);
    assert.ok(Math.abs(B.wallet - expectB) <= 2, `B wallet ${B.wallet} vs ${expectB}`);
    assert.equal(A.mini_coins, 20);
    assert.ok(sales(A) > 0, 'A sold something'); assert.equal(sales(B), 0, 'B bought only the shield, so it sold nothing');

    // ---- Reveal, reconnect, Next Game
    assert.deepEqual(errors(await org.say({ type: 'reveal' })), []);
    await aCeo.say({ type: 'sync' });
    assert.deepEqual(Object.keys(aCeo.state().results), ['companyVsCompany', 'coinDifference', 'roleBars']);

    aCeo.ws.terminate();
    await settle(100);
    const again = await bot();
    assert.equal((await again.say({ type: 'login', admissionId: 'S0' })).find((m) => m.type === 'welcome').view, 'game');
    await again.say({ type: 'sync' });
    assert.ok(again.state().results, 'a reconnected player still sees the graphs');

    assert.deepEqual(errors(await org.say({ type: 'next_game' })), []);
    await again.say({ type: 'sync' });
    assert.equal(again.state().screen, 'graphs');
    assert.deepEqual(Object.keys(again.state().graphs), ['companyVsCompany', 'coinDifference', 'roleBars']);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='completed'").get().n, 10);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE status='lobby'").get().n, 2);

    // A completed player logging in later gets their OWN game's graphs.
    const late = await bot();
    const lw = (await late.say({ type: 'login', admissionId: 'S7' })).find((m) => m.type === 'welcome');
    assert.equal(lw.view, 'graphs');
    await late.say({ type: 'sync' });
    assert.equal(late.state().gameId, 1);
    assert.equal(late.state().graphs.companyVsCompany, again.state().graphs.companyVsCompany);

    // ---- Leak scan: everything any player of the victim company ever received
    for (const [i, b] of victims.entries()) {
      for (const text of b.raw.slice(0, marks[5 + i])) {
        const m = JSON.parse(text);
        // The CEO's own attack menu (its own launches) is legitimate; everyone else's slot must be empty.
        if (m.view && m.view.competition) {
          if (i !== 0) assert.equal(m.view.competition.attack, null);
          delete m.view.competition.attack;
        }
        if (i === 0 && m.type === 'attack_result') continue;
        const s = JSON.stringify(m).replace(/Attack Shield|Blocks the next attack \(one per game\)/g, '');
        for (const re of [/attack/i, /rival/i, /"[A-Za-z]*(?:[Aa]dmission[A-Za-z]*|by|By)":"S[0-4]"/, /Player [0-4]\b/, /launched_by|attacker|shield_use|market_crash|price_squeeze/]) {
          const hit = s.match(re);
          assert.equal(hit, null, `victim player ${i + 5} leaked ${re}: ${hit && s.slice(Math.max(0, hit.index - 80), hit.index + 80)}`);
        }
      }
    }
    // The cover story did reach every victim player at some point.
    for (const b of victims) assert.ok(b.raw.some((x) => x.includes('Stock market prices have fallen')), 'cover story shown');

    // ---- Exports, images and the backup
    const ev = await get(port, `/export/event.xlsx?token=${welcome.token}`);
    assert.equal(ev.status, 200);
    assert.equal((await get(port, '/export/event.xlsx')).status, 403);
    const x = await sheetsOf(ev.body);
    assert.equal(x.Roster.length, 13);
    assert.equal(x.Samples.length, 1 + 386);
    assert.equal(x.Attacks.length, 3);
    const attackRows = x.Attacks.slice(1);
    assert.deepEqual(attackRows.map((r) => [r[0], r[2], r[3], r[4], r[5], r[6], r[9]]),
      [[1, 'A', 'B', 'S0', 'Market Crash', 450, 'yes'], [1, 'A', 'B', 'S0', 'Market Crash', 450, 'no']]);
    const req = x['Shop requests'].slice(1);
    assert.equal(req.length, 7);
    assert.deepEqual(req.map((r) => r[3]), ['M01-L', 'O01', 'O02', 'O03', 'F01-B', 'O06', 'M04-S']);
    assert.deepEqual(req.map((r) => r[8]), ['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'rejected']);
    assert.equal(req.at(-1)[15], 'auto');
    assert.deepEqual(x.Puzzles.slice(1).map((r) => r[7]), ['solved', 'skipped', 'skipped', 'skipped', undefined]);
    assert.equal(x.Puzzles.slice(1).filter((r) => r[9] === 10).length, 1);
    assert.equal(x.Puzzles.slice(1).at(-1)[10], 1, 'the wrong answer is counted');
    const wal = Object.fromEntries(x.Wallets.slice(1).map((r) => [r[1], r]));
    assert.equal(wal.A[3], A.wallet); assert.equal(wal.B[3], B.wallet);
    assert.equal(wal.A[4], 20);
    const ideas = x.Ideation.slice(1);
    assert.deepEqual(ideas.map((r) => [r[1], r[4]]).sort(), [['S1', 'H1'], ['S8', 'S1']].sort());
    const kinds = x['Events and shields'].slice(1).map((r) => r[1]).sort();
    assert.deepEqual(kinds, ['coin_injection', 'market_event', 'shield_bought', 'shield_used']);
    const sess = x.Sessions.slice(1);
    for (const id of ['S0', 'S1', 'S9']) assert.ok(sess.some((r) => r[1] === id && r[3] === 'login'), `${id} login in Sessions`);
    assert.equal(sess.filter((r) => r[3] === 'seat_swap').length, 2);
    assert.ok(x['Organizer actions'].slice(1).some((r) => r[2] === 'inject' && r[3] === '{"company":"A","coins":500}'));

    const g1 = await sheetsOf((await get(port, `/export/game/1.xlsx?token=${welcome.token}`)).body);
    assert.equal(g1.Players.length, 11);
    assert.equal(g1.Samples.length, 387);

    // Saved images: six files, real PNGs, same bytes over HTTP
    const folder = join(dir, 'exports', 'game-1');
    assert.equal(readdirSync(folder).length, 6);
    for (const stem of ['company-vs-company', 'coin-difference', 'role-bars']) {
      const png = readFileSync(join(folder, `${stem}.png`));
      assert.ok(png.subarray(0, 8).equals(PNG), `${stem}.png has the PNG signature`);
      assert.ok(png.length > 500 && png.includes(Buffer.from('IEND')), `${stem}.png is complete`);
      assert.ok(statSync(join(folder, `${stem}.svg`)).size > 100);
      const dl = await get(port, `/export/game/1/${stem}.png?token=${welcome.token}`);
      assert.equal(dl.status, 200);
      assert.ok(dl.body.equals(png));
    }
    await app.backupIdle();
    assert.ok(readdirSync(join(dir, 'backups')).some((f) => f.includes('after')), 'a backup was made after Next Game');
    assert.equal(app.backupStatus.ok, true);

    // ---- The recording holds the story, per Admission ID and game number
    const ev1 = (type, id) => db.prepare('SELECT * FROM events WHERE type=? AND admission_id=? AND game_id=1').all(type, id);
    for (let i = 0; i < 10; i++) {
      const id = `S${i}`;
      const gs = ev1('game_start', id);
      assert.equal(gs.length, 1, `${id} game_start`);
      assert.deepEqual([JSON.parse(gs[0].payload).company, JSON.parse(gs[0].payload).role], [i < 5 ? 'A' : 'B', roles[i % 5]]);
      assert.ok(ev1('login', id).length >= 1, `${id} login in game 1`);
      assert.equal(ev1('game_end', id).length, 1, `${id} game_end`);
    }
    assert.equal(ev1('login', 'S0').length, 2, 'S0 logged in twice (reconnect)');
    assert.ok(ev1('disconnect', 'S0').length >= 1);
    assert.deepEqual(ev1('vote', 'S1').map((e) => JSON.parse(e.payload).ideaId), ['H1']);
    assert.deepEqual(ev1('idea_pick', 'S0').map((e) => JSON.parse(e.payload).ideaId), ['H1']);
    assert.deepEqual(ev1('idea_pick', 'S5').map((e) => JSON.parse(e.payload).ideaId), ['S1']);
    assert.equal(ev1('seat_swap', 'S1').length + ev1('seat_swap', 'S6').length, 2);
    assert.equal(ev1('shop_request', 'S3').length, 2); // M01-L and M04-S
    assert.equal(ev1('shop_request', 'S4').length, 3);
    assert.equal(ev1('shop_request', 'S1').length, 1);
    assert.equal(ev1('ceo_decision', 'S0').length, 1);
    assert.equal(ev1('cfo_decision', 'S2').length, 5);
    assert.equal(ev1('cfo_decision', 'S7').length, 1);
    assert.equal(ev1('attack', 'S0').length, 2);
    assert.equal(ev1('puzzle_solved', 'S2').length, 1);
    assert.equal(ev1('puzzle_skipped', 'S2').length, 3);
    assert.equal(ev1('puzzle_wrong', 'S7').length, 1);
    const unattributed = (type) => db.prepare('SELECT COUNT(*) AS n FROM events WHERE type=? AND game_id=1').get(type).n;
    assert.equal(unattributed('shop_auto_reject'), 1);
    assert.equal(unattributed('ideation_end_early'), 1);
    assert.equal(unattributed('market_event'), 1);
    assert.equal(unattributed('coin_injection'), 1);
    assert.equal(unattributed('graphs_revealed'), 1);
    assert.equal(unattributed('next_game'), 1);
    const types = new Set(db.prepare('SELECT DISTINCT type FROM events').all().map((r) => r.type));
    for (const t2 of ['login', 'disconnect', 'game_start', 'seat_swap', 'vote', 'idea_pick', 'ideation_end_early', 'shop_request', 'cfo_decision', 'ceo_decision', 'shop_auto_reject', 'attack', 'market_event', 'coin_injection', 'puzzle_shown', 'puzzle_skipped', 'puzzle_solved', 'puzzle_wrong', 'graphs_revealed', 'next_game', 'organizer_action']) {
      assert.ok(types.has(t2), `the recording has a ${t2} event`);
    }

    // ---- A second game: new roster, own data, game 1 untouched
    assert.deepEqual(errors(await org.say({ type: 'roster_import', text: Array.from({ length: 8 }, (_, i) => `T${i},Team ${i}`).join('\n') })), []);
    const ids2 = ['S10', 'S11', 'T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    for (const [i, id] of ids2.entries()) assert.deepEqual(errors(await org.say({ type: 'assign', admissionId: id, company: i < 5 ? 'A' : 'B', role: roles[i % 5] })), []);
    assert.deepEqual(errors(await org.say({ type: 'start_game', problemId: 1 })), []);
    assert.equal(db.prepare('SELECT MAX(id) AS n FROM games').get().n, 2);
    const q = [];
    for (const id of ids2) {
      const b = await bot();
      assert.equal((await b.say({ type: 'login', admissionId: id })).find((m) => m.type === 'welcome').view, 'game');
      q.push(b);
    }
    await org.say({ type: 'sync' });
    assert.equal(org.state().game.id, 2);
    for (let i = 0; i < 4; i++) assert.deepEqual(errors(await org.say({ type: 'skip_phase' })), []);
    await org.say({ type: 'sync' });
    assert.equal(org.state().game.clock.phase, 'competition');
    const base2 = Math.floor(t / 1000);
    await advanceTo(base2 + 21);
    assert.ok(db.prepare("SELECT idea_id FROM company_state WHERE game_id=2 AND company='B'").get().idea_id, 'ideas were auto-picked');
    assert.equal(wallet('A', 2) > 0 && wallet('A', 2) <= 1000, true);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM samples WHERE game_id=2').get().n >= 4);
    assert.deepEqual(errors(await org.say({ type: 'next_game' })), []);
    await q[0].say({ type: 'sync' });
    assert.equal(q[0].state().gameId, 2);
    assert.ok(q[0].state().graphs, 'game 2 graphs after Next Game');
    assert.notEqual(q[0].state().graphs.companyVsCompany, again.state().graphs.companyVsCompany);
    await again.say({ type: 'sync' });
    assert.equal(again.state().gameId, 1, 'S0 still sees game 1');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM samples WHERE game_id=1').get().n, 386);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events WHERE type=\'game_start\' AND game_id=2').get().n, 10);
    const both = await sheetsOf((await get(port, `/export/event.xlsx?token=${welcome.token}`)).body);
    assert.deepEqual([...new Set(both.Players.slice(1).map((r) => r[0]))].sort(), [1, 2]);
    assert.equal(both.Roster.length, 21);
    assert.equal(readdirSync(join(dir, 'exports', 'game-2')).length, 6);
  } finally {
    bots.forEach((b) => b.ws.terminate());
    app.wss.clients.forEach((c) => c.terminate());
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
