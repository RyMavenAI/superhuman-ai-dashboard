// ── Tool icons & categories ──────────────────────────────────────────────────
const TOOL_META = {
  read:            { icon: '📄', label: 'File Read',      cat: 'files'   },
  write:           { icon: '✍️',  label: 'File Write',     cat: 'files'   },
  edit:            { icon: '✏️',  label: 'File Edit',      cat: 'files'   },
  exec:            { icon: '💻', label: 'Shell Exec',     cat: 'system'  },
  process:         { icon: '⚙️',  label: 'Process',        cat: 'system'  },
  web_search:      { icon: '🔍', label: 'Web Search',     cat: 'web'     },
  web_fetch:       { icon: '🌐', label: 'Web Fetch',      cat: 'web'     },
  browser:         { icon: '🌍', label: 'Browser',        cat: 'web'     },
  memory_search:   { icon: '🧠', label: 'Memory Search',  cat: 'memory'  },
  memory_get:      { icon: '🧠', label: 'Memory Get',     cat: 'memory'  },
  sessions_list:   { icon: '📋', label: 'Sessions List',  cat: 'session' },
  sessions_history:{ icon: '📜', label: 'Session History',cat: 'session' },
  sessions_spawn:  { icon: '🚀', label: 'Spawn Agent',    cat: 'session' },
  sessions_send:   { icon: '📨', label: 'Send Message',   cat: 'session' },
  session_status:  { icon: '📊', label: 'Session Status', cat: 'session' },
  subagents:       { icon: '🤖', label: 'Subagents',      cat: 'session' },
  cron:            { icon: '⏰', label: 'Cron Job',       cat: 'system'  },
  message:         { icon: '💬', label: 'Message',        cat: 'comms'   },
  tts:             { icon: '🔊', label: 'Text to Speech', cat: 'comms'   },
  gateway:         { icon: '🔧', label: 'Gateway',        cat: 'system'  },
  canvas:          { icon: '🎨', label: 'Canvas',         cat: 'ui'      },
  image:           { icon: '🖼️',  label: 'Image Analysis', cat: 'ai'      },
  nodes:           { icon: '📡', label: 'Nodes',          cat: 'system'  },
  agents_list:     { icon: '🤖', label: 'Agents List',    cat: 'session' },
  whatsapp_login:  { icon: '📱', label: 'WhatsApp Login', cat: 'comms'   },
};

