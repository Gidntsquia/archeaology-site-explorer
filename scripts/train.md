# Training a site splat from photos/video

Produces a `.ply` Gaussian splat from a folder of overlapping photos. Run on a
GPU machine (12GB+ VRAM) — local if you have one, otherwise a RunPod/Lambda
spot instance (~$1/site, ~30-60 min).

## 1. Collect images

300-2000 photos of the same place, heavy overlap, consistent lighting where
possible. Sources (see PLAN.md §3b for licensing constraints):

- Wikimedia Commons category pages (e.g. `commons.wikimedia.org/wiki/Category:Pantheon,_Rome`)
- CC-licensed YouTube/drone walkthroughs, frame-extracted at 2fps:
  `ffmpeg -i input.mp4 -vf fps=2 frames/%04d.jpg`
- Mapillary 360 sequences (CC BY-SA), cube-face split first

Drop blurry frames and frames dominated by people/vehicles (not part of the
site, and may carry their own rights). **Record the source URL and license
for every photo/video you use** — needed for attribution and to keep NC
material out (see Licensing below).

Put all images in one flat folder: `data/<site>/images/`.

## 2. Structure-from-motion (camera poses)

```bash
# glomap is ~10x faster than colmap's mapper; both use colmap's feature pipeline
colmap feature_extractor --database_path data/<site>/db.db --image_path data/<site>/images
colmap exhaustive_matcher --database_path data/<site>/db.db
mkdir -p data/<site>/sparse
glomap mapper --database_path data/<site>/db.db --image_path data/<site>/images --output_path data/<site>/sparse
```

Falls back to `colmap mapper` in place of `glomap mapper` if glomap isn't
installed — much slower on more than a few hundred images.

Sanity check: open `data/<site>/sparse/0` in the COLMAP GUI or
`python -c "import pycolmap; print(pycolmap.Reconstruction('data/<site>/sparse/0').summary())"`
— expect most images registered (>80%). If registration is low, the photo set
has too little overlap or too much lighting/scale variance.

## 3. Train the splat

Using `gsplat` (Nerfstudio's fast CUDA implementation):

```bash
pip install gsplat nerfstudio
ns-train splatfacto --data data/<site> --output-dir outputs/<site> \
  --max-num-iterations 30000
ns-export gaussian-splat --load-config outputs/<site>/.../config.yml \
  --output-dir outputs/<site>/export
```

Or the reference `gaussian-splatting` repo if you need SIBR viewer / exact
paper reproduction:

```bash
python train.py -s data/<site> -m outputs/<site> --iterations 30000
```

Either way: ~30-60 min on a 12GB GPU for a single-building exterior.

## 4. Clean up in SuperSplat

Open the exported `.ply` at https://superspl.at/editor (free, browser-based):

- Crop floaters and stray geometry outside the site bounds
- Delete sky/background garbage (unless you want it for a skybox)
- Set the up-vector to Y-up
- Set the origin at the intended spawn point
- Export cleaned `.ply`

## 5. Compress and integrate

```bash
./scripts/compress.sh outputs/<site>/export/cleaned.ply public/splats/<site>.spz
```

Then add `src/sites/<site>.json` (see existing `test-splat.json` for the
schema: `src`, `bounds.center`, `bounds.radius`, `hotspots`, `credit`), wire
it into `SITES` in `src/app.js` and add a picker card in `index.html`.

## Licensing (PLAN.md §7)

A splat trained from CC BY-SA photos is a derivative work — ship it under
CC BY-SA and list every source photo's author/URL in the site's `credit`
field. Never include NC-licensed photos in a training set you plan to ship —
it taints the whole output, not just the frames it touched.
