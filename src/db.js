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
  ended_at           INTEGER,
  revealed_at        INTEGER
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
  last_tick_at   INTEGER,
  frac           REAL NOT NULL DEFAULT 0,
  mini_coins     REAL NOT NULL DEFAULT 0,
  attack_coins   REAL NOT NULL DEFAULT 0,
  cto_coins      REAL NOT NULL DEFAULT 0,
  cmo_coins      REAL NOT NULL DEFAULT 0,
  coo_coins      REAL NOT NULL DEFAULT 0,
  last_sample_at INTEGER,
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
CREATE TABLE IF NOT EXISTS attacks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  attacker    TEXT NOT NULL,
  victim      TEXT NOT NULL,
  key         TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  launched_by TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  end_at      INTEGER NOT NULL,
  blocked     INTEGER NOT NULL DEFAULT 0,
  cover       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notices (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  role    TEXT,
  text    TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  until   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS warnings_sent (
  game_id INTEGER NOT NULL,
  warning TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  PRIMARY KEY (game_id, warning)
);
CREATE TABLE IF NOT EXISTS market_events (
  game_id    INTEGER PRIMARY KEY,
  key        TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS injections (
  game_id INTEGER PRIMARY KEY,
  company TEXT NOT NULL,
  coins   INTEGER NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shield_use (
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, company)
);
CREATE TABLE IF NOT EXISTS samples (
  game_id      INTEGER NOT NULL,
  ts           INTEGER NOT NULL,
  company      TEXT NOT NULL,
  wallet       INTEGER NOT NULL,
  cto_rate     REAL NOT NULL,
  cmo_rate     REAL NOT NULL,
  coo_rate     REAL NOT NULL,
  cto_coins    REAL NOT NULL,
  cmo_coins    REAL NOT NULL,
  coo_coins    REAL NOT NULL,
  mini_coins   REAL NOT NULL,
  attack_coins REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS samples_by_game ON samples (game_id, ts, company);
CREATE TABLE IF NOT EXISTS hints (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  company TEXT NOT NULL,
  role    TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  text    TEXT NOT NULL,
  acted   INTEGER,
  hint_key TEXT
);
CREATE TABLE IF NOT EXISTS puzzle_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL,
  company     TEXT NOT NULL,
  admission_id TEXT NOT NULL,
  kind        TEXT NOT NULL,
  level       INTEGER NOT NULL,
  puzzle      TEXT NOT NULL,
  solution    TEXT NOT NULL,
  shown_at    INTEGER NOT NULL,
  ended_at    INTEGER,
  result      TEXT CHECK (result IN ('solved','skipped')),
  coins       INTEGER NOT NULL DEFAULT 0,
  penalty     INTEGER NOT NULL DEFAULT 0,
  wrong_tries INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS puzzle_sessions_by_company ON puzzle_sessions (game_id, company, id);
`;

// Columns added to company_state in schema v3; used to upgrade a v2 file.
const V3_COMPANY_STATE_COLUMNS = [
  ['last_tick_at', 'INTEGER'],
  ['frac', 'REAL NOT NULL DEFAULT 0'],
  ['mini_coins', 'REAL NOT NULL DEFAULT 0'],
  ['attack_coins', 'REAL NOT NULL DEFAULT 0'],
  ['cto_coins', 'REAL NOT NULL DEFAULT 0'],
  ['cmo_coins', 'REAL NOT NULL DEFAULT 0'],
  ['coo_coins', 'REAL NOT NULL DEFAULT 0'],
  ['last_sample_at', 'INTEGER'],
];

function migrate(db) {
  const have = new Set(db.prepare('PRAGMA table_info(company_state)').all().map((c) => c.name));
  for (const [name, type] of V3_COMPANY_STATE_COLUMNS) {
    if (!have.has(name)) db.exec(`ALTER TABLE company_state ADD COLUMN ${name} ${type}`);
  }
  const gameCols = new Set(db.prepare('PRAGMA table_info(games)').all().map((c) => c.name));
  if (!gameCols.has('revealed_at')) db.exec('ALTER TABLE games ADD COLUMN revealed_at INTEGER');
  // Hints carry a stored key so one trigger can never be written twice.
  const hintCols = new Set(db.prepare('PRAGMA table_info(hints)').all().map((c) => c.name));
  if (!hintCols.has('hint_key')) db.exec('ALTER TABLE hints ADD COLUMN hint_key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS hints_by_key ON hints (game_id, hint_key)');
}

export function openDb(file = ':memory:') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
