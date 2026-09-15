import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;
const PING_INTERVAL = 20000;

// room key -> { site, peers: Map<id, { ws, name, p, q }> }
const rooms = new Map();

let nextId = 1;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT);

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  for (const [id, peer] of room.peers) {
    if (id !== exceptId) send(peer.ws, msg);
  }
}

wss.on('connection', (ws) => {
  const id = String(nextId++);
  let room = null;
  let missedPongs = 0;

  ws.on('pong', () => {
    missedPongs = 0;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === 'join') {
      const key = `${msg.site}:${msg.room}`;
      let target = rooms.get(key);
      if (!target) {
        target = { site: msg.site, peers: new Map() };
        rooms.set(key, target);
      }
      if (target.site !== msg.site) return;

      room = target;
      const name = String(msg.name || 'anon').slice(0, 40);
      room.peers.set(id, { ws, name, p: null, q: null });

      const peers = [...room.peers.entries()]
        .filter(([peerId]) => peerId !== id)
        .map(([peerId, peer]) => ({ id: peerId, name: peer.name, p: peer.p, q: peer.q }));
      send(ws, { t: 'welcome', id, peers });
      broadcast(room, { t: 'peer-join', id, name }, id);
      return;
    }

    if (!room) return;
    const peer = room.peers.get(id);
    if (!peer) return;

    if (msg.t === 'pose') {
      peer.p = msg.p;
      peer.q = msg.q;
      broadcast(room, { t: 'pose', id, p: msg.p, q: msg.q, ts: Date.now() }, id);
    }
  });

  ws.on('close', () => {
    if (room) {
      room.peers.delete(id);
      broadcast(room, { t: 'peer-leave', id });
      if (room.peers.size === 0) {
        for (const [key, r] of rooms) {
          if (r === room) rooms.delete(key);
        }
      }
    }
  });

  const pingTimer = setInterval(() => {
    if (missedPongs >= 2) {
      ws.terminate();
      return;
    }
    missedPongs++;
    ws.ping();
  }, PING_INTERVAL);

  ws.on('close', () => clearInterval(pingTimer));
});

console.log(`Relay listening on ws://localhost:${PORT}`);
