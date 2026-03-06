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

// ── Render feed (chronological, oldest at top) ───────────────────────────────
function renderFeed(flash_id = null) {
  const filtered = state.activities.filter(a => {
    if (state.filterTool && a.tool_name !== state.filterTool) return false;
    return true;
  });

  if (!filtered.length) {
    feed.innerHTML = '<div class="empty-state">No activity in this session…</div>';
    return;
  }

  // Chronological order: oldest at top, newest at bottom
  if (!flash_id) {
    feed.innerHTML = '';
    filtered.forEach(a => feed.appendChild(makeCard(a)));
    // Scroll to bottom
    feed.scrollTop = feed.scrollHeight;
  } else {
    const act = state.activities.find(a => a.id === flash_id);
    if (act) {
      const existing = feed.querySelector(`[data-id="${flash_id}"]`);
      if (existing) {
        existing.replaceWith(makeCard(act, false));
      } else {
        // Append at bottom (newest)
        if (!state.filterTool || act.tool_name === state.filterTool) {
          feed.appendChild(makeCard(act, true));
          // Auto-scroll to bottom for new live activity
          feed.scrollTop = feed.scrollHeight;
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

// ── Session list ─────────────────────────────────────────────────────────────
function renderSessionList() {
  sessionList.innerHTML = '';
  if (!state.sessions.length) {
    sessionList.innerHTML = '<div class="empty-state" style="padding:20px">No sessions yet</div>';
    return;
  }
  for (const s of state.sessions) {
    const card = document.createElement('div');
    card.className = 'session-card' + (s.session_id === state.selectedSession ? ' active' : '');
    card.dataset.sessionId = s.session_id;

    const shortId = s.session_id.slice(0, 8);
    const model = s.model || 'unknown';
    const totalCalls = Number(s.total_calls) || 0;
    const errorCount = Number(s.error_count) || 0;
    const lastActive = s.last_activity || s.started_at;

    card.innerHTML = `
      <div class="session-card-id">${shortId}</div>
      <div class="session-card-model">${model}</div>
      <div class="session-card-stats">
        <span class="calls">${totalCalls} calls</span>
        ${errorCount > 0 ? `<span class="errors">${errorCount} err</span>` : ''}
      </div>
      <div class="session-card-time">${fmtRelative(lastActive)}</div>`;

    card.addEventListener('click', () => selectSession(s.session_id));
    sessionList.appendChild(card);
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
    if (!state.liveEnabled) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

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
    // Move to top if not already
    const idx = state.sessions.indexOf(session);
    if (idx > 0) {
      state.sessions.splice(idx, 1);
      state.sessions.unshift(session);
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
  await loadSessions();
  connectWs();
})();
