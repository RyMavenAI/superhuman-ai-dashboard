const express = require('express');
const http    = require('http');
const path    = require('path');
const WebSocket = require('ws');
const chokidar  = require('chokidar');

const { getActivities, getSessions, getSessionActivities, getStats } = require('./lib/db');
const { SESSION_DIR, AGENTS_DIR, syncFile, importAll } = require('./lib/parser');
const { loadAgents, getWorkspaceFiles, getFileContent, saveFileContent, getDocFiles, getDocContent, getMemoryFiles, getMemoryContent } = require('./lib/agents');
const { getCronJobs, toggleCronJob, CRON_FILE } = require('./lib/cron-reader');
const { ContextPoller } = require('./lib/context-poller');

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

// ─── Docs API ────────────────────────────────────────────────────────────────

app.get('/api/agents/:id/docs', (req, res) => {
  const files = getDocFiles(req.params.id);
  if (files === null) return res.status(404).json({ ok: false, error: 'Agent not found' });
  res.json({ ok: true, files });
});

app.get('/api/agents/:id/docs/*', (req, res) => {
  const relPath = req.params[0];
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid path' });
  }
  const content = getDocContent(req.params.id, relPath);
  if (content === null) return res.status(404).json({ ok: false, error: 'File not found' });
  res.json({ ok: true, path: relPath, content });
});

// ─── Global Docs API ──────────────────────────────────────────────────────

app.get('/api/docs', (_req, res) => {
  try {
    const agents = loadAgents();
    const allDocs = [];
    for (const agent of agents) {
      const files = getDocFiles(agent.id);
      if (!files) continue;
      for (const filePath of files) {
        const parts = filePath.split('/');
        allDocs.push({
          agentId: agent.id,
          agentName: agent.displayName || agent.name || agent.id,
          agentEmoji: agent.emoji || '🤖',
          path: filePath,
          filename: parts[parts.length - 1],
          subfolder: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
        });
      }
    }
    res.json({ ok: true, docs: allDocs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Global Memory API ───────────────────────────────────────────────────

app.get('/api/memories', (_req, res) => {
  try {
    const agents = loadAgents();
    const allMemories = [];
    for (const agent of agents) {
      const files = getMemoryFiles(agent.id);
      if (!files) continue;
      for (const f of files) {
        allMemories.push({
          agentId: agent.id,
          agentName: agent.displayName || agent.name || agent.id,
          agentEmoji: agent.emoji || '🤖',
          filename: f.filename,
          mtime: f.mtime,
        });
      }
    }
    res.json({ ok: true, memories: allMemories });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/agents/:id/memory/*', (req, res) => {
  const file = req.params[0];
  if (!file || file.includes('..') || file.startsWith('/')) {
    return res.status(400).json({ ok: false, error: 'Invalid path' });
  }
  const content = getMemoryContent(req.params.id, file);
  if (content === null) return res.status(404).json({ ok: false, error: 'File not found' });
  res.json({ ok: true, filename: file, content });
});

// ─── Global Crons API ────────────────────────────────────────────────────

app.get('/api/crons', (_req, res) => {
  try {
    const agents = loadAgents();
    const agentMap = {};
    for (const a of agents) agentMap[a.id] = a;
    const allJobs = getCronJobs();
    const result = allJobs.map(j => ({
      ...j,
      agentName: agentMap[j.agentId]?.displayName || agentMap[j.agentId]?.name || j.agentId,
      agentEmoji: agentMap[j.agentId]?.emoji || '🤖',
    }));
    res.json({ ok: true, jobs: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Cron Jobs API ───────────────────────────────────────────────────────────

app.get('/api/agents/:id/crons', (req, res) => {
  try {
    const jobs = getCronJobs(req.params.id);
    res.json({ ok: true, jobs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/crons/:jobId/toggle', (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'enabled (boolean) required' });
  }
  try {
    const job = toggleCronJob(req.params.jobId, enabled);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
    res.json({ ok: true, job });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Context API ─────────────────────────────────────────────────────────────

const poller = new ContextPoller();

app.get('/api/context', (_req, res) => {
  res.json({ ok: true, sessions: poller.getSessions() });
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
  // Send current context data on connect
  const ctx = poller.getSessions();
  if (ctx.length) ws.send(JSON.stringify({ type: 'context_update', sessions: ctx }));
});

// Broadcast context updates
poller.on('context_update', (sessions) => {
  broadcast({ type: 'context_update', sessions });
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

// ─── Cron File Watcher ───────────────────────────────────────────────────────

function watchCronFile() {
  const watcher = chokidar.watch(CRON_FILE, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('change', () => {
    console.log('[watcher] Cron file changed externally');
    broadcast({ type: 'cron_update' });
  });

  watcher.on('error', e => console.error('[cron-watcher] error:', e));
  console.log(`[watcher] Watching cron file: ${CRON_FILE}`);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

importAll();
watchSessions();
watchCronFile();
poller.start();

server.listen(PORT, () => {
  console.log(`\n🧠 Superhuman AI Dashboard`);
  console.log(`   → http://localhost:${PORT}\n`);
});