function toolMeta(name) {
  return TOOL_META[name] || { icon: '🔮', label: name, cat: 'other' };
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  sessions: [],          // all sessions from API
  selectedSession: null, // currently selected session_id
  activities: [],        // activities for selected session (oldest first)
  selectedId: null,      // selected activity id for detail panel
  liveEnabled: true,
  filterTool: '',
  ws: null,
  collapsedAgents: new Set(),  // agent names that are collapsed
  agents: [],            // agent metadata from /api/agents
  // Workspace editor state
  wsEditor: {
    active: false,       // is workspace mode active
    agentId: null,       // which agent's workspace
    files: [],           // list of .md filenames
    selectedFile: null,  // currently selected file
    content: '',         // loaded content
    dirty: false,        // unsaved changes
  },
  // Cron viewer state
  cronViewer: {
    active: false,
    agentId: null,
    jobs: [],
  },
  // Context usage data from poller
  contextSessions: [],   // [{sessionKey, totalTokens, contextTokens, pct, agent, model}]
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const feed          = $('feed');
const detailPanel   = $('detail-panel');
const wsBadge       = $('ws-status');
const liveToggle    = $('live-toggle');
const toolFilters   = $('tool-filters');
const sessionList   = $('session-list');
const detailClose   = $('detail-close');
const activityDetail = $('activity-detail');
const wsEditorPanel  = $('workspace-editor');
const wsEditorTitle  = $('ws-editor-title');
const wsEditorClose  = $('ws-editor-close');
const wsFileList     = $('ws-file-list');
const wsTextarea     = $('ws-editor-textarea');
const wsSaveBtn      = $('ws-editor-save');
const wsSaveStatus   = $('ws-editor-status');
const cronViewerPanel = $('cron-viewer');
const cronViewerTitle = $('cron-viewer-title');
const cronViewerClose = $('cron-viewer-close');
const cronJobsList    = $('cron-jobs-list');

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(ms) {
  if (ms == null || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
function fmtTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
function shortArgs(argsJson) {
  try {
    const obj = JSON.parse(argsJson || '{}');
    const entries = Object.entries(obj);
    if (!entries.length) return '{ }';
    return entries
      .slice(0, 3)
      .map(([k, v]) => {
        let vs = typeof v === 'string' ? v : JSON.stringify(v);
        if (vs.length > 60) vs = vs.slice(0, 57) + '…';
        return `${k}: ${vs}`;
      })
      .join('  |  ');
  } catch { return argsJson || ''; }
}
function prettyJson(json) {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json || ''; }
}

// ── Render activity card ─────────────────────────────────────────────────────
function makeCard(act, flash = false) {
  const meta   = toolMeta(act.tool_name);
  const status = act.result == null ? 'pending' : act.is_error ? 'error' : 'success';
  const dur    = fmtDuration(act.duration_ms);

  const card = document.createElement('div');
  card.className = 'activity-card' + (flash ? ' new-flash' : '');
  card.dataset.id = act.id;

  card.innerHTML = `
    <div class="card-top">
      <span class="tool-icon">${meta.icon}</span>
      <span class="tool-name">${meta.label}</span>
      <span class="card-status status-${status}">${status}</span>
    </div>
    <div class="card-args">${shortArgs(act.arguments)}</div>
    <div class="card-meta">
      <span>🕐 ${fmtTime(act.timestamp)}</span>
      ${dur ? `<span class="card-duration">⚡ ${dur}</span>` : ''}
    </div>`;

  card.addEventListener('click', () => selectActivity(act.id));
  return card;
}

// ── Render feed (newest first) ────────────────────────────────────────────────
function renderFeed(flash_id = null) {
  const filtered = state.activities.filter(a => {
    if (state.filterTool && a.tool_name !== state.filterTool) return false;
    return true;
  });

  if (!filtered.length) {
    feed.innerHTML = '<div class="empty-state">No activity in this session…</div>';
    return;
  }

  // Descending order: newest at top
  if (!flash_id) {
    feed.innerHTML = '';
    [...filtered].reverse().forEach(a => feed.appendChild(makeCard(a)));
  } else {
    const act = state.activities.find(a => a.id === flash_id);
    if (act) {
      const existing = feed.querySelector(`[data-id="${flash_id}"]`);
      if (existing) {
        existing.replaceWith(makeCard(act, false));
      } else {
        // Prepend at top (newest first)
        if (!state.filterTool || act.tool_name === state.filterTool) {
          feed.prepend(makeCard(act, true));
        }
      }
    }
  }
}

// ── Select / detail panel ────────────────────────────────────────────────────
function selectActivity(id) {
  const act = state.activities.find(a => a.id === id);
  if (!act) return;
  state.selectedId = id;

  // Close workspace editor if open
  if (state.wsEditor.active) {
    if (state.wsEditor.dirty && !confirm('Unsaved workspace changes. Discard?')) return;
    state.wsEditor.active = false;
    wsEditorPanel.style.display = 'none';
  }
  // Close cron viewer if open
  if (state.cronViewer.active) {
    state.cronViewer.active = false;
    cronViewerPanel.style.display = 'none';
  }
  activityDetail.style.display = '';

  feed.querySelectorAll('.activity-card').forEach(c => c.classList.toggle('selected', +c.dataset.id === id));

  const meta = toolMeta(act.tool_name);
  $('detail-tool-name').textContent = `${meta.icon} ${meta.label}`;
  $('detail-args').textContent   = prettyJson(act.arguments);
  $('detail-result').textContent = act.result || '(pending…)';
  $('detail-ts').textContent     = `Called: ${fmtDate(act.timestamp)}`;
  $('detail-duration').textContent = act.duration_ms != null
    ? `Duration: ${fmtDuration(act.duration_ms)}`
    : '';

  detailPanel.classList.remove('hidden');
  document.querySelector('.layout').classList.add('detail-open');
}

detailClose.addEventListener('click', () => {
  if (state.wsEditor.active) {
    closeWorkspaceEditor();
    return;
  }
  if (state.cronViewer.active) {
    closeCronViewer();
    return;
  }
  detailPanel.classList.add('hidden');
  document.querySelector('.layout').classList.remove('detail-open');
  state.selectedId = null;
  feed.querySelectorAll('.activity-card').forEach(c => c.classList.remove('selected'));
});

// ── Header stats (for selected session) ──────────────────────────────────────
function updateSessionStats() {
  const acts = state.activities;
  $('stat-calls').textContent = acts.length || '—';

  if (acts.length >= 2) {
    const first = new Date(acts[0].timestamp).getTime();
    const last  = new Date(acts[acts.length - 1].timestamp).getTime();
    $('stat-duration').textContent = fmtDuration(last - first) || '—';
  } else {
    $('stat-duration').textContent = '—';
  }

  const errors = acts.filter(a => a.is_error).length;
  $('stat-errors').textContent = errors || '0';
}

// ── Tool filter bar (built from selected session's activities) ────────────────
function buildToolFilters() {
  const counts = {};
  for (const a of state.activities) {
    counts[a.tool_name] = (counts[a.tool_name] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  toolFilters.innerHTML = '<button class="filter-btn active" data-tool="">All</button>';
  for (const [tool, count] of sorted) {
    const m = toolMeta(tool);
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.tool = tool;
    btn.textContent = `${m.icon} ${m.label} (${count})`;
    toolFilters.appendChild(btn);
  }
}

toolFilters.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  state.filterTool = btn.dataset.tool || '';
  toolFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFeed();
});

// ── Context bar helper ───────────────────────────────────────────────────────
function contextBarHtml(sessionId) {
  // Match session by looking for sessionKey containing the session_id
  const ctx = state.contextSessions.find(c =>
    c.sessionKey && c.sessionKey.includes(sessionId)
  );
  if (!ctx || !ctx.contextTokens) return '';

  const pct = ctx.pct;
  const color = pct >= 85 ? 'var(--error)' : pct >= 70 ? 'var(--warn)' : 'var(--success)';
  const label = `${fmtTokens(ctx.totalTokens)} / ${fmtTokens(ctx.contextTokens)} · ${pct}%`;
  const badge = pct >= 85 ? '<span class="compact-badge">Compact soon</span>' : '';

  return `
    <div class="context-bar-wrap">
      <div class="context-bar"><div class="context-bar-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div></div>
      <div class="context-label">${label}${badge}</div>
    </div>`;
}

// ── Session list (grouped by agent) ──────────────────────────────────────────
function renderSessionList() {
  sessionList.innerHTML = '';
  if (!state.sessions.length && !state.agents.length) {
    sessionList.innerHTML = '<div class="empty-state" style="padding:20px">No sessions yet</div>';
    return;
  }

  // Group sessions by agent
  const agentMap = {};
  for (const s of state.sessions) {
    const agent = s.agent || 'main';
    if (!agentMap[agent]) agentMap[agent] = [];
    agentMap[agent].push(s);
  }

  // Build agent lookup from metadata
  const agentMeta = {};
  for (const a of state.agents) agentMeta[a.id] = a;

  // Ensure all known agents appear (even with no sessions)
  for (const a of state.agents) {
    if (!agentMap[a.id]) agentMap[a.id] = [];
  }

  // Sort agent groups by most recent activity
  const agentEntries = Object.entries(agentMap).sort((a, b) => {
    const lastA = a[1][0]?.last_activity || a[1][0]?.started_at || '';
    const lastB = b[1][0]?.last_activity || b[1][0]?.started_at || '';
    return lastB.localeCompare(lastA);
  });

  for (const [agentName, sessions] of agentEntries) {
    const meta = agentMeta[agentName] || {};
    const emoji = meta.emoji || '🤖';
    const displayName = meta.displayName || agentName;
    const model = meta.model || '';
    const workspace = meta.workspace || '';

    const group = document.createElement('div');
    const isCollapsed = state.collapsedAgents && state.collapsedAgents.has(agentName);
    group.className = 'agent-group' + (isCollapsed ? ' collapsed' : '');
    group.dataset.agent = agentName;

    const totalCalls = sessions.reduce((sum, s) => sum + (Number(s.total_calls) || 0), 0);

    // Agent header — richer card
    const header = document.createElement('div');
    header.className = 'agent-header agent-header-rich';
    header.innerHTML = `
      <div class="agent-header-top">
        <span class="agent-toggle">▼</span>
        <span class="agent-emoji">${emoji}</span>
        <div class="agent-info">
          <span class="agent-display-name">${displayName}</span>
          ${model ? `<span class="agent-model-badge">${model}</span>` : ''}
        </div>
      </div>
      <div class="agent-header-bottom">
        <div class="agent-stats">
          <span class="agent-sessions">${sessions.length} sess</span>
          <span class="agent-calls">${totalCalls} calls</span>
        </div>
        ${workspace ? `<span class="agent-workspace-path" title="${workspace}">~/${workspace.split('/').slice(-1)[0]}</span>` : ''}
        <button class="agent-cron-btn" data-agent="${agentName}">Crons</button>
        <button class="agent-ws-btn" data-agent="${agentName}">Workspace</button>
      </div>`;

    // Collapse/expand on top row click (but not on workspace button)
    header.querySelector('.agent-header-top').addEventListener('click', () => {
      group.classList.toggle('collapsed');
      if (!state.collapsedAgents) state.collapsedAgents = new Set();
      if (group.classList.contains('collapsed')) {
        state.collapsedAgents.add(agentName);
      } else {
        state.collapsedAgents.delete(agentName);
      }
    });

    // Workspace button
    header.querySelector('.agent-ws-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkspaceEditor(agentName);
    });

    // Crons button
    header.querySelector('.agent-cron-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openCronViewer(agentName);
    });

    group.appendChild(header);

    // Session cards under this agent
    const listDiv = document.createElement('div');
    listDiv.className = 'agent-sessions-list';

    for (const s of sessions) {
      const card = document.createElement('div');
      card.className = 'session-card' + (s.session_id === state.selectedSession ? ' active' : '');
      card.dataset.sessionId = s.session_id;

      const shortId = s.session_id.slice(0, 8);
      const sModel = s.model || 'unknown';
      const sCalls = Number(s.total_calls) || 0;
      const errorCount = Number(s.error_count) || 0;
      const sLastActive = s.last_activity || s.started_at;

      card.innerHTML = `
        <div class="session-card-id">${shortId}</div>
        <div class="session-card-model">${sModel}</div>
        <div class="session-card-stats">
          <span class="calls">${sCalls} calls</span>
          ${errorCount > 0 ? `<span class="errors">${errorCount} err</span>` : ''}
        </div>
        <div class="session-card-time">${fmtRelative(sLastActive)}</div>
        ${contextBarHtml(s.session_id)}`;

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSession(s.session_id);
      });
      listDiv.appendChild(card);
    }

    group.appendChild(listDiv);
    sessionList.appendChild(group);
  }
}

