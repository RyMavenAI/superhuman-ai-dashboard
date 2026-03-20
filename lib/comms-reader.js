/**
 * Parses inter-agent communications from session JSONL files and cron run summaries.
 *
 * Inter-agent messages have a provenance block:
 *   { message: { role:"user", provenance: { kind:"inter_session", sourceSessionKey, sourceTool:"sessions_send" } } }
 *
 * Cron run summaries live in ~/.openclaw/cron/runs/*.jsonl with fields:
 *   ts, jobId, action, status, summary, sessionKey, durationMs, model, usage
 */

const fs   = require('fs');
const path = require('path');

// OPENCLAW_SESSION_DIR points to a specific agent's sessions dir (e.g. agents/main/sessions)
// We need the root agents dir — derive it by walking up, or fall back to the default.
const _sessionDir = process.env.OPENCLAW_SESSION_DIR || '';
const AGENTS_DIR = _sessionDir
  ? path.resolve(_sessionDir, '..', '..') // agents/main/sessions -> agents/
  : path.join(process.env.HOME, '.openclaw', 'agents');

const CRON_RUNS_DIR = path.join(process.env.HOME, '.openclaw', 'cron', 'runs');

// Agent name mapping for display
const AGENT_DISPLAY = {
  main:      'Maven',
  polymath:  'Jarvis',
  coder:     'Coda',
  marketer:  'Aura',
};

/**
 * Extract agent ID from a session key like "agent:polymath:cron:..." or "agent:main:main"
 */
function agentFromSessionKey(key) {
  if (!key) return null;
  const parts = key.split(':');
  // Format: agent:<name>:...
  if (parts[0] === 'agent' && parts.length >= 2) return parts[1];
  return null;
}

/**
 * Extract agent ID from a session file path.
 * Pattern: agents/<AGENT_NAME>/sessions/<session-id>.jsonl
 */
function agentFromPath(filePath) {
  const m = filePath.match(/agents\/([^/]+)\/sessions\//);
  return m ? m[1] : null;
}

/**
 * Get display name for an agent ID.
 */
function displayName(agentId) {
  return AGENT_DISPLAY[agentId] || agentId || 'Unknown';
}

/**
 * Truncate message text to a brief summary.
 */
function summarize(text, maxLen = 120) {
  if (!text) return '';
  // Strip timestamp prefix like "[Mon 2026-03-16 08:00 UTC]"
  let clean = text.replace(/^\[.*?\]\s*/, '');
  // Strip any event type prefix like "YOUTUBE_DIGEST_READY:"
  clean = clean.replace(/^[A-Z_]+:\s*/, '');
  // Trim whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  if (clean.length > maxLen) return clean.slice(0, maxLen) + '…';
  return clean;
}

/**
 * Scan all agent session JSONL files for inter-session messages.
 * Returns array of comm events: { ts, from, to, fromDisplay, toDisplay, summary, fullText, channel }
 */
function parseInterAgentComms() {
  const comms = [];

  if (!fs.existsSync(AGENTS_DIR)) return comms;

  let agentDirs;
  try { agentDirs = fs.readdirSync(AGENTS_DIR); } catch { return comms; }

  for (const agentName of agentDirs) {
    const sessionsDir = path.join(AGENTS_DIR, agentName, 'sessions');
    if (!fs.existsSync(sessionsDir)) continue;

    let files;
    try { files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl')); } catch { continue; }

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      let content;
      try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }

      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }

        if (entry.type !== 'message') continue;
        const msg = entry.message;
        if (!msg || !msg.provenance) continue;
        if (msg.provenance.kind !== 'inter_session') continue;
        if (msg.provenance.sourceTool !== 'sessions_send') continue;

        const fromAgent = agentFromSessionKey(msg.provenance.sourceSessionKey);
        const toAgent = agentFromPath(filePath);

        // Extract text content
        let text = '';
        if (Array.isArray(msg.content)) {
          text = msg.content.map(c => c.text || '').join('');
        } else if (typeof msg.content === 'string') {
          text = msg.content;
        }

        comms.push({
          ts: msg.timestamp || new Date(entry.timestamp).getTime() || Date.now(),
          from: fromAgent,
          to: toAgent,
          fromDisplay: displayName(fromAgent),
          toDisplay: displayName(toAgent),
          summary: summarize(text),
          fullText: text.length > 2000 ? text.slice(0, 2000) + '\n…[truncated]' : text,
          channel: msg.provenance.sourceChannel || 'direct',
        });
      }
    }
  }

  // Sort by timestamp descending (newest first)
  comms.sort((a, b) => b.ts - a.ts);
  return comms;
}

/**
 * Load cron job configs to map jobId -> agent via sessionTarget field.
 */
function loadCronJobAgentMap() {
  const CRON_FILE = path.join(process.env.HOME, '.openclaw/cron/jobs.json');
  const map = {};
  try {
    const data = JSON.parse(fs.readFileSync(CRON_FILE, 'utf8'));
    for (const job of (data.jobs || [])) {
      if (job.sessionTarget) map[job.id] = job.sessionTarget;
      if (job.agentId) map[job.id] = job.agentId;
    }
  } catch {}
  return map;
}

/**
 * Parse cron run summaries from ~/.openclaw/cron/runs/*.jsonl.
 * Returns array of run events: { ts, jobId, status, summary, agent, agentDisplay, durationMs, model, tokens }
 */
function parseCronRuns() {
  const runs = [];
  const jobAgentMap = loadCronJobAgentMap();

  if (!fs.existsSync(CRON_RUNS_DIR)) return runs;

  let files;
  try { files = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith('.jsonl')); } catch { return runs; }

  for (const file of files) {
    const filePath = path.join(CRON_RUNS_DIR, file);
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { continue; }

    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }

      if (entry.action !== 'finished') continue;

      const agent = agentFromSessionKey(entry.sessionKey) || jobAgentMap[entry.jobId] || 'main';
      runs.push({
        ts: entry.ts || Date.now(),
        jobId: entry.jobId,
        status: entry.status || 'unknown',
        summary: entry.summary || '',
        agent,
        agentDisplay: displayName(agent),
        durationMs: entry.durationMs || 0,
        model: entry.model || '',
        tokens: entry.usage?.total_tokens || 0,
      });
    }
  }

  // Sort by timestamp descending (newest first)
  runs.sort((a, b) => b.ts - a.ts);
  return runs;
}

/**
 * Build the edges map: { "from->to": count } for the agent graph.
 */
function buildEdges(comms) {
  const edges = {};
  for (const c of comms) {
    if (!c.from || !c.to) continue;
    const key = `${c.from}->${c.to}`;
    edges[key] = (edges[key] || 0) + 1;
  }
  return Object.entries(edges).map(([key, count]) => {
    const [from, to] = key.split('->');
    return { from, to, fromDisplay: displayName(from), toDisplay: displayName(to), count };
  });
}

/**
 * Get all comms data: inter-agent messages only, and graph edges.
 * Cron runs are single-agent work and are excluded from comms view.
 */
function getAgentComms() {
  const comms = parseInterAgentComms();
  const edges = buildEdges(comms);

  const timeline = comms.map(c => ({ ...c, type: 'message' }));
  // Already sorted descending from parseInterAgentComms

  return { timeline, edges, commsCount: comms.length };
}

module.exports = { getAgentComms, parseInterAgentComms, parseCronRuns, AGENT_DISPLAY };
