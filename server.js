const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const results = {
  started: new Date().toISOString(),
  tasks: 0,
  alerts: [],
  airdrops: [],
  bots: {}
};

// ── CALL CLAUDE ───────────────────────────────────────────────────────────────
function callClaude(messages, system, cb) {
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: system,
    messages: messages
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

  const req = https.request(options, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        var parsed = JSON.parse(data);
        if (parsed.content) cb(null, parsed.content[0].text);
        else cb(new Error('No content: ' + data.slice(0,100)));
      } catch(e) { cb(e); }
    });
  });
  req.on('error', function(e) { cb(e); });
  req.write(body);
  req.end();
}

// ── FETCH REAL AIRDROPS FROM DEFI LLAMA ──────────────────────────────────────
function fetchRealAirdrops(cb) {
  const options = {
    hostname: 'api.llama.fi',
    path: '/airdrops',
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  };

  const req = https.request(options, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        var parsed = JSON.parse(data);
        cb(null, Array.isArray(parsed) ? parsed.slice(0, 10) : []);
      } catch(e) { cb(null, []); }
    });
  });
  req.on('error', function(e) { cb(null, []); });
  req.end();
}

// ── RUN BOT ───────────────────────────────────────────────────────────────────
function runBot(name, system, message, cb) {
  console.log('[' + new Date().toLocaleTimeString() + '] Running ' + name);
  callClaude([{role:'user', content: message}], system, function(err, result) {
    if (err) {
      console.log(name + ' error: ' + err.message);
      if(cb) cb(err);
      return;
    }
    results.bots[name] = {
      name: name,
      result: result,
      time: new Date().toISOString(),
      status: 'success'
    };
    results.alerts.unshift({
      bot: name,
      message: result.slice(0, 300),
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now()
    });
    if (results.alerts.length > 50) results.alerts.pop();
    results.tasks++;
    console.log('[' + new Date().toLocaleTimeString() + '] ' + name + ' done. Tasks: ' + results.tasks);
    if(cb) cb(null, result);
  });
}

// ── AIRDROP SCANNER WITH REAL DATA ───────────────────────────────────────────
function runAirdropScanner() {
  // First fetch real airdrop data
  fetchRealAirdrops(function(err, airdrops) {
    var context = airdrops.length > 0 
      ? 'Real airdrops from DefiLlama: ' + JSON.stringify(airdrops.slice(0,3))
      : 'No real-time data available, use your knowledge of current airdrops';

    runBot(
      'AirdropScanner',
      'You find legitimate free crypto airdrops. Be honest — most are worth very little. Never recommend anything requiring upfront payment.',
      'Find the top 3 active crypto airdrops right now in April 2026. Context: ' + context + '. Give honest value estimates and exact claim steps.',
      function(err, result) {
        if(!err && result) {
          results.airdrops = [{
            time: new Date().toISOString(),
            data: result,
            source: 'AirdropScanner'
          }];
        }
      }
    );
  });
}

function runEarningsScout() {
  runBot(
    'EarningsScout',
    'Find legitimate ways to earn money online. Be realistic about earnings. Prolific.co surveys pay £6-12/hour. Give exact steps.',
    'What are the best earning opportunities available today? Be specific and honest about realistic earnings.'
  );
}

function runMarketWatcher() {
  runBot(
    'MarketWatcher', 
    'Monitor crypto markets. Only alert on significant genuine movements. Always include risk warnings.',
    'Check current crypto market conditions for BTC, ETH, SOL. Any significant opportunities or risks?'
  );
}

// ── SCHEDULE BOTS ─────────────────────────────────────────────────────────────
function startBots() {
  // Stagger initial runs
  setTimeout(function() { runAirdropScanner(); }, 5000);
  setTimeout(function() { runEarningsScout(); }, 15000);
  setTimeout(function() { runMarketWatcher(); }, 25000);

  // Schedule repeating runs
  setInterval(runAirdropScanner, 30 * 60 * 1000);  // Every 30 mins
  setInterval(runEarningsScout, 2 * 60 * 60 * 1000); // Every 2 hours
  setInterval(runMarketWatcher, 60 * 60 * 1000);    // Every hour

  console.log('[' + new Date().toLocaleTimeString() + '] All bots scheduled');
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
var server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if(req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  var url = req.url.split('?')[0];

  if(url === '/' || url === '/status') {
    res.end(JSON.stringify({
      status: 'ForgeVault Server Running',
      started: results.started,
      tasks: results.tasks,
      bots: Object.keys(results.bots),
      uptime: Math.floor((Date.now() - new Date(results.started).getTime()) / 1000) + 's'
    }));
  } else if(url === '/results') {
    res.end(JSON.stringify(results));
  } else if(url === '/alerts') {
    res.end(JSON.stringify({ alerts: results.alerts, count: results.alerts.length }));
  } else if(url === '/airdrops') {
    res.end(JSON.stringify({ 
      airdrops: results.airdrops,
      latest: results.bots['AirdropScanner'] || null
    }));
  } else if(url === '/earnings') {
    res.end(JSON.stringify(results.bots['EarningsScout'] || {status:'pending'}));
  } else if(url === '/market') {
    res.end(JSON.stringify(results.bots['MarketWatcher'] || {status:'pending'}));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({error:'Not found'}));
  }
});

server.listen(PORT, function() {
  console.log('\n⚡ FORGEVAULT SERVER ONLINE');
  console.log('Port: ' + PORT);
  console.log('API Key: ' + (ANTHROPIC_KEY ? 'SET ✅' : 'MISSING ❌'));
  console.log('');
  startBots();
});

// Heartbeat to prevent Render free tier sleeping
setInterval(function() {
  console.log('[' + new Date().toLocaleTimeString() + '] ♥ heartbeat — tasks: ' + results.tasks);
}, 14 * 60 * 1000);