async function selectSession(sessionId) {
  state.selectedSession = sessionId;

  // Highlight active session card
  sessionList.querySelectorAll('.session-card').forEach(c => {
    c.classList.toggle('active', c.dataset.sessionId === sessionId);
  });

  // Load activities for this session
  const r = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/activities`).then(r => r.json());
  state.activities = r.activities || [];

  // Reset tool filter
  state.filterTool = '';

  buildToolFilters();
  renderFeed();
  updateSessionStats();
}

// ── Load sessions from API ───────────────────────────────────────────────────
async function loadSessions() {
  const r = await fetch('/api/sessions').then(r => r.json());
  state.sessions = r.sessions || [];
  renderSessionList();

  // Auto-select the most recent session
  if (state.sessions.length && !state.selectedSession) {
    await selectSession(state.sessions[0].session_id);
  }
}

// ── Load agents metadata ────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const r = await fetch('/api/agents').then(r => r.json());
    state.agents = r.agents || [];
  } catch { state.agents = []; }
}

// ── Workspace Editor ────────────────────────────────────────────────────────
async function openWorkspaceEditor(agentId) {
  const meta = state.agents.find(a => a.id === agentId) || {};

  // Close cron viewer if open
  if (state.cronViewer.active) {
    state.cronViewer.active = false;
    cronViewerPanel.style.display = 'none';
  }

  state.wsEditor.active = true;
  state.wsEditor.agentId = agentId;
  state.wsEditor.dirty = false;
  state.wsEditor.selectedFile = null;
  state.wsEditor.content = '';

  // Show editor panel, hide activity detail
  activityDetail.style.display = 'none';
  wsEditorPanel.style.display = '';
  detailPanel.classList.remove('hidden');
  document.querySelector('.layout').classList.add('detail-open');

  // Set title
  wsEditorTitle.textContent = `${meta.emoji || '🤖'} ${meta.displayName || agentId} — Workspace`;

  // Load file list
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/workspace`).then(r => r.json());
    state.wsEditor.files = r.files || [];
  } catch { state.wsEditor.files = []; }

  renderWsFileList();
  wsTextarea.value = '';
  wsSaveStatus.textContent = '';

  // Auto-select first file
  if (state.wsEditor.files.length) {
    await selectWsFile(state.wsEditor.files[0]);
  }
}

