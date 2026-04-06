const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY || '';

const results = {
  started: new Date().toISOString(),
  tasks: 0,
  alerts: [],
  bots: {}
};

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
        if (parsed.content) {
          cb(null, parsed.content[0].text);
        } else {
          cb(new Error('No content: ' + data.slice(0,100)));
        }
      } catch(e) { cb(e); }
    });
  });

  req.on('error', function(e) { cb(e); });
  req.write(body);
  req.end();
}

function runBot(name, system, message) {
  console.log('Running ' + name);
  callClaude([{role:'user', content: message}], system, function(err, result) {
    if (err) { console.log(name + ' error: ' + err.message); return; }
    results.bots[name] = { name: name, result: result, time: new Date().toISOString() };
    results.alerts.unshift({ bot: name, message: result.slice(0, 200), time: new Date().toLocaleTimeString() });
    if (results.alerts.length > 20) results.alerts.pop();
    results.tasks++;
    console.log(name + ' done. Total tasks: ' + results.tasks);
  });
}

function runAllBots() {
  runBot('AirdropScanner', 'Find legitimate free crypto airdrops. Be honest - most are worth very little.', 'Find top 3 active crypto airdrops right now with honest value estimates.');
  setTimeout(function() {
    runBot('EarningsScout', 'Find legitimate ways to earn money online. Be realistic.', 'Best earning opportunities available today?');
  }, 10000);
}

var server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/' || req.url === '/status') {
    res.end(JSON.stringify({status:'running', tasks: results.tasks, started: results.started}));
  } else if (req.url === '/results') {
    res.end(JSON.stringify(results));
  } else if (req.url === '/alerts') {
    res.end(JSON.stringify({alerts: results.alerts}));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({error:'not found'}));
  }
});

server.listen(PORT, function() {
  console.log('ForgeVault Server online on port ' + PORT);
  runAllBots();
  setInterval(runAllBots, 30 * 60 * 1000);
});
