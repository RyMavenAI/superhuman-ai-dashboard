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
const { getAgentComms } = require('./lib/comms-reader');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const SUGGESTIONS_FILE = path.join(process.env.HOME, '.openclaw/workspace/suggestions.json');

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
    const sourceSet = {};
    for (const agent of agents) {
      const files = getDocFiles(agent.id);
      if (!files) continue;
      for (const filePath of files) {
        const parts = filePath.split('/');
        // Source = first two path segments (e.g. youtube/all-in-podcast)
        const source = parts.length >= 3 ? parts.slice(0, 2).join('/') : '';
        if (source && !sourceSet[source]) {
          const channel = parts[0];
          const slug = parts[1];
          const label = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          sourceSet[source] = { id: source, label, channel };
        }
        allDocs.push({
          agentId: agent.id,
          agentName: agent.displayName || agent.name || agent.id,
          agentEmoji: agent.emoji || '🤖',
          path: filePath,
          filename: parts[parts.length - 1],
          subfolder: parts.length > 1 ? parts.slice(0, -1).join('/') : '',
          source: source || '',
        });
      }
    }
    const sources = Object.values(sourceSet).sort((a, b) => a.label.localeCompare(b.label));
    res.json({ ok: true, sources, docs: allDocs });
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

// ─── Agent Comms API ────────────────────────────────────────────────────────

app.get('/api/agent-comms', (_req, res) => {
  try {
    const data = getAgentComms();
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Suggestions API ────────────────────────────────────────────────────────

app.get('/api/suggestions', (_req, res) => {
  try {
    let suggestions = [];
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      suggestions = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
    }
    suggestions.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return (b.date || '').localeCompare(a.date || '');
    });
    res.json({ ok: true, suggestions });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/suggestions/:id', (req, res) => {
  const { status } = req.body || {};
  if (status !== 'approved' && status !== 'declined') {
    return res.status(400).json({ ok: false, error: 'status must be "approved" or "declined"' });
  }
  try {
    let suggestions = [];
    if (fs.existsSync(SUGGESTIONS_FILE)) {
      suggestions = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));
    }
    const idx = suggestions.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Suggestion not found' });
    suggestions[idx].status = status;
    suggestions[idx].votedAt = new Date().toISOString();
    fs.writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
    res.json({ ok: true, suggestion: suggestions[idx] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Content API ─────────────────────────────────────────────────────────────

const CONTENT_DIR = path.join(process.env.HOME, '.openclaw/workspace-marketer/content');

function parseContentFile(filePath, platform) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const filename = path.basename(filePath);

  // Parse frontmatter (--- delimited block at top)
  let frontmatter = {};
  let body = raw;
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const fmBlock = fmMatch[1];
    for (const line of fmBlock.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        frontmatter[key] = val;
      }
    }
    body = raw.slice(fmMatch[0].length).trim();
  }

  // Extract title from first # heading or filename
  let title = filename.replace(/\.md$/, '');
  const h1Match = body.match(/^#\s+(.+)/m);
  if (h1Match) title = h1Match[1].trim();

  // Status from frontmatter or body keywords
  let status = frontmatter.status || 'Draft';
  if (!frontmatter.status) {
    if (/\bFINAL\b/i.test(body)) status = 'Final';
    else if (/\bREVIEW\b/i.test(body)) status = 'Review';
  }

  // Target publish date
  const targetPublish = frontmatter['target publish'] || frontmatter['target_publish'] || frontmatter.publish || null;
  // Also check body for **Target publish:** pattern
  let targetFromBody = null;
  const tpMatch = body.match(/\*\*Target publish:\*\*\s*(.+)/i);
  if (tpMatch) targetFromBody = tpMatch[1].trim();

  // Preview: first 200 chars of body, skipping frontmatter-like lines and section headers
  const bodyLines = body.split('\n');
  const previewLines = [];
  let chars = 0;
  for (const line of bodyLines) {
    // Skip section headers like **Theme:**, **Visual:**, ## headings, ---
    if (/^\*\*\w+.*:\*\*/.test(line.trim())) continue;
    if (/^#{1,3}\s/.test(line.trim())) continue;
    if (/^---/.test(line.trim())) continue;
    if (line.trim() === '') continue;
    previewLines.push(line.trim());
    chars += line.trim().length;
    if (chars >= 200) break;
  }
  const preview = previewLines.join(' ').slice(0, 200);

  return {
    filename,
    platform,
    path: filePath,
    title,
    status,
    targetPublish: targetPublish || targetFromBody || null,
    preview,
    raw,
    frontmatter,
  };
}

function walkContentDir(dir, platform) {
  const items = [];
  if (!fs.existsSync(dir)) return items;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      items.push(...walkContentDir(fullPath, platform || entry.name));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        items.push(parseContentFile(fullPath, platform || 'general'));
      } catch {}
    }
  }
  return items;
}