function closeWorkspaceEditor() {
  if (state.wsEditor.dirty) {
    if (!confirm('You have unsaved changes. Discard?')) return;
  }
  state.wsEditor.active = false;
  state.wsEditor.agentId = null;
  state.wsEditor.dirty = false;
  wsEditorPanel.style.display = 'none';
  activityDetail.style.display = '';
  detailPanel.classList.add('hidden');
  document.querySelector('.layout').classList.remove('detail-open');
}

function renderWsFileList() {
  wsFileList.innerHTML = '';
  for (const f of state.wsEditor.files) {
    const item = document.createElement('div');
    item.className = 'ws-file-item' + (f === state.wsEditor.selectedFile ? ' active' : '');
    item.innerHTML = `<span class="ws-file-name">${f}</span>${state.wsEditor.dirty && f === state.wsEditor.selectedFile ? '<span class="ws-dirty-dot"></span>' : ''}`;
    item.addEventListener('click', () => selectWsFile(f));
    wsFileList.appendChild(item);
  }
}

async function selectWsFile(filename) {
  if (state.wsEditor.dirty && filename !== state.wsEditor.selectedFile) {
    if (!confirm(`Unsaved changes to ${state.wsEditor.selectedFile}. Discard?`)) return;
  }

  state.wsEditor.selectedFile = filename;
  state.wsEditor.dirty = false;
  wsSaveStatus.textContent = '';
  wsSaveBtn.textContent = 'Save';
  wsSaveBtn.disabled = false;

  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(state.wsEditor.agentId)}/workspace/${encodeURIComponent(filename)}`).then(r => r.json());
    state.wsEditor.content = r.content || '';
    wsTextarea.value = state.wsEditor.content;
  } catch {
    wsTextarea.value = '(Error loading file)';
  }

  renderWsFileList();
}

async function saveWsFile() {
  if (!state.wsEditor.selectedFile || !state.wsEditor.agentId) return;

  wsSaveBtn.textContent = 'Saving…';
  wsSaveBtn.disabled = true;
  wsSaveStatus.textContent = '';

  try {
    const r = await fetch(
      `/api/agents/${encodeURIComponent(state.wsEditor.agentId)}/workspace/${encodeURIComponent(state.wsEditor.selectedFile)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: wsTextarea.value }),
      }
    ).then(r => r.json());

    if (r.ok) {
      state.wsEditor.content = wsTextarea.value;
      state.wsEditor.dirty = false;
      wsSaveStatus.textContent = 'Saved \u2713';
      wsSaveStatus.className = 'ws-save-status ws-save-ok';
    } else {
      wsSaveStatus.textContent = 'Error \u2717';
      wsSaveStatus.className = 'ws-save-status ws-save-err';
    }
  } catch {
    wsSaveStatus.textContent = 'Error \u2717';
    wsSaveStatus.className = 'ws-save-status ws-save-err';
  }

  wsSaveBtn.textContent = 'Save';
  wsSaveBtn.disabled = false;
  renderWsFileList();
}

