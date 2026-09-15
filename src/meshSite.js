import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let dracoLoader = null;
function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('draco/');
  }
  return dracoLoader;
}

export function buildMeshSite(config, renderer, scene, onProgress) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(20, 40, 20);
  scene.add(sun);

  let object = null;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  loader.setPath(config.assetPath);
  loader.load(
    config.src,
    (gltf) => {
      object = gltf.scene;
      scene.add(object);
      resolveReady();
    },
    (evt) => {
      if (onProgress && evt.total) onProgress(evt.loaded / evt.total);
    },
    (err) => console.error('glTF load failed', err),
  );

  return {
    object: null,
    ready,
    clampToBounds(position, dt = 1 / 60) {
      if (!config.bounds) return;
      const center = new THREE.Vector3(...config.bounds.center);
      const offset = position.clone().sub(center);
      const dist = offset.length();
      const softRadius = config.bounds.radius * 0.8;
      if (dist <= softRadius) return;

      const overshoot = Math.min((dist - softRadius) / (config.bounds.radius - softRadius), 1);
      const springStrength = 8;
      const pullBack = offset.clone().normalize().multiplyScalar(-overshoot * overshoot * springStrength * dt);
      position.add(pullBack);

      const hardDist = position.distanceTo(center);
      if (hardDist > config.bounds.radius) {
        position.copy(center).addScaledVector(position.clone().sub(center).normalize(), config.bounds.radius);
      }
    },
    dispose() {
      if (object) scene.remove(object);
    },
  };
}
