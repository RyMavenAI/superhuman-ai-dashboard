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
  activities: [],        // all loaded activities (oldest first for display)
  selectedId: null,
  liveEnabled: true,
  filterTool: '',
  filterSession: '',
  ws: null,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const feed          = $('feed');
const detailPanel   = $('detail-panel');
const wsBadge       = $('ws-status');
const liveToggle    = $('live-toggle');
const clearBtn      = $('clear-btn');
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
  return `${(ms / 1000).toFixed(1)}s`;
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

// ── Render card ──────────────────────────────────────────────────────────────
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
      <span style="margin-left:auto;font-size:10px;opacity:0.5">${act.session_id?.slice(0, 8) || ''}</span>
    </div>`;

  card.addEventListener('click', () => selectActivity(act.id));
  return card;
}

// ── Render feed ──────────────────────────────────────────────────────────────
function renderFeed(flash_id = null) {
  const filtered = state.activities.filter(a => {
    if (state.filterTool && a.tool_name !== state.filterTool) return false;
    if (state.filterSession && a.session_id !== state.filterSession) return false;
    return true;
  });

  if (!filtered.length) {
    feed.innerHTML = '<div class="empty-state">No activity yet — waiting for Maven to do something…</div>';
    return;
  }

  // Render newest first
  const sorted = [...filtered].reverse();

  // Only re-render all if it's a full refresh (no flash_id)
  if (!flash_id) {
    feed.innerHTML = '';
    sorted.forEach(a => feed.appendChild(makeCard(a)));
  } else {
    // Prepend new card (newest at top)
    const act = state.activities.find(a => a.id === flash_id);
    if (act) {
      const existing = feed.querySelector(`[data-id="${flash_id}"]`);
      if (existing) {
        // Update existing (e.g. result came in)
        existing.replaceWith(makeCard(act, false));
      } else {
        feed.insertBefore(makeCard(act, true), feed.firstChild);
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

// ── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
  const r = await fetch('/api/stats').then(r => r.json());
  $('stat-total').textContent     = r.totalActivities ?? '—';
  $('stat-last-hour').textContent = r.recentActivity ?? '—';
  $('stat-sessions').textContent  = r.totalSessions ?? '—';

  // Build tool filter buttons
  const tools = r.toolBreakdown || [];
  toolFilters.innerHTML = '<button class="filter-btn active" data-tool="">All tools</button>';
  tools.forEach(t => {
    const m = toolMeta(t.tool_name);
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.tool = t.tool_name;
    btn.innerHTML = `${m.icon} ${m.label} <span style="margin-left:auto;font-size:10px;opacity:0.6">${t.count}</span>`;
    btn.addEventListener('click', () => setToolFilter(t.tool_name, btn));
    toolFilters.appendChild(btn);
  });
}

function setToolFilter(tool, btn) {
  state.filterTool = tool;
  toolFilters.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFeed();
}

toolFilters.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  setToolFilter(btn.dataset.tool || '', btn);
});

// ── Sessions ─────────────────────────────────────────────────────────────────
async function loadSessions() {
  const r = await fetch('/api/sessions').then(r => r.json());
  sessionList.innerHTML = '';
  if (!r.sessions?.length) { sessionList.textContent = 'None yet'; return; }
  r.sessions.forEach(s => {
    const el = document.createElement('div');
    el.className = 'session-item';
    el.title = s.session_id;
    el.textContent = s.session_id.slice(0, 8) + '…';
    el.addEventListener('click', () => {
      state.filterSession = state.filterSession === s.session_id ? '' : s.session_id;
      sessionList.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
      if (state.filterSession) el.classList.add('active');
      renderFeed();
    });
    sessionList.appendChild(el);
  });
}

// ── Load initial activities ──────────────────────────────────────────────────
async function loadActivities() {
  const r = await fetch('/api/activities?limit=500').then(r => r.json());
  // API returns newest-first; reverse for our array (oldest first)
  state.activities = (r.activities || []).reverse();
  renderFeed();
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
      const existing = state.activities.findIndex(a => a.tool_call_id === act.tool_call_id);
      if (existing === -1) {
        // Assign a temp negative id for new live entries without DB id yet
        act.id = act.id || Date.now();
        state.activities.push(act);
        renderFeed(act.id);
        if ((state.filterTool === '' || act.tool_name === state.filterTool)) {
          updateStats();
        }
      }
    }

    if (msg.type === 'result_update') {
      const act = state.activities.find(a => a.tool_call_id === msg.toolCallId);
      if (act) {
        act.result   = msg.result;
        act.is_error = msg.isError;
        // Update card
        const card = feed.querySelector(`[data-id="${act.id}"]`);
        if (card) card.replaceWith(makeCard(act, false));
        // Update detail if open
        if (state.selectedId === act.id) {
          $('detail-result').textContent = act.result || '(no result)';
        }
      }
    }
  };
}

function updateStats() {
  $('stat-total').textContent = state.activities.length;
  const hourAgo = Date.now() - 3600000;
  $('stat-last-hour').textContent = state.activities.filter(a => new Date(a.timestamp).getTime() > hourAgo).length;
}

// ── Controls ─────────────────────────────────────────────────────────────────
liveToggle.addEventListener('change', () => { state.liveEnabled = liveToggle.checked; });

clearBtn.addEventListener('click', () => {
  feed.innerHTML = '<div class="empty-state">Feed cleared — live updates still active</div>';
});

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([loadActivities(), loadStats(), loadSessions()]);
  connectWs();
})();
