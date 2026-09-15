import * as THREE from 'three';

const INTERP_DELAY = 100; // ms, render this far behind the newest sample

// z = arm swing out from body, x = forward/up swing (positive = up and forward, since
// rotating +x moves the hanging arm toward -z/+y, i.e. up in front of the avatar).
const EMOTE_CONFIG = {
  wave: {
    upDuration: 120,
    upTo: [0.9, 2.6],
    loopPeriod: 160, // ms per half-cycle while held
    loopFrom: [0.9, 2.6],
    loopTo: [0.9, 2.25],
    downDuration: 220,
  },
  raise: {
    upDuration: 200,
    upTo: [0.15, 2.75],
    loopPeriod: 0, // static hold while held
    loopFrom: [0.15, 2.75],
    loopTo: [0.15, 2.75],
    downDuration: 250,
  },
};

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '32px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 20), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.set(0, 0.95, 0);
  return sprite;
}

function makeGhostBody(color) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    emissive: color,
    emissiveIntensity: 0.15,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), material);
  head.position.set(0, 0.18, 0);
  group.add(head);

  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12, 1, true), material);
  skirt.position.set(0, -0.15, 0);
  group.add(skirt);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeometry = new THREE.SphereGeometry(0.03, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eyeL.position.set(-0.08, 0.18, -0.19);
  group.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeometry, eyeMaterial);
  eyeR.position.set(0.08, 0.18, -0.19);
  group.add(eyeR);

  return group;
}

function makeArm(color, side) {
  const arm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.035, 0.22, 4, 8),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      emissive: color,
      emissiveIntensity: 0.15,
    }),
  );
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.2, 0.15, 0);
  arm.position.set(0, -0.11, 0);
  pivot.add(arm);
  pivot.rotation.z = side * 0.3;
  return pivot;
}

function makeAvatarGroup(name, color) {
  const group = new THREE.Group();
  group.add(makeGhostBody(color));

  const rightArm = makeArm(color, 1);
  group.add(rightArm);

  group.add(makeNameSprite(name));

  return { group, rightArm, baseArmRotationZ: rightArm.rotation.z };
}

function newEmoteState() {
  return { emoteType: null, phase: null, phaseStart: 0, downFromZ: 0, downFromX: 0 };
}

function startEmote(state, type) {
  if (!EMOTE_CONFIG[type]) return;
  state.emoteType = type;
  state.phase = 'up';
  state.phaseStart = performance.now();
}

function releaseEmote(state) {
  if (!state.emoteType || state.phase === 'down') return;
  state.phase = 'down';
  state.phaseStart = performance.now();
  state.downFromZ = state.currentZ ?? 0;
  state.downFromX = state.currentX ?? 0;
}

function updateEmoteState(state, rightArm, baseArmRotationZ, now) {
  if (!state.emoteType) return false;
  const cfg = EMOTE_CONFIG[state.emoteType];
  const elapsed = now - state.phaseStart;

  if (state.phase === 'up') {
    const t = Math.min(1, elapsed / cfg.upDuration);
    rightArm.rotation.z = lerp(0, cfg.upTo[0], t);
    rightArm.rotation.x = lerp(0, cfg.upTo[1], t);
    if (t >= 1) {
      state.phase = 'loop';
      state.phaseStart = now;
    }
  } else if (state.phase === 'loop') {
    if (cfg.loopPeriod > 0) {
      const cycle = (elapsed % (cfg.loopPeriod * 2)) / cfg.loopPeriod;
      const t = cycle <= 1 ? cycle : 2 - cycle;
      rightArm.rotation.z = lerp(cfg.loopFrom[0], cfg.loopTo[0], t);
      rightArm.rotation.x = lerp(cfg.loopFrom[1], cfg.loopTo[1], t);
    } else {
      rightArm.rotation.z = cfg.upTo[0];
      rightArm.rotation.x = cfg.upTo[1];
    }
  } else if (state.phase === 'down') {
    const t = Math.min(1, elapsed / cfg.downDuration);
    rightArm.rotation.z = lerp(state.downFromZ, baseArmRotationZ, t);
    rightArm.rotation.x = lerp(state.downFromX, 0, t);
    if (t >= 1) {
      state.emoteType = null;
      state.phase = null;
      state.currentZ = null;
      state.currentX = null;
      return false;
    }
  }
  state.currentZ = rightArm.rotation.z;
  state.currentX = rightArm.rotation.x;
  return true;
}

export function createSelfArm(camera, color = 0xd9a24a) {
  const rightArm = makeArm(color, 1);
  rightArm.position.set(0.28, -0.28, -0.55);
  rightArm.scale.setScalar(1.3);
  camera.add(rightArm);
  const baseArmRotationZ = rightArm.rotation.z;
  const state = newEmoteState();

  function trigger(type) {
    startEmote(state, type);
  }

  function release(type) {
    if (!type || state.emoteType === type) releaseEmote(state);
  }

  function update() {
    updateEmoteState(state, rightArm, baseArmRotationZ, performance.now());
  }

  function dispose() {
    camera.remove(rightArm);
  }

  return { trigger, release, update, dispose };
}

export function createAvatarManager(scene) {
  const peers = new Map(); // id -> { group, rightArm, baseArmRotationZ, samples, waveStart }

  function addPeer(id, name, p, q, color) {
    if (peers.has(id)) return;
    const avatarColor = color ?? randomColor();
    const { group, rightArm, baseArmRotationZ } = makeAvatarGroup(name || 'anon', avatarColor);
    if (p) group.position.set(...p);
    if (q) group.quaternion.set(...q);
    scene.add(group);
    const now = performance.now();
    const initialSample = { t: now, p: p || [0, 0, 0], q: q || [0, 0, 0, 1] };
    peers.set(id, { group, rightArm, baseArmRotationZ, samples: [initialSample, initialSample], emote: newEmoteState() });
  }

  function updatePose(id, p, q) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.samples.push({ t: performance.now(), p, q });
    if (peer.samples.length > 2) peer.samples.shift();
  }

  function triggerEmote(id, type, phase = 'start') {
    const peer = peers.get(id);
    if (!peer) return;
    if (phase === 'stop') {
      releaseEmote(peer.emote);
    } else {
      startEmote(peer.emote, type);
    }
  }

  function removePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    scene.remove(peer.group);
    disposeGroup(peer.group);
    peers.delete(id);
  }

  function update() {
    const now = performance.now();
    const renderTime = now - INTERP_DELAY;
    for (const peer of peers.values()) {
      const [a, b] = peer.samples;
      let t = 0;
      if (b.t > a.t) t = (renderTime - a.t) / (b.t - a.t);
      t = Math.max(0, Math.min(1, t));

      peer.group.position.set(
        lerp(a.p[0], b.p[0], t),
        lerp(a.p[1], b.p[1], t),
        lerp(a.p[2], b.p[2], t),
      );
      const qa = new THREE.Quaternion(...a.q);
      const qb = new THREE.Quaternion(...b.q);
      peer.group.quaternion.slerpQuaternions(qa, qb, t);

      updateEmoteState(peer.emote, peer.rightArm, peer.baseArmRotationZ, now);
    }
  }

  function dispose() {
    for (const id of [...peers.keys()]) removePeer(id);
  }

  return { addPeer, updatePose, removePeer, triggerEmote, update, dispose };
}

function randomColor() {
  return new THREE.Color().setHSL(Math.random(), 0.65, 0.6).getHex();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}
