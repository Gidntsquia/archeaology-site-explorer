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
const mpRoom = document.getElementById('mp-room');
const mpPeers = document.getElementById('mp-peers');
const mpInvite = document.getElementById('mp-invite');
const waveBtn = document.getElementById('wave-btn');
const raiseBtn = document.getElementById('raise-btn');
const namePrompt = document.getElementById('name-prompt');
const nameInput = document.getElementById('name-input');
const nameSubmit = document.getElementById('name-submit');

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

const NAME_KEY = 'player-name';

export function getSavedName() {
  try {
    return sessionStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

export function promptForName() {
  const saved = getSavedName();
  if (saved) return Promise.resolve(saved);

  return new Promise((resolve) => {
    namePrompt.hidden = false;
    nameInput.focus();
    const submit = () => {
      const name = (nameInput.value || 'Explorer').trim().slice(0, 20) || 'Explorer';
      saveName(name);
      namePrompt.hidden = true;
      nameSubmit.removeEventListener('click', submit);
      nameInput.removeEventListener('keydown', onKeydown);
      resolve(name);
    };
    const onKeydown = (e) => {
      if (e.key === 'Enter') submit();
    };
    nameSubmit.addEventListener('click', submit);
    nameInput.addEventListener('keydown', onKeydown);
  });
}

export function setRoomInfo(room) {
  mpRoom.textContent = `Room: ${room}`;
}

export function setPeerCount(count) {
  mpPeers.textContent = count === 1 ? '1 other here' : `${count} others here`;
}

export function onInviteClick(cb) {
  mpInvite.addEventListener('click', cb);
}

export async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    const original = mpInvite.textContent;
    mpInvite.textContent = 'Copied!';
    setTimeout(() => {
      mpInvite.textContent = original;
    }, 1500);
  } catch {
    // clipboard unavailable; ignore
  }
}

export function onWaveClick(cb) {
  if (waveBtn) waveBtn.addEventListener('click', cb);
}

export function onRaiseClick(cb) {
  if (raiseBtn) raiseBtn.addEventListener('click', cb);
}

let waveFlashTimer = null;
export function flashWaveBtn() {
  if (!waveBtn) return;
  waveBtn.classList.add('active');
  clearTimeout(waveFlashTimer);
  waveFlashTimer = setTimeout(() => waveBtn.classList.remove('active'), 300);
}

let raiseFlashTimer = null;
export function flashRaiseBtn() {
  if (!raiseBtn) return;
  raiseBtn.classList.add('active');
  clearTimeout(raiseFlashTimer);
  raiseFlashTimer = setTimeout(() => raiseBtn.classList.remove('active'), 300);
}

export function showContextLost() {
  if (contextLostEl) contextLostEl.hidden = false;
}

export function hideContextLost() {
  if (contextLostEl) contextLostEl.hidden = true;
}
