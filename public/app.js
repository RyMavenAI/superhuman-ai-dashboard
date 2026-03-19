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
  currentView: 'org',      // 'org' | 'docs' | 'memory' | 'crons' | 'activity'
  sessions: [],            // all sessions from API
  selectedSession: null,   // currently selected session_id
  activities: [],          // activities for selected session (oldest first)
  selectedId: null,        // selected activity id for detail panel
  liveEnabled: true,
  filterTool: '',
  ws: null,
  collapsedAgents: new Set(),  // agent names that are collapsed
  agents: [],              // agent metadata from /api/agents
  // Workspace editor state
  wsEditor: {
    active: false,
    agentId: null,
    files: [],
    selectedFile: null,
    content: '',
    dirty: false,
  },
  // Cron viewer state
  cronViewer: {
    active: false,
    agentId: null,
    jobs: [],
  },
  // Docs viewer state
  docsViewer: {
    active: false,
    agentId: null,
    files: [],
    selectedFile: null,
  },
  // Context usage data from poller
  contextSessions: [],
  // Global docs/crons cache (lazy loaded)
  globalDocsCache: null,
  globalDocsSources: [],         // from /api/docs { sources }
  docsSourceFilter: 'all',       // active source filter id
  globalCronsCache: null,
  globalDocsSelected: null,   // { agentId, path }
  globalDocsCollapsed: new Set(),
  // Global memory cache (lazy loaded)
  globalMemoryCache: null,
  globalMemorySelected: null,   // { agentId, filename }
  globalMemoryCollapsed: new Set(),
  globalMemorySearch: '',
  // Tasks view
  tasks: [],
  tasksLoading: false,
  tasksNewFormOpen: false,
  tasksExpandedId: null,
  tasksDispatchedIds: new Set(),
  tasksPollTimer: null,
  // Agent Comms view
  commsTimeline: [],
  commsEdges: [],
  commsLoading: false,
  commsFilter: 'messages',
  commsSelectedIdx: null,
  // Ideas view
  ideasFilter: 'all',
  ideasSuggestions: [],
  ideasPollTimer: null,
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
const docsViewerPanel = $('docs-viewer');
const docsViewerTitle = $('docs-viewer-title');
const docsViewerClose = $('docs-viewer-close');
const docsFileList    = $('docs-file-list');
const docsContentPane = $('docs-content-pane');
const mainNav         = $('main-nav');
const activityView    = $('activity-view');
const globalDocsView  = $('global-docs-view');
const globalDocsSidebar = $('global-docs-sidebar');
const globalDocsContent = $('global-docs-content');
const globalCronsView = $('global-crons-view');
const globalMemoryView    = $('global-memory-view');
const globalMemorySidebar = $('global-memory-sidebar');
const globalMemoryContent = $('global-memory-content');
const globalMemoryList    = $('global-memory-list');
const memorySearch        = $('memory-search');
const tasksView           = $('tasks-view');
const agentCommsView      = $('agent-comms-view');
const ideasView           = $('ideas-view');

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

