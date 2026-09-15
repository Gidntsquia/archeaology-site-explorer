import * as THREE from 'three';

const INTERP_DELAY = 100; // ms, render this far behind the newest sample

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
  sprite.position.set(0, 0.9, 0);
  return sprite;
}

function makeAvatarGroup(name) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.18, 0.5, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x4fa3ff }),
  );
  group.add(body);

  const facing = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcc55 }),
  );
  facing.rotation.x = Math.PI / 2;
  facing.position.set(0, 0, -0.3);
  group.add(facing);

  group.add(makeNameSprite(name));

  return group;
}

export function createAvatarManager(scene) {
  const peers = new Map(); // id -> { group, samples: [{t, p, q}] }

  function addPeer(id, name, p, q) {
    if (peers.has(id)) return;
    const group = makeAvatarGroup(name || 'anon');
    if (p) group.position.set(...p);
    if (q) group.quaternion.set(...q);
    scene.add(group);
    const now = performance.now();
    const initialSample = { t: now, p: p || [0, 0, 0], q: q || [0, 0, 0, 1] };
    peers.set(id, { group, samples: [initialSample, initialSample] });
  }

  function updatePose(id, p, q) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.samples.push({ t: performance.now(), p, q });
    if (peer.samples.length > 2) peer.samples.shift();
  }

  function removePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    scene.remove(peer.group);
    disposeGroup(peer.group);
    peers.delete(id);
  }

  function update() {
    const renderTime = performance.now() - INTERP_DELAY;
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
    }
  }

  function dispose() {
    for (const id of [...peers.keys()]) removePeer(id);
  }

  return { addPeer, updatePose, removePeer, update, dispose };
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
