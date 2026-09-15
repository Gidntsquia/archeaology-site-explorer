# Multiplayer Plan

Goal: two (or a few) people in the same site see each other as avatars in real time.

## Architecture

**Transport: a small WebSocket relay server** (`server/relay.js`, Node + `ws`). Clients send
their own pose; the server rebroadcasts to everyone else in the same room. No game logic on the
server, no persistence.

Why a relay and not WebRTC/P2P: WebRTC needs a signaling server anyway, and NAT traversal
between a phone on cellular and a laptop on WSL2 often needs TURN. A relay is ~80 lines, works
through the existing cloudflared tunnel, and is trivial to debug.

Why not a hosted service (Liveblocks, PartyKit, Colyseus): avoids an account and a dependency
for a two-person feature. Easy to swap later since all networking lives in one module.

**Rooms**: `siteId + roomCode`. Room code comes from the URL (`?room=abcd`); if absent, generate
one and push it into the URL so the address bar is the invite link.

## Protocol (JSON, ~15 Hz)

```
client -> server   { t: 'join', room, site, name }
client -> server   { t: 'pose', p: [x,y,z], q: [x,y,z,w] }         // only when changed
server -> client   { t: 'welcome', id, peers: [{id, name, p, q}] }
server -> client   { t: 'peer-join', id, name }
server -> client   { t: 'pose', id, p, q, ts }
server -> client   { t: 'peer-leave', id }
```

Server also sends ping every 20 s and drops sockets that miss two pongs.

## Client modules

- `src/net.js` — connect/reconnect with backoff, send pose at fixed rate (skip if unmoved),
  emit `peer-join / pose / peer-leave` events. Everything network-specific stays here.
- `src/avatars.js` — one `Group` per peer: a small capsule body plus a cone or short line showing
  view direction, and a `Sprite` name label that always faces the camera. Keeps a two-sample
  buffer per peer and interpolates ~100 ms behind the newest sample so movement is smooth at 15 Hz.
  Exposes `update(dt, camera)` and `dispose()`.
- `src/app.js` — after `loadSite`, call `net.join(siteId, room, name)`; in `animate()` call
  `net.sendPose(camera)` and `avatars.update(dt, camera)`. On back-to-picker, `net.leave()` and
  `avatars.dispose()`.
- `src/ui.js` — HUD shows room code, peer count, and a "copy invite link" button.
  Name prompt on first join, stored in `localStorage`.

## Dev and deploy

- `npm run dev` runs Vite and the relay together (`concurrently`); Vite proxies `/ws` to
  `localhost:8787` so the client always connects to `same-origin/ws` and one cloudflared tunnel
  covers both. Same for `vite preview` (phone testing uses the built preview).
- Production: relay on Fly.io / Railway / Render free tier, URL set via `VITE_RELAY_URL`.
  Static site stays wherever it is now.

## Steps

1. Relay server + `net.js`, verified with two browser tabs logging each other's poses.
2. Avatars with interpolation; tune send rate and lag buffer.
3. HUD: room code, peer count, invite link, name.
4. Vite proxy + `concurrently`; test laptop + phone through the tunnel.
5. Deploy relay; add `VITE_RELAY_URL`.

## Gotchas

- Both clients must load the identical site config, so poses are in the same coordinate frame.
  The relay rejects a join whose `site` differs from the room's site.
- Touch clients render at 30 fps; sending is decoupled from the render loop so rates match.
- Bounds clamping only applies to your own camera; remote poses are shown as received.
- Hide your own avatar (you'd see it inside the camera).

## Later

- Voice chat (WebRTC audio, relay used only for signaling).
- Pointer/laser: broadcast a raycast hit point so one person can point at something.
- Shared hotspot focus: "follow me" that teleports others to your pose.
- Position history / ghost trail for guided tours.
