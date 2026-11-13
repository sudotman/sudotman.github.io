-- The door's tables. Kept in step with SCHEMA in core.mjs by scripts/test-door.mjs;
-- server.mjs creates them itself, and D1 is given this file once (see README.md).
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  gone INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT '',
  gone INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sweeps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note INTEGER NOT NULL,
  at INTEGER NOT NULL,
  who TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS words_who ON words (who, at);
CREATE INDEX IF NOT EXISTS notes_who ON notes (who, at);
CREATE INDEX IF NOT EXISTS sweeps_who ON sweeps (who, at);
