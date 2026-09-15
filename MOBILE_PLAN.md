# Mobile Plan — explore sites on a phone

Current state: desktop-only. Pointer lock + WASD controls, DPR capped at 2, no touch
handling, Skara Brae ships as a 75 MB OBJ + 20 MB JPEG. None of that works on a phone.
Four things to fix, in order: reach the app from the phone, touch controls, asset size,
then mobile UI/perf polish.

## 1. Get the phone on the dev server (do first, 30 min)

WSL2 is behind Windows' NAT, so `vite` on `localhost` is invisible to the phone.
Pick one:

- **Mirrored networking (recommended, Win11 22H2+):** add to `%UserProfile%\.wslconfig`:
  ```
  [wsl2]
  networkingMode=mirrored
  ```
  then `wsl --shutdown`. After that `npm run dev -- --host` is reachable at the
  Windows LAN IP (`ipconfig`), e.g. `http://192.168.1.x:5173`. Allow port 5173 in
  Windows Firewall.
- **Tunnel (works anywhere, no firewall fiddling):** `npx cloudflared tunnel --url http://localhost:5173`
  gives an https URL. HTTPS also unlocks DeviceOrientation (gyro look) on iOS, which
  needs a secure context. Prefer this for testing.
- **Deployed build:** `vite build` → GitHub Pages / Cloudflare Pages. Needed eventually
  anyway (§5), and the only option once splats live on a CDN.

Add `server: { host: true }` to `vite.config.js` so `--host` is the default.

Debugging: Android → `chrome://inspect` over USB. iPhone → Safari > Develop menu over
USB. Both give console + WebGL errors from the phone.

## 2. Touch controls (`src/touchControls.js`, new; ~1 day)

Keep `FlyControls` unchanged for desktop. Add a `TouchControls` class with the same
interface (`enabled`, `update(dt)`, `setSpeed`, `dispose`) and pick one in `app.js`:

```js
const isTouch = matchMedia('(pointer: coarse)').matches;
controls = isTouch ? new TouchControls(camera, canvas, opts) : new FlyControls(camera, canvas, opts);
```

Scheme (standard mobile FPS layout, works in portrait and landscape):

| Gesture | Action |
|---|---|
| Left-thumb virtual joystick (bottom-left 40% of screen) | forward/back/strafe, analog magnitude → speed |
| One-finger drag anywhere on the right 60% | look (yaw/pitch), 0.004 rad/px, same clamp as desktop |
| Two-finger vertical drag | ascend/descend |
| Pinch | speed multiplier (open = fast), or fov zoom — pick one, default speed |
| Double-tap | reset to spawn |
| Optional toggle: gyro | DeviceOrientation drives look; drag still adds offset. iOS needs `DeviceOrientationEvent.requestPermission()` from a tap and HTTPS. |

Implementation notes:
- Track pointers by `pointerId` with `pointerdown/move/up/cancel`; assign each new
  pointer to "move" or "look" by its start x. Don't use `touchstart` events.
- `canvas { touch-action: none; }` and `overscroll-behavior: none` on body, or iOS
  will scroll/zoom the page instead of the scene.
- Joystick: render a base ring + knob as two `div`s in the HUD; knob follows the
  finger within 50 px radius; hide the ring when no finger is down (floating
  joystick appears where the thumb lands).
- Reuse the same bounds spring and hotspot proximity code — controls only move the camera.
- Add a small `?` overlay on first launch showing the gestures, dismissed on tap,
  remembered in `localStorage`.

## 3. Assets that a phone can download and hold (~1 day)

Phone budget: ≤ 30 MB per site over the network, ≤ ~500 k splats or ≤ 500 k tris
+ one 2048² texture in GPU memory. iOS Safari kills the tab around 1–1.5 GB.

