const loadingFill = document.getElementById('loading-fill');
const loadingBar = document.getElementById('loading-bar');
const locationName = document.getElementById('location-name');
const fpsEl = document.getElementById('fps');
const hud = document.getElementById('hud');
const picker = document.getElementById('picker');
const backBtn = document.getElementById('back-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const hotspotPanel = document.getElementById('hotspot-panel');
const hotspotTitle = document.getElementById('hotspot-title');
const hotspotText = document.getElementById('hotspot-text');
const hotspotClose = document.getElementById('hotspot-close');
const contextLostEl = document.getElementById('context-lost');
const gestureOverlay = document.getElementById('gesture-overlay');
const gestureDismiss = document.getElementById('gesture-dismiss');

export function showPicker() {
  picker.hidden = false;
  hud.hidden = true;
  hideHotspot();
}

export function showHud() {
  picker.hidden = true;
  hud.hidden = false;
  setLoading(0);
}

export function onBack(cb) {
  backBtn.addEventListener('click', cb);
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
  if (!document.documentElement.requestFullscreen) fullscreenBtn.hidden = true;
}

export function setLoading(fraction) {
  loadingFill.style.width = `${Math.round(fraction * 100)}%`;
  loadingBar.style.opacity = fraction >= 1 ? '0' : '1';
}

export function setLocationName(name) {
  locationName.textContent = name || '';
}

export function setFps(fps) {
  fpsEl.textContent = `${Math.round(fps)} fps`;
}

export function showHotspot(name, text) {
  hotspotTitle.textContent = name;
  hotspotText.textContent = text;
  hotspotPanel.hidden = false;
}

export function hideHotspot() {
  hotspotPanel.hidden = true;
}

hotspotClose.addEventListener('click', hideHotspot);

const GESTURE_SEEN_KEY = 'gestures-seen';

export function maybeShowGestureOverlay() {
  if (!gestureOverlay) return;
  let seen = false;
  try {
    seen = localStorage.getItem(GESTURE_SEEN_KEY) === '1';
  } catch {
    // localStorage unavailable (private mode); show every time
  }
  if (seen) return;
  gestureOverlay.hidden = false;
}

if (gestureDismiss) {
  gestureDismiss.addEventListener('click', () => {
    gestureOverlay.hidden = true;
    try {
      localStorage.setItem(GESTURE_SEEN_KEY, '1');
    } catch {
      // ignore
    }
  });
}

export function showContextLost() {
  if (contextLostEl) contextLostEl.hidden = false;
}

export function hideContextLost() {
  if (contextLostEl) contextLostEl.hidden = true;
}
