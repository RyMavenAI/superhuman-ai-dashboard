const EventEmitter = require('events');
const http = require('http');

const GATEWAY_URL = 'http://127.0.0.1:18789/tools/invoke';
const GATEWAY_TOKEN = '202c1d32a3a90ec416b21263fd54d58f5ab0de61b1e443b0';
const POLL_INTERVAL = 30000;

class ContextPoller extends EventEmitter {
  constructor() {
    super();
    this._timer = null;
    this._lastSessions = [];
  }

  start() {
    this._poll();
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL);
    console.log(`[context-poller] Polling every ${POLL_INTERVAL / 1000}s`);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  getSessions() {
    return this._lastSessions;
  }

  _poll() {
    const body = JSON.stringify({
      tool: 'sessions_list',
      args: { limit: 20, messageLimit: 0 },
    });

    const url = new URL(GATEWAY_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const sessions = this._extractSessions(parsed);
          this._lastSessions = sessions;
          this.emit('context_update', sessions);
        } catch (e) {
          console.error('[context-poller] Parse error:', e.message);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[context-poller] Request error:', e.message);
      // Keep last known values — don't clear _lastSessions
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('[context-poller] Request timeout');
    });

    req.write(body);
    req.end();
  }

  _extractSessions(parsed) {
    // The gateway returns result.details.sessions[]
    const details = parsed?.result?.details || parsed?.details || parsed;
    const rawSessions = details?.sessions || [];

    return rawSessions.map(s => {
      const totalTokens = s.totalTokens || 0;
      const contextTokens = s.contextTokens || 0;
      const pct = contextTokens > 0
        ? Math.round((totalTokens / contextTokens) * 100)
        : 0;
      return {
        sessionKey: s.key || s.sessionKey || s.id || '',
        sessionId:  s.sessionId || '',   // UUID e.g. 99af247e-...
        totalTokens,
        contextTokens,
        pct,
        agent: s.agent || s.agentId || 'main',
        model: s.model || '',
      };
    });
  }
}

module.exports = { ContextPoller };