// Workspace editor event listeners
wsEditorClose.addEventListener('click', closeWorkspaceEditor);
wsSaveBtn.addEventListener('click', saveWsFile);
wsTextarea.addEventListener('input', () => {
  if (wsTextarea.value !== state.wsEditor.content) {
    state.wsEditor.dirty = true;
  } else {
    state.wsEditor.dirty = false;
  }
  renderWsFileList();
});

// ── Cron Jobs Viewer ────────────────────────────────────────────────────────
async function openCronViewer(agentId) {
  const meta = state.agents.find(a => a.id === agentId) || {};

  // Close workspace editor if open
  if (state.wsEditor.active) {
    if (state.wsEditor.dirty && !confirm('Unsaved workspace changes. Discard?')) return;
    state.wsEditor.active = false;
    wsEditorPanel.style.display = 'none';
  }

  state.cronViewer.active = true;
  state.cronViewer.agentId = agentId;

  // Show cron panel, hide others
  activityDetail.style.display = 'none';
  wsEditorPanel.style.display = 'none';
  cronViewerPanel.style.display = '';
  detailPanel.classList.remove('hidden');
  document.querySelector('.layout').classList.add('detail-open');

  cronViewerTitle.textContent = `⏰ ${meta.displayName || agentId} — Cron Jobs`;

  // Load cron jobs
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/crons`).then(r => r.json());
    state.cronViewer.jobs = r.jobs || [];
  } catch { state.cronViewer.jobs = []; }

  renderCronJobs();
}

function closeCronViewer() {
  state.cronViewer.active = false;
  state.cronViewer.agentId = null;
  cronViewerPanel.style.display = 'none';
  activityDetail.style.display = '';
  detailPanel.classList.add('hidden');
  document.querySelector('.layout').classList.remove('detail-open');
}

function renderCronJobs() {
  cronJobsList.innerHTML = '';
  const jobs = state.cronViewer.jobs;

  if (!jobs.length) {
    cronJobsList.innerHTML = '<div class="empty-state" style="padding:40px">No scheduled tasks for this agent</div>';
    return;
  }

  for (const job of jobs) {
    const card = document.createElement('div');
    card.className = 'cron-card' + (job.enabled ? '' : ' cron-disabled');
    card.dataset.jobId = job.id;

    const st = job.state || {};
    const lastRunIcon = !st.lastRunAtMs ? '—' :
      st.lastRunStatus === 'ok' ? '<span class="cron-status-ok">ok</span>' :
      '<span class="cron-status-err">error</span>';
    const lastRunTime = st.lastRunAtMs ? fmtRelative(st.lastRunAtMs) : '—';
    const nextRun = job.enabled && st.nextRunAtMs ? fmtDate(st.nextRunAtMs) : '—';

    let deliveryHtml = '';
    if (job.delivery) {
      const ch = job.delivery.channel || '';
      const to = job.delivery.to || '';
      deliveryHtml = `<div class="cron-detail"><span class="cron-detail-label">Delivery</span>${ch}${to ? ` · ${to}` : ''}</div>`;
    }

    card.innerHTML = `
      <div class="cron-card-top">
        <span class="cron-name">${job.name}</span>
        <label class="cron-toggle">
          <input type="checkbox" ${job.enabled ? 'checked' : ''} data-job-id="${job.id}" />
          <span class="cron-toggle-slider"></span>
        </label>
      </div>
      <div class="cron-detail"><span class="cron-detail-label">Schedule</span>${job.scheduleHuman}</div>
      <div class="cron-detail"><span class="cron-detail-label">Last run</span>${lastRunTime} ${lastRunIcon}</div>
      <div class="cron-detail"><span class="cron-detail-label">Next run</span>${nextRun}</div>
      ${deliveryHtml}`;

    // Toggle handler
    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      const newEnabled = checkbox.checked;
      checkbox.disabled = true;
      try {
        const r = await fetch(`/api/crons/${encodeURIComponent(job.id)}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: newEnabled }),
        }).then(r => r.json());
        if (r.ok && r.job) {
          // Update local state
          const idx = state.cronViewer.jobs.findIndex(j => j.id === job.id);
          if (idx >= 0) state.cronViewer.jobs[idx] = r.job;
          renderCronJobs();
        } else {
          checkbox.checked = !newEnabled; // revert
        }
      } catch {
        checkbox.checked = !newEnabled; // revert
      }
      checkbox.disabled = false;
    });

    cronJobsList.appendChild(card);
  }
}

