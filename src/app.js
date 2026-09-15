import * as THREE from 'three';
import { FlyControls } from './controls.js';
import { TouchControls } from './touchControls.js';
import { buildSplatSite } from './splatSite.js';
import { buildMeshSite } from './meshSite.js';
import * as net from './net.js';
import { createAvatarManager } from './avatars.js';
import testSplatConfig from './sites/test-splat.json' with { type: 'json' };
import skaraBraeConfig from './sites/skara-brae.json' with { type: 'json' };
import * as ui from './ui.js';

const SITES = {
  'test-splat': { config: testSplatConfig, kind: 'splat' },
  'skara-brae': { config: skaraBraeConfig, kind: 'mesh' },
};

const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('is-touch', isTouch);
if (new URLSearchParams(location.search).has('debug')) document.body.classList.add('debug');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const lowMemory = isTouch && navigator.deviceMemory && navigator.deviceMemory < 4;
let dpr = Math.min(window.devicePixelRatio, lowMemory ? 1 : isTouch ? 1.25 : 2);
renderer.setPixelRatio(dpr);
renderer.setSize(getViewportWidth(), getViewportHeight());

const camera = new THREE.PerspectiveCamera(70, getViewportWidth() / getViewportHeight(), 0.01, 2000);

let scene = null;
let controls = null;
let currentSite = null;
let siteHotspots = [];
let activeSiteId = null;
let avatars = null;

function getOrCreateRoomCode() {
  const params = new URLSearchParams(location.search);
  let room = params.get('room');
  if (!room) {
    room = Math.random().toString(36).slice(2, 8);
    params.set('room', room);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }
  return room;
}

function getViewportWidth() {
  return window.visualViewport ? window.visualViewport.width : window.innerWidth;
}
function getViewportHeight() {
  return window.visualViewport ? window.visualViewport.height : window.innerHeight;
}

function handleResize() {
  camera.aspect = getViewportWidth() / getViewportHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(getViewportWidth(), getViewportHeight());
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  clock.getDelta();
});

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  ui.showContextLost();
});
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  ui.hideContextLost();
});

let paused = false;
let contextLost = false;
let lowFpsAccum = 0;

document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('click', () => loadSite(card.dataset.site));
});

ui.onBack(() => {
  activeSiteId = null;
  if (currentSite) currentSite.dispose();
  currentSite = null;
  controls.enabled = false;
  document.exitPointerLock?.();
  net.leave();
  if (avatars) avatars.dispose();
  avatars = null;
  knownPeers.clear();
  ui.showPicker();
});

ui.onInviteClick(() => ui.copyInviteLink());

const knownPeers = new Set();

net.on('peer-join', (peer) => {
  if (avatars) avatars.addPeer(peer.id, peer.name, peer.p, peer.q, peer.color);
  knownPeers.add(peer.id);
  ui.setPeerCount(knownPeers.size);
});
net.on('pose', (msg) => {
  if (avatars) avatars.updatePose(msg.id, msg.p, msg.q);
});
net.on('peer-leave', (msg) => {
  if (avatars) avatars.removePeer(msg.id);
  knownPeers.delete(msg.id);
  ui.setPeerCount(knownPeers.size);
});
net.on('emote', (msg) => {
  if (avatars) avatars.triggerEmote(msg.id, msg.emoteType);
});

function sendWave() {
  if (!activeSiteId) return;
  net.sendEmote('wave');
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat) sendWave();
});
ui.onWaveClick(sendWave);

async function loadSite(siteId) {
  const site = SITES[siteId];
  if (!site) return;
  activeSiteId = siteId;
  ui.showHud();
  ui.setLoading(0.05);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const build = site.kind === 'mesh' ? buildMeshSite : buildSplatSite;
  currentSite = build(site.config, renderer, scene, (frac) => {
    ui.setLoading(0.1 + frac * 0.85);
  });
  await currentSite.ready;
  ui.setLoading(0.95);

  const { position, lookAt } = site.config.spawn;
  camera.position.set(...position);
  camera.lookAt(...lookAt);

  if (controls) controls.dispose();
  const ControlsClass = isTouch ? TouchControls : FlyControls;
  controls = new ControlsClass(camera, canvas, {
    speed: site.config.speed,
    fastMultiplier: site.config.fastMultiplier,
  });
  if (isTouch) {
    controls.setSpawn(position, lookAt);
    ui.maybeShowGestureOverlay();
  }
  controls.enabled = true;

  siteHotspots = (site.config.hotspots || []).map((h) => ({ ...h, vec: new THREE.Vector3(...h.position) }));
  ui.setLocationName(site.config.name);
  ui.setLoading(1);

  avatars = createAvatarManager(scene);
  const room = getOrCreateRoomCode();
  ui.setRoomInfo(room);
  ui.setPeerCount(0);
  const name = await ui.promptForName();
  net.join(siteId, room, name);
}

const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;

const FRAME_INTERVAL = isTouch ? 1 / 30 : 0;
let frameAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  if (paused || contextLost) return;
  let dt = Math.min(clock.getDelta(), 0.1);

  if (FRAME_INTERVAL > 0) {
    frameAccum += dt;
    if (frameAccum < FRAME_INTERVAL) return;
    dt = frameAccum;
    frameAccum = 0;
  }

  if (activeSiteId && controls) {
    controls.update(dt);
    if (currentSite) currentSite.clampToBounds(camera.position, dt);
    updateHotspotProximity();
    net.sendPose(camera);
    if (avatars) avatars.update();
    renderer.render(scene, camera);
  }

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    const fps = fpsFrames / fpsAccum;
    ui.setFps(fps);
    if (dpr > 1 && fps < 25) {
      lowFpsAccum += fpsAccum;
      if (lowFpsAccum >= 3) {
        dpr = 1;
        renderer.setPixelRatio(dpr);
        lowFpsAccum = 0;
      }
    } else {
      lowFpsAccum = 0;
    }
    fpsAccum = 0;
    fpsFrames = 0;
  }
}

let nearestHotspot = null;
function updateHotspotProximity() {
  let closest = null;
  let closestDist = Infinity;
  for (const h of siteHotspots) {
    const d = camera.position.distanceTo(h.vec);
    if (d < closestDist) {
      closestDist = d;
      closest = h;
    }
  }
  const PROXIMITY_RADIUS = 6;
  if (closest && closestDist < PROXIMITY_RADIUS) {
    if (nearestHotspot !== closest) {
      nearestHotspot = closest;
      ui.showHotspot(closest.name, closest.text);
    }
  } else if (nearestHotspot) {
    nearestHotspot = null;
    ui.hideHotspot();
  }
}

animate();
