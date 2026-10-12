// Organizer-only export. These workbooks show BOTH companies and the real attack causes
// and are never served to players. Puzzle solutions/seeds are never read.
import { buildWorkbook } from './xlsx.js';
import { ATTACKS } from './attacks.js';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());
const json = (s) => { try { return JSON.parse(s) ?? {}; } catch { return {}; } };
const END = Number.MAX_SAFE_INTEGER;

export function gameSheets(db, data, gameId) {
  const g = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
  if (!g) throw new Error('no such game');
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const itemName = (id) => (data.item(id) || {}).name ?? id;
  const ideaOf = (company) => {
    const cs = db.prepare('SELECT idea_id FROM company_state WHERE game_id=? AND company=?').get(gameId, company);
    return cs && cs.idea_id ? (data.ideasFor(g.problem_id).find((i) => i.id === cs.idea_id) || {}).name ?? cs.idea_id : null;
  };
  const players = new Set(all('SELECT admission_id FROM participants WHERE game_id = ?', gameId).map((p) => p.admission_id));
  const sheet = (name, columns, rows) => ({ name, columns, rows });

  const sessionRows = all(
    `SELECT admission_id, ts, type FROM events
     WHERE type IN ('game_start','game_end','seat_swap','seat_replace','login','disconnect')
       AND (game_id = ? OR (type IN ('login','disconnect') AND ts >= ? AND ts <= ?))
     ORDER BY ts, id`, gameId, g.started_at, g.ended_at ?? END,
  ).filter((e) => (e.admission_id && players.has(e.admission_id)) || e.type.startsWith('seat'));

  const pick = (type) => all('SELECT * FROM events WHERE game_id = ? AND type = ? ORDER BY ts, id', gameId, type).map((e) => ({ ...e, p: json(e.payload) }));

  const samples = all('SELECT * FROM samples WHERE game_id = ? ORDER BY ts, company', gameId);
  const t0 = samples.length ? samples[0].ts : 0;

  return [
    sheet('Players', ['game', 'admission_id', 'name', 'company', 'role', 'status'],
      all('SELECT * FROM participants WHERE game_id = ? ORDER BY company, role', gameId).map((p) => [gameId, p.admission_id, p.name, p.company, p.role, p.status])),
    sheet('Sessions', ['game', 'admission_id', 'time', 'event', 'ts_ms'],
      sessionRows.map((e) => [gameId, e.admission_id, iso(e.ts), e.type, e.ts])),
    sheet('Ideation', ['game', 'admission_id', 'time', 'company', 'idea_id', 'previous_idea', 'ts_ms'],
      pick('vote').map((e) => [gameId, e.admission_id, iso(e.ts), e.p.company, e.p.ideaId, e.p.previous, e.ts])),
    sheet('Idea picks', ['game', 'company', 'idea_id', 'source', 'picked_by', 'time', 'seconds_saved', 'ts_ms'],
      [...pick('idea_pick').map((e) => [gameId, e.p.company, e.p.ideaId, 'ceo', e.admission_id, iso(e.ts), null, e.ts]),
        ...pick('idea_auto_pick').map((e) => [gameId, e.p.company, e.p.ideaId, e.p.tied ? 'auto (tie)' : 'auto', null, iso(e.ts), null, e.ts]),
        ...pick('ideation_end_early').map((e) => [gameId, null, null, 'early end', null, iso(e.ts), e.p.savedSec, e.ts])]
        .sort((a, b) => a[7] - b[7])),
    sheet('Shop requests', ['game', 'request_id', 'company', 'item_id', 'item', 'choice', 'requested_by', 'recommended', 'status', 'phase', 'price', 'charged', 'requested_at', 'decided_at', 'decided_by', 'reject_reason'],
      all('SELECT * FROM requests WHERE game_id = ? ORDER BY id', gameId).map((r) => [gameId, r.id, r.company, r.item_id, itemName(r.item_id), r.choice, r.requested_by, r.recommended, r.status, r.phase, r.price, r.charged, iso(r.requested_at), iso(r.decided_at), r.decided_by, r.reject_reason])),
    sheet('Wallets', ['game', 'company', 'idea', 'leftover_coins', 'mini_coins', 'attack_coins', 'cto_sales', 'cmo_sales', 'coo_sales'],
      all('SELECT * FROM company_state WHERE game_id = ? ORDER BY company', gameId).map((c) => [gameId, c.company, ideaOf(c.company), c.wallet, c.mini_coins, c.attack_coins, c.cto_coins, c.cmo_coins, c.coo_coins])),
    sheet('Samples', ['game', 'time', 'ts_ms', 'seconds', 'company', 'wallet', 'cto_rate', 'cmo_rate', 'coo_rate', 'cto_coins', 'cmo_coins', 'coo_coins', 'mini_coins', 'attack_coins'],
      samples.map((s) => [gameId, iso(s.ts), s.ts, (s.ts - t0) / 1000, s.company, s.wallet, s.cto_rate, s.cmo_rate, s.coo_rate, s.cto_coins, s.cmo_coins, s.coo_coins, s.mini_coins, s.attack_coins])),
    sheet('Attacks', ['game', 'attack_id', 'attacker_company', 'victim_company', 'ceo_admission_id', 'attack', 'cost', 'start', 'end', 'blocked_by_shield', 'cover_story'],
      all('SELECT * FROM attacks WHERE game_id = ? ORDER BY id', gameId).map((a) => [gameId, a.id, a.attacker, a.victim, a.launched_by, (ATTACKS.find((x) => x.key === a.key) || {}).name ?? a.key, a.cost, iso(a.launched_at), iso(a.end_at), a.blocked ? 'yes' : 'no', a.cover])),
    sheet('Events and shields', ['game', 'kind', 'company', 'detail', 'time'],
      [...all('SELECT * FROM market_events WHERE game_id = ?', gameId).map((e) => [gameId, 'market_event', null, e.key, iso(e.started_at)]),
        ...all('SELECT * FROM injections WHERE game_id = ?', gameId).map((e) => [gameId, 'coin_injection', e.company, `${e.coins} coins`, iso(e.ts)]),
        ...all("SELECT * FROM owned WHERE game_id = ? AND family = 'O06' ORDER BY company", gameId).map((o) => [gameId, 'shield_bought', o.company, `${o.charged} coins`, iso(o.bought_at)]),
        ...all('SELECT * FROM shield_use WHERE game_id = ? ORDER BY company', gameId).map((s) => [gameId, 'shield_used', s.company, 'blocked an attack', iso(s.used_at)])]),
    sheet('Hints', ['game', 'company', 'role', 'time', 'text', 'acted'],
      all('SELECT * FROM hints WHERE game_id = ? ORDER BY id', gameId).map((h) => [gameId, h.company, h.role, iso(h.ts), h.text, h.acted == null ? null : h.acted ? 'yes' : 'no'])),
    // Explicit columns: puzzle, solution (and so the seed) are never exported.
    sheet('Puzzles', ['game', 'company', 'admission_id', 'kind', 'level', 'shown_at', 'ended_at', 'result', 'coins', 'penalty', 'wrong_tries', 'seconds'],
      all('SELECT id, company, admission_id, kind, level, shown_at, ended_at, result, coins, penalty, wrong_tries FROM puzzle_sessions WHERE game_id = ? ORDER BY id', gameId)
        .map((p) => [gameId, p.company, p.admission_id, p.kind, p.level, iso(p.shown_at), iso(p.ended_at), p.result, p.coins, p.penalty, p.wrong_tries, p.ended_at ? Math.round((p.ended_at - p.shown_at) / 1000) : null])),
    sheet('Organizer actions', ['game', 'time', 'action', 'details'],
      all("SELECT * FROM events WHERE type = 'organizer_action' AND ts >= ? AND ts <= ? ORDER BY ts, id", g.started_at - 3_600_000, g.ended_at ?? END)
        .map((e) => [gameId, iso(e.ts), json(e.payload).action, JSON.stringify(json(e.payload).args ?? {})])),
    sheet('Events', ['game', 'time', 'ts_ms', 'admission_id', 'type', 'payload'],
      all('SELECT * FROM events WHERE game_id = ? ORDER BY ts, id', gameId).map((e) => [gameId, iso(e.ts), e.ts, e.admission_id, e.type, e.payload])),
  ];
}

