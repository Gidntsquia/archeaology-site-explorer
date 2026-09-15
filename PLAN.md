# Archaeology Site Explorer — Plan (photoreal free-fly)

Goal: fly freely around real archaeological sites and have it look like a photo —
real stone, real trees, real sky — not hand-built geometry.

Panoramas can't do this (no depth: step off the capture point and it tears).
Procedural models can't do this (no photo detail). What can:

| Tech | What it is | Realism | Free-fly | Sky/trees | Interiors | Cost |
|---|---|---|---|---|---|---|
| **3D Gaussian Splatting (3DGS)** | A scene reconstructed from photos/video into millions of soft coloured blobs. Renders like a photograph from any viewpoint. | Photo | Yes, within the captured area | Yes, captured as-is | Yes | Free, static files (50–300 MB per site) |
| **Google Photorealistic 3D Tiles** | Google Earth's textured mesh of the planet, streamed. | Aerial-photo | Yes, planet-wide | Trees as lumpy mesh, sky from our own skybox | No | Free tier then per-request; needs API key + live internet |
| Photogrammetry mesh (glTF) | Photos → textured triangle mesh. | Good at distance, mushy close | Yes | Trees/sky usually missing | Yes | Free files, heavy cleanup |
| Panoramas | Spheres of photos | Photo | No | Yes | Yes | Tiny |

**Decision:** 3DGS is the primary format. Google 3D Tiles is the wide-area fallback for
sites with no good splat (drone-scale flyovers, arriving from the air). Panoramas and
procedural models are dropped.

## 1. Stack

- **Three.js** + **`@sparkjsdev/spark`** (splat renderer for three.js, supports `.ply`,
  `.splat`, `.ksplat`, `.spz`, sorts on GPU, works with normal three.js cameras and
  can mix ordinary meshes into the same scene). Alternative: `@mkkellogg/gaussian-splats-3d`.
- **`3d-tiles-renderer`** (NASA-AMMOS) for Google Photorealistic 3D Tiles in three.js.
- **Vite**, vanilla JS + CSS. No framework.
- Existing `controls.js` fly controls stay. `sites/build*.js` are deleted.

```
archeaology-site-explorer/
  index.html
  src/
    app.js              scene, site switching, render loop
    controls.js         WASD + mouse fly (kept)
    splatSite.js        loads a .spz/.ksplat, sets bounds, spawn, collision-free clamp
    tilesSite.js        Google 3D Tiles + skybox + sun, geo-anchored spawn
    ui.js               HUD, hotspots, credits, loading bar
    sites/*.json        per-site config
  assets/<site>/
    scene.spz           compressed splat (main download)
    scene_lod.spz       optional 10 % point subset for instant first frame
    sky.hdr             only for tiles sites
  scripts/
    train.md            capture + training recipe (see §3)
    compress.sh         ply → spz/ksplat, prune, SH degree reduce
```

## 2. Site JSON

```json
{
  "name": "Pantheon, Rome",
  "kind": "splat",
  "src": "assets/pantheon/scene.spz",
  "lod": "assets/pantheon/scene_lod.spz",
  "up": [0, 1, 0],
  "spawn": { "position": [0, 1.7, 12], "lookAt": [0, 6, 0] },
  "bounds": { "center": [0, 5, 0], "radius": 40 },
  "speed": 3, "fastMultiplier": 4,
  "hotspots": [{ "position": [0, 20, 0], "name": "Oculus", "text": "..." }],
  "credit": { "author": "...", "license": "CC BY 4.0", "url": "..." }
}
```

`kind: "tiles"` sites replace `src` with `{ "lat", "lon", "altitude", "heading" }` and a
`skybox`. `bounds` softly pushes the camera back inside the well-captured region so the
user never sees the ragged edge of a splat.

## 3. Data — where the splats come from

### 3a. Ready-made splats (fastest)
Public 3DGS captures of heritage sites exist but are scattered. Check, in order:
- **Polycam** and **Luma AI** public galleries (search site name; many allow `.ply` export, licence per capture — ask the author).
- **Sketchfab** now accepts Gaussian splat uploads; filter "Gaussian Splat" + CC licence.
- **SuperSplat / PlayCanvas** community gallery and **Hugging Face** datasets tagged `gaussian-splatting`.
- Academic sets: Tanks & Temples, Mip-NeRF 360 (not archaeology, but test data for the viewer).

Take what exists, credit it, move on. Expect 1–3 usable sites this way (Colosseum,
Roman Forum, Stonehenge, Angkor exteriors are the most likely hits).

### 3b. Train our own from existing photos/video (main route)
3DGS only needs a lot of overlapping photos of the same place. We don't need to travel:
- **Wikimedia Commons** has thousands of CC photos of Pantheon, Pompeii, Stonehenge,
  Petra, Angkor. Mixed cameras and lighting hurt quality but COLMAP + 3DGS still
  converges on the popular viewpoints ("phototourism" is a standard 3DGS benchmark).
