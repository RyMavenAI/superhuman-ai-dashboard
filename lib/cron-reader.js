const fs = require('fs');
const path = require('path');

const CRON_FILE = path.join(process.env.HOME, '.openclaw/cron/jobs.json');

function readCronFile() {
  try {
    const raw = fs.readFileSync(CRON_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[cron-reader] Error reading cron file:', e.message);
    return { version: 1, jobs: [] };
  }
}

function getCronJobs(agentId) {
  const data = readCronFile();
  let jobs = data.jobs || [];
  if (agentId) jobs = jobs.filter(j => j.agentId === agentId);
  return jobs.map(j => ({
    id: j.id,
    agentId: j.agentId,
    name: j.name,
    enabled: j.enabled,
    schedule: j.schedule,
    scheduleHuman: humanSchedule(j),
    delivery: j.delivery || null,
    state: j.state || {},
    deleteAfterRun: j.deleteAfterRun || false,
    createdAtMs: j.createdAtMs,
    updatedAtMs: j.updatedAtMs,
  }));
}

function toggleCronJob(jobId, enabled) {
  const data = readCronFile();
  const job = (data.jobs || []).find(j => j.id === jobId);
  if (!job) return null;
  job.enabled = !!enabled;
  job.updatedAtMs = Date.now();
  fs.writeFileSync(CRON_FILE, JSON.stringify(data, null, 2), 'utf8');
  return {
    id: job.id,
    agentId: job.agentId,
    name: job.name,
    enabled: job.enabled,
    schedule: job.schedule,
    scheduleHuman: humanSchedule(job),
    delivery: job.delivery || null,
    state: job.state || {},
    updatedAtMs: job.updatedAtMs,
  };
}

function humanSchedule(job) {
  const s = job.schedule;
  if (!s) return '—';

  if (s.kind === 'at') {
    const d = new Date(s.at);
    const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `Once at ${d.toLocaleString('en-GB', opts)}`;
  }

  if (s.kind === 'every') {
    const val = s.value || s.interval || 0;
    const unit = s.unit || 'minutes';
    return `Every ${val} ${unit}`;
  }

  if (s.kind === 'cron') {
    const expr = s.expr || '';
    const tz = s.tz ? ` · ${s.tz}` : '';
    // Try to produce a human-friendly version for simple patterns
    const parts = expr.split(/\s+/);
    if (parts.length === 5) {
      const [min, hour, dom, mon, dow] = parts;
      // Daily at HH:MM
      if (dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(hour) && /^\d+$/.test(min)) {
        const hh = hour.padStart(2, '0');
        const mm = min.padStart(2, '0');
        return `Daily at ${hh}:${mm}${tz}`;
      }
    }
    return `${expr}${tz}`;
  }

  return '—';
}

module.exports = { getCronJobs, toggleCronJob, humanSchedule, CRON_FILE };