- **Skara Brae:** convert OBJ → glTF binary once with `gltf-transform`:
  ```
  npx @gltf-transform/cli optimize skara-brae.obj skara-brae.glb \
    --texture-compress webp --texture-size 2048 --compress draco --simplify --simplify-ratio 0.5
  ```
  (OBJ input needs `obj2gltf` first: `npx obj2gltf -i skara-brae.obj -o skara-brae.glb`.)
  Expect ~5–8 MB. Load with `GLTFLoader` + `DRACOLoader` in `meshSite.js`, drop OBJ/MTL
  loaders. Keep the original OBJ out of `public/` (move to `assets-src/`, gitignored).
- **Splats:** honour the `lod` field from `PLAN.md` §2. On touch devices load
  `scene_lod.spz` only (≤ 300 k splats, SH degree 0) and never the full file unless the
  user taps "High quality". `compress.sh` already plans to emit the LOD file.
- **Progressive loading:** show the LOD first for all devices; the mobile path just
  stops there.
- Serve with `Content-Encoding: br/gzip` enabled (Pages does this by default); `.spz`
  is already compressed, `.glb` with Draco is too, so no double-compression benefit
  but no harm.

## 4. Renderer + UI adjustments (~half day)

`app.js`:
- `renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 2))`.
- `powerPreference: 'high-performance'`, `antialias: false` (already).
- Handle `orientationchange` / `visualViewport.resize` — use `visualViewport.width/height`
  not `window.inner*` so the URL bar collapse doesn't leave a black strip.
- Pause the render loop on `visibilitychange` hidden (battery).
- Handle `webglcontextlost` → show "Reload" message instead of a frozen canvas.
- Auto quality: if FPS averages < 25 for 3 s, drop DPR to 1, then hide splat SH.

`index.html` / `style.css`:
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
- `<meta name="apple-mobile-web-app-capable" content="yes">` + `theme-color`.
- Safe-area padding on HUD buttons: `padding-top: env(safe-area-inset-top)`.
- Buttons ≥ 44 × 44 px. Back button and a new fullscreen button top-left/top-right.
- Hotspot panel: `@media (max-width: 600px)` → bottom sheet, full width, max 40vh, scrollable.
- Picker cards: one column, full width, `min-height: 44px` tap targets. Add thumbnails.
- Hide FPS counter on touch unless `?debug`.
- Fullscreen button calls `canvas.requestFullscreen()` (Android) — iOS Safari has no
  fullscreen for non-video; PWA "Add to Home Screen" is the iOS route (§5).

## 5. Install + deploy (~half day)

- `public/manifest.webmanifest` (name, icons 192/512, `display: standalone`,
  `orientation: any`, dark `background_color`). Link from `index.html`. This gives
  home-screen install on both platforms and hides the browser chrome.
- No service worker for now: sites are tens of MB and the cache-storage quota on iOS
  is unreliable. Revisit for "download this site for offline" later.
- Deploy: GitHub Actions → `vite build` → GitHub Pages. Set `base` in `vite.config.js`
  to the repo path. Large models go to GitHub Releases or a Cloudflare R2 bucket with
  CORS; site JSON points at absolute URLs.

## 6. Order of work

1. Mirrored networking or cloudflared; confirm the picker loads on the phone. (Also
   confirms Spark's WebGL2 path works on iOS — check before anything else.)
2. `touchControls.js` + `touch-action: none` + joystick UI. Test on butterfly splat.
3. Skara Brae → glb, `meshSite.js` to GLTFLoader. Test load time on 4G.
4. Renderer/UI/CSS changes from §4.
5. Manifest + Pages deploy.

## 7. Risks

- **Spark on iOS Safari:** GPU sorting depends on WebGL2 features that iOS has only
  supported since 15; older phones may fall back to slow paths or fail. Test in step 1;
  fallback is `@mkkellogg/gaussian-splats-3d` which has a tested mobile path.
- **Gyro look permission:** iOS requires a user gesture and HTTPS; keep drag-look as
  the default and gyro as opt-in.
- **Heat/battery:** splat rendering at 60 fps will throttle after a few minutes. Cap to
  30 fps on touch (`setAnimationLoop` with a frame skip) unless the user opts out.
- **Memory on old Androids:** 2 GB devices can't hold even the LOD splat plus textures.
  Detect via `navigator.deviceMemory < 4` and pick the smallest asset tier.
