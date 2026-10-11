import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS participants (
  admission_id TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'lobby'
               CHECK (status IN ('lobby','in_game','completed')),
  game_id      INTEGER,
  company      TEXT CHECK (company IN ('A','B')),
  role         TEXT CHECK (role IN ('CEO','CTO','CFO','CMO','COO'))
);
CREATE TABLE IF NOT EXISTS games (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id         INTEGER NOT NULL,
  started_at         INTEGER NOT NULL,
  heartbeat_at       INTEGER,
  ideation_saved_sec INTEGER NOT NULL DEFAULT 0,
  ended_at           INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  game_id      INTEGER,
  admission_id TEXT,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_by_game ON events (game_id, ts);
CREATE TABLE IF NOT EXISTS company_state (
  game_id     INTEGER NOT NULL,
  company     TEXT NOT NULL,
  idea_id     TEXT,
  picked_by   TEXT,
  picked_at   INTEGER,
  pick_source TEXT,
  wallet      INTEGER NOT NULL DEFAULT 1000,
  PRIMARY KEY (game_id, company)
);
CREATE TABLE IF NOT EXISTS votes (
  game_id      INTEGER NOT NULL,
  admission_id TEXT NOT NULL,
  company      TEXT NOT NULL,
  idea_id      TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  PRIMARY KEY (game_id, admission_id)
);
CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id      INTEGER NOT NULL,
  company      TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  family       TEXT NOT NULL,
  choice       INTEGER,
  requested_by TEXT NOT NULL,
  recommended  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL CHECK (status IN ('awaiting_ceo','pending','approved','rejected')),
  phase        TEXT NOT NULL,
  price        INTEGER NOT NULL,
  charged      INTEGER,
  requested_at INTEGER NOT NULL,
  decided_at   INTEGER,
  decided_by   TEXT,
  reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS requests_by_company ON requests (game_id, company, status);
CREATE TABLE IF NOT EXISTS owned (
  game_id   INTEGER NOT NULL,
  company   TEXT NOT NULL,
  family    TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  choice    INTEGER,
  bought_at INTEGER NOT NULL,
  charged   INTEGER NOT NULL,
  PRIMARY KEY (game_id, company, family)
);
CREATE TABLE IF NOT EXISTS phase_done (
  game_id INTEGER NOT NULL,
  phase   TEXT NOT NULL,
  PRIMARY KEY (game_id, phase)
);
`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
