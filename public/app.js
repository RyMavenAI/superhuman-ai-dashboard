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
  // Match by UUID (sessionId) first, then fall back to sessionKey contains check
  const ctx = state.contextSessions.find(c =>
    c.sessionId === sessionId ||
    (c.sessionKey && c.sessionKey.includes(sessionId))
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Org Chart View ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const ORG_PALETTE = ['#14b8a6','#a855f7','#f97316','#22c55e','#ec4899','#3b82f6','#eab308','#06b6d4'];

function hashColor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return ORG_PALETTE[Math.abs(h) % ORG_PALETTE.length];
}

// Org chart state
state.orgView = localStorage.getItem('dashboard-view') === 'org' ? 'org' : 'list';
state.orgConfig = null;
state.orgZoom = 1;
state.orgPan = { x: 0, y: 0 };
state.orgSelectedAgent = null;
state.orgDetailTab = 'sessions';
state.orgDragging = false;
state.orgDragStart = { x: 0, y: 0 };
state.orgPanStart = { x: 0, y: 0 };
// Org workspace editor state (separate from list view)
state.orgWsEditor = {
  agentId: null,
  files: [],
  selectedFile: null,
  content: '',
  dirty: false,
};

// DOM refs for org chart
const orgChartView   = $('org-chart-view');
const orgCanvasWrap  = $('org-canvas-wrap');
const orgSvg         = $('org-svg');
const orgNodes       = $('org-nodes');
const orgResetZoom   = $('org-reset-zoom');
const orgDetailPanel = $('org-detail-panel');
const orgDetailClose = $('org-detail-close');
const orgDetailTabs  = $('org-detail-tabs');
const orgDetailBody  = $('org-detail-body');
const orgDetailInfo  = $('org-detail-agent-info');
const viewToggle     = $('view-toggle');

