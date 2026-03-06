const fs   = require('fs');
const path = require('path');

const OPENCLAW_CONFIG = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
const DEFAULT_WORKSPACE = path.join(process.env.HOME, '.openclaw', 'workspace');

function parseIdentity(workspacePath) {
  const idFile = path.join(workspacePath, 'IDENTITY.md');
  const result = { name: null, emoji: null };
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

module.exports = { loadAgents, getAgent, getWorkspaceFiles, getFileContent, saveFileContent };