export function eventSheets(db, data) {
  const ids = db.prepare('SELECT id FROM games ORDER BY id').all().map((g) => g.id);
  const merged = new Map();
  for (const id of ids) {
    for (const s of gameSheets(db, data, id)) {
      if (!merged.has(s.name)) merged.set(s.name, { name: s.name, columns: s.columns, rows: [] });
      merged.get(s.name).rows.push(...s.rows);
    }
  }
  const sheets = [...merged.values()];
  if (!sheets.length) return [];
  sheets.find((s) => s.name === 'Events').rows = db.prepare('SELECT * FROM events ORDER BY ts, id').all()
    .map((e) => [e.game_id, iso(e.ts), e.ts, e.admission_id, e.type, e.payload]);
  sheets.find((s) => s.name === 'Organizer actions').rows = db.prepare("SELECT * FROM events WHERE type = 'organizer_action' ORDER BY ts, id").all()
    .map((e) => [e.game_id, iso(e.ts), json(e.payload).action, JSON.stringify(json(e.payload).args ?? {})]);
  sheets.splice(1, 0, { name: 'Roster', columns: ['admission_id', 'name', 'status', 'game', 'company', 'role'],
    rows: db.prepare('SELECT * FROM participants ORDER BY admission_id').all().map((p) => [p.admission_id, p.name, p.status, p.game_id, p.company, p.role]) });
  return sheets;
}

export const exportGame = (db, data, gameId) => buildWorkbook(gameSheets(db, data, gameId));
export async function exportEvent(db, data) {
  const sheets = eventSheets(db, data);
  return buildWorkbook(sheets.length ? sheets : [{ name: 'Empty', columns: ['note'], rows: [['No games have been played yet.']] }]);
}
