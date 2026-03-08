const fs   = require('fs');
const path = require('path');

const OPENCLAW_CONFIG = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const DEFAULT_WORKSPACE = path.join(process.env.HOME, '.openclaw', 'workspace');

function parseIdentity(workspacePath) {
  const idFile = path.join(workspacePath, 'IDENTITY.md');
  const result = { name: null, emoji: null, tagline: null };
  try {
    const text = fs.readFileSync(idFile, 'utf-8');
    // Parse "- **Name:** Maven"
    const nameMatch = text.match(/- \*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      result.name = nameMatch[1].trim();
      // Remove markdown/parens leftovers
      if (result.name.startsWith('_') || !result.name) result.name = null;
    }
    // Parse "- **Emoji:** 🧠"
    const emojiMatch = text.match(/- \*\*Emoji:\*\*\s*(.+)/);
    if (emojiMatch) {
      const val = emojiMatch[1].trim();
      // Extract first emoji character (unicode emoji regex)
      const emojiChar = val.match(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/u);
      if (emojiChar) result.emoji = emojiChar[0];
    }
    // Parse "- **Tagline:** Thinking Partner"
    const taglineMatch = text.match(/- \*\*Tagline:\*\*\s*(.+)/);
    if (taglineMatch) {
      const val = taglineMatch[1].trim();
      if (val && !val.startsWith('_')) result.tagline = val;
    }
  } catch {}
  return result;
}

function loadAgents() {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, 'utf-8'));
  } catch {}

  const defaults = config.agents?.defaults || {};
  const agentList = config.agents?.list || [];
  const defaultModel = defaults.model?.primary || 'unknown';

  const agents = [];

  for (const entry of agentList) {
    const id = entry.id;
    const workspace = entry.workspace || defaults.workspace || DEFAULT_WORKSPACE;
    const model = entry.model?.primary || defaultModel;
    const identity = parseIdentity(workspace);

    agents.push({
      id,
      name: entry.name || id,
      displayName: identity.name || entry.name || id,
      emoji: identity.emoji || '🤖',
      tagline: identity.tagline || null,
      workspace,
      agentDir: entry.agentDir || null,
      model: model.replace('anthropic/', ''),
      identity,
    });
  }

  // If 'main' is not in the list, we already have it from the list above (the config has it).
  // But ensure main is always present
  if (!agents.find(a => a.id === 'main')) {
    const workspace = defaults.workspace || DEFAULT_WORKSPACE;
    const identity = parseIdentity(workspace);
    agents.unshift({
      id: 'main',
      name: 'main',
      displayName: identity.name || 'main',
      emoji: identity.emoji || '🤖',
      tagline: identity.tagline || null,
      workspace,
      agentDir: null,
      model: defaultModel.replace('anthropic/', ''),
      identity,
    });
  }

  return agents;
}

function getAgent(agentId) {
  return loadAgents().find(a => a.id === agentId) || null;
}

function getWorkspaceFiles(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  try {
    const entries = fs.readdirSync(agent.workspace, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => e.name)
      .sort();
  } catch { return []; }
}

function getFileContent(agentId, filename) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  // Path traversal protection
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null;
  if (!filename.endsWith('.md')) return null;
  try {
    return fs.readFileSync(path.join(agent.workspace, filename), 'utf-8');
  } catch { return null; }
}

function saveFileContent(agentId, filename, content) {
  const agent = getAgent(agentId);
  if (!agent) return { ok: false, error: 'Agent not found' };
  // Path traversal protection
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return { ok: false, error: 'Invalid filename' };
  }
  if (!filename.endsWith('.md')) {
    return { ok: false, error: 'Only .md files allowed' };
  }
  try {
    fs.writeFileSync(path.join(agent.workspace, filename), content, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Docs (recursive scan of workspace/docs/) ──────────────────────────────────

function getDocFiles(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  const docsDir = path.join(agent.workspace, 'docs');
  if (!fs.existsSync(docsDir)) return [];
  const results = [];
  function scan(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        scan(path.join(dir, e.name), relPath);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        results.push(relPath);
      }
    }
  }
  scan(docsDir, '');
  return results.sort();
}

function getDocContent(agentId, relPath) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  // Path traversal protection
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) return null;
  const docsDir = path.join(agent.workspace, 'docs');
  const fullPath = path.join(docsDir, relPath);
  // Ensure resolved path is inside docsDir
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(docsDir) + path.sep)) return null;
  if (!resolved.endsWith('.md')) return null;
  try {
    return fs.readFileSync(resolved, 'utf-8');
  } catch { return null; }
}

// ── Memory files (workspace/memory/*.md + workspace/MEMORY.md) ─────────────

function getMemoryFiles(agentId) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  const results = [];

  // Check for root MEMORY.md (pinned)
  const memoryMd = path.join(agent.workspace, 'MEMORY.md');
  try {
    const stat = fs.statSync(memoryMd);
    if (stat.isFile()) {
      results.push({ filename: 'MEMORY.md', agentId, mtime: stat.mtime.toISOString() });
    }
  } catch {}

  // Scan workspace/memory/*.md
  const memDir = path.join(agent.workspace, 'memory');
  try {
    const entries = fs.readdirSync(memDir, { withFileTypes: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .map(e => {
        const stat = fs.statSync(path.join(memDir, e.name));
        return { filename: `memory/${e.name}`, agentId, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename));
    results.push(...mdFiles);
  } catch {}

  return results;
}

function getMemoryContent(agentId, filename) {
  const agent = getAgent(agentId);
  if (!agent) return null;
  // Only allow MEMORY.md or memory/<name>.md
  if (filename === 'MEMORY.md') {
    try {
      return fs.readFileSync(path.join(agent.workspace, 'MEMORY.md'), 'utf-8');
    } catch { return null; }
  }
  if (/^memory\/[^/\\]+\.md$/.test(filename) && !filename.includes('..')) {
    const fullPath = path.join(agent.workspace, filename);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(path.join(agent.workspace, 'memory')) + path.sep)) return null;
    try {
      return fs.readFileSync(resolved, 'utf-8');
    } catch { return null; }
  }
  return null;
}

module.exports = { loadAgents, getAgent, getWorkspaceFiles, getFileContent, saveFileContent, getDocFiles, getDocContent, getMemoryFiles, getMemoryContent };
