import * as THREE from 'three';

const KEY_MAP = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  KeyE: 'up', KeyQ: 'down', ShiftLeft: 'fast', ShiftRight: 'fast',
};

export class FlyControls {
  constructor(camera, domElement, { speed = 5, fastMultiplier = 4 } = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.speed = speed;
    this.fastMultiplier = fastMultiplier;
    this.enabled = false;

    this.state = { forward: false, back: false, left: false, right: false, up: false, down: false, fast: false };
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(camera.quaternion);

    this._onKeyDown = (e) => { if (KEY_MAP[e.code]) this.state[KEY_MAP[e.code]] = true; };
    this._onKeyUp = (e) => { if (KEY_MAP[e.code]) this.state[KEY_MAP[e.code]] = false; };
    this._onMouseMove = (e) => {
      if (!this.enabled || document.pointerLockElement !== this.domElement) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.euler.y -= dx * 0.0025;
      this.euler.x -= dy * 0.0025;
      this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    };
    this._onClick = () => { if (this.enabled) this.domElement.requestPointerLock(); };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('click', this._onClick);
  }

  setSpeed(speed) { this.speed = speed; }

  update(dt) {
    if (!this.enabled) return;
    const s = this.state;
    const dir = new THREE.Vector3();
    if (s.forward) dir.z -= 1;
    if (s.back) dir.z += 1;
    if (s.left) dir.x -= 1;
    if (s.right) dir.x += 1;
    if (dir.lengthSq() > 0) dir.normalize();

    dir.applyQuaternion(this.camera.quaternion);
    if (s.up) dir.y += 1;
    if (s.down) dir.y -= 1;

    const mult = s.fast ? this.fastMultiplier : 1;
    this.camera.position.addScaledVector(dir, this.speed * mult * dt);
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('click', this._onClick);
  }
}
