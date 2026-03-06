/**
 * Parses OpenClaw session JSONL files and extracts tool call activities.
 * Each session file is a newline-delimited JSON stream.
 *
 * Relevant entry types:
 *   type:"session"          – session metadata
 *   type:"model_change"     – model switch
 *   type:"message"          – user/assistant/toolResult messages
 *
 * Inside assistant messages, content array may contain:
 *   { type:"toolCall", id, name, arguments }
 *
 * toolResult messages look like:
 *   { role:"toolResult", toolCallId, toolName, content, isError }
 */

const fs   = require('fs');
const path = require('path');
const db = require('./db');
const { insertActivity, updateResult, upsertSession, getOffset, setOffset } = db;

const SESSION_DIR = process.env.OPENCLAW_SESSION_DIR ||
  path.join(process.env.HOME, '.openclaw', 'agents', 'main', 'sessions');

/**
 * Read new lines from a file starting at `startOffset`.
 * Returns { lines, newOffset }.
 */
function readNewLines(filePath, startOffset = 0) {
  const fd = fs.openSync(filePath, 'r');
  const stat = fs.fstatSync(fd);
  const size = stat.size;
  if (size <= startOffset) { fs.closeSync(fd); return { lines: [], newOffset: startOffset }; }

  const buf = Buffer.alloc(size - startOffset);
  fs.readSync(fd, buf, 0, buf.length, startOffset);
  fs.closeSync(fd);

  const text = buf.toString('utf8');
  const rawLines = text.split('\n').filter(l => l.trim());
  return { lines: rawLines, newOffset: size };
}

/**
 * Process a list of raw JSONL lines from a session file.
 * Extracts tool calls and results, writes to DB.
 * Returns array of new activity objects for broadcasting.
 */
function processLines(lines, sessionFile, sessionId) {
  const newActivities = [];

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Session metadata
    if (entry.type === 'session') {
      upsertSession({ sessionId: entry.id || sessionId, sessionFile, startedAt: entry.timestamp || null, model: null });
      continue;
    }

    // Model change
    if (entry.type === 'model_change') {
      upsertSession({ sessionId, sessionFile, startedAt: null, model: entry.modelId || null });
      continue;
    }

    if (entry.type !== 'message') continue;

    const msg = entry.message;
    if (!msg) continue;

    // Assistant message — extract tool calls
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type !== 'toolCall') continue;
        const act = {
          sessionId,
          sessionFile,
          messageId: entry.id || null,
          toolCallId: item.id,
          toolName: item.name,
          arguments: JSON.stringify(item.arguments || {}),
          timestamp: entry.timestamp || new Date().toISOString(),
        };
        insertActivity(act);
        newActivities.push({ ...act, result: null, isError: 0 });
      }
    }

    // Tool result message
    if (msg.role === 'toolResult') {
      const resultText = Array.isArray(msg.content)
        ? msg.content.map(c => c.text || '').join('')
        : (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));

      // Truncate huge results for storage
      const truncated = resultText.length > 8000
        ? resultText.slice(0, 8000) + '\n…[truncated]'
        : resultText;

      updateResult({
        toolCallId: msg.toolCallId,
        result: truncated,
        isError: msg.isError ? 1 : 0,
        resultAt: entry.timestamp || new Date().toISOString(),
      });

      // Emit result update for broadcast
      newActivities.push({
        _type: 'result_update',
        toolCallId: msg.toolCallId,
        result: truncated,
        isError: msg.isError ? 1 : 0,
      });
    }
  }

  return newActivities;
}

/**
 * Import all lines from a session file from its last known offset.
 * Returns new activities found.
 */
function syncFile(filePath) {
  const sessionId = path.basename(filePath, '.jsonl');
  const startOffset = getOffset(filePath);
  const { lines, newOffset } = readNewLines(filePath, startOffset);
  if (!lines.length) return [];
  const acts = processLines(lines, filePath, sessionId);
  setOffset(filePath, newOffset);
  return acts;
}

/**
 * Bootstrap: import all existing session files.
 */
function importAll() {
  if (!fs.existsSync(SESSION_DIR)) {
    console.warn(`[parser] Session dir not found: ${SESSION_DIR}`);
    return;
  }
  const files = fs.readdirSync(SESSION_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(SESSION_DIR, f));

  let total = 0;
  for (const f of files) {
    const acts = syncFile(f);
    total += acts.filter(a => !a._type).length;
  }
  console.log(`[parser] Bootstrap: imported ${total} tool calls from ${files.length} session file(s)`);
}

module.exports = { SESSION_DIR, syncFile, importAll, readNewLines };
