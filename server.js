const express = require('express');
const http    = require('http');
const path    = require('path');
const WebSocket = require('ws');
const chokidar  = require('chokidar');

const { getActivities, getSessions, getSessionActivities, getStats } = require('./lib/db');
const { SESSION_DIR, AGENTS_DIR, syncFile, importAll } = require('./lib/parser');
const { loadAgents, getWorkspaceFiles, getFileContent, saveFileContent } = require('./lib/agents');

const PORT = process.env.PORT || 3000;

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/activities', (req, res) => {
  const { session, tool, limit, offset, since } = req.query;
  try {
    const rows = getActivities({
      session,
      tool,
      limit:  limit  ? parseInt(limit)  : 200,
      offset: offset ? parseInt(offset) : 0,
      since,
    });
    res.json({ ok: true, count: rows.length, activities: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/sessions', (_req, res) => {
  res.json({ ok: true, sessions: getSessions() });
});

app.get('/api/sessions/:id/activities', (req, res) => {
  try {
    const rows = getSessionActivities(req.params.id);
    res.json({ ok: true, count: rows.length, activities: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/agents', (_req, res) => {
  res.json({ ok: true, agents: loadAgents() });
});

app.get('/api/agents/:id/workspace', (req, res) => {
  const files = getWorkspaceFiles(req.params.id);
  if (files === null) return res.status(404).json({ ok: false, error: 'Agent not found' });
  res.json({ ok: true, files });
});

app.get('/api/agents/:id/workspace/:file', (req, res) => {
  const filename = req.params.file;
  if (filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ ok: false, error: 'Invalid filename' });
  }
  const content = getFileContent(req.params.id, filename);
  if (content === null) return res.status(404).json({ ok: false, error: 'File not found' });
  res.json({ ok: true, filename, content });
});

app.put('/api/agents/:id/workspace/:file', (req, res) => {
  const filename = req.params.file;
  if (filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ ok: false, error: 'Invalid filename' });
  }
  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ ok: false, error: 'Content required' });
  const result = saveFileContent(req.params.id, filename, content);
  res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/stats', (_req, res) => {
  res.json({ ok: true, ...getStats() });
});

// ─── HTTP + WebSocket ─────────────────────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
});

// ─── File Watcher ─────────────────────────────────────────────────────────────

function watchSessions() {
  const pattern = path.join(AGENTS_DIR, '*/sessions/*.jsonl');
  const watcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: true,   // already imported on bootstrap
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    console.log(`[watcher] New session file: ${filePath}`);
    const acts = syncFile(filePath);
    acts.filter(a => !a._type).forEach(act => broadcast({ type: 'activity', activity: act }));
  });

  watcher.on('change', (filePath) => {
    const acts = syncFile(filePath);
    for (const act of acts) {
      if (act._type === 'result_update') {
        broadcast({ type: 'result_update', ...act });
      } else {
        broadcast({ type: 'activity', activity: act });
      }
    }
  });

  watcher.on('error', e => console.error('[watcher] error:', e));
  console.log(`[watcher] Watching ${AGENTS_DIR}/*/sessions/*.jsonl`);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

importAll();
watchSessions();

server.listen(PORT, () => {
  console.log(`\n🧠 Superhuman AI Dashboard`);
  console.log(`   → http://localhost:${PORT}\n`);
});
