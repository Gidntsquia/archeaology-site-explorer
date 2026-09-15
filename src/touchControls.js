import * as THREE from 'three';

const JOYSTICK_RADIUS = 50;
const LOOK_SENSITIVITY = 0.004;
const VERTICAL_SENSITIVITY = 0.02;
const PINCH_SENSITIVITY = 0.006;
const MIN_SPEED_MULT = 0.3;
const MAX_SPEED_MULT = 4;

export class TouchControls {
  constructor(camera, domElement, { speed = 5, fastMultiplier = 4 } = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.speed = speed;
    this.fastMultiplier = fastMultiplier;
    this.enabled = false;

    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(camera.quaternion);

    this.movePointerId = null;
    this.moveOrigin = { x: 0, y: 0 };
    this.moveVector = { x: 0, y: 0 };

    this.lookPointerId = null;
    this.lookLast = { x: 0, y: 0 };
    this.lookPos = { x: 0, y: 0 };

    this.verticalPointerIds = [];
    this.verticalLastY = 0;
    this.verticalDelta = 0;
    this.vertPos = { x: 0, y: 0 };
    this.pinchLastDist = null;
    this.speedMultiplier = 1;

    this.lastTap = 0;
    this.spawn = null;
    this.buttonVertical = 0;

    // gyro mode: camera = yaw(_yawOffset) * device * pitch(_pitchOffset); touch drags edit the offsets
    this._deviceQuat = new THREE.Quaternion();
    this._hasDeviceQuat = false;
    this._yawOffset = 0;
    this._pitchOffset = 0;
    this._yawQuat = new THREE.Quaternion();
    this._pitchQuat = new THREE.Quaternion();
    this._yAxis = new THREE.Vector3(0, 1, 0);
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._zee = new THREE.Vector3(0, 0, 1);
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    this._orientEuler = new THREE.Euler();

    this.joystickBase = document.getElementById('joystick-base');
    this.joystickKnob = document.getElementById('joystick-knob');
    this.upBtn = document.getElementById('btn-up');
    this.downBtn = document.getElementById('btn-down');
    this.gyroBtn = document.getElementById('gyro-btn');

    this.gyroEnabled = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onDeviceOrientation = this._onDeviceOrientation.bind(this);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);

