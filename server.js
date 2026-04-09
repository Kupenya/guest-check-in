const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { WebSocketServer } = require('ws');

const PORT        = process.env.PORT || 3000;
const CHECKINS_FILE = path.join(__dirname, 'checkins.json');

// ── Load persisted check-ins ─────────────────────────────────
let checkins = {};
if (fs.existsSync(CHECKINS_FILE)) {
  try { checkins = JSON.parse(fs.readFileSync(CHECKINS_FILE, 'utf8')); }
  catch (e) { console.warn('Could not read checkins.json, starting fresh.'); }
}

function saveCheckins() {
  fs.writeFileSync(CHECKINS_FILE, JSON.stringify(checkins, null, 2));
}

// ── Static file server ───────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.csv':  'text/csv',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ── WebSocket server ─────────────────────────────────────────
const wss = new WebSocketServer({ server });

function broadcast(data, exclude) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== exclude && client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', ws => {
  // Send full current state to new client
  ws.send(JSON.stringify({ type: 'init', checkins }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'checkin') {
      checkins[msg.idx] = { ts: Date.now() };
      saveCheckins();
      broadcast({ type: 'checkin', idx: msg.idx }, ws);
    }

    if (msg.type === 'undo') {
      delete checkins[msg.idx];
      saveCheckins();
      broadcast({ type: 'undo', idx: msg.idx }, ws);
    }
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`\n✓ Guest check-in running at http://localhost:${PORT}`);
  console.log(`  Share this URL with ushers on the same network.\n`);
});
