import * as THREE from 'three';

const INTERP_DELAY = 100; // ms, render this far behind the newest sample

// Keyframes: [timeMs, rotationZ, rotationX]. z = arm swing out from body, x = forward/back swing.
const EMOTE_KEYFRAMES = {
  wave: [
    [0, 0, 0],
    [120, Math.PI * 0.6, -1.0], // big sweep up
    [280, Math.PI * 0.6, -0.35], // wave down
    [440, Math.PI * 0.6, -1.0], // wave back up
    [600, 0, 0], // return to standard
  ],
  raise: [
    [0, 0, 0],
    [200, 0.15, -1.5], // sweep straight up
    [1000, 0.15, -1.5], // hold
    [1250, 0, 0], // return to standard
  ],
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

function animateArmFrame(rightArm, baseArmRotationZ, waveStart, emoteType, now) {
  const keyframes = EMOTE_KEYFRAMES[emoteType];
  const elapsed = now - waveStart;
  const duration = keyframes[keyframes.length - 1][0];
  if (elapsed > duration) {
    rightArm.rotation.z = baseArmRotationZ;
    rightArm.rotation.x = 0;
    return false;
  }
  let i = 0;
  while (i < keyframes.length - 2 && elapsed > keyframes[i + 1][0]) i++;
  const [t0, z0, x0] = keyframes[i];
  const [t1, z1, x1] = keyframes[i + 1];
  const t = t1 > t0 ? (elapsed - t0) / (t1 - t0) : 1;
  rightArm.rotation.z = lerp(z0, z1, t);
  rightArm.rotation.x = lerp(x0, x1, t);
  return true;
}

export function createSelfArm(camera, color = 0xd9a24a) {
  const rightArm = makeArm(color, 1);
  rightArm.position.set(0.28, -0.28, -0.55);
  rightArm.scale.setScalar(1.3);
  camera.add(rightArm);
  const baseArmRotationZ = rightArm.rotation.z;
  let waveStart = null;
  let emoteType = null;

  function trigger(type) {
    if (!EMOTE_KEYFRAMES[type]) return;
    emoteType = type;
    waveStart = performance.now();
  }

  function update() {
    if (waveStart === null) return;
    const now = performance.now();
    const active = animateArmFrame(rightArm, baseArmRotationZ, waveStart, emoteType, now);
    if (!active) {
      waveStart = null;
      emoteType = null;
    }
  }

  function dispose() {
    camera.remove(rightArm);
  }

  return { trigger, update, dispose };
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
    peers.set(id, { group, rightArm, baseArmRotationZ, samples: [initialSample, initialSample], waveStart: null, emoteType: null });
  }

  function updatePose(id, p, q) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.samples.push({ t: performance.now(), p, q });
    if (peer.samples.length > 2) peer.samples.shift();
  }

  function triggerEmote(id, type) {
    if (!EMOTE_KEYFRAMES[type]) return;
    const peer = peers.get(id);
    if (!peer) return;
    peer.emoteType = type;
    peer.waveStart = performance.now();
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

      if (peer.waveStart !== null) {
        const active = animateArmFrame(peer.rightArm, peer.baseArmRotationZ, peer.waveStart, peer.emoteType, now);
        if (!active) {
          peer.waveStart = null;
          peer.emoteType = null;
        }
      }
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