    // the buttons outlive this instance (a new one is made per site load), so track listeners for dispose
    this._buttonListeners = [];
    const listen = (el, type, fn) => {
      if (!el) return;
      el.addEventListener(type, fn);
      this._buttonListeners.push([el, type, fn]);
    };
    listen(this.upBtn, 'pointerdown', (e) => { e.preventDefault(); this.buttonVertical = 1; });
    listen(this.upBtn, 'pointerup', () => { this.buttonVertical = 0; });
    listen(this.upBtn, 'pointercancel', () => { this.buttonVertical = 0; });
    listen(this.downBtn, 'pointerdown', (e) => { e.preventDefault(); this.buttonVertical = -1; });
    listen(this.downBtn, 'pointerup', () => { this.buttonVertical = 0; });
    listen(this.downBtn, 'pointercancel', () => { this.buttonVertical = 0; });
    listen(this.gyroBtn, 'click', () => this._toggleGyro());
  }

  async _toggleGyro() {
    if (this.gyroEnabled) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      this.gyroEnabled = false;
      if (this.gyroBtn) {
        this.gyroBtn.textContent = 'Gyro: off';
        this.gyroBtn.classList.remove('active');
      }
      return;
    }
    let orientationResult = 'granted';
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        orientationResult = await DeviceOrientationEvent.requestPermission();
      } catch {
        return;
      }
    }
    if (orientationResult !== 'granted') return;

    this._hasDeviceQuat = false;
    window.addEventListener('deviceorientation', this._onDeviceOrientation);
    this.gyroEnabled = true;
    if (this.gyroBtn) {
      this.gyroBtn.textContent = 'Gyro: on';
      this.gyroBtn.classList.add('active');
    }
  }

  _onDeviceOrientation(e) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;

    const alpha = THREE.MathUtils.degToRad(e.alpha);
    const beta = THREE.MathUtils.degToRad(e.beta);
    const gamma = THREE.MathUtils.degToRad(e.gamma);
    const screenAngle = THREE.MathUtils.degToRad(screen.orientation?.angle ?? window.orientation ?? 0);

    this._orientEuler.set(beta, alpha, -gamma, 'YXZ');
    this._deviceQuat.setFromEuler(this._orientEuler);
    this._deviceQuat.multiply(this._q1);
    this._deviceQuat.multiply(this._q0.setFromAxisAngle(this._zee, -screenAngle));

    if (!this._hasDeviceQuat) {
      this._hasDeviceQuat = true;
      this._alignGyroHeading();
    }
    this._applyGyro();
  }

  // pick offsets that keep the camera's current heading, so gyro taking over doesn't spin the view
  _alignGyroHeading() {
    this._orientEuler.setFromQuaternion(this._deviceQuat, 'YXZ');
    this._yawOffset = this.euler.y - this._orientEuler.y;
    this._pitchOffset = 0;
  }

  _applyGyro() {
    this._yawQuat.setFromAxisAngle(this._yAxis, this._yawOffset);
    this._pitchQuat.setFromAxisAngle(this._xAxis, this._pitchOffset);
    this.camera.quaternion.copy(this._yawQuat).multiply(this._deviceQuat).multiply(this._pitchQuat);
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
  }

  setSpeed(speed) { this.speed = speed; }
  setSpawn(position, lookAt) { this.spawn = { position, lookAt }; }

  _onPointerDown(e) {
    if (!this.enabled) return;
    const isLeftSide = e.clientX < window.innerWidth * 0.4;

    if (isLeftSide && this.movePointerId === null) {
      this.movePointerId = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.moveVector = { x: 0, y: 0 };
      if (this.joystickBase) {
        this.joystickBase.style.left = `${e.clientX}px`;
        this.joystickBase.style.top = `${e.clientY}px`;
        this.joystickBase.hidden = false;
      }
      if (this.joystickKnob) {
        this.joystickKnob.style.left = `${e.clientX}px`;
        this.joystickKnob.style.top = `${e.clientY}px`;
        this.joystickKnob.hidden = false;
      }
      return;
    }

    if (!isLeftSide) {
      const now = performance.now();
      if (now - this.lastTap < 300 && this.spawn) {
        this.camera.position.set(...this.spawn.position);
        this.camera.lookAt(...this.spawn.lookAt);
        this.euler.setFromQuaternion(this.camera.quaternion);
        if (this.gyroEnabled && this._hasDeviceQuat) {
          this._alignGyroHeading();
          this._applyGyro();
        }
      }
      this.lastTap = now;

      if (this.lookPointerId === null) {
        this.lookPointerId = e.pointerId;
        this.lookLast = { x: e.clientX, y: e.clientY };
        this.lookPos = { x: e.clientX, y: e.clientY };
      } else if (this.verticalPointerIds.length < 1 && e.pointerId !== this.lookPointerId) {
        this.verticalPointerIds.push(e.pointerId);
        this.verticalLastY = e.clientY;
        this.vertPos = { x: e.clientX, y: e.clientY };
        this.pinchLastDist = Math.hypot(this.vertPos.x - this.lookPos.x, this.vertPos.y - this.lookPos.y);
      }
    }
  }

  _onPointerMove(e) {
    if (!this.enabled) return;

    if (e.pointerId === this.movePointerId) {
      let dx = e.clientX - this.moveOrigin.x;
      let dy = e.clientY - this.moveOrigin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      this.moveVector = { x: dx / JOYSTICK_RADIUS, y: dy / JOYSTICK_RADIUS };
      if (this.joystickKnob) {
        this.joystickKnob.style.left = `${this.moveOrigin.x + dx}px`;
        this.joystickKnob.style.top = `${this.moveOrigin.y + dy}px`;
      }
      return;
    }

    if (e.pointerId === this.lookPointerId) {
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookPos = { x: e.clientX, y: e.clientY };
      if (this.gyroEnabled && this._hasDeviceQuat) {
        this._yawOffset -= dx * LOOK_SENSITIVITY;
        this._pitchOffset -= dy * LOOK_SENSITIVITY;
        this._pitchOffset = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this._pitchOffset));
        this._applyGyro();
      } else {
        this.euler.y -= dx * LOOK_SENSITIVITY;
        this.euler.x -= dy * LOOK_SENSITIVITY;
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
        this.camera.quaternion.setFromEuler(this.euler);
      }
      this._updatePinch();
      return;
    }

    if (this.verticalPointerIds.includes(e.pointerId)) {
      const dy = e.clientY - this.verticalLastY;
      this.verticalLastY = e.clientY;
      this.verticalDelta -= dy * VERTICAL_SENSITIVITY;
      this.vertPos = { x: e.clientX, y: e.clientY };
      this._updatePinch();
    }
  }

  _updatePinch() {
    if (this.lookPointerId === null || this.verticalPointerIds.length < 1) {
      this.pinchLastDist = null;
      return;
    }
    const dist = Math.hypot(this.vertPos.x - this.lookPos.x, this.vertPos.y - this.lookPos.y);
    if (this.pinchLastDist !== null) {
      const delta = dist - this.pinchLastDist;
      this.speedMultiplier = Math.max(
        MIN_SPEED_MULT,
        Math.min(MAX_SPEED_MULT, this.speedMultiplier * (1 + delta * PINCH_SENSITIVITY)),
      );
    }
    this.pinchLastDist = dist;
  }

  _onPointerUp(e) {
    if (e.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveVector = { x: 0, y: 0 };
      if (this.joystickBase) this.joystickBase.hidden = true;
      if (this.joystickKnob) this.joystickKnob.hidden = true;
    }
    if (e.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
    const vIdx = this.verticalPointerIds.indexOf(e.pointerId);
    if (vIdx !== -1) this.verticalPointerIds.splice(vIdx, 1);
    if (e.pointerId === this.lookPointerId || vIdx !== -1) this.pinchLastDist = null;
  }

  update(dt) {
    if (!this.enabled) return;
    const dir = new THREE.Vector3(this.moveVector.x, 0, this.moveVector.y);
    if (dir.lengthSq() > 1) dir.normalize();
    dir.applyQuaternion(this.camera.quaternion);
    dir.y = 0;

    const speed = this.speed * this.speedMultiplier;
    this.camera.position.addScaledVector(dir, speed * dt);
    this.camera.position.y += this.verticalDelta * speed * dt;
    this.camera.position.y += this.buttonVertical * speed * dt;
    this.verticalDelta = 0;
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    for (const [el, type, fn] of this._buttonListeners) el.removeEventListener(type, fn);
    this._buttonListeners = [];
    if (this.gyroEnabled) {
      window.removeEventListener('deviceorientation', this._onDeviceOrientation);
      this.gyroEnabled = false;
    }
    if (this.gyroBtn) {
      this.gyroBtn.textContent = 'Gyro: off';
      this.gyroBtn.classList.remove('active');
    }
    if (this.joystickBase) this.joystickBase.hidden = true;
    if (this.joystickKnob) this.joystickKnob.hidden = true;
  }
}