// ── View Toggle ──────────────────────────────────────────────────────────────
function setView(view) {
  state.orgView = view;
  localStorage.setItem('dashboard-view', view);

  const layout = document.querySelector('.layout');
  if (view === 'org') {
    layout.style.display = 'none';
    orgChartView.style.display = '';
    renderOrgChart();
  } else {
    layout.style.display = '';
    orgChartView.style.display = 'none';
  }

  viewToggle.querySelectorAll('.view-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

viewToggle.addEventListener('click', e => {
  const btn = e.target.closest('.view-toggle-btn');
  if (!btn) return;
  setView(btn.dataset.view);
});

// ── Load org config ──────────────────────────────────────────────────────────
async function loadOrgConfig() {
  try {
    const r = await fetch('/org-config.json').then(r => r.json());
    state.orgConfig = r;
  } catch {
    state.orgConfig = { owner: { name: 'Ryan', initials: 'RY', emoji: '🧠', subtitle: 'Owner · Dubai' }, groups: [] };
  }
}

// ── Agent status helper ──────────────────────────────────────────────────────
function getAgentStatus(agentId) {
  const now = Date.now();
  const agentSessions = state.sessions.filter(s => s.agent === agentId);
  for (const s of agentSessions) {
    const lastTs = s.last_activity || s.started_at;
    if (!lastTs) continue;
    const diff = now - new Date(lastTs).getTime();
    if (diff < 3600000) return 'active';
    if (diff < 86400000) return 'recent';
  }
  return 'idle';
}

// ── Render org chart ─────────────────────────────────────────────────────────
function renderOrgChart() {
  if (state.orgView !== 'org') return;

  const cfg = state.orgConfig || { owner: { name: 'Ryan', initials: 'RY', emoji: '🧠', subtitle: 'Owner · Dubai' }, groups: [] };
  const agents = state.agents;
  const canvasRect = orgChartView.getBoundingClientRect();
  const canvasW = canvasRect.width || window.innerWidth;

  orgNodes.innerHTML = '';
  orgSvg.innerHTML = '';

  // Layout constants
  const rootW = 260, rootH = 150;
  const nodeW = 220, nodeH = 160;
  const rootY = 60;
  const agentY = 280;
  const minGap = 260;

  // Calculate total sessions/calls across all agents
  const totalAgents = agents.length;
  const totalSessions = state.sessions.length;
  const totalCalls = state.sessions.reduce((s, sess) => s + (Number(sess.total_calls) || 0), 0);

  // Root node
  const rootX = canvasW / 2 - rootW / 2;
  const rootEl = document.createElement('div');
  rootEl.className = 'org-root-node';
  rootEl.style.left = rootX + 'px';
  rootEl.style.top = rootY + 'px';
  rootEl.style.width = rootW + 'px';
  rootEl.innerHTML = `
    <div class="org-root-avatar">${cfg.owner.emoji || cfg.owner.initials}</div>
    <div class="org-root-name">${cfg.owner.name}</div>
    <div class="org-root-subtitle">${cfg.owner.subtitle || ''}</div>
    <div class="org-root-stats">
      <span class="org-root-stat">${totalAgents} agents</span>
      <span class="org-root-stat">${totalSessions} sessions</span>
      <span class="org-root-stat">${totalCalls} calls</span>
    </div>`;
  orgNodes.appendChild(rootEl);

  // Agent nodes - horizontal layout
  if (!agents.length) return;

  const totalWidth = agents.length * minGap;
  const startX = canvasW / 2 - totalWidth / 2 + (minGap - nodeW) / 2;

  // Check if we need two rows
  const maxPerRow = Math.max(1, Math.floor(canvasW / minGap));
  const needsTwoRows = agents.length > maxPerRow;
  const row1Count = needsTwoRows ? Math.ceil(agents.length / 2) : agents.length;

  const agentPositions = []; // {x, y, agentId}

  agents.forEach((agent, idx) => {
    let row, col, rowCount;
    if (needsTwoRows) {
      if (idx < row1Count) {
        row = 0; col = idx; rowCount = row1Count;
      } else {
        row = 1; col = idx - row1Count; rowCount = agents.length - row1Count;
      }
    } else {
      row = 0; col = idx; rowCount = agents.length;
    }

    const rowWidth = rowCount * minGap;
    const rowStartX = canvasW / 2 - rowWidth / 2 + (minGap - nodeW) / 2;
    const x = rowStartX + col * minGap;
    const y = agentY + row * 200;

    agentPositions.push({ x: x + nodeW / 2, y: y, agentId: agent.id });

    const agentSessions = state.sessions.filter(s => s.agent === agent.id);
    const callCount = agentSessions.reduce((s, ss) => s + (Number(ss.total_calls) || 0), 0);
    const agStatus = getAgentStatus(agent.id);
    const color = hashColor(agent.id);
    const lastActivity = agentSessions[0]?.last_activity || agentSessions[0]?.started_at;

    const emoji = agent.emoji || '';
    const initials = (agent.displayName || agent.id).slice(0, 2).toUpperCase();
    const avatarContent = emoji && emoji !== '🤖' ? emoji : initials;
    const role = agent.displayName && agent.displayName !== agent.id ? agent.id : (agent.workspace ? '~/' + agent.workspace.split('/').pop() : 'agent');

    const el = document.createElement('div');
    el.className = 'org-agent-node' + (state.orgSelectedAgent === agent.id ? ' selected' : '');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = nodeW + 'px';
    if (state.orgSelectedAgent === agent.id) {
      el.style.borderColor = color;
    }
    el.dataset.agentId = agent.id;
    el.innerHTML = `
      <div class="org-agent-status-dot org-status-${agStatus}"></div>
      <div class="org-agent-top">
        <div class="org-agent-avatar" style="background:${color}">${avatarContent}</div>
        <div class="org-agent-info-col">
          <div class="org-agent-name">${agent.displayName || agent.id}</div>
          <div class="org-agent-role">${role}</div>
          ${agent.model ? `<span class="org-agent-model-pill">${agent.model}</span>` : ''}
        </div>
      </div>
      <div class="org-agent-tags">
        <span class="org-agent-tag">${agentSessions.length} sess</span>
        <span class="org-agent-tag">${callCount} calls</span>
        ${lastActivity ? `<span class="org-agent-tag">${fmtRelative(lastActivity)}</span>` : ''}
      </div>`;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectOrgAgent(agent.id);
    });

    orgNodes.appendChild(el);
  });

  // Draw SVG connector lines
  const rootCx = rootX + rootW / 2;
  const rootCy = rootY + rootH;

  let svgPaths = '';
  for (const ap of agentPositions) {
    const x1 = rootCx, y1 = rootCy;
    const x2 = ap.x, y2 = ap.y;
    const midY = y1 + (y2 - y1) * 0.5;
    svgPaths += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="rgba(124,58,237,0.4)" stroke-width="2"/>`;
  }
  orgSvg.innerHTML = svgPaths;

  // Apply current transform
  applyOrgTransform();
}

function applyOrgTransform() {
  orgCanvasWrap.style.transform = `translate(${state.orgPan.x}px, ${state.orgPan.y}px) scale(${state.orgZoom})`;
}

// ── Zoom ─────────────────────────────────────────────────────────────────────
orgChartView.addEventListener('wheel', e => {
  if (e.target.closest('.org-detail-panel')) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  state.orgZoom = Math.max(0.3, Math.min(2.5, state.orgZoom + delta));
  applyOrgTransform();
}, { passive: false });

// ── Pan ──────────────────────────────────────────────────────────────────────
orgChartView.addEventListener('mousedown', e => {
  if (e.target.closest('.org-agent-node') || e.target.closest('.org-root-node') || e.target.closest('.org-detail-panel') || e.target.closest('.org-reset-zoom')) return;
  state.orgDragging = true;
  state.orgDragStart = { x: e.clientX, y: e.clientY };
  state.orgPanStart = { ...state.orgPan };
  orgCanvasWrap.classList.add('grabbing');
});

window.addEventListener('mousemove', e => {
  if (!state.orgDragging) return;
  state.orgPan.x = state.orgPanStart.x + (e.clientX - state.orgDragStart.x);
  state.orgPan.y = state.orgPanStart.y + (e.clientY - state.orgDragStart.y);
  applyOrgTransform();
});

window.addEventListener('mouseup', () => {
  if (state.orgDragging) {
    state.orgDragging = false;
    orgCanvasWrap.classList.remove('grabbing');
  }
});

// Reset zoom
orgResetZoom.addEventListener('click', () => {
  state.orgZoom = 1;
  state.orgPan = { x: 0, y: 0 };
  applyOrgTransform();
});

// ── Close org detail on background click ─────────────────────────────────────
orgChartView.addEventListener('click', e => {
  if (e.target.closest('.org-agent-node') || e.target.closest('.org-detail-panel') || e.target.closest('.org-reset-zoom') || e.target.closest('.org-root-node')) return;
  if (state.orgDragging) return;
  closeOrgDetail();
});

// ── Select agent in org chart ────────────────────────────────────────────────
function selectOrgAgent(agentId) {
  state.orgSelectedAgent = agentId;
  state.orgDetailTab = 'sessions';
  renderOrgChart();
  openOrgDetail(agentId);
}

function closeOrgDetail() {
  if (state.orgWsEditor.dirty && !confirm('Unsaved workspace changes. Discard?')) return;
  state.orgSelectedAgent = null;
  state.orgWsEditor = { agentId: null, files: [], selectedFile: null, content: '', dirty: false };
  orgDetailPanel.style.display = 'none';
  renderOrgChart();
}

// ESC key closes org detail
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.orgView === 'org' && state.orgSelectedAgent) {
    closeOrgDetail();
  }
});

orgDetailClose.addEventListener('click', closeOrgDetail);

// ── Org detail tabs ──────────────────────────────────────────────────────────
orgDetailTabs.addEventListener('click', e => {
  const btn = e.target.closest('.org-tab-btn');
  if (!btn) return;
  if (state.orgWsEditor.dirty && state.orgDetailTab === 'workspace') {
    if (!confirm('Unsaved workspace changes. Discard?')) return;
    state.orgWsEditor.dirty = false;
  }
  state.orgDetailTab = btn.dataset.tab;
  orgDetailTabs.querySelectorAll('.org-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.orgDetailTab));
  renderOrgDetailTab();
});

// ── Open org detail panel ────────────────────────────────────────────────────
async function openOrgDetail(agentId) {
  const agent = state.agents.find(a => a.id === agentId) || {};
  const color = hashColor(agentId);
  const emoji = agent.emoji || '';
  const initials = (agent.displayName || agentId).slice(0, 2).toUpperCase();
  const avatarContent = emoji && emoji !== '🤖' ? emoji : initials;
  const status = getAgentStatus(agentId);

  orgDetailInfo.innerHTML = `
    <div class="org-detail-avatar" style="background:${color}">${avatarContent}</div>
    <span class="org-detail-name">${agent.displayName || agentId}</span>
    <span class="org-agent-status-dot org-status-${status}" style="position:static;flex-shrink:0"></span>`;

  orgDetailPanel.style.display = '';

  // Reset tabs
  orgDetailTabs.querySelectorAll('.org-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.orgDetailTab));

  await renderOrgDetailTab();
}

// ── Render detail tab content ────────────────────────────────────────────────
async function renderOrgDetailTab() {
  const agentId = state.orgSelectedAgent;
  if (!agentId) return;

  const body = orgDetailBody;
  body.innerHTML = '<div class="empty-state" style="padding:30px">Loading…</div>';

  if (state.orgDetailTab === 'sessions') {
    const agentSessions = state.sessions.filter(s => s.agent === agentId);
    if (!agentSessions.length) {
      body.innerHTML = '<div class="empty-state" style="padding:40px">No sessions for this agent</div>';
      return;
    }
    body.innerHTML = '';
    for (const s of agentSessions) {
      const shortId = s.session_id.slice(0, 8);
      const sCalls = Number(s.total_calls) || 0;
      const errCount = Number(s.error_count) || 0;
      const sLastActive = s.last_activity || s.started_at;

      const row = document.createElement('div');
      row.className = 'org-session-row';
      row.innerHTML = `
        <div class="org-session-row-top">
          <span class="org-session-id">${shortId}</span>
          ${s.model ? `<span class="org-session-model">${s.model}</span>` : ''}
        </div>
        <div class="org-session-row-stats">
          <span>${sCalls} calls</span>
          ${errCount > 0 ? `<span style="color:var(--error)">${errCount} err</span>` : ''}
          <span>${fmtRelative(sLastActive)}</span>
        </div>
        ${contextBarHtml(s.session_id)}`;

      row.addEventListener('click', () => {
        // Switch to list view with this session selected
        setView('list');
        selectSession(s.session_id);
      });

      body.appendChild(row);
    }
  }

  if (state.orgDetailTab === 'crons') {
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/crons`).then(r => r.json());
      const jobs = r.jobs || [];
      if (!jobs.length) {
        body.innerHTML = '<div class="empty-state" style="padding:40px">No scheduled tasks</div>';
        return;
      }
      body.innerHTML = '';
      for (const job of jobs) {
        const card = document.createElement('div');
        card.className = 'cron-card' + (job.enabled ? '' : ' cron-disabled');
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
            if (!r.ok) checkbox.checked = !newEnabled;
          } catch {
            checkbox.checked = !newEnabled;
          }
          checkbox.disabled = false;
        });

        body.appendChild(card);
      }
    } catch {
      body.innerHTML = '<div class="empty-state" style="padding:40px">Failed to load crons</div>';
    }
  }

  if (state.orgDetailTab === 'workspace') {
    state.orgWsEditor.agentId = agentId;
    state.orgWsEditor.dirty = false;
    state.orgWsEditor.selectedFile = null;
    state.orgWsEditor.content = '';

    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/workspace`).then(r => r.json());
      state.orgWsEditor.files = r.files || [];
    } catch { state.orgWsEditor.files = []; }

    if (!state.orgWsEditor.files.length) {
      body.innerHTML = '<div class="empty-state" style="padding:40px">No workspace files</div>';
      return;
    }

    body.innerHTML = `
      <div class="org-ws-file-list" id="org-ws-file-list"></div>
      <div class="org-ws-editor-wrap">
        <textarea id="org-ws-textarea" class="org-ws-textarea" spellcheck="false"></textarea>
        <div class="org-ws-footer">
          <button id="org-ws-save" class="ws-save-btn">Save</button>
          <span id="org-ws-status" class="ws-save-status"></span>
        </div>
      </div>`;

    renderOrgWsFileList();

    // Auto-select first file
    if (state.orgWsEditor.files.length) {
      await selectOrgWsFile(state.orgWsEditor.files[0]);
    }

    // Event listeners
    const textarea = $('org-ws-textarea');
    const saveBtn = $('org-ws-save');
    textarea.addEventListener('input', () => {
      state.orgWsEditor.dirty = textarea.value !== state.orgWsEditor.content;
      renderOrgWsFileList();
    });

    saveBtn.addEventListener('click', async () => {
      if (!state.orgWsEditor.selectedFile || !state.orgWsEditor.agentId) return;
      saveBtn.textContent = 'Saving…';
      saveBtn.disabled = true;
      const statusEl = $('org-ws-status');
      try {
        const r = await fetch(
          `/api/agents/${encodeURIComponent(state.orgWsEditor.agentId)}/workspace/${encodeURIComponent(state.orgWsEditor.selectedFile)}`,
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: textarea.value }) }
        ).then(r => r.json());
        if (r.ok) {
          state.orgWsEditor.content = textarea.value;
          state.orgWsEditor.dirty = false;
          statusEl.textContent = 'Saved ✓';
          statusEl.className = 'ws-save-status ws-save-ok';
        } else {
          statusEl.textContent = 'Error ✗';
          statusEl.className = 'ws-save-status ws-save-err';
        }
      } catch {
        statusEl.textContent = 'Error ✗';
        statusEl.className = 'ws-save-status ws-save-err';
      }
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
      renderOrgWsFileList();
    });
  }
}

function renderOrgWsFileList() {
  const list = $('org-ws-file-list');
  if (!list) return;
  list.innerHTML = '';
  for (const f of state.orgWsEditor.files) {
    const item = document.createElement('div');
    item.className = 'ws-file-item' + (f === state.orgWsEditor.selectedFile ? ' active' : '');
    item.innerHTML = `<span class="ws-file-name">${f}</span>${state.orgWsEditor.dirty && f === state.orgWsEditor.selectedFile ? '<span class="ws-dirty-dot"></span>' : ''}`;
    item.addEventListener('click', () => selectOrgWsFile(f));
    list.appendChild(item);
  }
}

async function selectOrgWsFile(filename) {
  if (state.orgWsEditor.dirty && filename !== state.orgWsEditor.selectedFile) {
    if (!confirm(`Unsaved changes to ${state.orgWsEditor.selectedFile}. Discard?`)) return;
  }
  state.orgWsEditor.selectedFile = filename;
  state.orgWsEditor.dirty = false;
  const textarea = $('org-ws-textarea');
  const statusEl = $('org-ws-status');
  if (statusEl) statusEl.textContent = '';
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(state.orgWsEditor.agentId)}/workspace/${encodeURIComponent(filename)}`).then(r => r.json());
    state.orgWsEditor.content = r.content || '';
    if (textarea) textarea.value = state.orgWsEditor.content;
  } catch {
    if (textarea) textarea.value = '(Error loading file)';
  }
  renderOrgWsFileList();
}

// ── Recalculate org chart on resize ──────────────────────────────────────────
window.addEventListener('resize', () => {
  if (state.orgView === 'org') renderOrgChart();
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await loadAgents();
  await loadOrgConfig();
  await loadSessions();
  // Load initial context data
  try {
    const r = await fetch('/api/context').then(r => r.json());
    state.contextSessions = r.sessions || [];
    renderSessionList();
  } catch {}
  connectWs();
  // Apply saved view
  setView(state.orgView);
})();