- **CC-licensed YouTube walkthrough / drone videos** — frame-extract at 2 fps. One good
  4k drone orbit of Angkor Wat or the Colosseum gives a clean site-wide splat. Check
  licence; YouTube's CC BY filter exists in search.
- **Mapillary 360 sequences** (CC BY-SA) — split equirect into cube faces, feed to COLMAP.

Pipeline (`scripts/train.md`):
1. Collect 300–2000 images. Drop blurry / people-heavy frames.
2. `colmap` automatic reconstructor (or `glomap` — 10× faster) → sparse poses.
3. Train with `gsplat` (Nerfstudio) or the reference `gaussian-splatting` repo. 30k iters,
   ~30–60 min on a 12 GB GPU. No GPU: RunPod/Lambda spot, ~$1 per site.
4. Clean in **SuperSplat** (free browser editor): crop floaters, delete sky garbage if
   using a skybox instead, set up-vector, set origin at spawn.
5. `compress.sh`: prune to ≤ 2 M splats, SH degree 1, export `.spz` (≈ 10× smaller than `.ply`).
   Target 40–120 MB per site; produce a 200k-splat `scene_lod.spz` for the first frame.

### 3c. Google Photorealistic 3D Tiles (wide-area fallback)
- Covers Rome, Athens, Siem Reap, and most of Europe — the areas around our target
  sites. Check coverage per site before promising it.
- Aerial-quality only: fine from 20 m up, mush at eye level. Use for the "fly in from
  the air" opening and for sites with no splat, then hand off to the splat when the
  camera gets close (same world frame, fade).
- Needs a Google Maps Platform key with Map Tiles API enabled, attribution overlay,
  and live internet. Free quota is fine for a personal project.
- Sky: HDRI skybox (Poly Haven, CC0) + matching directional light.

### 3d. Interiors
Only via 3DGS from photos/video. Pantheon interior: Commons has hundreds of photos, good
candidate. Prioritize interiors where Commons/CC coverage is dense and well-lit; skip
any site where photo access is thin or licences are mostly restricted.

## 4. Rendering notes
- Splats render sorted back-to-front; Spark sorts on the GPU each frame. 2 M splats at
  1080p ≈ 60 fps on a mid laptop GPU, ~30 fps on Intel iGPU. Offer a "quality" toggle
  that loads the LOD file only.
- Sky: if the capture includes sky, it comes for free as a far shell of splats (looks
  right, slightly soft). For drone captures the sky is often thin — replace with an
  HDRI skybox behind the splat.
- Mixing meshes: hotspot markers, a ground plane for tiles sites, and a fade-sphere for
  transitions are ordinary three.js meshes drawn in the same scene.
- Fly controls: keep WASD/mouse. Add a soft "bounds" spring so you can't leave the
  captured volume. Clamp speed per site.
- Mobile: load LOD only, cap DPR at 1.5.

## 5. UI
- Site picker with a rendered thumbnail per site.
- HUD: location name, compass, FPS (dev), quality toggle, reset view.
- Hotspots: 3D positions in splat space, proximity panel (existing code).
- Loading bar driven by splat file progress; show LOD file first.
- Credits page per site: photo sources + licences, capture author, "reconstructed with
  Gaussian splatting from N public photos".

## 6. Milestones
1. **Viewer (day 1):** Spark + three.js, load a public test splat, fly controls, bounds spring.
2. **First real site (days 2–3):** grab a ready-made CC splat (§3a) or train Pantheon
   exterior from Commons photos. Compress, LOD, ship.
3. **Training pipeline (days 4–6):** `train.md` + `compress.sh` end to end on a cloud GPU.
   Produce Stonehenge from Commons photos and Pantheon interior from Commons photos.
4. **Google 3D Tiles (day 7):** aerial fly-in for Rome and Angkor, handoff to splat.
5. **UI + polish (days 8–9):** hotspots, credits, quality toggle, mobile LOD, GitHub Pages
   (splats on a CDN or GitHub Releases; > 100 MB files won't go in the repo).

## 7. Risks
- **Training quality** from mixed tourist photos varies. Budget a second pass with more
  curated input per site. Drone video is far more reliable than photo sets.
- **File size**: 50–150 MB per site. First load is slow on poor connections; LOD file and
  a progress bar are mandatory. Host on a CDN, not GitHub Pages directly.
- **Licence**: a splat trained from CC BY-SA photos is arguably a derivative → ship under
  CC BY-SA and list all source authors. NC photos would taint the output; exclude them.
- **Google Tiles ToS**: live-stream only, keep attribution, no caching. It is a
  network-dependent feature; the app must work without it.
- **iGPU performance**: sorting 2 M splats is the bottleneck; the LOD toggle is the escape.
- **Splat edges**: any view outside the captured volume shows holes and floaters. Bounds
  spring + fog-to-skybox at the edge hides most of it.

## 8. What changed
Dropped the panorama-node plan and the procedural/glTF plan. Kept `controls.js` and the
hotspot/UI code. `src/sites/buildPantheon.js` and `buildMachu.js` are to be deleted once
the splat loader lands.