app.get('/api/content', (_req, res) => {
  try {
    const items = walkContentDir(CONTENT_DIR, null);
    res.json({ ok: true, content: items });
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

// ─── Linear API ──────────────────────────────────────────────────────────────

const LINEAR_API   = 'https://api.linear.app/graphql';
const LINEAR_KEY   = 'lin_api_REDACTED_SEE_ENV';
const LINEAR_TEAM  = '8d4035d0-9ad1-4f38-8426-8d6bf6e6f431';
const HOOKS_TOKEN  = '66eba28a835fc99e311be1e95acc53eb926e4a1bb2791767';
const GATEWAY_URL  = 'http://localhost:18789/hooks/agent';

// Linear user IDs for agent → assignee mapping
const AGENT_LINEAR_USER = {
  main:     '8d22ee57-cfae-46d7-ba1a-959c77900a37',  // Maven
  coder:    'b657d17a-f289-4ab1-aeb3-aa684cff0508',  // Ryan as fallback for Coda
};
const AGENT_ID_MAP = {
  Maven:    'main',
  Coda:     'coder',
  Jarvis:   'polymath',
  Aura:     'marketer',
};

async function linearQuery(query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': LINEAR_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(', '));
  return json.data;
}

app.get('/api/linear/tasks', async (_req, res) => {
  try {
    const data = await linearQuery(`
      query TeamIssues($teamId: String!) {
        team(id: $teamId) {
          issues(filter: { state: { type: { nin: ["cancelled"] } } }) {
            nodes {
              id title description priority priorityLabel
              state { id name color type }
              assignee { id name displayName email }
              createdAt updatedAt
            }
          }
        }
      }`, { teamId: LINEAR_TEAM });
    res.json({ ok: true, tasks: data.team.issues.nodes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/linear/tasks', async (req, res) => {
  const { title, description, priority } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'title required' });
  try {
    const data = await linearQuery(`
      mutation CreateIssue($teamId: String!, $title: String!, $description: String, $priority: Int) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
          issue { id title priority priorityLabel state { id name color type } assignee { id name } createdAt }
        }
      }`, { teamId: LINEAR_TEAM, title, description: description || null, priority: priority ?? null });
    res.json({ ok: true, task: data.issueCreate.issue });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.patch('/api/linear/tasks/:id', async (req, res) => {
  const { stateId, priority, title, assigneeId } = req.body || {};
  const input = {};
  if (stateId    !== undefined) input.stateId    = stateId;
  if (priority   !== undefined) input.priority   = priority;
  if (title      !== undefined) input.title      = title;
  if (assigneeId !== undefined) input.assigneeId = assigneeId;
  try {
    const data = await linearQuery(`
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          issue { id title priority priorityLabel state { id name color type } assignee { id name displayName } updatedAt }
        }
      }`, { id: req.params.id, input });
    res.json({ ok: true, task: data.issueUpdate.issue });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/linear/tasks/:id', async (req, res) => {
  try {
    // Get the task to find its team
    const taskData = await linearQuery(`
      query Issue($id: String!) {
        issue(id: $id) { id team { id } }
      }`, { id: req.params.id });
    const teamId = taskData.issue?.team?.id;
    if (!teamId) return res.status(404).json({ ok: false, error: 'Task not found' });

    // Get cancelled state for the team
    const statesData = await linearQuery(`
      query TeamStates($teamId: String!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }`, { teamId });
    const cancelledState = statesData.team.states.nodes.find(s => s.type === 'cancelled');
    if (!cancelledState) return res.status(400).json({ ok: false, error: 'No cancelled state found for team' });

    // Update the issue to cancelled state
    const data = await linearQuery(`
      mutation CancelIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          issue { id state { id name type } }
        }
      }`, { id: req.params.id, input: { stateId: cancelledState.id } });
    res.json({ ok: true, task: data.issueUpdate.issue });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/linear/dispatch', async (req, res) => {
  const { taskId, taskTitle, taskDescription, priority, agentName } = req.body || {};
  if (!taskId || !agentName) return res.status(400).json({ ok: false, error: 'taskId and agentName required' });

  const agentId = AGENT_ID_MAP[agentName];
  if (!agentId) return res.status(400).json({ ok: false, error: `Unknown agent: ${agentName}` });

  const message = [
    `New task assigned to you: ${taskTitle}`,
    taskDescription ? `\n${taskDescription}` : '',
    `\nPriority: ${priority || 'None'}`,
    `\nLinear ID: ${taskId}`,
  ].join('');

  try {
    // Fire hook to gateway
    await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HOOKS_TOKEN}` },
      body: JSON.stringify({ message, name: 'Linear', agentId, deliver: true, channel: 'slack' }),
    });

    // Assign in Linear if agent has a mapped user
    const linearUserId = AGENT_LINEAR_USER[agentId];
    if (linearUserId) {
      await linearQuery(`
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { issue { id } }
        }`, { id: taskId, input: { assigneeId: linearUserId } });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

importAll();
watchSessions();
watchCronFile();
poller.start();

server.listen(PORT, () => {
  console.log(`\n🧠 Superhuman AI Dashboard`);
  console.log(`   → http://localhost:${PORT}\n`);
});
