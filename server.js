// Hearthlight co-op relay server.
// Serves index.html over HTTP and relays messages between players in a room over WebSocket.
// The game simulation runs on the host player's browser (host-authoritative); this server
// only hands out room codes, routes messages, and handles disconnects / rejoins.
//
//   npm install
//   node server.js            (default port 8080, override with PORT=9000 node server.js)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 4;
const MAX_ROOMS = 500;          // public deployments: cap how many games can be open at once
const MSG_PER_SEC = 400;        // generous for real play (a host sends ~60/s); floods get dropped
const MSG_KICK_PER_SEC = 2000;  // far beyond any real client: disconnect
const HOST_GRACE_MS = 15000; // how long a room survives without its host (refresh / blip)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { res.writeHead(500); res.end('index.html missing'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } else if (url === '/health') {
    // CORS so the GitHub Pages site can ping (and wake) a sleeping free-tier server
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  } else {
    res.writeHead(404); res.end('not found');
  }
});

const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
const rooms = new Map(); // code -> room

function makeCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room codes');
}
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

// room = { code, members: Map<pid, {pid, ws|null, name, token, goneAt}>, hostTimer }
function roster(room) {
  return [...room.members.values()].map(m => ({ pid: m.pid, name: m.name, online: !!m.ws }));
}
function broadcast(room, obj, exceptPid) {
  const s = JSON.stringify(obj);
  for (const m of room.members.values()) if (m.pid !== exceptPid && m.ws) send(m.ws, s);
}
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

wss.on('connection', (ws, req) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  log('connect', req.socket.remoteAddress);

  ws.on('message', (raw) => {
    // per-connection rate limit
    const now = Date.now();
    if (now - (ws.rateT || 0) >= 1000) { ws.rateT = now; ws.rateN = 0; }
    ws.rateN = (ws.rateN || 0) + 1;
    if (ws.rateN > MSG_KICK_PER_SEC) { ws.terminate(); return; }
    if (ws.rateN > MSG_PER_SEC) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'host') {
      // fresh room, or host reclaiming its room after a refresh
      if (msg.code && msg.token && rooms.has(msg.code)) {
        const room = rooms.get(msg.code), h = room.members.get(0);
        if (h && h.token === msg.token) {
          h.ws = ws; h.goneAt = 0; ws.room = room; ws.pid = 0;
          clearTimeout(room.hostTimer); room.hostTimer = null;
          send(ws, { t: 'hosted', code: room.code, pid: 0, token: h.token, roster: roster(room), resumed: true });
          broadcast(room, { t: 'hostBack', roster: roster(room) }, 0);
          log('host resumed', room.code);
          return;
        }
      }
      if (rooms.size >= MAX_ROOMS) { send(ws, { t: 'error', reason: 'The server is full right now. Try again in a few minutes.' }); return; }
      const code = makeCode();
      const room = { code, members: new Map(), hostTimer: null };
      const m = { pid: 0, ws, name: String(msg.name || 'Host').slice(0, 16), token: token(), goneAt: 0 };
      room.members.set(0, m); rooms.set(code, room);
      ws.room = room; ws.pid = 0;
      send(ws, { t: 'hosted', code, pid: 0, token: m.token, roster: roster(room) });
      log('room created', code);
      return;
    }

    if (msg.t === 'join') {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(ws, { t: 'error', reason: 'No game found with code ' + code }); return; }
      // rejoin with a token keeps the same player slot
      let m = null;
      if (msg.token) for (const x of room.members.values()) if (x.token === msg.token && x.pid !== 0) m = x;
      if (m) {
        if (m.ws && m.ws !== ws) { try { m.ws.close(4000, 'replaced'); } catch {} }
        m.ws = ws; m.goneAt = 0;
      } else {
        // drop stale offline slots so the room doesn't fill up with ghosts
        for (const x of [...room.members.values()]) if (x.pid !== 0 && !x.ws) room.members.delete(x.pid);
        if (room.members.size >= MAX_PLAYERS) { send(ws, { t: 'error', reason: 'That game is full (4 players)' }); return; }
        let pid = 1; while (room.members.has(pid)) pid++;
        m = { pid, ws, name: String(msg.name || 'Player').slice(0, 16), token: token(), goneAt: 0 };
        room.members.set(pid, m);
      }
      ws.room = room; ws.pid = m.pid;
      send(ws, { t: 'joined', code, pid: m.pid, token: m.token, roster: roster(room), hostOnline: !!(room.members.get(0) || {}).ws });
      broadcast(room, { t: 'peerJoin', pid: m.pid, name: m.name, roster: roster(room) }, m.pid);
      log('join', code, 'pid', m.pid, m.name);
      return;
    }

    if (msg.t === 'msg') {
      const room = ws.room; if (!room) return;
      const out = JSON.stringify({ t: 'msg', from: ws.pid, d: msg.d });
      if (msg.to === 'all') {
        for (const m of room.members.values()) if (m.pid !== ws.pid && m.ws) send(m.ws, out);
      } else {
        const m = room.members.get(msg.to === 'host' ? 0 : Number(msg.to));
        if (m && m.ws) send(m.ws, out);
      }
      return;
    }

    if (msg.t === 'leave') { ws.close(1000, 'leave'); }
  });

  ws.on('close', () => {
    const room = ws.room; if (!room) return;
    const m = room.members.get(ws.pid);
    if (!m || m.ws !== ws) return; // already replaced by a reconnect
    m.ws = null; m.goneAt = Date.now();
    if (ws.pid === 0) {
      log('host lost', room.code);
      broadcast(room, { t: 'hostLost', graceMs: HOST_GRACE_MS });
      room.hostTimer = setTimeout(() => {
        broadcast(room, { t: 'roomClosed', reason: 'The host left the game' });
        for (const x of room.members.values()) if (x.ws) try { x.ws.close(1000, 'room closed'); } catch {}
        rooms.delete(room.code);
        log('room closed', room.code);
      }, HOST_GRACE_MS);
    } else {
      log('peer left', room.code, ws.pid);
      broadcast(room, { t: 'peerLeave', pid: ws.pid, roster: roster(room) });
    }
  });
});

// heartbeat: drop dead sockets so disconnects are noticed quickly
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; try { ws.ping(); } catch {}
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`\n  Hearthlight server running on port ${PORT}\n`);
  console.log(`  This computer:     http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Same network (LAN): http://${a.address}:${PORT}`);
  }
  console.log('\n  Open one of those addresses in a browser, then Host or Join from the title screen.\n');
});
