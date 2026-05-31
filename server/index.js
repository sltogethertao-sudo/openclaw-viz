import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { watch } from 'chokidar';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OPENCLAW_HOME = resolve(process.env.HOME || '/root', '.openclaw');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// In production, serve the built client
const clientDist = join(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ─── Data Collectors ────────────────────────────────────────────────

function readJSON(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) { /* ignore */ }
  return null;
}

function getSessions() {
  const sessionsFile = join(OPENCLAW_HOME, 'agents/main/sessions/sessions.json');
  const data = readJSON(sessionsFile);
  if (!data) return [];

  return Object.entries(data).map(([key, s]) => {
    const isActive = Date.now() - (s.updatedAt || 0) < 300000; // 5 min
    const isRecent = Date.now() - (s.updatedAt || 0) < 3600000; // 1 hour

    let status = 'idle';
    if (isActive) status = 'active';
    else if (!isRecent) status = 'stale';

    // Parse session key for metadata
    // Format: agent:main:main | agent:main:feishu:direct:xxx | agent:main:heartbeat | agent:main:dreaming-xxx
    const parts = key.split(':');
    const agentId = parts[1] || 'unknown';
    let channel = s.lastChannel || parts[2] || 'unknown';
    let sessionType = s.chatType || 'direct';
    
    // Fix channel for special sessions
    if (key.includes('heartbeat')) channel = 'internal';
    if (key.includes('dreaming')) channel = 'internal';
    if (key.includes('cron')) channel = 'cron';

    return {
      key,
      sessionId: s.sessionId,
      agentId,
      channel,
      sessionType,
      chatType: s.chatType || 'direct',
      lastChannel: s.lastChannel || 'unknown',
      status,
      model: s.model || 'default',
      totalTokens: s.totalTokens || 0,
      inputTokens: s.inputTokens || 0,
      outputTokens: s.outputTokens || 0,
      estimatedCost: s.estimatedCostUsd || 0,
      updatedAt: s.updatedAt,
      lastInteractionAt: s.lastInteractionAt,
      sessionStartedAt: s.sessionStartedAt,
      compactionCount: s.compactionCount || 0,
      skillsCount: s.skillsSnapshot?.skills?.length || 0,
      // Module context (extracted from key)
      module: extractModule(key),
    };
  });
}

function extractModule(sessionKey) {
  const k = sessionKey.toLowerCase();
  if (k.includes('heartbeat')) return 'Heartbeat';
  if (k.includes('dreaming') || k.includes('dream')) return 'Dreaming';
  if (k.includes('cron')) return 'Cron';
  if (k.includes('feishu')) return 'Feishu';
  if (k.includes('task') || k.includes('taskflow')) return 'Tasks';
  if (k.includes('group')) return 'GroupChat';
  if (k.includes('direct')) return 'DirectChat';
  return 'Main';
}

function getSubAgents() {
  try {
    // Read from active processes
    const output = execSync('ps aux | grep -E "openclaw|node.*agent" | grep -v grep', {
      timeout: 3000,
      encoding: 'utf8',
    }).trim();
    
    if (!output) return [];
    
    return output.split('\n').filter(Boolean).map((line, i) => {
      const parts = line.split(/\s+/);
      return {
        pid: parts[1],
        cpu: parseFloat(parts[2]) || 0,
        mem: parseFloat(parts[3]) || 0,
        command: parts.slice(10).join(' ').substring(0, 100),
        status: 'running',
      };
    }).filter(p => p.command.includes('agent') || p.command.includes('openclaw'));
  } catch {
    return [];
  }
}

function getCronJobs() {
  const jobsFile = join(OPENCLAW_HOME, 'cron/jobs.json');
  const data = readJSON(jobsFile);
  if (!data?.jobs) return [];

  return data.jobs.map(j => ({
    id: j.id,
    name: j.name,
    description: j.description,
    enabled: j.enabled,
    schedule: j.schedule,
    sessionTarget: j.sessionTarget,
    payload: j.payload,
    delivery: j.delivery,
    status: j.enabled ? 'active' : 'disabled',
    createdAt: j.createdAtMs,
  }));
}

function getCronRuns() {
  try {
    const runsDir = join(OPENCLAW_HOME, 'cron/runs');
    if (!existsSync(runsDir)) return [];
    
    const files = readdirSync(runsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20);
    
    return files.map(f => readJSON(join(runsDir, f))).filter(Boolean);
  } catch {
    return [];
  }
}