cronViewerClose.addEventListener('click', closeCronViewer);

// ── WebSocket ────────────────────────────────────────────────────────────────
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  state.ws = ws;

  ws.onopen = () => {
    wsBadge.textContent = '⚡ Live';
    wsBadge.className = 'ws-badge connected';
  };

  ws.onclose = () => {
    wsBadge.textContent = '⚡ Disconnected';
    wsBadge.className = 'ws-badge disconnected';
    setTimeout(connectWs, 3000);
  };

  ws.onmessage = ({ data }) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // Context updates always apply (even if live is off)
    if (msg.type === 'context_update') {
      state.contextSessions = msg.sessions || [];
      // Re-render session list to update context bars
      renderSessionList();
      return;
    }

    // Cron file changed externally — reload if cron viewer is open
    if (msg.type === 'cron_update') {
      if (state.cronViewer.active && state.cronViewer.agentId) {
        openCronViewer(state.cronViewer.agentId);
      }
      return;
    }

    if (!state.liveEnabled) return;

    if (msg.type === 'activity') {
      const act = msg.activity;

      // Update session list counts
      updateSessionListForActivity(act);

      // If this activity is for the currently selected session, add it to the feed
      if (act.sessionId === state.selectedSession || act.session_id === state.selectedSession) {
        const sid = act.sessionId || act.session_id;
        // Normalize field names (WS sends camelCase, DB uses snake_case)
        const normalized = {
          id: act.id || Date.now(),
          session_id: sid,
          session_file: act.sessionFile || act.session_file,
          message_id: act.messageId || act.message_id,
          tool_call_id: act.toolCallId || act.tool_call_id,
          tool_name: act.toolName || act.tool_name,
          arguments: act.arguments,
          result: act.result || null,
          is_error: act.isError || act.is_error || 0,
          duration_ms: act.duration_ms || null,
          timestamp: act.timestamp,
        };

        const existing = state.activities.findIndex(a => a.tool_call_id === normalized.tool_call_id);
        if (existing === -1) {
          state.activities.push(normalized);
          renderFeed(normalized.id);
          updateSessionStats();
        }
      }
    }

    if (msg.type === 'result_update') {
      const act = state.activities.find(a => a.tool_call_id === msg.toolCallId);
      if (act) {
        act.result   = msg.result;
        act.is_error = msg.isError;
        // Re-render card
        const card = feed.querySelector(`[data-id="${act.id}"]`);
        if (card) card.replaceWith(makeCard(act, false));
        // Update detail if open
        if (state.selectedId === act.id) {
          $('detail-result').textContent = act.result || '(no result)';
        }
        updateSessionStats();
      }

      // Update error count in session list
      if (msg.isError) {
        updateSessionListErrorCount(msg.toolCallId);
      }
    }
  };
}

