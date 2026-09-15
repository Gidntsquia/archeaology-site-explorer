import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8787;
const PING_INTERVAL = 20000;

// room key -> { site, peers: Map<id, { ws, name, color, p, q }> }
const rooms = new Map();

let nextId = 1;

const AVATAR_COLORS = [
  0xe74c3c, // red
  0x3498db, // blue
  0x2ecc71, // green
  0xf1c40f, // yellow
  0x9b59b6, // purple
  0xe67e22, // orange
  0x1abc9c, // teal
  0xe84393, // pink
  0xf39c12, // amber
  0x00cec9, // cyan
];

function pickColor(room) {
  const used = new Set([...room.peers.values()].map((p) => p.color));
  const unused = AVATAR_COLORS.filter((c) => !used.has(c));
  if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)];
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

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
      const color = pickColor(target);
      room.peers.set(id, { ws, name, color, p: null, q: null });

      const peers = [...room.peers.entries()]
        .filter(([peerId]) => peerId !== id)
        .map(([peerId, peer]) => ({ id: peerId, name: peer.name, color: peer.color, p: peer.p, q: peer.q }));
      send(ws, { t: 'welcome', id, peers });
      broadcast(room, { t: 'peer-join', id, name, color }, id);
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

    if (msg.t === 'emote') {
      const type = String(msg.emoteType || 'wave').slice(0, 20);
      const phase = msg.phase === 'stop' ? 'stop' : 'start';
      broadcast(room, { t: 'emote', id, emoteType: type, phase }, id);
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