function getGatewayLogs() {
  try {
    const output = execSync(
      'journalctl --user -u openclaw-gateway --no-pager -n 50 --output=json 2>/dev/null || echo "[]"',
      { timeout: 5000, encoding: 'utf8' }
    ).trim();

    if (output === '[]' || !output) return [];

    return output.split('\n').filter(Boolean).map(line => {
      try {
        const entry = JSON.parse(line);
        const msg = entry.MESSAGE || '';
        let level = 'info';
        if (msg.includes('error') || msg.includes('Error')) level = 'error';
        else if (msg.includes('warn')) level = 'warn';
        else if (msg.includes('debug')) level = 'debug';

        return {
          timestamp: entry.__REALTIME_TIMESTAMP
            ? new Date(parseInt(entry.__REALTIME_TIMESTAMP) / 1000).toISOString()
            : new Date().toISOString(),
          message: msg,
          level,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function getSessionHistory(sessionKey) {
  try {
    const sessionsFile = join(OPENCLAW_HOME, 'agents/main/sessions/sessions.json');
    const data = readJSON(sessionsFile);
    if (!data || !data[sessionKey]) return [];

    const sessionPath = data[sessionKey].sessionFile;
    if (!sessionPath || !existsSync(sessionPath)) return [];

    const content = readFileSync(sessionPath, 'utf8');
    const lines = content.trim().split('\n');
    const messages = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // OpenClaw JSONL format: { type: "message", message: { role, content, ... } }
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message;
          let textContent = '';
          const toolCalls = [];
          
          if (typeof msg.content === 'string') {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            // Content blocks: text, thinking, toolCall, tool_result
            for (const block of msg.content) {
              if (block.type === 'text') {
                textContent += (textContent ? '\n' : '') + (block.text || '');
              } else if (block.type === 'toolCall' || block.type === 'tool_use') {
                toolCalls.push(block.name || block.tool || 'unknown');
              } else if (block.type === 'tool_result') {
                const ct = block.content || '';
                textContent += (textContent ? '\n' : '') + 
                  (typeof ct === 'string' ? ct.substring(0, 200) : JSON.stringify(ct).substring(0, 200));
              }
            }
          }

          // Normalize role names
          let role = msg.role || 'unknown';
          if (role === 'toolResult') role = 'tool';

          messages.push({
            role,
            content: textContent.substring(0, 500),
            timestamp: entry.timestamp || msg.timestamp,
            toolCalls,
            model: msg.model || null,
          });
        }
        
        // Handle custom_message (runtime context, etc.)
        if (entry.type === 'custom_message' && entry.content) {
          // Skip internal context messages - too noisy
        }
      } catch { /* skip malformed lines */ }
    }

    return messages.slice(-50); // Last 50 messages
  } catch {
    return [];
  }
}

function getAgentTopology() {
  const sessions = getSessions();
  const cronJobs = getCronJobs();

  // Group sessions by module
  const moduleGroups = {};
  sessions.forEach(s => {
    const mod = s.module || 'Other';
    if (!moduleGroups[mod]) moduleGroups[mod] = [];
    moduleGroups[mod].push(s);
  });

  // Build nodes - module-level aggregation for cleaner graph
  const nodes = [
    {
      id: 'agent:main',
      type: 'agent',
      label: 'Main Agent',
      sublabel: 'Trori 🌀',
      status: 'active',
      module: 'Core',
      model: 'deepseek-v4-flash',
      tokens: sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0),
    },
  ];

  // For each module, show top 3 most recent sessions + aggregated node
  const MAX_VISIBLE_PER_MODULE = 3;
  const visibleSessionKeys = new Set();

  Object.entries(moduleGroups).forEach(([mod, modSessions]) => {
    // Sort by last interaction (most recent first)
    const sorted = modSessions.sort((a, b) => (b.lastInteractionAt || 0) - (a.lastInteractionAt || 0));
    
    // Show top N as individual nodes
    const visible = sorted.slice(0, MAX_VISIBLE_PER_MODULE);
    const hidden = sorted.slice(MAX_VISIBLE_PER_MODULE);

    visible.forEach(s => {
      visibleSessionKeys.add(s.key);
      nodes.push({
        id: `session:${s.key}`,
        type: 'session',
        label: s.module,
        sublabel: s.lastChannel !== 'unknown' ? s.lastChannel : s.chatType,
        status: s.status,
        module: s.module,
        channel: s.lastChannel,
        chatType: s.chatType,
        tokens: s.totalTokens,
        cost: s.estimatedCost,
      });
    });

    // Add aggregated node for hidden sessions
    if (hidden.length > 0) {
      const totalTokens = hidden.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
      const activeCount = hidden.filter(s => s.status === 'active').length;
      nodes.push({
        id: `module:${mod}`,
        type: 'module',
        label: `${mod}`,
        sublabel: `+${hidden.length} sessions`,
        status: activeCount > 0 ? 'active' : 'idle',
        module: mod,
        tokens: totalTokens,
        sessionCount: hidden.length,
      });
    }
  });

  // Add cron job nodes
  cronJobs.forEach(j => {
    nodes.push({
      id: `cron:${j.id}`,
      type: 'cron',
      label: j.name,
      sublabel: j.schedule?.expr || 'manual',
      status: j.status,
      module: 'Scheduler',
    });
  });

  // Build edges
  const edges = [];
  
  // Main agent connects to module aggregated nodes and visible sessions
  const connectedModules = new Set();
  
  sessions.forEach(s => {
    if (visibleSessionKeys.has(s.key)) {
      edges.push({
        source: 'agent:main',
        target: `session:${s.key}`,
        type: 'manages',
        label: 'runs',
      });
    }
    connectedModules.add(s.module);
  });

  // Connect module aggregated nodes to main agent
  connectedModules.forEach(mod => {
    if (nodes.find(n => n.id === `module:${mod}`)) {
      edges.push({
        source: 'agent:main',
        target: `module:${mod}`,
        type: 'manages',
        label: `${moduleGroups[mod]?.length || 0} sessions`,
      });
    }
  });

  // Cron jobs connect to main agent
  cronJobs.forEach(j => {
    edges.push({
      source: `cron:${j.id}`,
      target: 'agent:main',
      type: 'triggers',
      label: 'schedules',
    });
  });

  // Cross-module relationships
  const feishuGroup = moduleGroups['Feishu'] || [];
  const directGroup = moduleGroups['DirectChat'] || [];
  if (feishuGroup.length > 0 && directGroup.length > 0) {
    edges.push({
      source: nodes.find(n => n.id === 'module:Feishu') ? 'module:Feishu' : `session:${feishuGroup[0].key}`,
      target: nodes.find(n => n.id === 'module:DirectChat') ? 'module:DirectChat' : `session:${directGroup[0].key}`,
      type: 'related',
      label: 'shared user',
    });
  }

  return { nodes, edges, stats: {
    totalSessions: sessions.length,
    visibleSessions: visibleSessionKeys.size,
    modules: Object.keys(moduleGroups).length,
  }};
}

function getSystemStats() {
  try {
    const uptime = execSync('uptime -p', { encoding: 'utf8' }).trim();
    const memInfo = execSync("free -m | awk '/Mem:/{print $3\"/\"$2}'", { encoding: 'utf8' }).trim();
    const cpuLoad = execSync("cat /proc/loadavg | awk '{print $1}'", { encoding: 'utf8' }).trim();
    const diskUsage = execSync("df -h / | awk 'NR==2{print $3\"/\"$2}'", { encoding: 'utf8' }).trim();

    return {
      uptime,
      memory: memInfo,
      cpuLoad,
      diskUsage,
      nodeVersion: process.version,
      openclawVersion: '2026.5.7',
    };
  } catch {
    return {};
  }
}

// ─── API Routes ─────────────────────────────────────────────────────

app.get('/api/topology', (req, res) => {
  res.json(getAgentTopology());
});

app.get('/api/sessions', (req, res) => {
  res.json(getSessions());
});

app.get('/api/sessions/:key/history', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  res.json(getSessionHistory(key));
});

app.get('/api/subagents', (req, res) => {
  res.json(getSubAgents());
});

app.get('/api/cron', (req, res) => {
  res.json({ jobs: getCronJobs(), runs: getCronRuns() });
});

app.get('/api/logs', (req, res) => {
  res.json(getGatewayLogs());
});

app.get('/api/stats', (req, res) => {
  res.json(getSystemStats());
});

// Human intervention - send message to session
app.post('/api/intervene/message', (req, res) => {
  const { sessionKey, message } = req.body;
  if (!sessionKey || !message) {
    return res.status(400).json({ error: 'sessionKey and message required' });
  }
  
  try {
    // Use openclaw CLI to send message
    const escaped = message.replace(/'/g, "'\\''");
    execSync(`openclaw sessions send '${sessionKey}' '${escaped}'`, {
      timeout: 10000,
      encoding: 'utf8',
    });
    res.json({ success: true, message: 'Message sent' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Human intervention - steer sub-agent
app.post('/api/intervene/steer', (req, res) => {
  const { target, message } = req.body;
  if (!target || !message) {
    return res.status(400).json({ error: 'target and message required' });
  }

  try {
    const escaped = message.replace(/'/g, "'\\''");
    execSync(`openclaw subagents steer '${target}' '${escaped}'`, {
      timeout: 10000,
      encoding: 'utf8',
    });
    res.json({ success: true, message: 'Steer command sent' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Human intervention - kill sub-agent
app.post('/api/intervene/kill', (req, res) => {
  const { target } = req.body;
  if (!target) {
    return res.status(400).json({ error: 'target required' });
  }

  try {
    execSync(`openclaw subagents kill '${target}'`, {
      timeout: 10000,
      encoding: 'utf8',
    });
    res.json({ success: true, message: 'Agent terminated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── V1.1: Search & Filter ─────────────────────────────────────────

app.get('/api/sessions/search', (req, res) => {
  const { q, module, status, channel, sort = 'recent' } = req.query;
  let sessions = getSessions();

  // Text search (fuzzy match on key, module, channel)
  if (q) {
    const query = q.toLowerCase();
    sessions = sessions.filter(s => 
      s.key.toLowerCase().includes(query) ||
      s.module.toLowerCase().includes(query) ||
      s.lastChannel.toLowerCase().includes(query) ||
      s.chatType.toLowerCase().includes(query)
    );
  }

  // Filters
  if (module) {
    const mods = module.split(',');
    sessions = sessions.filter(s => mods.includes(s.module));
  }
  if (status) {
    const statuses = status.split(',');
    sessions = sessions.filter(s => statuses.includes(s.status));
  }
  if (channel) {
    const channels = channel.split(',');
    sessions = sessions.filter(s => channels.includes(s.lastChannel));
  }

  // Sort
  if (sort === 'recent') {
    sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } else if (sort === 'tokens') {
    sessions.sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));
  } else if (sort === 'cost') {
    sessions.sort((a, b) => (b.estimatedCost || 0) - (a.estimatedCost || 0));
  } else if (sort === 'name') {
    sessions.sort((a, b) => a.module.localeCompare(b.module));
  }

  // Summary stats
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  const totalCost = sessions.reduce((sum, s) => sum + (s.estimatedCost || 0), 0);
  const moduleBreakdown = {};
  sessions.forEach(s => {
    if (!moduleBreakdown[s.module]) moduleBreakdown[s.module] = { count: 0, tokens: 0, cost: 0 };
    moduleBreakdown[s.module].count++;
    moduleBreakdown[s.module].tokens += s.totalTokens || 0;
    moduleBreakdown[s.module].cost += s.estimatedCost || 0;
  });

  res.json({
    sessions,
    meta: {
      total: sessions.length,
      totalTokens,
      totalCost,
      moduleBreakdown,
    },
  });
});

// ─── V1.1: Cron Management ─────────────────────────────────────────

app.get('/api/cron/jobs', (req, res) => {
  res.json({ jobs: getCronJobs(), runs: getCronRuns() });
});

app.post('/api/cron/jobs/:id/toggle', (req, res) => {
  const { id } = req.params;
  const jobsFile = join(OPENCLAW_HOME, 'cron/jobs.json');
  const data = readJSON(jobsFile);
  if (!data || !data.jobs) {
    return res.status(404).json({ error: 'No cron jobs found' });
  }

  const job = data.jobs.find(j => j.id === id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.enabled = !job.enabled;

  try {
    writeFileSync(jobsFile, JSON.stringify(data, null, 2));
    res.json({ success: true, enabled: job.enabled, job: job.name });
  } catch (e) {
    // If write fails, try using openclaw CLI
    try {
      const state = job.enabled ? 'enable' : 'disable';
      execSync(`openclaw cron update '${id}' '{"enabled": ${job.enabled}}'`, { timeout: 10000 });
      res.json({ success: true, enabled: job.enabled, job: job.name });
    } catch (e2) {
      res.status(500).json({ error: e2.message });
    }
  }
});

app.post('/api/cron/jobs/:id/run', (req, res) => {
  const { id } = req.params;
  try {
    execSync(`openclaw cron run '${id}'`, { timeout: 10000, encoding: 'utf8' });
    res.json({ success: true, message: 'Job triggered' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── V1.1: Agent Performance Metrics ────────────────────────────────

app.get('/api/metrics', (req, res) => {
  const sessions = getSessions();
  const logs = getGatewayLogs();

  // Calculate per-module metrics
  const moduleMetrics = {};
  sessions.forEach(s => {
    const mod = s.module;
    if (!moduleMetrics[mod]) {
      moduleMetrics[mod] = {
        module: mod,
        sessionCount: 0,
        totalTokens: 0,
        totalCost: 0,
        avgTokensPerSession: 0,
        activeCount: 0,
        lastActive: null,
      };
    }
    moduleMetrics[mod].sessionCount++;
    moduleMetrics[mod].totalTokens += s.totalTokens || 0;
    moduleMetrics[mod].totalCost += s.estimatedCost || 0;
    if (s.status === 'active') moduleMetrics[mod].activeCount++;
    const lastActive = s.lastInteractionAt || s.updatedAt;
    if (lastActive && (!moduleMetrics[mod].lastActive || lastActive > moduleMetrics[mod].lastActive)) {
      moduleMetrics[mod].lastActive = lastActive;
    }
  });

  Object.values(moduleMetrics).forEach(m => {
    m.avgTokensPerSession = m.sessionCount > 0 ? Math.round(m.totalTokens / m.sessionCount) : 0;
  });

  // Error rate from logs
  const errorLogs = logs.filter(l => l.level === 'error');
  const totalLogs = logs.length;
  const errorRate = totalLogs > 0 ? ((errorLogs.length / totalLogs) * 100).toFixed(1) : 0;

  // Token trend (last 24h buckets)
  const now = Date.now();
  const hourlyTokens = {};
  sessions.forEach(s => {
    if (s.updatedAt) {
      const hour = new Date(s.updatedAt).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      if (!hourlyTokens[hour]) hourlyTokens[hour] = 0;
      hourlyTokens[hour] += s.totalTokens || 0;
    }
  });

  // Response time estimation from logs
  const responseTimes = [];
  const logMessages = logs.map(l => l.message);
  logMessages.forEach(msg => {
    const match = msg.match(/(\d+)ms/);
    if (match) responseTimes.push(parseInt(match[1]));
  });
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  res.json({
    overview: {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      totalTokens: sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0),
      totalCost: sessions.reduce((sum, s) => sum + (s.estimatedCost || 0), 0),
      errorRate: parseFloat(errorRate),
      avgResponseTime: avgResponseTime,
      moduleCount: Object.keys(moduleMetrics).length,
    },
    modules: Object.values(moduleMetrics).sort((a, b) => b.totalTokens - a.totalTokens),
    hourlyTokens,
    recentErrors: errorLogs.slice(-10),
  });
});

// ─── V1.1: Session Export ───────────────────────────────────────────

app.get('/api/sessions/:key/export', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const format = req.query.format || 'json'; // json or markdown
  const history = getSessionHistory(key);
  const sessions = getSessions();
  const session = sessions.find(s => s.key === key);

  if (format === 'markdown') {
    let md = `# Session Export: ${session?.module || key}\n\n`;
    md += `**Channel:** ${session?.lastChannel || 'N/A'}\n`;
    md += `**Type:** ${session?.chatType || 'N/A'}\n`;
    md += `**Tokens:** ${session?.totalTokens?.toLocaleString() || 'N/A'}\n`;
    md += `**Exported:** ${new Date().toISOString()}\n\n`;
    md += `---\n\n`;

    history.forEach(msg => {
      const roleLabel = msg.role === 'assistant' ? '🤖 Assistant' : msg.role === 'user' ? '👤 User' : '🔧 Tool';
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
      md += `### ${roleLabel} ${time}\n\n`;
      if (msg.content) {
        md += `${msg.content}\n\n`;
      }
      if (msg.toolCalls?.length > 0) {
        md += `**Tools:** ${msg.toolCalls.join(', ')}\n\n`;
      }
      md += `---\n\n`;
    });

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="session-${session?.module || 'export'}.md"`);
    res.send(md);
  } else {
    res.json({
      session: session || { key },
      history,
      exportedAt: new Date().toISOString(),
      messageCount: history.length,
    });
  }
});

// ─── V2.0: Project Structure & Dependencies ─────────────────────────

const WORKSPACE = resolve(process.env.HOME || '/root', '.openclaw/workspace');

function getProjectStructure() {
  const projectsDir = join(WORKSPACE, 'Projects');
  if (!existsSync(projectsDir)) return { projects: [], dependencies: [] };

  const projects = [];
  const dependencies = [];

  try {
    const dirs = readdirSync(projectsDir).filter(d => {
      const full = join(projectsDir, d);
      return statSync(full).isDirectory() && d !== 'node_modules';
    });

    dirs.forEach(dir => {
      const projPath = join(projectsDir, dir);
      const files = [];
      const subDirs = [];

      try {
        const entries = readdirSync(projPath);
        entries.forEach(e => {
          if (e === 'node_modules' || e === '__pycache__' || e === '.git') return;
          const full = join(projPath, e);
          try {
            const st = statSync(full);
            if (st.isDirectory()) {
              subDirs.push(e);
            } else {
              files.push(e);
            }
          } catch {}
        });
      } catch {}

      // Detect project type
      let type = 'unknown';
      if (files.includes('package.json')) type = 'node';
      else if (files.includes('requirements.txt') || files.includes('setup.py')) type = 'python';
      else if (files.includes('tsconfig.json')) type = 'typescript';
      else if (files.some(f => f.endsWith('.py'))) type = 'python';
      else if (files.some(f => f.endsWith('.md'))) type = 'docs';

      // Detect tech stack from files
      const tech = [];
      if (files.includes('package.json')) {
        try {
          const pkg = JSON.parse(readFileSync(join(projPath, 'package.json'), 'utf8'));
          const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          Object.keys(allDeps).forEach(d => {
            if (['react', 'vue', 'express', 'd3', 'vite', 'tailwindcss'].includes(d)) tech.push(d);
          });
        } catch {}
      }
      if (files.includes('requirements.txt')) {
        try {
          const req = readFileSync(join(projPath, 'requirements.txt'), 'utf8');
          ['numpy', 'pandas', 'torch', 'tensorflow', 'flask', 'fastapi'].forEach(lib => {
            if (req.includes(lib)) tech.push(lib);
          });
        } catch {}
      }

      // Get file count and size
      let totalFiles = 0;
      let totalSize = 0;
      function countFiles(dirPath) {
        try {
          readdirSync(dirPath).forEach(e => {
            if (e === 'node_modules' || e === '__pycache__' || e === '.git') return;
            const full = join(dirPath, e);
            try {
              const st = statSync(full);
              if (st.isDirectory()) countFiles(full);
              else { totalFiles++; totalSize += st.size; }
            } catch {}
          });
        } catch {}
      }
      countFiles(projPath);

      projects.push({
        name: dir,
        type,
        tech,
        files: totalFiles,
        size: totalSize,
        subDirs,
        topFiles: files.slice(0, 10),
        status: detectProjectStatus(dir),
      });
    });

    // Infer dependencies between projects
    const projectNames = projects.map(p => p.name);
    projects.forEach(proj => {
      // Check if project references other projects
      projectNames.forEach(other => {
        if (other === proj.name) return;
        // Check config files or imports
        const configPath = join(projectsDir, proj.name);
        try {
          const allContent = readdirSync(configPath)
            .filter(f => ['package.json', 'requirements.txt', 'README.md', 'config.py', 'path_config.py'].includes(f))
            .map(f => {
              try { return readFileSync(join(configPath, f), 'utf8'); } catch { return ''; }
            }).join('\n');
          if (allContent.includes(other)) {
            dependencies.push({ from: proj.name, to: other, type: 'references' });
          }
        } catch {}
      });
    });

    // Known relationships
    dependencies.push({ from: '多维度记忆', to: '智能检索算法', type: 'evolved_into' });
    dependencies.push({ from: '智能检索算法', to: '智能检索工具', type: 'evolved_into' });
    dependencies.push({ from: '多维度记忆', to: '容纳百川', type: 'shares_code' });
    dependencies.push({ from: '自动化工具', to: '多维度记忆', type: 'automates' });
    dependencies.push({ from: 'openclaw-viz', to: '自动化工具', type: 'monitors' });

  } catch (e) {
    console.error('Project scan error:', e.message);
  }

  return { projects, dependencies };
}

function detectProjectStatus(name) {
  // Check git status or recent file modification
  const projPath = join(WORKSPACE, 'Projects', name);
  try {
    const gitDir = join(projPath, '.git');
    if (existsSync(gitDir)) return 'tracked';
  } catch {}
  return 'active';
}

// ─── V2.0: Timeline Extraction ──────────────────────────────────────

function getProjectTimeline() {
  const memoryFile = join(WORKSPACE, 'MEMORY.md');
  const milestones = [];
  const projects = [];

  // Parse MEMORY.md
  if (existsSync(memoryFile)) {
    const content = readFileSync(memoryFile, 'utf8');

    // Extract milestones: ### [DATE] Title
    const milestoneRe = /###\s+\[([^\]]+)\]\s+(.+?)(?:\n)/g;
    let m;
    while ((m = milestoneRe.exec(content)) !== null) {
      let dateStr = m[1].trim().split(/\s+/)[0]; // Take just date part
      let title = m[2].trim().replace(/#\w+/g, '').trim();
      
      // Find status in next 300 chars
      const section = content.substring(m.index, m.index + 500);
      const statusMatch = section.match(/\*\*状态:\*\*\s*(\S+)/);
      const status = statusMatch ? statusMatch[1] : 'active';
      
      const typeMatch = section.match(/\*\*类型:\*\*\s*(\S+)/);
      const type = typeMatch ? typeMatch[1] : 'milestone';

      milestones.push({ date: dateStr, title, status, type });
    }

    // Extract project tracking sections
    const projRe = /###\s+(.+?)\s+#.*?\n\*\*状态:\*\*\s*(\S+).*?\n(?:\*\*开始日期:\*\*\s*(\S+))?/g;
    while ((m = projRe.exec(content)) !== null) {
      const name = m[1].trim().replace(/\[.*?\]\s*/, '');
      projects.push({
        name,
        status: m[2],
        startDate: m[3] || null,
      });
    }
  }

  // Parse daily memory files for additional events
  const memoryDir = join(WORKSPACE, 'memory');
  const dailyEvents = [];
  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir)
        .filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
        .sort();
      
      files.forEach(f => {
        const date = f.replace('.md', '');
        try {
          const content = readFileSync(join(memoryDir, f), 'utf8');
          const lines = content.split('\n').length;
          // Extract key decisions/events from headers
          const headers = content.match(/^##\s+.+$/gm) || [];
          const keyEvents = headers.map(h => h.replace(/^##\s+/, '').trim()).slice(0, 3);
          
          dailyEvents.push({
            date,
            lineCount: lines,
            events: keyEvents,
            hasMilestones: content.includes('milestone') || content.includes('完成'),
          });
        } catch {}
      });
    } catch {}
  }

  // Build Gantt-style project data
  const projectGantt = buildGanttData(projects, milestones, dailyEvents);

  return {
    milestones: milestones.sort((a, b) => a.date.localeCompare(b.date)),
    projects,
    dailyEvents,
    gantt: projectGantt,
    activityHeatmap: buildActivityHeatmap(dailyEvents),
  };
}

function buildGanttData(projects, milestones, dailyEvents) {
  // Group milestones by approximate project
  const projectMap = {};
  
  const knownProjects = [
    { name: '记忆系统', start: '2026-03-23', end: '2026-04-06', status: 'completed', color: '#6366f1' },
    { name: '智能检索', start: '2026-04-07', end: '2026-04-11', status: 'completed', color: '#10b981' },
    { name: '容纳百川', start: '2026-04-14', end: null, status: 'active', color: '#f59e0b' },
    { name: '铜氧研究', start: '2026-04-02', end: null, status: 'active', color: '#ef4444' },
    { name: '深度思考', start: '2026-04-17', end: null, status: 'active', color: '#8b5cf6' },
    { name: 'Dreaming', start: '2026-05-01', end: null, status: 'active', color: '#ec4899' },
    { name: 'OpenClaw Viz', start: '2026-05-24', end: null, status: 'active', color: '#0ea5e9' },
  ];

  knownProjects.forEach(p => {
    const projMilestones = milestones.filter(m => {
      if (!p.end) return m.date >= p.start;
      return m.date >= p.start && m.date <= p.end;
    });
    
    projectMap[p.name] = {
      ...p,
      milestones: projMilestones,
      duration: p.end 
        ? Math.ceil((new Date(p.end) - new Date(p.start)) / 86400000)
        : Math.ceil((Date.now() - new Date(p.start).getTime()) / 86400000),
    };
  });

  return Object.values(projectMap);
}

function buildActivityHeatmap(dailyEvents) {
  const heatmap = {};
  dailyEvents.forEach(d => {
    // Group by week
    const date = new Date(d.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().substring(0, 10);
    
    if (!heatmap[weekKey]) heatmap[weekKey] = { week: weekKey, activity: 0, days: 0 };
    heatmap[weekKey].activity += d.lineCount;
    heatmap[weekKey].days++;
  });
  return Object.values(heatmap).sort((a, b) => a.week.localeCompare(b.week));
}

// ─── V2.0: Task Flow ────────────────────────────────────────────────

function getTaskFlow() {
  const sessions = getSessions();
  const cronJobs = getCronJobs();
  const cronRuns = getCronRuns();

  // Build task pipeline from sessions and cron
  const tasks = [];
  const connections = [];

  // Cron jobs as source tasks
  cronJobs.forEach(job => {
    tasks.push({
      id: `cron:${job.id}`,
      type: 'cron',
      name: job.name,
      status: job.enabled ? 'scheduled' : 'disabled',
      schedule: job.schedule?.expr,
      lastRun: null,
      nextRun: estimateNextRun(job.schedule?.expr),
    });
  });

  // Active sessions as running tasks
  sessions.filter(s => s.status === 'active').forEach(s => {
    tasks.push({
      id: `session:${s.key}`,
      type: 'session',
      name: `${s.module} (${s.lastChannel})`,
      status: 'running',
      tokens: s.totalTokens,
      cost: s.estimatedCost,
    });
  });

  // Recent completed sessions
  sessions
    .filter(s => s.status === 'idle' && s.updatedAt > Date.now() - 86400000)
    .slice(0, 10)
    .forEach(s => {
      tasks.push({
        id: `session:${s.key}`,
        type: 'session',
        name: `${s.module} (${s.lastChannel})`,
        status: 'completed',
        tokens: s.totalTokens,
        cost: s.estimatedCost,
        completedAt: s.updatedAt,
      });
    });

  // Connections: cron -> triggered sessions
  cronJobs.forEach(job => {
    const relatedSessions = sessions.filter(s => 
      s.module.toLowerCase().includes((job.name || '').toLowerCase().split(' ')[0])
    );
    relatedSessions.slice(0, 3).forEach(s => {
      connections.push({
        from: `cron:${job.id}`,
        to: `session:${s.key}`,
        type: 'triggers',
      });
    });
  });

  // Pipeline stages
  const stages = [
    { id: 'input', label: 'Input', tasks: tasks.filter(t => t.type === 'cron') },
    { id: 'processing', label: 'Processing', tasks: tasks.filter(t => t.status === 'running') },
    { id: 'completed', label: 'Completed', tasks: tasks.filter(t => t.status === 'completed') },
  ];

  return { tasks, connections, stages };
}

function estimateNextRun(cronExpr) {
  if (!cronExpr) return null;
  // Simple: return next occurrence hint
  return `Next: ${cronExpr}`;
}

// ─── V2.0: Smart Alerts ─────────────────────────────────────────────

function getSmartAlerts() {
  const sessions = getSessions();
  const logs = getGatewayLogs();
  const alerts = [];

  // 1. Error spike detection
  const errorLogs = logs.filter(l => l.level === 'error');
  const recentErrors = errorLogs.filter(l => {
    const t = new Date(l.timestamp).getTime();
    return Date.now() - t < 3600000; // Last hour
  });
  if (recentErrors.length > 3) {
    alerts.push({
      id: 'error-spike',
      severity: 'high',
      type: 'error_spike',
      title: 'Error Spike Detected',
      message: `${recentErrors.length} errors in the last hour (threshold: 3)`,
      details: recentErrors.slice(0, 3).map(e => e.message?.substring(0, 100)),
      timestamp: Date.now(),
      actionable: true,
      action: 'Check logs and model configuration',
    });
  }

  // 2. Stale session detection
  const staleSessions = sessions.filter(s => 
    s.status === 'stale' && s.module !== 'Dreaming' && s.module !== 'Heartbeat'
  );
  if (staleSessions.length > 5) {
    alerts.push({
      id: 'stale-sessions',
      severity: 'medium',
      type: 'stale_sessions',
      title: 'Many Stale Sessions',
      message: `${staleSessions.length} sessions haven't been active in over 1 hour`,
      details: staleSessions.slice(0, 5).map(s => s.key),
      timestamp: Date.now(),
      actionable: true,
      action: 'Consider cleaning up or reactivating sessions',
    });
  }

  // 3. High token usage
  const totalTokens = sessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  if (totalTokens > 1000000) {
    alerts.push({
      id: 'high-tokens',
      severity: 'low',
      type: 'token_usage',
      title: 'High Token Consumption',
      message: `Total token usage: ${(totalTokens / 1000000).toFixed(1)}M tokens`,
      details: [`Consider reviewing session compaction settings`],
      timestamp: Date.now(),
      actionable: true,
      action: 'Review session token budgets',
    });
  }

  // 4. Model failure detection
  const modelErrors = logs.filter(l => 
    l.message?.includes('provider rejected') || 
    l.message?.includes('Access denied') ||
    l.message?.includes('FailoverError')
  );
  if (modelErrors.length > 0) {
    const lastError = modelErrors[modelErrors.length - 1];
    const modelMatch = lastError.message?.match(/model=(\S+)/);
    const providerMatch = lastError.message?.match(/provider=(\S+)/);
    alerts.push({
      id: 'model-failure',
      severity: 'high',
      type: 'model_failure',
      title: 'Model Provider Failure',
      message: `${providerMatch?.[1] || 'unknown'}/${modelMatch?.[1] || 'unknown'} is failing`,
      details: [lastError.message?.substring(0, 150)],
      timestamp: new Date(lastError.timestamp).getTime(),
      actionable: true,
      action: 'Check provider status, API key, or account balance',
    });
  }

  // 5. Cost anomaly
  const totalCost = sessions.reduce((sum, s) => sum + (s.estimatedCost || 0), 0);
  if (totalCost > 0.1) {
    alerts.push({
      id: 'cost-warning',
      severity: 'medium',
      type: 'cost',
      title: 'Cost Threshold Warning',
      message: `Total estimated cost: $${totalCost.toFixed(3)}`,
      timestamp: Date.now(),
      actionable: false,
    });
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

  return {
    alerts,
    summary: {
      total: alerts.length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length,
    },
  };
}

// ─── V2.0: API Routes ───────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  res.json(getProjectStructure());
});

// ─── Processing (LogicFolding) 实时状态 ────────────────────────────

const PROCESSING_DIR = join(WORKSPACE, 'Projects/多层感知思考模式/src/thinking_logs');

// ─── 单管道状态检测 ──────────────────────────────────────────

function getPipelineState(pipelineLayerDir) {
  const result = { steps: [], stream: [], throughVerdict: null, compressionRatio: 0, latency: 0 };
  if (!pipelineLayerDir || !existsSync(pipelineLayerDir)) return result;

  const files = new Set(readdirSync(pipelineLayerDir));
  const hasCtx = files.has('context.md'), hasS1 = files.has('s1_intuition.md'), hasS2 = files.has('s2_rationality.md');
  const hasHbe = files.has('hbe_audit.md'), hasS3 = files.has('s3_reflection.md'), hasSyn = files.has('synthesis.md');
  const hasEff = files.has('efficiency.md'), hasTrace = files.has('trace.json');

  let sp = { s1:'pending', s2:'pending', hbe:'pending', s3:'pending', syn:'pending', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };
  if (hasTrace) sp = { s1:'done', s2:'done', hbe:'done', s3:'done', syn:'done', eng:'done', trace:'done', ana:'done', eff:'done' };
  else if (hasEff) sp = { s1:'done', s2:'done', hbe:'done', s3:'done', syn:'done', eng:'done', trace:'done', ana:'current', eff:'current' };
  else if (hasSyn) sp = { s1:'done', s2:'done', hbe:'done', s3:'done', syn:'done', eng:'done', trace:'current', ana:'pending', eff:'pending' };
  else if (hasS3) sp = { s1:'done', s2:'done', hbe:'done', s3:'done', syn:'current', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };
  else if (hasHbe) sp = { s1:'done', s2:'done', hbe:'done', s3:'current', syn:'pending', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };
  else if (hasS2) sp = { s1:'done', s2:'done', hbe:'current', s3:'pending', syn:'pending', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };
  else if (hasS1) sp = { s1:'done', s2:'current', hbe:'pending', s3:'pending', syn:'pending', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };
  else if (hasCtx) sp = { s1:'current', s2:'pending', hbe:'pending', s3:'pending', syn:'pending', eng:'pending', trace:'pending', ana:'pending', eff:'pending' };

  let query = '', model = 'deepseek/deepseek-v4-pro', timestamp = null;
  if (hasTrace) { const t = readJSON(join(pipelineLayerDir, 'trace.json')); if (t) { query = t.query||''; model = t.model||model; timestamp = t.timestamp; } }
  else if (hasCtx) {
    const c = readFileSync(join(pipelineLayerDir, 'context.md'), 'utf8');
    const qm = c.match(/##\s*查询[：:]*\s*\n([\s\S]+?)\n##\s/); if (qm) query = qm[1].trim();
    const mm = c.match(/模型[：:]?\s*(.+)/); if (mm) model = mm[1].trim();
    const tsm = c.match(/^#.*?—\s*(.+)/); if (tsm) timestamp = tsm[1].trim();
  }

  const trace = hasTrace ? readJSON(join(pipelineLayerDir, 'trace.json')) : null;
  const layers = trace?.layers || {};
  if (trace?.query) query = trace.query; if (trace?.model) model = trace.model; if (trace?.timestamp) timestamp = trace.timestamp;
  const eff = trace?.efficiency || {}; result.compressionRatio = eff.compression_ratio || 0; result.latency = eff.total_latency || 0;

  const pm = (n, p) => { const fp = join(pipelineLayerDir, n); if (!existsSync(fp)) return null; try { const c = readFileSync(fp, 'utf8'), m = c.match(p); return m ? m[1].trim() : null; } catch { return null; } };
  const s1c = parseFloat(pm('s1_intuition.md', /置信度[：：]?\s*([\d.]+)/)) || 0;
  const s1m = layers.s1 ? { confidence: layers.s1.confidence ? (layers.s1.confidence*100).toFixed(0)+'%' : '—', latency: layers.s1.latency_ms ? (layers.s1.latency_ms/1000).toFixed(1)+'s' : '—', tokens: String(layers.s1.tokens_out||'—') } : { confidence: s1c ? (s1c*100).toFixed(0)+'%' : '—', latency: '—', tokens: '—' };
  let s2fc = layers.s2?.facts_checked || 0;
  if (!s2fc) { try { const sc = readFileSync(join(pipelineLayerDir,'s2_rationality.md'), 'utf8'); s2fc = (sc.match(/- ✓/g)||[]).length; } catch {} }
  const s2m = layers.s2 ? { confidence: layers.s2.facts_confirmed!==undefined ? String(layers.s2.facts_confirmed)+'/'+String(layers.s2.facts_checked||0)+'✓' : '—', latency: layers.s2.latency_ms ? (layers.s2.latency_ms/1000).toFixed(1)+'s' : '—', tokens: String(layers.s2.tokens_out||'—') } : { confidence: s2fc>0 ? String(s2fc)+'✓' : '—', latency: '—', tokens: '—' };
  const s3md = pm('s3_reflection.md', /判定[：：]?\s*(\S+)/) || '';
  const s3m = layers.s3 ? { confidence: layers.s3.verdict||'—', latency: layers.s3.latency_ms ? (layers.s3.latency_ms/1000).toFixed(1)+'s' : '—', tokens: String(layers.s3.tokens_out||'—') } : { confidence: s3md||'—', latency: '—', tokens: '—' };
  const fusm = layers.fusion ? { confidence: result.compressionRatio>0 ? result.compressionRatio.toFixed(1)+'x' : '—', latency: layers.fusion.latency_ms ? (layers.fusion.latency_ms/1000).toFixed(1)+'s' : '—', tokens: String(layers.fusion.tokens_out||'—') } : { confidence: '—', latency: '—', tokens: '—' };

  result.steps = [
    { id:'s1', phase:sp.s1, title:'S₁ 直觉层', desc:'System 1 — 快思考', tag:'直觉', metrics:s1m },
    { id:'s2', phase:sp.s2, title:'S₂ 理性层', desc:'System 2 — 慢思考', tag:'理性', metrics:s2m },
    { id:'hbe', phase:sp.hbe, title:'HBE 审计', desc:'硬熔断边界审计', tag:'审计', metrics:{ confidence:'—', latency:'—', tokens:'—' } },
    { id:'s3', phase:sp.s3, title:'S₃ 反思层', desc:'System 3 — 元认知', tag:'元认知', metrics:s3m },
    { id:'syn', phase:sp.syn, title:'Folded Synthesis', desc:'三层融合输出', tag:'融合', metrics:fusm },
    { id:'eng', phase:sp.eng, title:'VerticalStackingEngine', desc:'引擎协调器', tag:'引擎', metrics:{ confidence:'—', latency:'—', tokens:'—' } },
    { id:'trace', phase:sp.trace, title:'TracingLayer', desc:'思考追踪层', tag:'追踪', metrics:{ confidence:'—', latency:'—', tokens:'—' } },
    { id:'ana', phase:sp.ana, title:'TraceAnalyzer', desc:'批量分析工具', tag:'分析', metrics:{ confidence:'—', latency:'—', tokens:'—' } },
    { id:'eff', phase:sp.eff, title:'效率计算', desc:'折叠效率 τ′/τ', tag:'指标', metrics:{ confidence:'—', latency:'—', tokens:'—' } },
  ];

  const st = timestamp ? new Date(timestamp) : new Date();
  const ft = (d) => d.toLocaleTimeString('zh-CN', {hour12:false});
  result.stream.push({ time:ft(st), msg:`启动推理: ${query.substring(0,40)}`, status:'ok' });
  const sm = {}; result.steps.forEach(s => { sm[s.id] = s; });

  const s1conf = layers.s1?.confidence || parseFloat(pm('s1_intuition.md', /置信度[：：]?\s*([\d.]+)/));
  if (s1conf) result.stream.push({ time:ft(new Date(st.getTime()+(layers.s1?.latency_ms||1000))), msg:`S₁ 直觉: ${(s1conf*100).toFixed(0)}% 置信`, status:'ok' });
  else if (sm.s1?.phase==='current') result.stream.push({ time:ft(new Date(st.getTime()+1000)), msg:'S₁ 直觉: 执行中', status:'run' });

  if (s2fc>0) result.stream.push({ time:ft(new Date(st.getTime()+(layers.s2?.latency_ms||2000))), msg:`S₂ 理性: ${s2fc} 事实核对`, status:'ok' });
  else if (sm.s2?.phase==='current') result.stream.push({ time:ft(new Date(st.getTime()+2000)), msg:'S₂ 理性: 执行中', status:'run' });

  if (existsSync(join(pipelineLayerDir, 'hbe_audit.md'))) {
    const hv = layers.hbe?.verdict || pm('hbe_audit.md', /判决[：：]?\s*(\S+)/) || 'AUDIT_PASSED';
    result.stream.push({ time:ft(new Date(st.getTime()+(layers.hbe?.latency_ms||3000))), msg:`HBE 审计: ${hv} (${((layers.hbe?.confidence||0.95)*100).toFixed(0)}%)`, status:'ok' });
  }

  const s3v = (layers.s3?.verdict && layers.s3?.verdict!=='?') ? layers.s3?.verdict : pm('s3_reflection.md', /判定[：：]?\s*(\S+)/);
  let s3b = layers.s3?.bias_detected; if (s3b===undefined) { try { const sc = readFileSync(join(pipelineLayerDir,'s3_reflection.md'),'utf8'); s3b = sc.includes('确认偏差: 有'); } catch {} }
  if (s3v) result.stream.push({ time:ft(new Date(st.getTime()+(layers.s3?.latency_ms||3000))), msg:`S₃ 反思: ${s3v}, 偏差${s3b?'':'未'}检测`, status:sm.s3?.phase==='done'?'ok':'run' });
  else if (sm.s3?.phase==='current') result.stream.push({ time:ft(new Date(st.getTime()+3000)), msg:'S₃ 反思: 执行中', status:'run' });

  if (layers?.fusion?.tokens_out) result.stream.push({ time:ft(new Date(st.getTime()+(layers.fusion?.latency_ms||1000))), msg:`Fusion 完成: 压缩比 ${result.compressionRatio.toFixed(1)}x, 总耗时 ${result.latency.toFixed(0)}s`, status:'ok' });
  else if (sm.syn?.phase==='current') result.stream.push({ time:ft(new Date(st.getTime()+1000)), msg:'Fusion: 融合中', status:'run' });

  // 贯穿回溯
  const ppd = join(pipelineLayerDir, '..', '..');
  const rvp = join(ppd, 'through_review.md');
  if (existsSync(rvp)) { try { const rc = readFileSync(rvp,'utf8'); const vm=rc.match(/\*\*verdict\*\*:\s*(\S+)/); if(vm) result.throughVerdict=vm[1]; } catch {} }
  if (result.throughVerdict) result.stream.push({ time:ft(new Date()), msg:`贯穿回溯: ${result.throughVerdict}`, status:result.throughVerdict==='FAIL'?'err':'ok' });

  return result;
}

// ─── CrossFusion 状态检测 ─────────────────────────────────────

function getCrossFusionState(sessionDir) {
  const cfDir = join(sessionDir, 'cross_fusion');
  const coreFiles = ['cross_analysis.md', 'contradictions.md', 'final_answer.md'];
  const optionalFiles = ['let_fly.md'];
  if (!existsSync(cfDir)) return { status: 'pending', files: [] };
  const chk = (f) => existsSync(join(cfDir, f)) ? 'completed' : 'pending';
  const core = coreFiles.map(f => ({ name: f, status: chk(f) }));
  const opt = optionalFiles.map(f => ({ name: f, status: chk(f) }));
  const hasFinal = existsSync(join(cfDir, 'final_answer.md'));
  let preview = null;
  if (hasFinal) { try { preview = readFileSync(join(cfDir, 'final_answer.md'), 'utf8').substring(0, 300); } catch {} }
  return { status: hasFinal ? 'completed' : (core.some(f => f.status === 'completed') ? 'running' : 'pending'), files: [...core, ...opt], finalAnswerPreview: preview };
}

// ─── 主处理入口 ───────────────────────────────────────────────

function getLatestProcessingState() {
  try {
    if (!existsSync(PROCESSING_DIR)) return { status: 'idle', isMulti: false, steps: [], stream: [] };

    const dates = readdirSync(PROCESSING_DIR).filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/)).sort().reverse();
    if (!dates.length) return { status: 'idle', isMulti: false, steps: [], stream: [] };
    const dateDir = join(PROCESSING_DIR, dates[0]);
    const sessions = readdirSync(dateDir).filter(d => /^\d{6}_[a-f0-9]+$/.test(d)).sort().reverse();
    if (!sessions.length) return { status: 'idle', isMulti: false, steps: [], stream: [] };
    const sessionDir = join(dateDir, sessions[0]);

    const masterTrace = readJSON(join(sessionDir, 'master_trace.json'));
    const subCount = masterTrace?.sub_problem_count || 0;
    const isMulti = subCount > 1;

    const pipelinesDir = join(sessionDir, 'pipelines');
    const pipeInfos = [];
    if (existsSync(pipelinesDir)) {
      readdirSync(pipelinesDir).filter(d => d.startsWith('q')).sort().forEach(pid => {
        const pd = join(pipelinesDir, pid);
        const dd = readdirSync(pd).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
        if (dd.length) {
          const ss = readdirSync(join(pd, dd[0])).filter(d => /^\d{6}_[a-f0-9]+$/.test(d) || /^[a-f0-9]{6,}$/.test(d)).sort().reverse();
          if (ss.length) pipeInfos.push({ pipeId: pid, layerDir: join(pd, dd[0], ss[0]) });
        }
      });
    }
    if (!pipeInfos.length) return { status: 'idle', isMulti: false, steps: [], stream: [] };

    // 子问题标题
    let mainQuery = '', stMap = {};
    try {
      const dpPath = join(sessionDir, 'dispatcher', 'dispatch_plan.md');
      if (existsSync(dpPath)) {
        const dpc = readFileSync(dpPath, 'utf8');
        const re = /\|\s*(q\d+)\s*\|\s*([^|]+?)\s*\|/g; let m;
        while ((m = re.exec(dpc)) !== null) stMap[m[1]] = m[2].trim();
        const fst = dpc.split('\n').find(l => l.trim() && !l.startsWith('|') && !l.startsWith('-'));
        if (fst) mainQuery = fst.trim().replace(/^#+\s*/, '');
      }
    } catch {}

    if (isMulti) {
      const subProblems = pipeInfos.map(({ pipeId, layerDir }) => {
        const state = getPipelineState(layerDir);
        const allDone = state.steps.every(s => s.phase === 'done');
        const anyRunning = state.steps.some(s => s.phase !== 'pending');
        return {
          id: pipeId, title: stMap[pipeId] || `子问题 ${pipeId}`,
          status: allDone ? 'completed' : anyRunning ? 'running' : 'pending',
          steps: state.steps, stream: state.stream,
          throughVerdict: state.throughVerdict,
          compressionRatio: state.compressionRatio, latency: state.latency,
        };
      });
      const xf = getCrossFusionState(sessionDir);
      const doneSteps = subProblems.reduce((s, sp) => s + sp.steps.filter(x => x.phase === 'done').length, 0);
      const cfDone = xf.files.filter(f => f.status === 'completed').length;
      return {
        status: xf.status === 'completed' ? 'completed' : 'running', isMulti: true,
        mainQuery: (masterTrace?.query_preview || mainQuery).substring(0, 80),
        subProblemCount: subCount,
        totalProgress: { done: doneSteps + cfDone, total: subProblems.length * 9 + 4 },
        subProblems, crossFusion: xf,
        session: { id: sessions[0], date: dates[0], dir: sessionDir },
      };
    }

    // 单问题后退
    const first = pipeInfos[0];
    const state = getPipelineState(first.layerDir);
    const allDone = state.steps.every(s => s.phase === 'done');
    return {
      status: allDone ? 'completed' : 'running', isMulti: false,
      currentStep: state.steps.find(s => s.phase === 'current')?.id || null,
      steps: state.steps, stream: state.stream,
      session: {
        id: sessions[0], date: dates[0], dir: sessionDir,
        query: (masterTrace?.query_preview || '').substring(0, 80),
        model: masterTrace?.model || 'unknown',
        compressionRatio: state.compressionRatio, totalLatency: state.latency,
        backtracks: 0, hbeBacktracks: 0,
      },
    };
  } catch (e) {
    console.error('Processing status error:', e.message);
    return { status: 'error', isMulti: false, steps: [], stream: [] };
  }
}


app.get('/api/processing/status', (req, res) => {
  res.json(getLatestProcessingState());
});

// Watch thinking_logs for changes
const PROCESSING_WATCH = PROCESSING_DIR;
if (existsSync(PROCESSING_WATCH)) {
  try {
    const processingWatcher = watch(PROCESSING_WATCH, {
      persistent: true,
      depth: 5,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    // 监听所有 .md 层文件和 trace.json 的变化
    // .md 文件写入更快，可以更早检测到步骤进度
    processingWatcher.on('change', (path) => {
      if (path.endsWith('.json') || path.endsWith('.md')) {
        const fname = path.split('/').pop();
        const isLayer = ['context.md','s1_intuition.md','s2_rationality.md','hbe_audit.md','s3_reflection.md','synthesis.md','efficiency.md','trace.json','master_trace.json'].includes(fname);
        if (isLayer || fname.startsWith('trace')) {
          console.log('Processing layer changed:', fname);
          broadcast('processing:update', getLatestProcessingState());
        }
      }
    });

    processingWatcher.on('add', (path) => {
      if (path.endsWith('.json') || path.endsWith('.md')) {
        const fname = path.split('/').pop();
        const isLayer = ['context.md','s1_intuition.md','s2_rationality.md','hbe_audit.md','s3_reflection.md','synthesis.md','efficiency.md','trace.json','master_trace.json'].includes(fname);
        if (isLayer || fname.startsWith('trace')) {
          console.log('New processing layer:', fname);
          broadcast('processing:update', getLatestProcessingState());
        }
      }
    });
  } catch (e) {
    console.error('Processing watcher error:', e.message);
  }
}

app.get('/api/timeline', (req, res) => {
  res.json(getProjectTimeline());
});

app.get('/api/taskflow', (req, res) => {
  res.json(getTaskFlow());
});

app.get('/api/alerts', (req, res) => {
  res.json(getSmartAlerts());
});

// ─── V3.0: Multi-User System ──────────────────────────────────────────

// Track connected users (in-memory + persist to file)
const USERS_FILE = join(OPENCLAW_HOME, 'viz-users.json');
const AUDIT_FILE = join(OPENCLAW_HOME, 'viz-audit.jsonl');

function getUsers() {
  return readJSON(USERS_FILE) || { users: {}, auditLog: [] };
}

function saveUsers(data) {
  try { writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function registerUser(userId, name, role = 'viewer') {
  const data = getUsers();
  if (!data.users[userId]) {
    data.users[userId] = { id: userId, name, role, firstSeen: Date.now(), lastSeen: Date.now(), interventions: 0 };
  } else {
    data.users[userId].lastSeen = Date.now();
  }
  saveUsers(data);
  return data.users[userId];
}

function addAuditEntry(userId, action, target, details = '') {
  const entry = { timestamp: Date.now(), userId, action, target, details };
  try {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(AUDIT_FILE, line);
  } catch {}
}

function getAuditLog(limit = 50) {
  if (!existsSync(AUDIT_FILE)) return [];
  try {
    const lines = readFileSync(AUDIT_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// WebSocket user tracking
const connectedUsers = new Map(); // userId -> { ws, name, role, connectedAt }

// ─── V3.0: Intervention Policy Engine ──────────────────────────────────

const POLICIES_FILE = join(OPENCLAW_HOME, 'viz-policies.json');

function getPolicies() {
  return readJSON(POLICIES_FILE) || {
    policies: [
      {
        id: 'error-spike-auto',
        name: 'Error Spike Auto-Alert',
        enabled: true,
        condition: { type: 'error_rate', threshold: 5, windowMinutes: 60 },
        action: { type: 'notify', severity: 'high' },
        description: 'Auto-alert when error rate exceeds 5 errors/hour',
      },
      {
        id: 'stale-session-pause',
        name: 'Stale Session Warning',
        enabled: true,
        condition: { type: 'session_idle', thresholdMinutes: 120 },
        action: { type: 'notify', severity: 'medium' },
        description: 'Warn when a session is idle for > 2 hours',
      },
      {
        id: 'token-budget-guard',
        name: 'Token Budget Guard',
        enabled: true,
        condition: { type: 'token_budget', thresholdTokens: 2000000 },
        action: { type: 'notify', severity: 'medium' },
        description: 'Alert when total token usage exceeds 2M',
      },
      {
        id: 'cost-threshold',
        name: 'Cost Threshold Alert',
        enabled: true,
        condition: { type: 'cost_limit', thresholdUsd: 0.5 },
        action: { type: 'notify', severity: 'high' },
        description: 'Alert when total cost exceeds $0.50',
      },
      {
        id: 'model-failover',
        name: 'Model Failover Alert',
        enabled: true,
        condition: { type: 'model_failure', consecutiveFailures: 3 },
        action: { type: 'notify', severity: 'high' },
        description: 'Alert after 3 consecutive model failures',
      },
    ],
  };
}

function savePolicies(data) {
  try { writeFileSync(POLICIES_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function evaluatePolicies() {
  const policies = getPolicies().policies.filter(p => p.enabled);
  const sessions = getSessions();
  const logs = getGatewayLogs();
  const alerts = [];
  const now = Date.now();

  policies.forEach(policy => {
    const cond = policy.condition;
    let triggered = false;
    let detail = '';

    switch (cond.type) {
      case 'error_rate': {
        const windowMs = (cond.windowMinutes || 60) * 60000;
        const errors = logs.filter(l => 
          l.level === 'error' && (now - new Date(l.timestamp).getTime()) < windowMs
        );
        if (errors.length >= cond.threshold) {
          triggered = true;
          detail = `${errors.length} errors in ${cond.windowMinutes}m (threshold: ${cond.threshold})`;
        }
        break;
      }
      case 'session_idle': {
        const thresholdMs = (cond.thresholdMinutes || 120) * 60000;
        const idleSessions = sessions.filter(s => 
          s.status !== 'stale' && s.module !== 'Dreaming' && s.module !== 'Heartbeat' &&
          (now - (s.updatedAt || 0)) > thresholdMs
        );
        if (idleSessions.length > 0) {
          triggered = true;
          detail = `${idleSessions.length} sessions idle > ${cond.thresholdMinutes}m`;
        }
        break;
      }
      case 'token_budget': {
        const total = sessions.reduce((s, x) => s + (x.totalTokens || 0), 0);
        if (total >= cond.thresholdTokens) {
          triggered = true;
          detail = `${(total / 1000000).toFixed(1)}M tokens (limit: ${(cond.thresholdTokens / 1000000).toFixed(1)}M)`;
        }
        break;
      }
      case 'cost_limit': {
        const totalCost = sessions.reduce((s, x) => s + (x.estimatedCost || 0), 0);
        if (totalCost >= cond.thresholdUsd) {
          triggered = true;
          detail = `$${totalCost.toFixed(3)} (limit: $${cond.thresholdUsd})`;
        }
        break;
      }
      case 'model_failure': {
        const modelErrors = logs.filter(l => 
          l.message?.includes('FailoverError') || l.message?.includes('provider rejected')
        );
        if (modelErrors.length >= cond.consecutiveFailures) {
          triggered = true;
          detail = `${modelErrors.length} model failures (threshold: ${cond.consecutiveFailures})`;
        }
        break;
      }
    }

    if (triggered) {
      alerts.push({
        policyId: policy.id,
        policyName: policy.name,
        severity: policy.action.severity,
        detail,
        triggeredAt: now,
        action: policy.action.type,
      });
    }
  });

  return alerts;
}

// ─── V3.0: Session Replay ──────────────────────────────────────────────

function getSessionReplay(sessionKey) {
  const sessionsFile = join(OPENCLAW_HOME, 'agents/main/sessions/sessions.json');
  const data = readJSON(sessionsFile);
  if (!data || !data[sessionKey]) return null;

  const sessionPath = data[sessionKey].sessionFile;
  if (!sessionPath || !existsSync(sessionPath)) return null;

  const content = readFileSync(sessionPath, 'utf8');
  const lines = content.trim().split('\n');
  const frames = [];
  let sessionStart = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      if (entry.type === 'session') {
        sessionStart = new Date(entry.timestamp).getTime();
        frames.push({
          type: 'session_start',
          timestamp: sessionStart,
          offset: 0,
          data: { id: entry.id, cwd: entry.cwd },
        });
      }
      
      if (entry.type === 'model_change') {
        frames.push({
          type: 'model_change',
          timestamp: new Date(entry.timestamp).getTime(),
          offset: sessionStart ? new Date(entry.timestamp).getTime() - sessionStart : 0,
          data: { provider: entry.provider, model: entry.modelId },
        });
      }

      if (entry.type === 'message' && entry.message) {
        const msg = entry.message;
        let text = '';
        const tools = [];
        
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') text += (text ? '\n' : '') + (block.text || '');
            if (block.type === 'toolCall' || block.type === 'tool_use') {
              tools.push({ name: block.name || 'unknown', input: block.input || {} });
            }
            if (block.type === 'tool_result') {
              const ct = block.content || '';
              text += (text ? '\n' : '') + (typeof ct === 'string' ? ct.substring(0, 200) : '');
            }
          }
        }

        let role = msg.role || 'unknown';
        if (role === 'toolResult') role = 'tool';

        frames.push({
          type: 'message',
          role,
          timestamp: new Date(entry.timestamp).getTime(),
          offset: sessionStart ? new Date(entry.timestamp).getTime() - sessionStart : 0,
          data: {
            content: text.substring(0, 500),
            tools,
            model: msg.model || null,
          },
        });
      }
    } catch {}
  }

  const sessionMeta = data[sessionKey];
  return {
    sessionKey,
    module: extractModule(sessionKey),
    channel: sessionMeta.lastChannel || 'unknown',
    totalTokens: sessionMeta.totalTokens || 0,
    frames,
    duration: frames.length > 1 ? frames[frames.length - 1].offset : 0,
    frameCount: frames.length,
  };
}

// ─── V3.0: A/B Test Comparison ────────────────────────────────────────

function getABTestComparison() {
  const sessions = getSessions();
  const logs = getGatewayLogs();
  
  // Group sessions by model provider (extracted from logs)
  const modelStats = {};
  
  // Parse model info from logs
  const modelLogEntries = logs.filter(l => 
    l.message?.includes('model=') || l.message?.includes('provider=')
  );
  
  modelLogEntries.forEach(log => {
    const modelMatch = log.message?.match(/model=(\S+)/);
    const providerMatch = log.message?.match(/provider=(\S+)/);
    const isError = log.message?.includes('isError=true');
    
    if (modelMatch) {
      const key = `${providerMatch?.[1] || 'unknown'}/${modelMatch[1]}`;
      if (!modelStats[key]) {
        modelStats[key] = { model: key, provider: providerMatch?.[1] || 'unknown', calls: 0, errors: 0, successes: 0 };
      }
      modelStats[key].calls++;
      if (isError) modelStats[key].errors++;
      else modelStats[key].successes++;
    }
  });

  // Group by channel
  const channelStats = {};
  sessions.forEach(s => {
    const ch = s.lastChannel || 'unknown';
    if (!channelStats[ch]) {
      channelStats[ch] = { channel: ch, sessions: 0, tokens: 0, cost: 0, active: 0 };
    }
    channelStats[ch].sessions++;
    channelStats[ch].tokens += s.totalTokens || 0;
    channelStats[ch].cost += s.estimatedCost || 0;
    if (s.status === 'active') channelStats[ch].active++;
  });

  // Group by module
  const moduleStats = {};
  sessions.forEach(s => {
    const mod = s.module;
    if (!moduleStats[mod]) {
      moduleStats[mod] = { module: mod, sessions: 0, tokens: 0, cost: 0, avgTokens: 0 };
    }
    moduleStats[mod].sessions++;
    moduleStats[mod].tokens += s.totalTokens || 0;
    moduleStats[mod].cost += s.estimatedCost || 0;
  });
  Object.values(moduleStats).forEach(m => {
    m.avgTokens = m.sessions > 0 ? Math.round(m.tokens / m.sessions) : 0;
  });

  // Time-based comparison (last 7 days vs previous 7 days)
  const now = Date.now();
  const week1 = sessions.filter(s => (now - (s.updatedAt || 0)) < 7 * 86400000);
  const week2 = sessions.filter(s => {
    const age = now - (s.updatedAt || 0);
    return age >= 7 * 86400000 && age < 14 * 86400000;
  });

  const timeComparison = {
    thisWeek: {
      sessions: week1.length,
      tokens: week1.reduce((s, x) => s + (x.totalTokens || 0), 0),
      cost: week1.reduce((s, x) => s + (x.estimatedCost || 0), 0),
    },
    lastWeek: {
      sessions: week2.length,
      tokens: week2.reduce((s, x) => s + (x.totalTokens || 0), 0),
      cost: week2.reduce((s, x) => s + (x.estimatedCost || 0), 0),
    },
  };

  return {
    models: Object.values(modelStats).sort((a, b) => b.calls - a.calls),
    channels: Object.values(channelStats).sort((a, b) => b.sessions - a.sessions),
    modules: Object.values(moduleStats).sort((a, b) => b.sessions - a.sessions),
    timeComparison,
  };
}

// ─── V3.0: API Routes ────────────────────────────────────────────────

// Multi-user
app.post('/api/users/register', (req, res) => {
  const { userId, name, role } = req.body;
  if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });
  const user = registerUser(userId, name, role || 'viewer');
  res.json(user);
});

app.get('/api/users', (req, res) => {
  const data = getUsers();
  const users = Object.values(data.users || {}).map(u => ({
    ...u,
    online: connectedUsers.has(u.id),
    lastSeenAgo: Date.now() - u.lastSeen,
  }));
  res.json({ users, total: users.length, online: users.filter(u => u.online).length });
});

app.get('/api/audit', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getAuditLog(limit));
});

// Policies
app.get('/api/policies', (req, res) => {
  const policies = getPolicies();
  const triggered = evaluatePolicies();
  res.json({ ...policies, triggeredAlerts: triggered });
});

app.post('/api/policies/:id/toggle', (req, res) => {
  const { id } = req.params;
  const data = getPolicies();
  const policy = data.policies.find(p => p.id === id);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });
  policy.enabled = !policy.enabled;
  savePolicies(data);
  res.json({ success: true, enabled: policy.enabled, policy: policy.name });
});

app.post('/api/policies', (req, res) => {
  const { name, condition, action, description } = req.body;
  if (!name || !condition || !action) {
    return res.status(400).json({ error: 'name, condition, and action required' });
  }
  const data = getPolicies();
  const newPolicy = {
    id: `policy-${Date.now()}`,
    name,
    enabled: true,
    condition,
    action,
    description: description || '',
  };
  data.policies.push(newPolicy);
  savePolicies(data);
  res.json(newPolicy);
});

app.delete('/api/policies/:id', (req, res) => {
  const { id } = req.params;
  const data = getPolicies();
  data.policies = data.policies.filter(p => p.id !== id);
  savePolicies(data);
  res.json({ success: true });
});

// Replay
app.get('/api/replay/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const replay = getSessionReplay(key);
  if (!replay) return res.status(404).json({ error: 'Session not found' });
  res.json(replay);
});

app.get('/api/replay-sessions', (req, res) => {
  const sessions = getSessions();
  // Return sessions with replay metadata
  const replayable = sessions
    .filter(s => s.totalTokens > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 20)
    .map(s => ({
      key: s.key,
      module: s.module,
      channel: s.lastChannel,
      tokens: s.totalTokens,
      cost: s.estimatedCost,
      updatedAt: s.updatedAt,
      status: s.status,
    }));
  res.json(replayable);
});

// A/B Comparison
app.get('/api/abtest', (req, res) => {
  res.json(getABTestComparison());
});

// ─── V4.0: RBAC Permission System ─────────────────────────────────────

const ROLES_FILE = join(OPENCLAW_HOME, 'viz-roles.json');

const DEFAULT_PERMISSIONS = {
  view: { label: 'View Dashboard', roles: ['viewer', 'operator', 'admin'] },
  intervene: { label: 'Send Messages', roles: ['operator', 'admin'] },
  manage_cron: { label: 'Manage Cron Jobs', roles: ['operator', 'admin'] },
  manage_policies: { label: 'Manage Policies', roles: ['admin'] },
  manage_users: { label: 'Manage Users', roles: ['admin'] },
  replay: { label: 'Session Replay', roles: ['viewer', 'operator', 'admin'] },
  export: { label: 'Export Data', roles: ['operator', 'admin'] },
  delete: { label: 'Delete Resources', roles: ['admin'] },
  configure_cluster: { label: 'Configure Clusters', roles: ['admin'] },
  view_audit: { label: 'View Audit Log', roles: ['admin'] },
};

function getRoleConfig() {
  return readJSON(ROLES_FILE) || {
    roles: {
      admin: { priority: 100, inherits: ['operator'] },
      operator: { priority: 50, inherits: ['viewer'] },
      viewer: { priority: 10, inherits: [] },
    },
    users: {},
  };
}

function hasPermission(userRole, permissionId) {
  const cfg = getRoleConfig();
  const perm = DEFAULT_PERMISSIONS[permissionId];
  if (!perm) return false;
  
  // Check role directly
  if (perm.roles.includes(userRole)) return true;
  
  // Check inherited roles
  const roleCfg = cfg.roles[userRole];
  if (roleCfg?.inherits) {
    for (const inherited of roleCfg.inherits) {
      if (perm.roles.includes(inherited)) return true;
    }
  }
  return false;
}

function requirePermission(permissionId) {
  return (req, res, next) => {
    const role = req.headers['x-viz-role'] || 'viewer';
    if (hasPermission(role, permissionId)) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden', required: permissionId, role });
  };
}

// ─── V4.0: Enhanced Immutable Audit ────────────────────────────────────

const AUDIT_IMMUTABLE_FILE = join(OPENCLAW_HOME, 'viz-audit-immutable.log');

function writeImmutableAudit(entry) {
  try {
    const line = JSON.stringify({ ...entry, _hash: createAuditHash(entry) }) + '\n';
    appendFileSync(AUDIT_IMMUTABLE_FILE, line);
    return true;
  } catch { return false; }
}

function createAuditHash(entry) {
  const str = `${entry.timestamp}.${entry.userId}.${entry.action}.${entry.target}.${entry.detail}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(16);
}

function verifyAuditIntegrity(lines) {
  let valid = 0, invalid = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const expectedHash = createAuditHash(entry);
      if (entry._hash === expectedHash) valid++;
      else invalid++;
    } catch { invalid++; }
  }
  return { valid, invalid, verifiedLines: valid + invalid };
}

function getImmutableAudit(limit = 100) {
  if (!existsSync(AUDIT_IMMUTABLE_FILE)) return [];
  try {
    const lines = readFileSync(AUDIT_IMMUTABLE_FILE, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// Log an intervention action (used by the intervention routes)
function logIntervention(userId, action, target, detail) {
  addAuditEntry(userId, action, target, detail);
  writeImmutableAudit({ timestamp: Date.now(), userId, action, target, detail });
}

// ─── V4.0: Multi-Cluster Monitoring ────────────────────────────────────

const CLUSTERS_FILE = join(OPENCLAW_HOME, 'viz-clusters.json');

function getClusters() {
  return readJSON(CLUSTERS_FILE) || { clusters: [] };
}

function saveClusters(data) {
  try { writeFileSync(CLUSTERS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

async function checkClusterHealth(cluster) {
  const result = { id: cluster.id, name: cluster.name, url: cluster.url, status: 'unknown', latency: null, sessions: 0, error: null };
  try {
    const start = Date.now();
    const response = await fetch(`${cluster.url}/api/status`, {
      signal: AbortSignal.timeout(5000),
      headers: cluster.token ? { Authorization: `Bearer ${cluster.token}` } : {},
    });
    result.latency = Date.now() - start;
    
    if (response.ok) {
      result.status = 'healthy';
      try {
        const body = await response.json();
        result.sessions = body.agentCount || 0;
        result.version = body.version;
      } catch {}
    } else {
      result.status = 'error';
      result.error = `HTTP ${response.status}`;
    }
  } catch (e) {
    result.status = 'offline';
    result.error = e.message?.substring(0, 100);
  }
  return result;
}

async function checkAllClusters() {
  const data = getClusters();
  const results = await Promise.allSettled(data.clusters.map(c => checkClusterHealth(c)));
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

// ─── V4.0: Prometheus Metrics ──────────────────────────────────────────

function getPrometheusMetrics() {
  const sessions = getSessions();
  const logs = getGatewayLogs();
  
  let metrics = '# HELP openclaw_viz_sessions_total Total session count\n';
  metrics += '# TYPE openclaw_viz_sessions_total gauge\n';
  metrics += `openclaw_viz_sessions_total ${sessions.length}\n`;
  
  metrics += '# HELP openclaw_viz_sessions_active Active session count\n';
  metrics += '# TYPE openclaw_viz_sessions_active gauge\n';
  metrics += `openclaw_viz_sessions_active ${sessions.filter(s => s.status === 'active').length}\n`;
  
  metrics += '# HELP openclaw_viz_tokens_total Total token consumption\n';
  metrics += '# TYPE openclaw_viz_tokens_total counter\n';
  metrics += `openclaw_viz_tokens_total ${sessions.reduce((s, x) => s + (x.totalTokens || 0), 0)}\n`;
  
  metrics += '# HELP openclaw_viz_cost_total Total estimated cost USD\n';
  metrics += '# TYPE openclaw_viz_cost_total gauge\n';
  metrics += `openclaw_viz_cost_total ${sessions.reduce((s, x) => s + (x.estimatedCost || 0), 0)}\n`;
  
  metrics += '# HELP openclaw_viz_errors_total Total error count in gateway logs\n';
  metrics += '# TYPE openclaw_viz_errors_total counter\n';
  metrics += `openclaw_viz_errors_total ${logs.filter(l => l.level === 'error').length}\n`;
  
  metrics += '# HELP openclaw_viz_modules_total Module count\n';
  metrics += '# TYPE openclaw_viz_modules_total gauge\n';
  const modules = new Set(sessions.map(s => s.module));
  metrics += `openclaw_viz_modules_total ${modules.size}\n`;
  
  // Per-module metrics
  const modMap = {};
  sessions.forEach(s => {
    const mod = s.module;
    if (!modMap[mod]) modMap[mod] = { tokens: 0, cost: 0, count: 0 };
    modMap[mod].tokens += s.totalTokens || 0;
    modMap[mod].cost += s.estimatedCost || 0;
    modMap[mod].count++;
  });
  
  metrics += '\n# HELP openclaw_viz_module_tokens Token consumption by module\n';
  metrics += '# TYPE openclaw_viz_module_tokens gauge\n';
  Object.entries(modMap).forEach(([mod, m]) => {
    metrics += `openclaw_viz_module_tokens{module="${mod}"} ${m.tokens}\n`;
  });
  
  return metrics;
}

// ─── V4.0: SSO / OAuth2 ────────────────────────────────────────────────

function generateToken(userId, role, name) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    name,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24h expiry
  })).toString('base64url');
  const signature = Buffer.from(header + '.' + payload).toString('base64url').substring(0, 20);
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ─── V4.0: API Routes ──────────────────────────────────────────────────

// RBAC
app.get('/api/rbac/permissions', (req, res) => {
  res.json({ permissions: DEFAULT_PERMISSIONS });
});

app.get('/api/rbac/check', (req, res) => {
  const role = req.query.role || 'viewer';
  const results = {};
  Object.keys(DEFAULT_PERMISSIONS).forEach(perm => {
    results[perm] = hasPermission(role, perm);
  });
  res.json({ role, permissions: results });
});

app.get('/api/rbac/roles', (req, res) => {
  const cfg = getRoleConfig();
  res.json(cfg.roles);
});

app.put('/api/rbac/users/:userId/role', (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const cfg = getRoleConfig();
  if (!cfg.roles[role]) return res.status(400).json({ error: 'Invalid role' });
  cfg.users[userId] = { ...(cfg.users[userId] || {}), role };
  try { writeFileSync(ROLES_FILE, JSON.stringify(cfg, null, 2)); } catch {}
  res.json({ userId, role });
});

// Immutable Audit
app.get('/api/audit/immutable', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const entries = getImmutableAudit(limit);
  res.json(entries);
});

app.get('/api/audit/verify', (req, res) => {
  if (!existsSync(AUDIT_IMMUTABLE_FILE)) {
    return res.json({ verifiedLines: 0, valid: 0, invalid: 0, message: 'No audit file' });
  }
  const content = readFileSync(AUDIT_IMMUTABLE_FILE, 'utf8').trim();
  const lines = content.split('\n').filter(Boolean);
  const result = verifyAuditIntegrity(lines);
  res.json({ ...result, fileSize: content.length });
});

app.get('/api/audit/export/csv', (req, res) => {
  const entries = getImmutableAudit(500);
  let csv = 'timestamp,userId,action,target,detail,hash\n';
  entries.forEach(e => {
    csv += `${new Date(e.timestamp).toISOString()},"${e.userId}","${e.action}","${e.target}","${(e.detail || '').substring(0, 100)}",${e._hash}\n`;
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
  res.send(csv);
});

// Multi-Cluster
app.get('/api/clusters', async (req, res) => {
  const data = getClusters();
  const health = await checkAllClusters();
  res.json({ clusters: data.clusters, health });
});

app.post('/api/clusters', (req, res) => {
  const { name, url, token } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const data = getClusters();
  const newCluster = {
    id: `cluster-${Date.now()}`,
    name,
    url,
    token: token || '',
    addedAt: Date.now(),
    enabled: true,
  };
  data.clusters.push(newCluster);
  saveClusters(data);
  res.json(newCluster);
});

app.delete('/api/clusters/:id', (req, res) => {
  const { id } = req.params;
  const data = getClusters();
  data.clusters = data.clusters.filter(c => c.id !== id);
  saveClusters(data);
  res.json({ success: true });
});

app.get('/api/clusters/health', async (req, res) => {
  const health = await checkAllClusters();
  res.json(health);
});

// Prometheus
app.get('/api/metrics/prometheus', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(getPrometheusMetrics());
});

// SSO / Auth
app.post('/api/auth/login', (req, res) => {
  const { userId, name, role } = req.body;
  if (!userId || !name) return res.status(400).json({ error: 'userId and name required' });
  const finalRole = role || 'viewer';
  const token = generateToken(userId, finalRole, name);
  registerUser(userId, name, finalRole);
  logIntervention(userId, 'login', userId, `Logged in as ${finalRole}`);
  res.json({ token, user: { id: userId, name, role: finalRole } });
});

app.get('/api/auth/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const payload = verifyToken(auth.substring(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  res.json(payload);
});

app.get('/api/auth/sso-config', (req, res) => {
  res.json({
    enabled: false,
    providers: ['google', 'github', 'microsoft'],
    note: 'Configure OAuth2 client ID and secret in viz-config.json',
  });
});

// ─── V4.1: OIDC SSO (Google) ────────────────────────────────────────

const SSO_CONFIG_FILE = join(OPENCLAW_HOME, 'viz-sso.json');

function getSSOConfig() {
  return readJSON(SSO_CONFIG_FILE) || {
    google: { enabled: false, clientId: '', clientSecret: '', redirectUri: 'http://localhost:3000/api/auth/google/callback' },
    github: { enabled: false, clientId: '', clientSecret: '' },
    microsoft: { enabled: false, clientId: '', clientSecret: '' },
  };
}

// Generate OIDC state for CSRF protection
const oidcStates = new Map();

app.get('/api/auth/google', (req, res) => {
  const cfg = getSSOConfig().google;
  if (!cfg.enabled || !cfg.clientId) {
    return res.status(400).json({ error: 'Google SSO not configured', configPath: SSO_CONFIG_FILE });
  }
  const state = Buffer.from(Date.now().toString(36) + Math.random().toString(36).substring(2)).toString('hex');
  oidcStates.set(state, { createdAt: Date.now(), redirectTo: req.query.redirect || '/' });
  
  const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${cfg.clientId}` +
    `&redirect_uri=${encodeURIComponent(cfg.redirectUri)}` +
    `&response_type=code` +
    `&scope=openid+email+profile` +
    `&state=${state}`;
  
  res.json({ redirectUrl: url });
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!state || !oidcStates.has(state)) {
    return res.status(401).send('Invalid state parameter - possible CSRF attack');
  }
  oidcStates.delete(state);
  
  if (!code) {
    return res.status(401).send('Authorization code missing');
  }

  const cfg = getSSOConfig().google;
  try {
    // Exchange code for token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    
    if (!tokenRes.ok) {
      return res.status(500).send('Token exchange failed');
    }
    
    const tokenData = await tokenRes.json();
    
    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    
    if (!userRes.ok) {
      return res.status(500).send('Failed to get user info');
    }
    
    const userInfo = await userRes.json();
    
    // Create local JWT
    const userId = `google:${userInfo.id}`;
    const token = generateToken(userId, userInfo.email || 'viewer', userInfo.name || 'Google User');
    registerUser(userId, userInfo.name || 'Google User', 'viewer');
    logIntervention(userId, 'sso-login', 'google', `SSO login via Google: ${userInfo.email}`);
    
    res.json({ token, user: { id: userId, name: userInfo.name, role: 'viewer', email: userInfo.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/auth/sso/configure', (req, res) => {
  const { provider, clientId, clientSecret, enabled } = req.body;
  if (!provider) return res.status(400).json({ error: 'provider required' });
  const cfg = getSSOConfig();
  if (!cfg[provider]) return res.status(400).json({ error: `Unknown provider: ${provider}` });
  cfg[provider] = { ...cfg[provider], clientId: clientId || cfg[provider].clientId, clientSecret: clientSecret || cfg[provider].clientSecret, enabled: enabled !== undefined ? enabled : cfg[provider].enabled };
  try { writeFileSync(SSO_CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
  res.json({ success: true, provider });
});

// ─── V4.1: API Rate Limiter ──────────────────────────────────────────

const rateLimitBuckets = new Map(); // role -> { count, resetAt }

const ROLE_RATE_LIMITS = {
  admin: { requestsPerMinute: 300, burstSize: 50 },
  operator: { requestsPerMinute: 100, burstSize: 20 },
  viewer: { requestsPerMinute: 60, burstSize: 10 },
};

function rateLimitMiddleware(req, res, next) {
  const role = req.headers['x-viz-role'] || 'viewer';
  const limits = ROLE_RATE_LIMITS[role] || ROLE_RATE_LIMITS.viewer;
  const now = Date.now();
  
  if (!rateLimitBuckets.has(role)) {
    rateLimitBuckets.set(role, { count: 0, burst: 0, resetAt: now + 60000 });
  }
  
  const bucket = rateLimitBuckets.get(role);
  
  // Reset if minute has passed
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.burst = 0;
    bucket.resetAt = now + 60000;
  }
  
  bucket.count++;
  bucket.burst++;
  
  // Check limits
  if (bucket.count > limits.requestsPerMinute) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    res.setHeader('X-RateLimit-Limit', limits.requestsPerMinute);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.requestsPerMinute - bucket.count));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      role,
      limit: limits.requestsPerMinute,
      retryAfterSeconds: retryAfter,
    });
  }
  
  if (bucket.burst > limits.burstSize) {
    return res.status(429).json({ error: 'Burst limit exceeded', burstLimit: limits.burstSize });
  }
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', limits.requestsPerMinute);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.requestsPerMinute - bucket.count));
  
  next();
}

// Apply rate limiting to API routes
app.use('/api', rateLimitMiddleware);

app.get('/api/ratelimit/status', (req, res) => {
  const role = req.headers['x-viz-role'] || 'viewer';
  const bucket = rateLimitBuckets.get(role);
  res.json({
    role,
    limits: ROLE_RATE_LIMITS[role] || ROLE_RATE_LIMITS.viewer,
    current: bucket ? { count: bucket.count, burst: bucket.burst, resetsIn: bucket ? Math.max(0, bucket.resetAt - Date.now()) : 0 } : { count: 0, burst: 0, resetsIn: 60000 },
  });
});

// ─── V4.1: Session-Level Audit Export ────────────────────────────────

app.get('/api/audit/session/:key', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const history = getSessionHistory(key);
  const sessions = getSessions();
  const session = sessions.find(s => s.key === key);
  
  const audit = {
    session: { key, module: session?.module || 'unknown', channel: session?.lastChannel || 'unknown', tokens: session?.totalTokens || 0, cost: session?.estimatedCost || 0 },
    messages: history.map((m, i) => ({
      index: i,
      role: m.role,
      timestamp: m.timestamp || new Date().toISOString(),
      contentLength: (m.content || '').length,
      toolCalls: m.toolCalls || [],
      hasContent: (m.content || '').length > 0,
    })),
    summary: {
      totalMessages: history.length,
      userMessages: history.filter(m => m.role === 'user').length,
      assistantMessages: history.filter(m => m.role === 'assistant').length,
      toolMessages: history.filter(m => m.role === 'tool').length,
      totalToolCalls: history.reduce((s, m) => s + (m.toolCalls?.length || 0), 0),
      totalContentChars: history.reduce((s, m) => s + (m.content?.length || 0), 0),
    },
    exportedAt: new Date().toISOString(),
  };

  if (req.query.format === 'csv') {
    let csv = 'index,role,timestamp,contentLength,toolCalls\n';
    audit.messages.forEach(m => {
      csv += `${m.index},"${m.role}","${m.timestamp}",${m.contentLength},"${m.toolCalls.join('|')}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="session-${session?.module || 'export'}-audit.csv"`);
    res.send(csv);
  } else if (req.query.format === 'jsonl') {
    const jsonl = audit.messages.map(m => JSON.stringify(m)).join('\n');
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="session-${session?.module || 'export'}.jsonl"`);
    res.send(jsonl);
  } else {
    res.json(audit);
  }
});

// ─── V4.1: Cluster Auto-Discovery ────────────────────────────────────

app.get('/api/clusters/discover', async (req, res) => {
  const discovered = [];
  
  // Try common local ports
  const portsToCheck = [28907, 3000, 5173, 8888];
  const promises = portsToCheck.map(async (port) => {
    try {
      const url = `http://127.0.0.1:${port}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok || response.status < 500) {
        discovered.push({
          url,
          port,
          status: response.ok ? 'responding' : 'available',
          detectedAt: new Date().toISOString(),
        });
      }
    } catch { /* skip */ }
  });
  
  await Promise.allSettled(promises);
  
  // Also check for common OpenClaw ports via Tailscale/network
  try {
    const hostname = execSync('hostname', { encoding: 'utf8', timeout: 2000 }).trim();
    // Try mDNS / DNS-SD patterns
    const mdnsPatterns = [
      `http://${hostname}.local:28907`,
      `http://${hostname}.tailscale.ts.net:28907`,
    ];
    for (const url of mdnsPatterns) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          discovered.push({ url, port: 28907, status: 'dns-discovered', detectedAt: new Date().toISOString() });
        }
      } catch {}
    }
  } catch {}

  res.json({ discovered, count: discovered.length });
});

app.post('/api/clusters/import-discovered', async (req, res) => {
  const data = getClusters();
  const existing = new Set(data.clusters.map(c => c.url));
  let imported = 0;
  
  const { discovered } = await fetch('http://localhost:3000/api/clusters/discover', { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => ({ discovered: [] }));
  
  for (const d of discovered) {
    if (!existing.has(d.url)) {
      data.clusters.push({
        id: `auto-${Date.now()}-${imported}`,
        name: `Auto:${new URL(d.url).host}`,
        url: d.url,
        token: '',
        addedAt: Date.now(),
        enabled: true,
        autoDiscovered: true,
      });
      imported++;
      existing.add(d.url);
    }
  }
  
  if (imported > 0) saveClusters(data);
  res.json({ imported, total: data.clusters.length });
});

// ─── V4.1: Grafana Dashboard JSON Export ─────────────────────────────

app.get('/api/grafana/dashboard', (req, res) => {
  const dashboard = {
    __inputs: [],
    __requires: [{ type: 'grafana', id: 'grafana', name: 'Grafana', version: '8.5.0' }],
    annotations: { list: [] },
    editable: true,
    gnetId: null,
    graphTooltip: 1,
    id: null,
    links: [],
    panels: [
      {
        title: 'Active Sessions',
        type: 'stat',
        gridPos: { h: 4, w: 4, x: 0, y: 0 },
        targets: [{ expr: 'openclaw_viz_sessions_active', legendFormat: 'Active' }],
        options: { colorMode: 'background', graphMode: 'area' },
      },
      {
        title: 'Total Sessions',
        type: 'stat',
        gridPos: { h: 4, w: 4, x: 4, y: 0 },
        targets: [{ expr: 'openclaw_viz_sessions_total', legendFormat: 'Total' }],
        options: { colorMode: 'value' },
      },
      {
        title: 'Error Rate',
        type: 'stat',
        gridPos: { h: 4, w: 4, x: 8, y: 0 },
        targets: [{ expr: 'openclaw_viz_errors_total', legendFormat: 'Errors' }],
        options: { colorMode: 'background', thresholds: [{ color: 'red', value: 10 }] },
      },
      {
        title: 'Token Consumption',
        type: 'gauge',
        gridPos: { h: 4, w: 4, x: 12, y: 0 },
        targets: [{ expr: 'openclaw_viz_tokens_total', legendFormat: 'Tokens' }],
      },
      {
        title: 'Estimated Cost',
        type: 'stat',
        gridPos: { h: 4, w: 4, x: 16, y: 0 },
        targets: [{ expr: 'openclaw_viz_cost_total', legendFormat: 'Cost' }],
        options: { colorMode: 'value', decimals: 6 },
      },
      {
        title: 'Module Token Distribution',
        type: 'bargauge',
        gridPos: { h: 8, w: 8, x: 0, y: 4 },
        targets: [{ expr: 'openclaw_viz_module_tokens', legendFormat: '{{module}}' }],
      },
      {
        title: 'System Activity',
        type: 'timeseries',
        gridPos: { h: 8, w: 16, x: 8, y: 4 },
        targets: [
          { expr: 'openclaw_viz_sessions_active', legendFormat: 'Active Sessions' },
          { expr: 'openclaw_viz_errors_total', legendFormat: 'Errors' },
        ],
      },
    ],
    schemaVersion: 35,
    style: 'dark',
    tags: ['openclaw', 'viz'],
    templating: { list: [] },
    time: { from: 'now-1h', to: 'now' },
    timepicker: {},
    title: 'OpenClaw Viz - System Dashboard',
    uid: 'openclaw-viz',
    version: 1,
  };

  if (req.query.format === 'yaml') {
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', 'attachment; filename="openclaw-viz-grafana.json"');
    res.send(JSON.stringify(dashboard, null, 2));
  } else {
    res.json(dashboard);
  }
});

// SPA fallback
app.get('*', (req, res) => {
  if (existsSync(join(clientDist, 'index.html'))) {
    res.sendFile(join(clientDist, 'index.html'));
  } else {
    res.status(200).send('OpenClaw Viz - Dev mode. Run client dev server on port 5173.');
  }
});

// ─── WebSocket ──────────────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send initial data
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      topology: getAgentTopology(),
      sessions: getSessions(),
      cronJobs: getCronJobs(),
      stats: getSystemStats(),
    },
  }));

  ws.on('close', () => clients.delete(ws));
});

// Broadcast updates
function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: Date.now() });
  clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// Watch sessions file for changes
const sessionsPath = join(OPENCLAW_HOME, 'agents/main/sessions/sessions.json');
if (existsSync(sessionsPath)) {
  const watcher = watch(sessionsPath, {
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });

  watcher.on('change', () => {
    broadcast('sessions:update', {
      sessions: getSessions(),
      topology: getAgentTopology(),
    });
  });
}

// Periodic updates (every 10s)
setInterval(() => {
  broadcast('heartbeat', {
    sessions: getSessions(),
    topology: getAgentTopology(),
    stats: getSystemStats(),
  });
}, 10000);

// ─── Start ──────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║  🌀 OpenClaw Viz Server                   ║
  ║  http://localhost:${PORT}                    ║
  ║  WebSocket: ws://localhost:${PORT}/ws         ║
  ╚═══════════════════════════════════════════╝
  `);
});