// Update session list card counts when a new activity arrives via WS
function updateSessionListForActivity(act) {
  const sid = act.sessionId || act.session_id;
  const session = state.sessions.find(s => s.session_id === sid);
  if (session) {
    session.total_calls = (Number(session.total_calls) || 0) + 1;
    session.last_activity = act.timestamp;
    // Move to top within same agent group (sessions are sorted by recency)
    const agent = session.agent || 'main';
    const sameAgent = state.sessions.filter(s => (s.agent || 'main') === agent);
    const idx = sameAgent.indexOf(session);
    if (idx > 0) {
      // Re-sort: move to front of its agent group
      const globalIdx = state.sessions.indexOf(session);
      state.sessions.splice(globalIdx, 1);
      // Find first session of same agent
      const firstIdx = state.sessions.findIndex(s => (s.agent || 'main') === agent);
      if (firstIdx >= 0) {
        state.sessions.splice(firstIdx, 0, session);
      } else {
        state.sessions.unshift(session);
      }
    }
    renderSessionList();
  } else {
    // New session — reload session list
    loadSessions();
  }
}

function updateSessionListErrorCount(toolCallId) {
  // Find which session this tool call belongs to
  for (const s of state.sessions) {
    // If currently selected session, check state.activities
    if (s.session_id === state.selectedSession) {
      const act = state.activities.find(a => a.tool_call_id === toolCallId);
      if (act) {
        s.error_count = (Number(s.error_count) || 0) + 1;
        renderSessionList();
        return;
      }
    }
  }
}

// ── Controls ─────────────────────────────────────────────────────────────────
liveToggle.addEventListener('change', () => { state.liveEnabled = liveToggle.checked; });

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await loadAgents();
  await loadSessions();
  // Load initial context data
  try {
    const r = await fetch('/api/context').then(r => r.json());
    state.contextSessions = r.sessions || [];
    renderSessionList();
  } catch {}
  connectWs();
})();
