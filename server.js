const https = require('https');
const http = require('http');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';
const PORT = process.env.PORT || 3000;
const CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes

// ── CALL CLAUDE ───────────────────────────────────────────────────────────────
function callClaude(messages, system) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system,
      messages
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.content.map(b => b.text || '').join(''));
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── BOT TASKS ─────────────────────────────────────────────────────────────────
const BOT_TASKS = [
  {
    name: 'AirdropScanner',
    icon: '🪂',
    system: `You are AirdropScanner, running on the ForgeVault 24/7 server. 
    Your job is to research and find the TOP 3 most valuable active crypto airdrops available RIGHT NOW in April 2026.
    For each one provide: name, estimated value (honest LOW to HIGH range), deadline, eligibility requirements, and direct link.
    Be honest — most airdrops are worth very little. Only highlight ones with genuine potential.
    Format your response clearly with each airdrop numbered.`,
    message: 'Find the top 3 active crypto airdrops right now. Be honest about realistic values.',
    interval: 30 * 60 * 1000 // Every 30 mins
  },
  {
    name: 'MarketWatcher',
    icon: '📈',
    system: `You are MarketWatcher, running on the ForgeVault 24/7 server.
    Your job is to monitor crypto markets and identify significant price movements or opportunities.
    Check BTC, ETH, SOL and top altcoins. 
    Only alert if something genuinely significant is happening — do not manufacture alerts.
    Always include risk warnings. Never recommend investing more than someone can afford to lose.`,
    message: 'Check current crypto market conditions. Any significant movements or opportunities worth noting?',
    interval: 60 * 60 * 1000 // Every hour
  },
  {
    name: 'EarningsScout',
    icon: '💰',
    system: `You are EarningsScout, running on the ForgeVault 24/7 server.
    Your job is to find the best legitimate earning opportunities available TODAY.
    Focus on: survey platforms with current high-paying surveys, affiliate programmes with good current commission rates, micro task platforms with good availability.
    Be realistic — give honest earning estimates. Do not exaggerate.`,
    message: 'What are the best legitimate earning opportunities available right now today?',
    interval: 2 * 60 * 60 * 1000 // Every 2 hours
  }
];

// ── RESULTS STORE ─────────────────────────────────────────────────────────────
const results = {
  lastUpdated: null,
  bots: {},
  alerts: [],
  serverStarted: new Date().toISOString(),
  totalTasksRun: 0
};

// ── RUN BOT TASK ──────────────────────────────────────────────────────────────
async function runBotTask(task) {
  console.log(`[${new Date().toLocaleTimeString()}] Running ${task.name}...`);
  try {
    const result = await callClaude(
      [{ role: 'user', content: task.message }],
      task.system
    );

    results.bots[task.name] = {
      name: task.name,
      icon: task.icon,
      lastRun: new Date().toISOString(),
      result: result,
      status: 'success'
    };

    results.lastUpdated = new Date().toISOString();
    results.totalTasksRun++;

    // Add to alerts log
    results.alerts.unshift({
      bot: task.name,
      icon: task.icon,
      message: result.slice(0, 300),
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now()
    });

    // Keep only last 50 alerts
    if (results.alerts.length > 50) results.alerts = results.alerts.slice(0, 50);

    console.log(`[${new Date().toLocaleTimeString()}] ${task.name} completed successfully`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] ${task.name} failed:`, err.message);
    results.bots[task.name] = {
      name: task.name,
      icon: task.icon,
      lastRun: new Date().toISOString(),
      result: 'Task failed: ' + err.message,
      status: 'error'
    };
  }
}

// ── SCHEDULE ALL BOTS ─────────────────────────────────────────────────────────
function scheduleBots() {
  BOT_TASKS.forEach((task, index) => {
    // Stagger initial runs so they don't all fire at once
    setTimeout(() => {
      runBotTask(task);
      setInterval(() => runBotTask(task), task.interval);
    }, index * 10000); // 10 seconds apart
  });

  console.log(`[${new Date().toLocaleTimeString()}] All ${BOT_TASKS.length} bots scheduled`);
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
// This serves results to your ForgeVault app
const server = http.createServer((req, res) => {
  // CORS headers — allow ForgeVault app to fetch results
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;

  // GET /status — server health check
  if (url === '/status' || url === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ForgeVault Server Running 24/7',
      serverStarted: results.serverStarted,
      lastUpdated: results.lastUpdated,
      totalTasksRun: results.totalTasksRun,
      activeBots: BOT_TASKS.length,
      botNames: BOT_TASKS.map(b => b.name)
    }));
    return;
  }

  // GET /results — get all bot results
  if (url === '/results') {
    res.writeHead(200);
    res.end(JSON.stringify(results));
    return;
  }

  // GET /alerts — get recent alerts only
  if (url === '/alerts') {
    res.writeHead(200);
    res.end(JSON.stringify({
      alerts: results.alerts,
      lastUpdated: results.lastUpdated
    }));
    return;
  }

  // GET /airdrop — get airdrop scanner results
  if (url === '/airdrop') {
    res.writeHead(200);
    res.end(JSON.stringify(results.bots['AirdropScanner'] || { status: 'pending', message: 'First scan running...' }));
    return;
  }

  // GET /market — get market watcher results  
  if (url === '/market') {
    res.writeHead(200);
    res.end(JSON.stringify(results.bots['MarketWatcher'] || { status: 'pending', message: 'First check running...' }));
    return;
  }

  // GET /earnings — get earnings scout results
  if (url === '/earnings') {
    res.writeHead(200);
    res.end(JSON.stringify(results.bots['EarningsScout'] || { status: 'pending', message: 'First scan running...' }));
    return;
  }

  // POST /ask — ask a bot a direct question
  if (url === '/ask' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { question, botType } = JSON.parse(body);
        const task = BOT_TASKS.find(t => t.name === botType) || BOT_TASKS[0];
        const answer = await callClaude(
          [{ role: 'user', content: question }],
          task.system
        );
        res.writeHead(200);
        res.end(JSON.stringify({ answer, bot: task.name, time: new Date().toISOString() }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ── START ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   ⚡ FORGEVAULT SERVER ONLINE        ║
║   Port: ${PORT}                          ║
║   Bots: ${BOT_TASKS.length} active                    ║
║   Running 24/7 on Render             ║
╚══════════════════════════════════════╝
  `);
  scheduleBots();
});

// Keep alive — prevents Render free tier from sleeping
setInterval(() => {
  console.log(`[${new Date().toLocaleTimeString()}] Server heartbeat — ${results.totalTasksRun} tasks completed`);
}, 14 * 60 * 1000); // Every 14 minutes
