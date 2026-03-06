// Uses Node.js 22 built-in SQLite (no native compilation needed)
// Run with: node --experimental-sqlite server.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'activities.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    session_file TEXT NOT NULL,
    message_id   TEXT,
    tool_call_id TEXT UNIQUE,
    tool_name    TEXT NOT NULL,
    arguments    TEXT,
    result       TEXT,
    is_error     INTEGER DEFAULT 0,
    duration_ms  INTEGER,
    timestamp    TEXT NOT NULL,
    result_at    TEXT,
    created_at   INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_act_session ON activities(session_id);
  CREATE INDEX IF NOT EXISTS idx_act_tool    ON activities(tool_name);
  CREATE INDEX IF NOT EXISTS idx_act_ts      ON activities(timestamp);

  CREATE TABLE IF NOT EXISTS file_offsets (
    file_path  TEXT PRIMARY KEY,
    offset     INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id   TEXT PRIMARY KEY,
    session_file TEXT NOT NULL,
    started_at   TEXT,
    model        TEXT,
    agent        TEXT DEFAULT 'main',
    updated_at   INTEGER DEFAULT (unixepoch())
  );
`);

// Migration: add agent column if missing (existing installs)
try { db.exec(`ALTER TABLE sessions ADD COLUMN agent TEXT DEFAULT 'main'`); } catch {}


// ── Prepared statements ───────────────────────────────────────────────────────
const _insertActivity = db.prepare(`
  INSERT OR IGNORE INTO activities
    (session_id, session_file, message_id, tool_call_id, tool_name, arguments, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const _updateResult = db.prepare(`
  UPDATE activities
  SET result = ?, is_error = ?, result_at = ?,
      duration_ms = CAST((julianday(?) - julianday(timestamp)) * 86400000 AS INTEGER)
  WHERE tool_call_id = ?
`);

const _upsertSession = db.prepare(`
  INSERT INTO sessions (session_id, session_file, started_at, model, agent)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    model = COALESCE(excluded.model, model),
    agent = COALESCE(excluded.agent, agent),
    updated_at = unixepoch()
`);

const _getOffset = db.prepare(`SELECT offset FROM file_offsets WHERE file_path = ?`);
const _setOffset = db.prepare(`
  INSERT INTO file_offsets (file_path, offset) VALUES (?, ?)
  ON CONFLICT(file_path) DO UPDATE SET offset = excluded.offset, updated_at = unixepoch()
`);

// ── Exports ───────────────────────────────────────────────────────────────────
function insertActivity({ sessionId, sessionFile, messageId, toolCallId, toolName, arguments: args, timestamp }) {
  _insertActivity.run(sessionId, sessionFile, messageId ?? null, toolCallId, toolName, args ?? null, timestamp);
}

function updateResult({ toolCallId, result, isError, resultAt }) {
  _updateResult.run(result, isError ? 1 : 0, resultAt, resultAt, toolCallId);
}

function upsertSession({ sessionId, sessionFile, startedAt, model, agent }) {
  _upsertSession.run(sessionId, sessionFile, startedAt ?? null, model ?? null, agent ?? null);
}

function getOffset(filePath) {
  const row = _getOffset.get(filePath);
  return row ? Number(row.offset) : 0;
}

function setOffset(filePath, offset) {
  _setOffset.run(filePath, offset);
}

function getActivities({ session, tool, limit = 200, offset = 0, since } = {}) {
  let sql = 'SELECT * FROM activities';
  const conds = [];
  const params = [];
  if (session) { conds.push('session_id = ?');  params.push(session); }
  if (tool)    { conds.push('tool_name = ?');    params.push(tool); }
  if (since)   { conds.push('timestamp > ?');    params.push(since); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

function getSessions() {
  return db.prepare(`
    SELECT s.session_id, s.session_file, s.started_at, s.model,
           COALESCE(s.agent, 'main') AS agent,
           COALESCE(a.total_calls, 0) AS total_calls,
           COALESCE(a.error_count, 0) AS error_count,
           a.last_activity
    FROM sessions s
    LEFT JOIN (
      SELECT session_id,
             COUNT(*) AS total_calls,
             SUM(is_error) AS error_count,
             MAX(timestamp) AS last_activity
      FROM activities
      GROUP BY session_id
    ) a ON a.session_id = s.session_id
    ORDER BY COALESCE(a.last_activity, s.started_at) DESC
  `).all();
}

function getAgents() {
  return db.prepare(`
    SELECT COALESCE(s.agent, 'main') AS agent,
           COUNT(DISTINCT s.session_id) AS session_count,
           COALESCE(SUM(a.total_calls), 0) AS total_calls,
           MAX(COALESCE(a.last_activity, s.started_at)) AS last_active
    FROM sessions s
    LEFT JOIN (
      SELECT session_id,
             COUNT(*) AS total_calls,
             MAX(timestamp) AS last_activity
      FROM activities
      GROUP BY session_id
    ) a ON a.session_id = s.session_id
    GROUP BY COALESCE(s.agent, 'main')
    ORDER BY last_active DESC
  `).all();
}

function getSessionActivities(sessionId) {
  return db.prepare(`
    SELECT * FROM activities WHERE session_id = ? ORDER BY timestamp ASC, id ASC
  `).all(sessionId);
}

function getStats() {
  return {
    totalActivities: Number(db.prepare('SELECT COUNT(*) as n FROM activities').get().n),
    totalSessions:   Number(db.prepare('SELECT COUNT(*) as n FROM sessions').get().n),
    toolBreakdown:   db.prepare(`
      SELECT tool_name, COUNT(*) as count, SUM(is_error) as errors, AVG(duration_ms) as avg_ms
      FROM activities WHERE tool_name IS NOT NULL
      GROUP BY tool_name ORDER BY count DESC
    `).all(),
    recentActivity: Number(db.prepare(`
      SELECT COUNT(*) as n FROM activities WHERE created_at > unixepoch() - 3600
    `).get().n),
  };
}

module.exports = { insertActivity, updateResult, upsertSession, getOffset, setOffset, getActivities, getSessions, getSessionActivities, getStats, getAgents };
