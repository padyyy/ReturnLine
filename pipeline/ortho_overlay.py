"""The orthophoto base map of the console, placed on the console grid by GeoMapper.

GeoMapper (backend/geoMapper, GeoRaster + raster_to_matrix) samples the USGS Gale orthophoto at the
centre of every 1 m sub-cell of the console grid (10 x 10 per 10 m cell, on the same edges), nearest
pixel, no resampling of its own. The source is the orthophoto's 1 m level, cut out unchanged by
pipeline/fetch_sources.py (data/raw/gale_ortho_1m.tif). The picture covers exactly the console grid,
so it lines up with every layer, the time-to-base grid and the routes by construction.

Writes frontend/public/maps/ortho_gale_1m.jpg and .json (bounds for Leaflet's L.imageOverlay).
The image is for display only. Never read numbers back from it.

Run (repo root):  .venv/Scripts/python pipeline/fetch_sources.py --only ortho   (once)
                  .venv/Scripts/python pipeline/ortho_overlay.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import sys
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "backend" / "geoMapper"))
from mapping_grid import MappingGrid  # noqa: E402  the console grid
from map_layers import WindowGrid  # noqa: E402  sub-cells of the console grid, a GeoMapper grid

DATA = ROOT / "frontend" / "public" / "data"
SOURCE = ROOT / "data" / "raw" / "gale_ortho_1m.tif"
OUT = ROOT / "frontend" / "public" / "maps"
BAND_ROWS = 40          # console rows per GeoMapper call (keeps memory small)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--source", type=Path, default=SOURCE, help="local orthophoto GeoTIFF (default data/raw/gale_ortho_1m.tif)")
    p.add_argument("--sub", type=int, default=10, help="sub-cells per cell edge; 10 gives 1 m pixels")
    p.add_argument("--quality", type=int, default=85, help="JPEG quality")
    a = p.parse_args(argv)
    if not a.source.exists():
        print(f"{a.source} is missing; run pipeline/fetch_sources.py --only ortho", file=sys.stderr)
        return 2
    from mars_mapping import GeoRaster, raster_to_matrix
    t0 = time.time()
    grid = MappingGrid.load(DATA / "grid.json")
    layer = GeoRaster(a.source)
    try:
        cmap = None
        try:
            cmap = layer.ds.colormap(1)
        except ValueError:
            pass
        k = a.sub
        bands = []
        for r0 in range(0, grid.rows, BAND_ROWS):
            rows = min(BAND_ROWS, grid.rows - r0)
            bands.append(raster_to_matrix(layer, WindowGrid(grid, 0, r0, grid.columns, rows, k)))
            print(f"  GeoMapper: rows {r0 + rows}/{grid.rows} ({time.time() - t0:.0f} s)", flush=True)
        src_crs = layer.ds.crs.to_proj4()
        res = abs(layer.ds.transform.a)
    finally:
        layer.close()
    vals = np.vstack(bands)
    missing = int(np.isnan(vals).sum())
    idx = np.nan_to_num(vals, nan=0).astype(np.uint8)
    from PIL import Image
    identity = cmap is None or all(cmap.get(i, (i, i, i))[:3] == (i, i, i) for i in range(256))
    if identity:
        img = Image.fromarray(idx, mode="L")
    else:
        lut = np.array([cmap.get(i, (0, 0, 0, 255))[:3] for i in range(256)], dtype=np.uint8)
        img = Image.fromarray(lut[idx], mode="RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    img_path = OUT / "ortho_gale_1m.jpg"
    img.save(img_path, quality=a.quality, optimize=True, progressive=True)
    (s, w), (n, e) = grid.bounds
    side = a.source.with_suffix(".json")
    fetched = json.loads(side.read_text(encoding="utf-8")) if side.exists() else {}
    meta = {
        "image": img_path.name,
        "bounds": [[s, w], [n, e]],
        "bounds_note": "Leaflet order [[south, west], [north, east]], degrees, east-positive longitude; exactly the console grid",
        "bbox": {"west": w, "east": e, "south": s, "north": n},
        "width_px": img.width, "height_px": img.height, "pixel_size_m": grid.cell_size_m / k,
        "grid_id": grid.grid_id, "pixels_per_cell": k,
        "sampling": "GeoMapper raster_to_matrix: nearest source pixel at the centre of every sub-cell of the console grid",
        "missing_px": missing,
        "source": fetched.get("source", str(a.source)), "source_file": str(a.source.relative_to(ROOT)).replace("\\", "/") if a.source.is_relative_to(ROOT) else str(a.source),
        "source_crs": src_crs, "source_level": {"pixel_size_m": res},
        "mars_radius_m": 3396190.0,
        "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "pipeline/ortho_overlay.py",
        "use": "display only; never read numbers from this image",
    }
    (OUT / "ortho_gale_1m.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {img_path.relative_to(ROOT)} ({img.width} x {img.height} px, {img_path.stat().st_size / 1e6:.1f} MB, {missing} px without data) in {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
