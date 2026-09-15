const SEND_INTERVAL = 1000 / 15;
const RECONNECT_BASE = 500;
const RECONNECT_MAX = 8000;

let ws = null;
let reconnectDelay = RECONNECT_BASE;
let reconnectTimer = null;
let sendTimer = null;
let joinInfo = null;
let selfId = null;
let closedByUser = false;

let lastSent = { p: null, q: null };

const listeners = { 'peer-join': [], pose: [], 'peer-leave': [], connected: [], emote: [] };

export function on(event, cb) {
  listeners[event].push(cb);
}

function emit(event, data) {
  for (const cb of listeners[event]) cb(data);
}

function relayUrl() {
  if (import.meta.env.VITE_RELAY_URL) return import.meta.env.VITE_RELAY_URL;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function join(site, room, name) {
  joinInfo = { site, room, name };
  closedByUser = false;
  connect();
}

function connect() {
  if (!joinInfo) return;
  ws = new WebSocket(relayUrl());

  ws.addEventListener('open', () => {
    reconnectDelay = RECONNECT_BASE;
    ws.send(JSON.stringify({ t: 'join', ...joinInfo }));
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });

  ws.addEventListener('close', () => {
    if (closedByUser) return;
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });
}

function handleMessage(msg) {
  if (msg.t === 'welcome') {
    selfId = msg.id;
    emit('connected', { id: msg.id });
    for (const peer of msg.peers) emit('peer-join', peer);
  } else if (msg.t === 'peer-join') {
    emit('peer-join', msg);
  } else if (msg.t === 'pose') {
    emit('pose', msg);
  } else if (msg.t === 'peer-leave') {
    emit('peer-leave', msg);
  } else if (msg.t === 'emote') {
    emit('emote', msg);
  }
}

export function getSelfId() {
  return selfId;
}

export function sendPose(camera) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (sendTimer) return;
  sendTimer = setTimeout(() => {
    sendTimer = null;
  }, SEND_INTERVAL);

  const p = [camera.position.x, camera.position.y, camera.position.z];
  const q = [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w];

  if (lastSent.p && samePose(lastSent.p, p) && samePose(lastSent.q, q)) return;
  lastSent = { p, q };
  ws.send(JSON.stringify({ t: 'pose', p, q }));
}

function samePose(a, b, eps = 1e-4) {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

export function sendEmote(emoteType) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ t: 'emote', emoteType }));
}

export function leave() {
  closedByUser = true;
  joinInfo = null;
  selfId = null;
  lastSent = { p: null, q: null };
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (sendTimer) clearTimeout(sendTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
}
