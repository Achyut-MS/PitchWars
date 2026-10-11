import http from 'node:http';
import { WebSocketServer } from 'ws';
import { participantLogin, organizerLogin } from './auth.js';
import { activeGame } from './persist.js';
import { phaseAt } from './phases.js';

export function createApp({ db, organizerPassword, now = Date.now }) {
  const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server });
  const sessions = new Map(); // ws -> { kind: 'organizer' } | { kind: 'participant', admissionId }

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

  wss.on('connection', (ws) => {
    ws.on('close', () => sessions.delete(ws));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', error: 'bad_message' });
      }
      if (msg && msg.type === 'login') {
        const r = participantLogin(db, msg.admissionId, now());
        if (!r.ok) return send(ws, { type: 'error', error: r.error });
        sessions.set(ws, { kind: 'participant', admissionId: r.participant.admissionId });
        return send(ws, { type: 'welcome', view: r.view, participant: r.participant });
      }
      if (msg && msg.type === 'organizer') {
        if (!organizerLogin(msg.password, organizerPassword)) return send(ws, { type: 'error', error: 'bad_password' });
        sessions.set(ws, { kind: 'organizer' });
        return send(ws, { type: 'welcome', view: 'organizer' });
      }
      return send(ws, { type: 'error', error: 'bad_message' });
    });
  });

  function tickAll() {
    const game = activeGame(db);
    if (!game) return;
    const t = now();
    const tick = { type: 'tick', serverNow: t, ...phaseAt(game, t), gameId: game.id };
    for (const [ws, s] of sessions) {
      if (s.kind === 'organizer') { send(ws, tick); continue; }
      const p = db.prepare('SELECT status, game_id FROM participants WHERE admission_id = ?').get(s.admissionId);
      if (p && p.status === 'in_game' && p.game_id === game.id) send(ws, tick);
    }
  }

  return { server, wss, tickAll };
}
