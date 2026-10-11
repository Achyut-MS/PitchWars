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
`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
