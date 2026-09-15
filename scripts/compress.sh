#!/usr/bin/env bash
# Compress a trained Gaussian splat .ply into a web-deliverable .spz (or .ksplat).
#
# Usage: ./scripts/compress.sh <input.ply> <output.spz> [--max-sh-degree N]
#
# Steps:
#   1. Prune low-opacity / near-zero-scale gaussians (dead weight from training).
#   2. Optionally reduce spherical-harmonics degree (3 -> 1) to cut size ~4x
#      with modest specular-highlight loss — good for mobile/LOD variants.
#   3. Convert to .spz (PlayCanvas's compressed format, ~10x smaller than raw ply).
set -euo pipefail

IN="${1:?usage: compress.sh <input.ply> <output.spz> [--max-sh-degree N]}"
OUT="${2:?usage: compress.sh <input.ply> <output.spz> [--max-sh-degree N]}"
SH_DEGREE="${4:-3}"

if [[ "${3:-}" == "--max-sh-degree" ]]; then
  SH_DEGREE="${4:?--max-sh-degree requires a value}"
fi

command -v spz >/dev/null 2>&1 || {
  echo "error: 'spz' CLI not found. Install from https://github.com/nianticlabs/spz" >&2
  exit 1
}

PRUNED="${IN%.ply}.pruned.ply"

python3 - "$IN" "$PRUNED" "$SH_DEGREE" <<'PYEOF'
import sys
from plyfile import PlyData, PlyElement
import numpy as np

src, dst, sh_degree = sys.argv[1], sys.argv[2], int(sys.argv[3])
ply = PlyData.read(src)
verts = ply['vertex'].data

opacity = 1 / (1 + np.exp(-verts['opacity']))
scales = np.exp(np.stack([verts['scale_0'], verts['scale_1'], verts['scale_2']], axis=1))
keep = (opacity > 0.02) & (scales.max(axis=1) > 1e-6)

fields = list(verts.dtype.names)
if sh_degree < 3:
    max_coeffs = (sh_degree + 1) ** 2 - 1
    fields = [f for f in fields if not (f.startswith('f_rest_') and int(f.split('_')[-1]) >= max_coeffs * 3)]

pruned = verts[keep][fields]
PlyData([PlyElement.describe(pruned, 'vertex')], text=False).write(dst)
print(f"kept {keep.sum()}/{len(verts)} gaussians, sh_degree={sh_degree}")
PYEOF

spz convert "$PRUNED" "$OUT"
rm -f "$PRUNED"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