// ══════════════════════════════════════════════════════════════════════════════
// ── Top-level View Switching ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function switchView(view) {
  state.currentView = view;

  // Close any open mobile sheets/panels
  globalDocsSidebar.classList.remove('sheet-open');
  globalMemorySidebar.classList.remove('sheet-open');
  const _docsOv = document.getElementById('docs-sheet-overlay');
  const _memOv = document.getElementById('memory-sheet-overlay');
  if (_docsOv) _docsOv.classList.remove('active');
  if (_memOv) _memOv.classList.remove('active');
  detailPanel.classList.remove('mobile-open');

  // Hide all views
  orgChartView.style.display = 'none';
  globalDocsView.style.display = 'none';
  globalMemoryView.style.display = 'none';
  globalCronsView.style.display = 'none';
  activityView.style.display = 'none';
  tasksView.style.display = 'none';
  agentCommsView.style.display = 'none';
  ideasView.style.display = 'none';
  // Clear tasks poll and reset column switcher when leaving
  if (view !== 'tasks') {
    if (state.tasksPollTimer) {
      clearInterval(state.tasksPollTimer);
      state.tasksPollTimer = null;
    }
    state.mobileActiveColumn = null;
  }
  if (view !== 'ideas') {
    if (state.ideasPollTimer) {
      clearInterval(state.ideasPollTimer);
      state.ideasPollTimer = null;
    }
  }

  // Show selected view
  if (view === 'org') {
    orgChartView.style.display = '';
    renderOrgChart();
  } else if (view === 'docs') {
    globalDocsView.style.display = '';
    if (!state.globalDocsCache) loadGlobalDocs();
  } else if (view === 'memory') {
    globalMemoryView.style.display = '';
    if (!state.globalMemoryCache) loadGlobalMemory();
  } else if (view === 'crons') {
    globalCronsView.style.display = '';
    if (!state.globalCronsCache) loadGlobalCrons();
  } else if (view === 'activity') {
    activityView.style.display = '';
  } else if (view === 'tasks') {
    tasksView.style.display = '';
    loadTasks();
    state.tasksPollTimer = setInterval(loadTasks, 30000);
  } else if (view === 'comms') {
    agentCommsView.style.display = '';
    if (!state.commsTimeline.length) loadAgentComms();
  } else if (view === 'ideas') {
    ideasView.style.display = '';
    loadIdeas();
    state.ideasPollTimer = setInterval(loadIdeas, 60000);
  }

  // Update nav tab active state (both desktop and mobile)
  mainNav.querySelectorAll('.main-nav-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const mobileNav = $('mobile-bottom-nav');
  if (mobileNav) {
    mobileNav.querySelectorAll('.mobile-bottom-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
  }
}

mainNav.addEventListener('click', e => {
  const btn = e.target.closest('.main-nav-tab');
  if (!btn) return;
  switchView(btn.dataset.view);
});

// ── Mobile Bottom Nav ────────────────────────────────────────────────────────
const mobileBottomNav = $('mobile-bottom-nav');
if (mobileBottomNav) {
  mobileBottomNav.addEventListener('click', e => {
    const btn = e.target.closest('.mobile-bottom-nav-btn');
    if (!btn) return;
    switchView(btn.dataset.view);
  });
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
  // Close docs viewer if open
  if (state.docsViewer.active) {
    state.docsViewer.active = false;
    docsViewerPanel.style.display = 'none';
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
  activityView.classList.add('detail-open');
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
  if (state.docsViewer.active) {
    closeDocsViewer();
    return;
  }
  detailPanel.classList.remove('mobile-open');
  detailPanel.classList.add('hidden');
  activityView.classList.remove('detail-open');
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
        <button class="agent-docs-btn" data-agent="${agentName}">Docs</button>
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

    // Docs button
    header.querySelector('.agent-docs-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openDocsViewer(agentName);
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
  // Close docs viewer if open
  if (state.docsViewer.active) {
    state.docsViewer.active = false;
    docsViewerPanel.style.display = 'none';
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
  activityView.classList.add('detail-open');

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
  activityView.classList.remove('detail-open');
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
  // Close docs viewer if open
  if (state.docsViewer.active) {
    state.docsViewer.active = false;
    docsViewerPanel.style.display = 'none';
  }

  state.cronViewer.active = true;
  state.cronViewer.agentId = agentId;

  // Show cron panel, hide others
  activityDetail.style.display = 'none';
  wsEditorPanel.style.display = 'none';
  cronViewerPanel.style.display = '';
  detailPanel.classList.remove('hidden');
  activityView.classList.add('detail-open');

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
  activityView.classList.remove('detail-open');
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

// ── Docs Viewer (per-agent, in activity detail panel) ────────────────────────

async function openDocsViewer(agentId) {
  const meta = state.agents.find(a => a.id === agentId) || {};

  // Close other panels
  if (state.wsEditor.active) {
    if (state.wsEditor.dirty && !confirm('Unsaved workspace changes. Discard?')) return;
    state.wsEditor.active = false;
    wsEditorPanel.style.display = 'none';
  }
  if (state.cronViewer.active) {
    state.cronViewer.active = false;
    cronViewerPanel.style.display = 'none';
  }

  state.docsViewer.active = true;
  state.docsViewer.agentId = agentId;
  state.docsViewer.selectedFile = null;

  // Show docs panel, hide others
  activityDetail.style.display = 'none';
  wsEditorPanel.style.display = 'none';
  cronViewerPanel.style.display = 'none';
  docsViewerPanel.style.display = '';
  detailPanel.classList.remove('hidden');
  activityView.classList.add('detail-open');

  docsViewerTitle.textContent = `${meta.emoji || '🤖'} ${meta.displayName || agentId} — Docs`;

  // Load file list
  try {
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs`).then(r => r.json());
    state.docsViewer.files = r.files || [];
  } catch { state.docsViewer.files = []; }

  renderDocsFileList();
  docsContentPane.innerHTML = '<div class="empty-state" style="padding:60px 20px">Select a document to preview</div>';

  // Auto-select first file
  if (state.docsViewer.files.length) {
    await selectDocFile(state.docsViewer.files[0]);
  }
}

function closeDocsViewer() {
  state.docsViewer.active = false;
  state.docsViewer.agentId = null;
  docsViewerPanel.style.display = 'none';
  activityDetail.style.display = '';
  detailPanel.classList.add('hidden');
  activityView.classList.remove('detail-open');
}

function renderDocsFileList() {
  docsFileList.innerHTML = '';

  if (!state.docsViewer.files.length) {
    docsFileList.innerHTML = '<div class="docs-empty-files">No docs yet</div>';
    return;
  }

  // Group by folder
  const folders = {};
  for (const f of state.docsViewer.files) {
    const parts = f.split('/');
    const folder = parts.length > 1 ? parts[0] : '';
    const name = parts[parts.length - 1];
    if (!folders[folder]) folders[folder] = [];
    folders[folder].push({ name, path: f });
  }

  for (const [folder, files] of Object.entries(folders)) {
    if (folder) {
      const folderEl = document.createElement('div');
      folderEl.className = 'docs-folder';
      folderEl.innerHTML = `<span class="docs-folder-icon">📁</span><span class="docs-folder-name">${folder}</span>`;
      docsFileList.appendChild(folderEl);
    }
    for (const { name, path } of files) {
      const item = document.createElement('div');
      const isActive = path === state.docsViewer.selectedFile;
      item.className = 'docs-file-item' + (isActive ? ' active' : '') + (folder ? ' docs-file-indented' : '');
      item.innerHTML = `<span class="docs-file-icon">📄</span><span class="docs-file-name" title="${path}">${name}</span>`;
      item.addEventListener('click', () => selectDocFile(path));
      docsFileList.appendChild(item);
    }
  }
}

async function selectDocFile(relPath) {
  state.docsViewer.selectedFile = relPath;
  renderDocsFileList();

  docsContentPane.innerHTML = '<div class="empty-state" style="padding:60px 20px">Loading…</div>';

  try {
    const safeRelPath = relPath.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`/api/agents/${encodeURIComponent(state.docsViewer.agentId)}/docs/${safeRelPath}`).then(r => r.json());
    if (r.ok && r.content != null) {
      const html = typeof marked !== 'undefined' ? marked.parse(r.content) : r.content.replace(/\n/g, '<br>');
      docsContentPane.innerHTML = `<div class="docs-markdown">${html}</div>`;
    } else {
      docsContentPane.innerHTML = '<div class="empty-state" style="padding:60px 20px">Failed to load document</div>';
    }
  } catch {
    docsContentPane.innerHTML = '<div class="empty-state" style="padding:60px 20px">Error loading document</div>';
  }
}

docsViewerClose.addEventListener('click', closeDocsViewer);

// ══════════════════════════════════════════════════════════════════════════════
// ── Global Docs View ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function loadGlobalDocs() {
  globalDocsSidebar.innerHTML = '<div class="empty-state" style="padding:20px">Loading docs…</div>';
  try {
    const r = await fetch('/api/docs').then(r => r.json());
    state.globalDocsCache = r.docs || [];
    state.globalDocsSources = r.sources || [];
  } catch {
    state.globalDocsCache = [];
    state.globalDocsSources = [];
  }
  renderGlobalDocsSidebar();
}

function renderGlobalDocsSidebar() {
  globalDocsSidebar.innerHTML = '';
  const allDocs = state.globalDocsCache || [];

  if (!allDocs.length) {
    globalDocsSidebar.innerHTML = '<div class="empty-state" style="padding:20px">No docs found</div>';
    return;
  }

  // ── Source filter pill bar ──
  if (state.globalDocsSources.length > 0) {
    const filterBar = document.createElement('div');
    filterBar.className = 'docs-source-filters';
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (state.docsSourceFilter === 'all' ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => { state.docsSourceFilter = 'all'; renderGlobalDocsSidebar(); });
    filterBar.appendChild(allBtn);
    for (const src of state.globalDocsSources) {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (state.docsSourceFilter === src.id ? ' active' : '');
      btn.textContent = src.label;
      btn.addEventListener('click', () => { state.docsSourceFilter = src.id; renderGlobalDocsSidebar(); });
      filterBar.appendChild(btn);
    }
    globalDocsSidebar.appendChild(filterBar);
  }

  // Apply source filter
  const docs = state.docsSourceFilter === 'all'
    ? allDocs
    : allDocs.filter(d => d.source === state.docsSourceFilter);

  if (!docs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '20px';
    empty.textContent = 'No docs for this source';
    globalDocsSidebar.appendChild(empty);
    return;
  }

  // Group by agent
  const agentGroups = {};
  for (const doc of docs) {
    if (!agentGroups[doc.agentId]) {
      agentGroups[doc.agentId] = {
        agentName: doc.agentName,
        agentEmoji: doc.agentEmoji,
        files: [],
      };
    }
    agentGroups[doc.agentId].files.push(doc);
  }

  for (const [agentId, group] of Object.entries(agentGroups)) {
    const isCollapsed = state.globalDocsCollapsed.has(agentId);
    const section = document.createElement('div');
    section.className = 'global-docs-agent-group' + (isCollapsed ? ' collapsed' : '');

    const header = document.createElement('div');
    header.className = 'global-docs-agent-header';
    header.innerHTML = `
      <span class="global-docs-agent-toggle">▼</span>
      <span class="global-docs-agent-emoji">${group.agentEmoji}</span>
      <span class="global-docs-agent-name">${group.agentName}</span>`;

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      if (section.classList.contains('collapsed')) {
        state.globalDocsCollapsed.add(agentId);
      } else {
        state.globalDocsCollapsed.delete(agentId);
      }
    });

    section.appendChild(header);

    const fileList = document.createElement('div');
    fileList.className = 'global-docs-file-list';

    // Group files by subfolder
    const folders = {};
    for (const doc of group.files) {
      const folder = doc.subfolder || '';
      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(doc);
    }

    for (const [folder, files] of Object.entries(folders)) {
      if (folder) {
        const folderEl = document.createElement('div');
        folderEl.className = 'docs-folder';
        folderEl.innerHTML = `<span class="docs-folder-icon">📁</span><span class="docs-folder-name">${folder}</span>`;
        fileList.appendChild(folderEl);
      }
      for (const doc of files) {
        const item = document.createElement('div');
        const isActive = state.globalDocsSelected &&
          state.globalDocsSelected.agentId === doc.agentId &&
          state.globalDocsSelected.path === doc.path;
        item.className = 'docs-file-item' + (isActive ? ' active' : '') + (folder ? ' docs-file-indented' : '');
        item.innerHTML = `<span class="docs-file-icon">📄</span><span class="docs-file-name" title="${doc.path}">${doc.filename}</span>`;
        item.addEventListener('click', () => selectGlobalDoc(doc.agentId, doc.path));
        fileList.appendChild(item);
      }
    }

    section.appendChild(fileList);
    globalDocsSidebar.appendChild(section);
  }
}

async function selectGlobalDoc(agentId, relPath) {
  state.globalDocsSelected = { agentId, path: relPath };
  renderGlobalDocsSidebar();

  globalDocsContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Loading…</div>';

  try {
    const safeRelPath = relPath.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs/${safeRelPath}`).then(r => r.json());
    if (r.ok && r.content != null) {
      const html = typeof marked !== 'undefined' ? marked.parse(r.content) : r.content.replace(/\n/g, '<br>');
      globalDocsContent.innerHTML = `<div class="docs-markdown">${html}</div>`;
    } else {
      globalDocsContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Failed to load document</div>';
    }
  } catch {
    globalDocsContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Error loading document</div>';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Global Memory View ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function loadGlobalMemory() {
  globalMemoryList.innerHTML = '<div class="empty-state" style="padding:20px">Loading memories…</div>';
  try {
    const r = await fetch('/api/memories').then(r => r.json());
    state.globalMemoryCache = r.memories || [];
  } catch { state.globalMemoryCache = []; }
  renderGlobalMemorySidebar();
}

function renderGlobalMemorySidebar() {
  globalMemoryList.innerHTML = '';
  const memories = state.globalMemoryCache || [];

  if (!memories.length) {
    globalMemoryList.innerHTML = '<div class="empty-state" style="padding:20px">No memory files found</div>';
    return;
  }

  const search = state.globalMemorySearch.toLowerCase();

  // Group by agent
  const agentGroups = {};
  for (const mem of memories) {
    if (search && !mem.filename.toLowerCase().includes(search)) continue;
    if (!agentGroups[mem.agentId]) {
      agentGroups[mem.agentId] = {
        agentName: mem.agentName,
        agentEmoji: mem.agentEmoji,
        files: [],
      };
    }
    agentGroups[mem.agentId].files.push(mem);
  }

  if (!Object.keys(agentGroups).length) {
    globalMemoryList.innerHTML = '<div class="empty-state" style="padding:20px">No matches</div>';
    return;
  }

  for (const [agentId, group] of Object.entries(agentGroups)) {
    const isCollapsed = state.globalMemoryCollapsed.has(agentId);
    const section = document.createElement('div');
    section.className = 'global-memory-agent-group' + (isCollapsed ? ' collapsed' : '');

    const header = document.createElement('div');
    header.className = 'global-memory-agent-header';
    header.innerHTML = `
      <span class="global-memory-agent-toggle">▼</span>
      <span class="global-memory-agent-emoji">${group.agentEmoji}</span>
      <span class="global-memory-agent-name">${group.agentName}</span>`;

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      if (section.classList.contains('collapsed')) {
        state.globalMemoryCollapsed.add(agentId);
      } else {
        state.globalMemoryCollapsed.delete(agentId);
      }
    });

    section.appendChild(header);

    const fileList = document.createElement('div');
    fileList.className = 'global-memory-file-list';

    for (const mem of group.files) {
      const isPinned = mem.filename === 'MEMORY.md';
      const icon = isPinned ? '📌' : '📝';
      const displayName = isPinned ? 'Long-term Memory' : mem.filename.replace('memory/', '');
      const isActive = state.globalMemorySelected &&
        state.globalMemorySelected.agentId === mem.agentId &&
        state.globalMemorySelected.filename === mem.filename;

      const item = document.createElement('div');
      item.className = 'memory-file-item' + (isActive ? ' active' : '') + (isPinned ? ' memory-pinned' : '');
      item.innerHTML = `
        <span class="memory-file-icon">${icon}</span>
        <span class="memory-file-name" title="${mem.filename}">${displayName}</span>
        <span class="memory-file-date">${fmtRelative(mem.mtime)}</span>`;
      item.addEventListener('click', () => selectGlobalMemory(mem.agentId, mem.filename));
      fileList.appendChild(item);
    }

    section.appendChild(fileList);
    globalMemoryList.appendChild(section);
  }
}

async function selectGlobalMemory(agentId, filename) {
  state.globalMemorySelected = { agentId, filename };
  renderGlobalMemorySidebar();

  globalMemoryContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Loading…</div>';

  try {
    const safePath = filename.split('/').map(encodeURIComponent).join('/');
    const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/memory/${safePath}`).then(r => r.json());
    if (r.ok && r.content != null) {
      const html = typeof marked !== 'undefined' ? marked.parse(r.content) : r.content.replace(/\n/g, '<br>');
      globalMemoryContent.innerHTML = `<div class="docs-markdown">${html}</div>`;
    } else {
      globalMemoryContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Failed to load memory file</div>';
    }
  } catch {
    globalMemoryContent.innerHTML = '<div class="empty-state" style="padding:60px 20px">Error loading memory file</div>';
  }
}

memorySearch.addEventListener('keyup', () => {
  state.globalMemorySearch = memorySearch.value;
  renderGlobalMemorySidebar();
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Global Crons View ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function loadGlobalCrons() {
  globalCronsView.innerHTML = '<div class="empty-state" style="padding:40px">Loading cron jobs…</div>';
  try {
    const r = await fetch('/api/crons').then(r => r.json());
    state.globalCronsCache = r.jobs || [];
  } catch { state.globalCronsCache = []; }
  renderGlobalCrons();
}

function renderGlobalCrons() {
  globalCronsView.innerHTML = '';
  const jobs = state.globalCronsCache || [];

  if (!jobs.length) {
    globalCronsView.innerHTML = '<div class="empty-state" style="padding:40px">No cron jobs found</div>';
    return;
  }

  // Group by agent
  const agentGroups = {};
  for (const job of jobs) {
    if (!agentGroups[job.agentId]) {
      agentGroups[job.agentId] = {
        agentName: job.agentName,
        agentEmoji: job.agentEmoji,
        jobs: [],
      };
    }
    agentGroups[job.agentId].jobs.push(job);
  }

  for (const [agentId, group] of Object.entries(agentGroups)) {
    const section = document.createElement('div');
    section.className = 'global-crons-agent-section';

    const header = document.createElement('div');
    header.className = 'global-crons-agent-header';
    header.innerHTML = `
      <span class="global-crons-agent-emoji">${group.agentEmoji}</span>
      <span class="global-crons-agent-name">${group.agentName}</span>`;

    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'global-crons-list';

    for (const job of group.jobs) {
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
            const idx = state.globalCronsCache.findIndex(j => j.id === job.id);
            if (idx >= 0) {
              state.globalCronsCache[idx] = { ...r.job, agentName: job.agentName, agentEmoji: job.agentEmoji };
            }
            renderGlobalCrons();
          } else {
            checkbox.checked = !newEnabled;
          }
        } catch {
          checkbox.checked = !newEnabled;
        }
        checkbox.disabled = false;
      });

      list.appendChild(card);
    }

    section.appendChild(list);
    globalCronsView.appendChild(section);
  }
}

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

    // Cron file changed externally — reload if cron viewer is open or global crons view
    if (msg.type === 'cron_update') {
      if (state.cronViewer.active && state.cronViewer.agentId) {
        openCronViewer(state.cronViewer.agentId);
      }
      if (state.currentView === 'crons') {
        state.globalCronsCache = null;
        loadGlobalCrons();
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

// ── Load org config ──────────────────────────────────────────────────────────
async function loadOrgConfig() {
  try {
    const r = await fetch('/org-config.json').then(r => r.json());
    state.orgConfig = r;
  } catch {
    state.orgConfig = { owner: { name: 'Ryan', initials: 'RY', emoji: '😎', subtitle: 'Owner · Dubai' }, hierarchy: { orchestrator: 'main', subagents: ['coder', 'polymath', 'marketer'] } };
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
  if (state.currentView !== 'org') return;

  const cfg = state.orgConfig || { owner: { name: 'Ryan', initials: 'RY', emoji: '😎', subtitle: 'Owner · Dubai' }, hierarchy: { orchestrator: 'main', subagents: ['coder', 'polymath', 'marketer'] } };
  const agents = state.agents;
  const hierarchy = cfg.hierarchy || {};
  const orchestratorId = hierarchy.orchestrator || null;
  const subagentIds = hierarchy.subagents || [];
  const canvasRect = orgChartView.getBoundingClientRect();
  const canvasW = canvasRect.width || window.innerWidth;

  orgNodes.innerHTML = '';
  orgSvg.innerHTML = '';

  // Layout constants
  const rootW = 260, rootH = 150;
  const orchW = 250, orchH = 170;
  const nodeW = 220, nodeH = 160;
  const rootY = 60;
  const orchY = 260;
  const subY = 460;
  const subGap = 260;

  // Calculate total sessions/calls across all agents
  const totalAgents = agents.length;
  const totalSessions = state.sessions.length;
  const totalCalls = state.sessions.reduce((s, sess) => s + (Number(sess.total_calls) || 0), 0);

  // ── Tier 1: Ryan root node ──
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

  const rootCx = rootX + rootW / 2;
  const rootCy = rootY + rootH;

  // ── Tier 2: Maven (orchestrator) node ──
  const orchAgent = agents.find(a => a.id === orchestratorId);
  let orchCx = canvasW / 2;
  let orchCy = orchY;

  if (orchAgent) {
    const orchX = canvasW / 2 - orchW / 2;
    const orchSessions = state.sessions.filter(s => s.agent === orchAgent.id);
    const orchCallCount = orchSessions.reduce((s, ss) => s + (Number(ss.total_calls) || 0), 0);
    const orchStatus = getAgentStatus(orchAgent.id);
    const orchColor = hashColor(orchAgent.id);
    const orchLastActivity = orchSessions[0]?.last_activity || orchSessions[0]?.started_at;

    const orchEmoji = orchAgent.emoji || '';
    const orchInitials = (orchAgent.displayName || orchAgent.id).slice(0, 2).toUpperCase();
    const orchAvatarContent = orchEmoji && orchEmoji !== '🤖' ? orchEmoji : orchInitials;
    const orchRole = orchAgent.tagline || 'orchestrator';

    orchCx = orchX + orchW / 2;
    orchCy = orchY;

    const orchEl = document.createElement('div');
    orchEl.className = 'org-orchestrator-node' + (state.orgSelectedAgent === orchAgent.id ? ' selected' : '');
    orchEl.style.left = orchX + 'px';
    orchEl.style.top = orchY + 'px';
    orchEl.style.width = orchW + 'px';
    if (state.orgSelectedAgent === orchAgent.id) {
      orchEl.style.borderColor = orchColor;
    }
    orchEl.dataset.agentId = orchAgent.id;
    orchEl.innerHTML = `
      <div class="org-agent-status-dot org-status-${orchStatus}"></div>
      <div class="org-agent-top">
        <div class="org-agent-avatar" style="background:${orchColor}">${orchAvatarContent}</div>
        <div class="org-agent-info-col">
          <div class="org-agent-name">${orchAgent.displayName || orchAgent.id}</div>
          <div class="org-agent-role">${orchRole}</div>
          <span class="org-orchestrator-pill">Orchestrator</span>
          ${orchAgent.model ? `<span class="org-agent-model-pill">${orchAgent.model}</span>` : ''}
        </div>
      </div>
      <div class="org-agent-tags">
        <span class="org-agent-tag">${orchSessions.length} sess</span>
        <span class="org-agent-tag">${orchCallCount} calls</span>
        ${orchLastActivity ? `<span class="org-agent-tag">${fmtRelative(orchLastActivity)}</span>` : ''}
      </div>`;

    orchEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectOrgAgent(orchAgent.id);
    });

    orgNodes.appendChild(orchEl);
  }

  // ── Tier 3: Sub-agent nodes ──
  const subAgents = subagentIds.map(id => agents.find(a => a.id === id)).filter(Boolean);
  const subPositions = []; // {cx, cy, agentId}

  if (subAgents.length) {
    const totalSubWidth = subAgents.length * subGap;
    const subStartX = canvasW / 2 - totalSubWidth / 2 + (subGap - nodeW) / 2;

    subAgents.forEach((agent, idx) => {
      const x = subStartX + idx * subGap;
      const y = subY;

      subPositions.push({ cx: x + nodeW / 2, cy: y, agentId: agent.id });

      const agentSessions = state.sessions.filter(s => s.agent === agent.id);
      const callCount = agentSessions.reduce((s, ss) => s + (Number(ss.total_calls) || 0), 0);
      const agStatus = getAgentStatus(agent.id);
      const color = hashColor(agent.id);
      const lastActivity = agentSessions[0]?.last_activity || agentSessions[0]?.started_at;

      const emoji = agent.emoji || '';
      const initials = (agent.displayName || agent.id).slice(0, 2).toUpperCase();
      const avatarContent = emoji && emoji !== '🤖' ? emoji : initials;
      const role = agent.tagline || (agent.displayName && agent.displayName !== agent.id ? agent.id : (agent.workspace ? '~/' + agent.workspace.split('/').pop() : 'agent'));

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
  }

  // ── Also render any agents not in the hierarchy (fallback) ──
  const knownIds = new Set([orchestratorId, ...subagentIds].filter(Boolean));
  const otherAgents = agents.filter(a => !knownIds.has(a.id));
  const otherPositions = [];

  if (otherAgents.length) {
    const otherY = subAgents.length ? subY + 200 : subY;
    const otherGap = subGap;
    const totalOtherW = otherAgents.length * otherGap;
    const otherStartX = canvasW / 2 - totalOtherW / 2 + (otherGap - nodeW) / 2;

    otherAgents.forEach((agent, idx) => {
      const x = otherStartX + idx * otherGap;
      const y = otherY;

      otherPositions.push({ cx: x + nodeW / 2, cy: y, agentId: agent.id });

      const agentSessions = state.sessions.filter(s => s.agent === agent.id);
      const callCount = agentSessions.reduce((s, ss) => s + (Number(ss.total_calls) || 0), 0);
      const agStatus = getAgentStatus(agent.id);
      const color = hashColor(agent.id);
      const lastActivity = agentSessions[0]?.last_activity || agentSessions[0]?.started_at;

      const emoji = agent.emoji || '';
      const initials = (agent.displayName || agent.id).slice(0, 2).toUpperCase();
      const avatarContent = emoji && emoji !== '🤖' ? emoji : initials;
      const role = agent.tagline || (agent.displayName && agent.displayName !== agent.id ? agent.id : (agent.workspace ? '~/' + agent.workspace.split('/').pop() : 'agent'));

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
  }

  // ── Draw SVG connector lines ──
  let svgPaths = '';
  const orchNodeBottom = orchAgent ? orchY + orchH : rootCy;

  // 1. Ryan → Maven: solid purple line
  if (orchAgent) {
    const x1 = rootCx, y1 = rootCy;
    const x2 = orchCx, y2 = orchY;
    const midY = y1 + (y2 - y1) * 0.5;
    svgPaths += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="rgba(124,58,237,0.6)" stroke-width="2.5"/>`;
  }

  // 2. Maven → sub-agents: solid purple lines
  for (const sp of subPositions) {
    const x1 = orchCx, y1 = orchNodeBottom;
    const x2 = sp.cx, y2 = sp.cy;
    const midY = y1 + (y2 - y1) * 0.5;
    svgPaths += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="rgba(124,58,237,0.5)" stroke-width="2"/>`;
  }

  // 3. Ryan → sub-agents: dashed grey lines (direct chat relationship)
  for (const sp of subPositions) {
    const x1 = rootCx, y1 = rootCy;
    const x2 = sp.cx, y2 = sp.cy;
    const cp1y = y1 + (y2 - y1) * 0.3;
    const cp2y = y1 + (y2 - y1) * 0.7;
    svgPaths += `<path d="M${x1},${y1} C${x1},${cp1y} ${x2},${cp2y} ${x2},${y2}" fill="none" stroke="rgba(100,116,139,0.35)" stroke-width="1.5" stroke-dasharray="6,4"/>`;
  }

  // 4. Fallback: other agents connect to root
  for (const op of otherPositions) {
    const x1 = rootCx, y1 = rootCy;
    const x2 = op.cx, y2 = op.cy;
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
  if (e.target.closest('.org-agent-node') || e.target.closest('.org-orchestrator-node') || e.target.closest('.org-root-node') || e.target.closest('.org-detail-panel') || e.target.closest('.org-reset-zoom')) return;
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
  if (e.target.closest('.org-agent-node') || e.target.closest('.org-orchestrator-node') || e.target.closest('.org-detail-panel') || e.target.closest('.org-reset-zoom') || e.target.closest('.org-root-node')) return;
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
  if (e.key === 'Escape' && state.currentView === 'org' && state.orgSelectedAgent) {
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
        // Switch to activity view with this session selected
        switchView('activity');
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

  if (state.orgDetailTab === 'docs') {
    let docFiles = [];
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs`).then(r => r.json());
      docFiles = r.files || [];
    } catch {}

    if (!docFiles.length) {
      body.innerHTML = '<div class="empty-state" style="padding:40px">No docs yet</div>';
      return;
    }

    let selectedDocPath = docFiles[0];

    // Build layout
    body.innerHTML = `
      <div class="org-docs-file-list" id="org-docs-file-list"></div>
      <div class="org-docs-content" id="org-docs-content"><div class="empty-state" style="padding:40px">Loading…</div></div>`;

    function buildOrgDocFileList() {
      const list = $('org-docs-file-list');
      if (!list) return;
      list.innerHTML = '';
      const folders = {};
      for (const f of docFiles) {
        const parts = f.split('/');
        const folder = parts.length > 1 ? parts[0] : '';
        const name = parts[parts.length - 1];
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push({ name, path: f });
      }
      for (const [folder, files] of Object.entries(folders)) {
        if (folder) {
          const folderEl = document.createElement('div');
          folderEl.className = 'docs-folder';
          folderEl.innerHTML = `<span class="docs-folder-icon">📁</span><span class="docs-folder-name">${folder}</span>`;
          list.appendChild(folderEl);
        }
        for (const { name, path } of files) {
          const item = document.createElement('div');
          const isActive = path === selectedDocPath;
          item.className = 'docs-file-item' + (isActive ? ' active' : '') + (folder ? ' docs-file-indented' : '');
          item.innerHTML = `<span class="docs-file-icon">📄</span><span class="docs-file-name" title="${path}">${name}</span>`;
          item.addEventListener('click', () => loadOrgDoc(path));
          list.appendChild(item);
        }
      }
    }

    async function loadOrgDoc(relPath) {
      selectedDocPath = relPath;
      buildOrgDocFileList();
      const contentEl = $('org-docs-content');
      if (contentEl) contentEl.innerHTML = '<div class="empty-state" style="padding:40px">Loading…</div>';
      try {
        const safeRelPath = relPath.split('/').map(encodeURIComponent).join('/');
        const r = await fetch(`/api/agents/${encodeURIComponent(agentId)}/docs/${safeRelPath}`).then(r => r.json());
        if (r.ok && r.content != null && contentEl) {
          const html = typeof marked !== 'undefined' ? marked.parse(r.content) : r.content.replace(/\n/g, '<br>');
          contentEl.innerHTML = `<div class="docs-markdown">${html}</div>`;
        }
      } catch {}
    }

    buildOrgDocFileList();
    await loadOrgDoc(selectedDocPath);
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
  if (state.currentView === 'org') renderOrgChart();
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Tasks View ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_META = {
  1: { label: 'Urgent', color: '#ef4444' },
  2: { label: 'High',   color: '#f97316' },
  3: { label: 'Medium', color: '#eab308' },
  4: { label: 'Low',    color: '#3b82f6' },
  0: { label: 'None',   color: '#6b7280' },
};

const STATE_TYPE_ORDER = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'];

async function loadTasks() {
  if (state.tasksLoading) return;
  state.tasksLoading = true;
  try {
    const r = await fetch('/api/linear/tasks').then(r => r.json());
    if (r.ok) {
      state.tasks = r.tasks || [];
      renderTasksView();
    }
  } catch {}
  state.tasksLoading = false;
}

function renderTasksView() {
  tasksView.innerHTML = '';

  // Header bar
  const header = document.createElement('div');
  header.className = 'tasks-header';
  header.innerHTML = `
    <div class="tasks-header-left">
      <h2 class="tasks-title">📋 Tasks</h2>
      <span class="tasks-count">${state.tasks.length} total</span>
    </div>
    <button id="tasks-new-btn" class="tasks-new-btn">+ New Task</button>`;
  tasksView.appendChild(header);

  // New task form (inline, conditionally shown)
  const newForm = document.createElement('div');
  newForm.id = 'tasks-new-form';
  newForm.className = 'tasks-new-form' + (state.tasksNewFormOpen ? '' : ' hidden');
  newForm.innerHTML = `
    <div class="tasks-new-form-inner">
      <input id="task-new-title" class="tasks-input" placeholder="Task title (required)" type="text" />
      <textarea id="task-new-desc" class="tasks-textarea" placeholder="Description (optional)" rows="2"></textarea>
      <div class="tasks-new-form-row">
        <select id="task-new-priority" class="tasks-select">
          <option value="">Priority…</option>
          <option value="1">🔴 Urgent</option>
          <option value="2">🟠 High</option>
          <option value="3">🟡 Medium</option>
          <option value="4">🔵 Low</option>
        </select>
        <button id="task-new-submit" class="tasks-btn-primary">Create</button>
        <button id="task-new-cancel" class="tasks-btn-ghost">Cancel</button>
      </div>
    </div>`;
  tasksView.appendChild(newForm);

  // New task button toggle
  header.querySelector('#tasks-new-btn').addEventListener('click', () => {
    state.tasksNewFormOpen = !state.tasksNewFormOpen;
    renderTasksView();
    if (state.tasksNewFormOpen) {
      setTimeout(() => tasksView.querySelector('#task-new-title')?.focus(), 50);
    }
  });

  // New task form handlers
  if (state.tasksNewFormOpen) {
    tasksView.querySelector('#task-new-cancel').addEventListener('click', () => {
      state.tasksNewFormOpen = false;
      renderTasksView();
    });
    tasksView.querySelector('#task-new-submit').addEventListener('click', async () => {
      const titleEl = tasksView.querySelector('#task-new-title');
      const descEl  = tasksView.querySelector('#task-new-desc');
      const priEl   = tasksView.querySelector('#task-new-priority');
      const title   = titleEl?.value?.trim();
      if (!title) { titleEl?.classList.add('tasks-input-error'); return; }
      const btn = tasksView.querySelector('#task-new-submit');
      btn.textContent = 'Creating…';
      btn.disabled = true;
      try {
        const r = await fetch('/api/linear/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description: descEl?.value || undefined, priority: priEl?.value ? parseInt(priEl.value) : undefined }),
        }).then(r => r.json());
        if (r.ok) {
          state.tasksNewFormOpen = false;
          showTasksToast('Task created ✓');
          await loadTasks();
          return;
        }
      } catch {}
      btn.textContent = 'Create';
      btn.disabled = false;
    });
  }

  // Toast container
  const toastWrap = document.createElement('div');
  toastWrap.id = 'tasks-toast';
  toastWrap.className = 'tasks-toast hidden';
  tasksView.appendChild(toastWrap);

  // Kanban board
  const kanban = document.createElement('div');
  kanban.className = 'tasks-kanban';
  tasksView.appendChild(kanban);

  if (!state.tasks.length) {
    kanban.innerHTML = '<div class="empty-state" style="padding:60px 20px;width:100%">No tasks in Linear 🎉</div>';
    return;
  }

  // Derive columns from unique state values, ordered by state.type
  const stateMap = new Map();
  for (const t of state.tasks) {
    if (t.state && !stateMap.has(t.state.id)) {
      stateMap.set(t.state.id, t.state);
    }
  }
  const allStates = [...stateMap.values()];
  allStates.sort((a, b) => {
    const ai = STATE_TYPE_ORDER.indexOf(a.type);
    const bi = STATE_TYPE_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Group tasks by state
  const tasksByState = {};
  for (const t of state.tasks) {
    const sid = t.state?.id || '_unknown';
    if (!tasksByState[sid]) tasksByState[sid] = [];
    tasksByState[sid].push(t);
  }

  for (const st of allStates) {
    const tasks = tasksByState[st.id] || [];
    const col = document.createElement('div');
    col.className = 'tasks-column';

    const colHeader = document.createElement('div');
    colHeader.className = 'tasks-column-header';
    colHeader.style.borderLeftColor = st.color || '#6b7280';
    colHeader.innerHTML = `
      <span class="tasks-column-title">${escapeHtml(st.name)}</span>
      <span class="tasks-column-count">${tasks.length}</span>`;
    col.appendChild(colHeader);

    const colBody = document.createElement('div');
    colBody.className = 'tasks-column-body';

    for (const task of tasks) {
      colBody.appendChild(makeTaskCard(task));
    }

    col.appendChild(colBody);
    kanban.appendChild(col);
  }
}

function makeTaskCard(task) {
  const isExpanded = state.tasksExpandedId === task.id;
  const isDispatched = state.tasksDispatchedIds.has(task.id);
  const pm = PRIORITY_META[task.priority ?? 0] || PRIORITY_META[0];
  const assigneeName = task.assignee?.displayName || task.assignee?.name || 'Unassigned';
  const isDone = task.state?.type === 'completed';

  const card = document.createElement('div');
  card.className = 'task-card' + (isExpanded ? ' task-card-expanded' : '') + (isDone ? ' task-card-done' : '');
  card.dataset.taskId = task.id;

  card.innerHTML = `
    <div class="task-card-summary">
      <span class="task-title">${escapeHtml(task.title)}</span>
      <div class="task-card-badges">
        <span class="task-priority-badge" style="background:${pm.color}20;color:${pm.color};border-color:${pm.color}40">${pm.label}</span>
        ${isDispatched ? '<span class="task-dispatched-badge" title="Dispatched to agent">🤖</span>' : ''}
      </div>
      <span class="task-assignee">${escapeHtml(assigneeName)}</span>
    </div>`;

  // Expand/collapse on click
  card.querySelector('.task-card-summary').addEventListener('click', () => {
    state.tasksExpandedId = isExpanded ? null : task.id;
    renderTasksView();
  });

  if (isExpanded) {
    // Build unique state options from current tasks
    const states = [...new Map(state.tasks.map(t => t.state).filter(Boolean).map(s => [s.id, s])).values()];

    const detail = document.createElement('div');
    detail.className = 'task-card-detail';
    detail.innerHTML = `
      <div class="task-detail-grid">
        <div class="task-detail-col task-detail-col-full">
          <label class="task-detail-label">Title</label>
          <input id="task-edit-title-${task.id}" class="tasks-input" value="${escapeHtml(task.title)}" />
        </div>
        <div class="task-detail-col task-detail-col-full">
          <label class="task-detail-label">Description</label>
          <textarea id="task-edit-desc-${task.id}" class="tasks-textarea" rows="3">${escapeHtml(task.description || '')}</textarea>
        </div>
        <div class="task-detail-col">
          <label class="task-detail-label">Status</label>
          <select id="task-edit-state-${task.id}" class="tasks-select">
            ${states.map(s => `<option value="${s.id}" ${s.id === task.state?.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="task-detail-col">
          <label class="task-detail-label">Priority</label>
          <select id="task-edit-priority-${task.id}" class="tasks-select">
            <option value="1" ${task.priority === 1 ? 'selected' : ''}>🔴 Urgent</option>
            <option value="2" ${task.priority === 2 ? 'selected' : ''}>🟠 High</option>
            <option value="3" ${task.priority === 3 ? 'selected' : ''}>🟡 Medium</option>
            <option value="4" ${task.priority === 4 ? 'selected' : ''}>🔵 Low</option>
            <option value="0" ${!task.priority ? 'selected' : ''}>⚪ None</option>
          </select>
        </div>
      </div>
      <div class="task-detail-actions">
        <button id="task-save-${task.id}" class="tasks-btn-primary task-save-btn">Save</button>
        ${!isDone ? `<button id="task-done-${task.id}" class="tasks-btn-done">Mark as Done</button>` : ''}
        <button id="task-cancel-${task.id}" class="tasks-btn-danger">Cancel Task</button>
        <div class="task-dispatch-wrap">
          <select id="task-dispatch-agent-${task.id}" class="tasks-select">
            <option value="">Assign to agent…</option>
            <option value="Maven">🧠 Maven</option>
            <option value="Coda">⚡ Coda</option>
            <option value="Jarvis">🔭 Jarvis</option>
            <option value="Aura">✨ Aura</option>
          </select>
          <button id="task-dispatch-btn-${task.id}" class="tasks-btn-dispatch">Dispatch 🤖</button>
        </div>
      </div>`;

    // Save handler
    detail.querySelector(`#task-save-${task.id}`).addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = detail.querySelector(`#task-save-${task.id}`);
      btn.textContent = 'Saving…';
      btn.disabled = true;
      const newTitle    = detail.querySelector(`#task-edit-title-${task.id}`)?.value?.trim();
      const newStateId  = detail.querySelector(`#task-edit-state-${task.id}`)?.value;
      const newPriority = parseInt(detail.querySelector(`#task-edit-priority-${task.id}`)?.value);
      try {
        const r = await fetch(`/api/linear/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle, stateId: newStateId, priority: newPriority }),
        }).then(r => r.json());
        if (r.ok) {
          showTasksToast('Saved ✓');
          await loadTasks();
          return;
        }
      } catch {}
      btn.textContent = 'Save';
      btn.disabled = false;
    });

    // Mark as Done handler
    const doneBtn = detail.querySelector(`#task-done-${task.id}`);
    if (doneBtn) {
      doneBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Find completed state from known states
        const completedState = state.tasks.map(t => t.state).filter(Boolean).find(s => s.type === 'completed');
        if (!completedState) { showTasksToast('No completed state found'); return; }
        doneBtn.textContent = 'Completing…';
        doneBtn.disabled = true;
        try {
          const r = await fetch(`/api/linear/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stateId: completedState.id }),
          }).then(r => r.json());
          if (r.ok) {
            showTasksToast('Marked as Done ✓');
            await loadTasks();
            return;
          }
        } catch {}
        doneBtn.textContent = 'Mark as Done';
        doneBtn.disabled = false;
      });
    }

    // Cancel task handler
    detail.querySelector(`#task-cancel-${task.id}`).addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Cancel this task? This cannot be undone.')) return;
      const btn = detail.querySelector(`#task-cancel-${task.id}`);
      btn.textContent = 'Cancelling…';
      btn.disabled = true;
      try {
        const r = await fetch(`/api/linear/tasks/${task.id}`, { method: 'DELETE' }).then(r => r.json());
        if (r.ok) {
          showTasksToast('Task cancelled');
          state.tasksExpandedId = null;
          await loadTasks();
          return;
        }
      } catch {}
      showTasksToast('Failed to cancel task');
      btn.textContent = 'Cancel Task';
      btn.disabled = false;
    });

    // Dispatch handler
    detail.querySelector(`#task-dispatch-btn-${task.id}`).addEventListener('click', async (e) => {
      e.stopPropagation();
      const agentSelect = detail.querySelector(`#task-dispatch-agent-${task.id}`);
      const agentName = agentSelect?.value;
      if (!agentName) { agentSelect?.classList.add('tasks-input-error'); return; }
      const btn = detail.querySelector(`#task-dispatch-btn-${task.id}`);
      btn.textContent = 'Dispatching…';
      btn.disabled = true;
      try {
        const r = await fetch('/api/linear/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            taskTitle: task.title,
            taskDescription: task.description || '',
            priority: PRIORITY_META[task.priority || 0]?.label || 'None',
            agentName,
          }),
        }).then(r => r.json());
        if (r.ok) {
          state.tasksDispatchedIds.add(task.id);
          showTasksToast(`Dispatched to ${agentName}! 🤖`);
          renderTasksView();
          return;
        }
      } catch {}
      btn.textContent = 'Dispatch 🤖';
      btn.disabled = false;
    });

    card.appendChild(detail);
  }

  return card;
}

function showTasksToast(msg) {
  const toast = tasksView?.querySelector('#tasks-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Agent Comms View ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const AGENT_COLORS = {
  Maven:  '#7c3aed',
  Jarvis: '#22c55e',
  Coda:   '#3b82f6',
  Aura:   '#f59e0b',
};

function agentColor(name) { return AGENT_COLORS[name] || '#64748b'; }

async function loadAgentComms() {
  if (state.commsLoading) return;
  state.commsLoading = true;
  renderCommsView();
  try {
    const r = await fetch('/api/agent-comms').then(r => r.json());
    if (r.ok) {
      state.commsTimeline = r.timeline || [];
      state.commsEdges = r.edges || [];
    }
  } catch {}
  state.commsLoading = false;
  renderCommsView();
}

function fmtCommsTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function renderCommsView() {
  agentCommsView.innerHTML = '';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'comms-header';
  header.innerHTML = `
    <h2>Agent Comms</h2>
    <div class="comms-filters">
      <button class="comms-filter-btn comms-refresh" id="comms-refresh">↻ Refresh</button>
    </div>
  `;
  agentCommsView.appendChild(header);

  header.addEventListener('click', e => {
    const btn = e.target.closest('.comms-filter-btn');
    if (!btn) return;
    if (btn.id === 'comms-refresh') { state.commsTimeline = []; loadAgentComms(); return; }
    state.commsFilter = btn.dataset.filter;
    state.commsSelectedIdx = null;
    renderCommsView();
  });

  // ── Main layout: graph on left, timeline on right ──
  const layout = document.createElement('div');
  layout.className = 'comms-layout';

  // ── Agent Graph ──
  const graphPanel = document.createElement('div');
  graphPanel.className = 'comms-graph-panel';
  graphPanel.innerHTML = `<div class="comms-graph-title">Agent Topology</div>`;
  const graphSvg = renderAgentGraph();
  graphPanel.appendChild(graphSvg);

  // ── Edge legend ──
  if (state.commsEdges.length) {
    const legend = document.createElement('div');
    legend.className = 'comms-edge-legend';
    for (const edge of state.commsEdges) {
      const item = document.createElement('div');
      item.className = 'comms-edge-item';
      item.innerHTML = `
        <span class="comms-edge-dot" style="background:${agentColor(edge.fromDisplay)}"></span>
        <span class="comms-edge-label">${edge.fromDisplay} → ${edge.toDisplay}</span>
        <span class="comms-edge-count">${edge.count}</span>
      `;
      legend.appendChild(item);
    }
    graphPanel.appendChild(legend);
  }

  layout.appendChild(graphPanel);

  // ── Timeline ──
  const timelinePanel = document.createElement('div');
  timelinePanel.className = 'comms-timeline-panel';

  if (state.commsLoading) {
    timelinePanel.innerHTML = '<div class="empty-state">Loading agent communications…</div>';
  } else {
    let items = state.commsTimeline.filter(i => i.type === 'message');

    if (!items.length) {
      timelinePanel.innerHTML = '<div class="empty-state">No communications found</div>';
    } else {
      let lastDate = '';
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const d = new Date(item.ts);
        const dateStr = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

        // Date separator
        if (dateStr !== lastDate) {
          lastDate = dateStr;
          const sep = document.createElement('div');
          sep.className = 'comms-date-sep';
          sep.textContent = dateStr;
          timelinePanel.appendChild(sep);
        }

        const card = document.createElement('div');
        card.className = 'comms-card' + (state.commsSelectedIdx === i ? ' comms-card-selected' : '');
        card.dataset.idx = i;

        if (item.type === 'message') {
          const fromColor = agentColor(item.fromDisplay);
          const toColor = agentColor(item.toDisplay);
          card.innerHTML = `
            <div class="comms-card-top">
              <span class="comms-agent-tag" style="border-color:${fromColor};color:${fromColor}">${item.fromDisplay}</span>
              <span class="comms-arrow">→</span>
              <span class="comms-agent-tag" style="border-color:${toColor};color:${toColor}">${item.toDisplay}</span>
              <span class="comms-time">${fmtCommsTime(item.ts)}</span>
            </div>
            <div class="comms-card-summary">${escapeHtml(item.summary)}</div>
            ${item.channel !== 'direct' ? `<span class="comms-channel">${item.channel}</span>` : ''}
          `;
        }

        card.addEventListener('click', () => {
          state.commsSelectedIdx = state.commsSelectedIdx === i ? null : i;
          renderCommsView();
        });

        timelinePanel.appendChild(card);

        // Expanded detail
        if (state.commsSelectedIdx === i && item.type === 'message' && item.fullText) {
          const detail = document.createElement('div');
          detail.className = 'comms-card-detail';
          detail.innerHTML = `<pre class="comms-full-text">${escapeHtml(item.fullText)}</pre>`;
          timelinePanel.appendChild(detail);
        }
      }
    }
  }

  layout.appendChild(timelinePanel);
  agentCommsView.appendChild(layout);
}

function renderAgentGraph() {
  const W = 320, H = 260;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'comms-svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);

  // Agent positions (diamond layout)
  const agents = [
    { id: 'Maven',  x: W/2,     y: 45  },
    { id: 'Jarvis', x: W - 55,  y: H/2 },
    { id: 'Coda',   x: W/2,     y: H - 45 },
    { id: 'Aura',   x: 55,      y: H/2 },
  ];

  const agentMap = {};
  agents.forEach(a => agentMap[a.id] = a);

  // Defs for arrowheads
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  for (const a of agents) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', `arrow-${a.id}`);
    marker.setAttribute('viewBox', '0 0 10 6');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0,0 10,3 0,6');
    poly.setAttribute('fill', agentColor(a.id));
    marker.appendChild(poly);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);

  // Draw edges
  for (const edge of state.commsEdges) {
    const from = agentMap[edge.fromDisplay];
    const to = agentMap[edge.toDisplay];
    if (!from || !to) continue;

    // Offset line slightly to avoid overlap with reverse edge
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offX = -dy / len * 4, offY = dx / len * 4;

    // Shorten line to stop at node circle edge
    const nodeR = 22;
    const sX = from.x + dx / len * nodeR + offX;
    const sY = from.y + dy / len * nodeR + offY;
    const eX = to.x - dx / len * (nodeR + 6) + offX;
    const eY = to.y - dy / len * (nodeR + 6) + offY;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', sX);
    line.setAttribute('y1', sY);
    line.setAttribute('x2', eX);
    line.setAttribute('y2', eY);
    line.setAttribute('stroke', agentColor(edge.fromDisplay));
    line.setAttribute('stroke-width', Math.min(1.5 + edge.count * 0.3, 4));
    line.setAttribute('stroke-opacity', '0.5');
    line.setAttribute('marker-end', `url(#arrow-${edge.fromDisplay})`);
    svg.appendChild(line);

    // Edge count label
    const mx = (sX + eX) / 2, my = (sY + eY) / 2;
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', mx);
    label.setAttribute('y', my - 4);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#64748b');
    label.setAttribute('font-size', '10');
    label.textContent = edge.count;
    svg.appendChild(label);
  }

  // Draw agent nodes
  for (const a of agents) {
    const color = agentColor(a.id);

    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', a.x);
    circle.setAttribute('cy', a.y);
    circle.setAttribute('r', '22');
    circle.setAttribute('fill', color + '18');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '2');
    svg.appendChild(circle);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', a.x);
    text.setAttribute('y', a.y + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', '600');
    text.textContent = a.id;
    svg.appendChild(text);
  }

  return svg;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Mobile UX: Bottom Sheets, Activity Slide-in, Kanban Switcher ────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Docs bottom sheet (mobile) ──────────────────────────────────────────────
const docsBrowseBtn = $('docs-browse-btn');
const docsSheetClose = $('docs-sheet-close');
const docsSheetOverlay = $('docs-sheet-overlay');

function openDocsSheet() {
  globalDocsSidebar.classList.add('sheet-open');
  if (docsSheetOverlay) docsSheetOverlay.classList.add('active');
}
function closeDocsSheet() {
  globalDocsSidebar.classList.remove('sheet-open');
  if (docsSheetOverlay) docsSheetOverlay.classList.remove('active');
}

if (docsBrowseBtn) docsBrowseBtn.addEventListener('click', openDocsSheet);
if (docsSheetClose) docsSheetClose.addEventListener('click', closeDocsSheet);
if (docsSheetOverlay) docsSheetOverlay.addEventListener('click', closeDocsSheet);

// ── Memory bottom sheet (mobile) ────────────────────────────────────────────
const memoryBrowseBtn = $('memory-browse-btn');
const memorySheetClose = $('memory-sheet-close');
const memorySheetOverlay = $('memory-sheet-overlay');

function openMemorySheet() {
  globalMemorySidebar.classList.add('sheet-open');
  if (memorySheetOverlay) memorySheetOverlay.classList.add('active');
}
function closeMemorySheet() {
  globalMemorySidebar.classList.remove('sheet-open');
  if (memorySheetOverlay) memorySheetOverlay.classList.remove('active');
}

if (memoryBrowseBtn) memoryBrowseBtn.addEventListener('click', openMemorySheet);
if (memorySheetClose) memorySheetClose.addEventListener('click', closeMemorySheet);
if (memorySheetOverlay) memorySheetOverlay.addEventListener('click', closeMemorySheet);

// ── Activity detail panel — mobile slide-in ─────────────────────────────────
const detailBackBtn = $('detail-back-btn');

function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

// Override selectActivity to slide in on mobile
const _origSelectActivity = selectActivity;
selectActivity = function(id) {
  _origSelectActivity(id);
  if (isMobile()) {
    detailPanel.classList.add('mobile-open');
  }
};

function closeMobileDetail() {
  detailPanel.classList.remove('mobile-open');
  // Let CSS transition complete, then actually hide via hidden class
  setTimeout(() => {
    detailPanel.classList.add('hidden');
    activityView.classList.remove('detail-open');
    state.selectedId = null;
    feed.querySelectorAll('.activity-card').forEach(c => c.classList.remove('selected'));
  }, 260);
}

if (detailBackBtn) {
  detailBackBtn.addEventListener('click', closeMobileDetail);
}

// ── Kanban column switcher (mobile) ─────────────────────────────────────────
state.mobileActiveColumn = null; // index of active column on mobile

function renderKanbanColumnSwitcher() {
  // Remove any existing switcher
  const existing = tasksView.querySelector('.tasks-column-switcher');
  if (existing) existing.remove();

  const kanban = tasksView.querySelector('.tasks-kanban');
  if (!kanban) return;

  const columns = kanban.querySelectorAll('.tasks-column');
  if (!columns.length) return;

  // Find first non-empty column as default
  if (state.mobileActiveColumn == null) {
    for (let i = 0; i < columns.length; i++) {
      const body = columns[i].querySelector('.tasks-column-body');
      if (body && body.children.length > 0) {
        state.mobileActiveColumn = i;
        break;
      }
    }
    if (state.mobileActiveColumn == null) state.mobileActiveColumn = 0;
  }

  // Build pill row
  const switcher = document.createElement('div');
  switcher.className = 'tasks-column-switcher';

  columns.forEach((col, i) => {
    const title = col.querySelector('.tasks-column-title');
    const count = col.querySelector('.tasks-column-count');
    const pill = document.createElement('button');
    pill.className = 'tasks-column-pill' + (i === state.mobileActiveColumn ? ' active' : '');
    pill.textContent = (title ? title.textContent : `Col ${i+1}`) + (count ? ` (${count.textContent})` : '');
    pill.addEventListener('click', () => {
      state.mobileActiveColumn = i;
      applyMobileColumnVisibility();
      // Update pill active states
      switcher.querySelectorAll('.tasks-column-pill').forEach((p, j) => {
        p.classList.toggle('active', j === i);
      });
    });
    switcher.appendChild(pill);
  });

  // Insert before kanban
  kanban.parentNode.insertBefore(switcher, kanban);

  applyMobileColumnVisibility();
}

function applyMobileColumnVisibility() {
  const kanban = tasksView.querySelector('.tasks-kanban');
  if (!kanban) return;
  const columns = kanban.querySelectorAll('.tasks-column');
  columns.forEach((col, i) => {
    col.classList.toggle('mobile-active', i === state.mobileActiveColumn);
  });
}

// Patch renderTasksView to add column switcher after rendering
const _origRenderTasksView = renderTasksView;
renderTasksView = function() {
  _origRenderTasksView();
  renderKanbanColumnSwitcher();
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Ideas View ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

async function loadIdeas() {
  try {
    const r = await fetch('/api/suggestions').then(r => r.json());
    if (r.ok) {
      state.ideasSuggestions = r.suggestions || [];
      renderIdeasView();
    }
  } catch {}
}

function fmtIdeaDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderIdeasView() {
  ideasView.innerHTML = '';

  const pendingCount = state.ideasSuggestions.filter(s => s.status === 'pending').length;

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'ideas-header';
  header.innerHTML = `
    <div class="ideas-header-left">
      <h2 class="ideas-title">💡 Daily Ideas</h2>
      <span class="ideas-count">${pendingCount} pending</span>
    </div>`;
  ideasView.appendChild(header);

  // ── Filter pills ──
  const filters = document.createElement('div');
  filters.className = 'ideas-filters';
  const filterOpts = ['all', 'pending', 'approved', 'declined'];
  for (const f of filterOpts) {
    const btn = document.createElement('button');
    btn.className = 'comms-filter-btn' + (state.ideasFilter === f ? ' active' : '');
    btn.textContent = f.charAt(0).toUpperCase() + f.slice(1);
    btn.dataset.filter = f;
    btn.addEventListener('click', () => {
      state.ideasFilter = f;
      renderIdeasView();
    });
    filters.appendChild(btn);
  }
  ideasView.appendChild(filters);

  // ── Cards ──
  const list = document.createElement('div');
  list.className = 'ideas-list';

  const filtered = state.ideasSuggestions.filter(s =>
    state.ideasFilter === 'all' || s.status === state.ideasFilter
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state" style="padding:60px 20px">No suggestions yet — check back tomorrow 🙂</div>';
  } else {
    for (const s of filtered) {
      const card = document.createElement('div');
      card.className = 'idea-card' + (s.status === 'declined' ? ' idea-card-declined' : '');
      card.dataset.id = s.id;

      const dateLabel = fmtIdeaDate(s.date);

      let actionsHtml = '';
      if (s.status === 'pending') {
        actionsHtml = `
          <div class="idea-actions">
            <button class="idea-btn idea-btn-approve" data-action="approved">✅ Approve</button>
            <button class="idea-btn idea-btn-decline" data-action="declined">❌ Decline</button>
          </div>`;
      } else if (s.status === 'approved') {
        actionsHtml = `<span class="idea-status-badge idea-status-approved">✅ Approved</span>`;
      } else {
        actionsHtml = `<span class="idea-status-badge idea-status-declined">❌ Declined</span>`;
      }

      card.innerHTML = `
        <div class="idea-card-top">
          <span class="idea-category-badge">${escapeHtml(s.category || '')}</span>
          <span class="idea-agent">${s.agentEmoji || '🤖'} ${escapeHtml(s.agent || '')} · ${dateLabel}</span>
        </div>
        <div class="idea-title">${escapeHtml(s.suggestion)}</div>
        <div class="idea-rationale">${escapeHtml(s.rationale || '')}</div>
        ${actionsHtml}`;

      // Action button handlers
      if (s.status === 'pending') {
        card.querySelectorAll('.idea-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            // Optimistic update
            s.status = action;
            s.votedAt = new Date().toISOString();
            renderIdeasView();
            // PATCH
            try {
              await fetch(`/api/suggestions/${encodeURIComponent(s.id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: action }),
              });
            } catch {}
          });
        });
      }

      list.appendChild(card);
    }
  }

  ideasView.appendChild(list);
}

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
  // Always start on org view
  switchView('org');
})();
