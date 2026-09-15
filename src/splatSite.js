import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

let sparkRenderer = null;

function getSpark(renderer, scene) {
  if (!sparkRenderer) {
    sparkRenderer = new SparkRenderer({ renderer });
    scene.add(sparkRenderer);
  }
  return sparkRenderer;
}

export function buildSplatSite(config, renderer, scene, onProgress) {
  getSpark(renderer, scene);

  const mesh = new SplatMesh({
    url: config.src,
    onProgress: (evt) => {
      if (onProgress && evt.total) onProgress(evt.loaded / evt.total);
    },
  });
  mesh.quaternion.set(1, 0, 0, 0);
  scene.add(mesh);

  return {
    object: mesh,
    ready: mesh.initialized,
    // Soft spring: push back starts at 80% of radius and ramps up, rather than a
    // hard wall at the edge, so the user feels resistance before hitting the limit.
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
      scene.remove(mesh);
      mesh.dispose();
    },
  };
}
