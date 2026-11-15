"""Anchor every map layer on the console grid with GeoMapper, so a new map only needs to be listed.

How a map gets into the app
1. Put a georeferenced GeoTIFF anywhere (any Mars CRS: the console's eqc, GeoMapper's local metric
   grid of the A* run, ...) and list it in data/layers/layers.json, or drop it into data/layers/
   (then it is picked up with default settings; an optional <name>.layer.json beside it sets them).
2. Run  .venv/Scripts/python pipeline/map_layers.py
   GeoMapper (backend/geoMapper, GeoRaster + raster_to_matrix) samples the map at the centre of every
   cell of the console grid (frontend/public/data/grid.json through pipeline/mapping_grid.py), so the
   layer sits exactly on the grid the return area, the routes and the readout use.
3. Per layer this writes frontend/public/data/layers/<id>.png (display, grid bounds, transparent
   where the map has no data), <id>.f32 (the sampled values, float32 little-endian, row-major, NaN
   without data) and <id>.json (bounds, grid_id, legend, units, source). layers/index.json lists all
   layers, the slope layer of mapping_bridge.py included. The console reads the index: every layer
   appears in the Layers menu and on the forearm tablet's map key, with its value in the readout.

Catalog entry (data/layers/layers.json, "layers": [...]):
  {"id": "radiation", "name": "Radiation dose rate", "source": "../../backend/routes/radiation/x.tif",
   "band": 1, "units": "mSv/day", "style": {"kind": "ramp", "colors": ["#EDF0E6", "#2B2D2F"], "range": [lo, hi]}
   | {"kind": "classes", "thresholds": [10, 20], "colors": [...], "labels": [...]},
   "opacity": 0.55, "priority": 20, "visible": false, "source_note": "..."}
Paths are relative to the catalog file. Sampling is GeoMapper's nearest neighbour at cell centres;
the display picture is smoothed between cell centres (upsample) before it is coloured.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "backend" / "geoMapper"))
from mapping_grid import MappingGrid  # noqa: E402  the console grid as a GeoMapper grid
from mapping_bridge import bilinear_upsample  # noqa: E402

DATA = ROOT / "frontend" / "public" / "data"
CATALOG = ROOT / "data" / "layers" / "layers.json"
GENERATOR = "pipeline/map_layers.py"
DEFAULT_RAMP = ["#EDF0E6", "#80878B", "#2B2D2F"]   # survey paper to graphite; green, amber and red stay for the return stages


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colourize(values: np.ndarray, style: dict) -> tuple[np.ndarray, list]:
    """RGBA picture and legend for sampled values; NaN stays transparent."""
    ok = np.isfinite(values)
    out = np.zeros(values.shape + (4,), dtype=np.uint8)
    if style.get("kind") == "classes":
        th, cols = style["thresholds"], [rgb(c) for c in style["colors"]]
        labels = style.get("labels") or [f"class {k + 1}" for k in range(len(cols))]
        cls = np.digitize(np.where(ok, values, 0), th, right=True)
        for k, c in enumerate(cols):
            m = ok & (cls == k)
            out[m] = (*c, 255)
        return out, [dict(label=l, rgba=[*c, 255]) for l, c in zip(labels, cols)]
    cols = [rgb(c) for c in style.get("colors", DEFAULT_RAMP)]
    lo, hi = style.get("range") or ([float(np.nanmin(values)), float(np.nanmax(values))] if ok.any() else [0.0, 1.0])
    span = hi - lo
    u = np.clip((values - lo) / span, 0, 1) if span > 0 else np.zeros_like(values)
    pos = u * (len(cols) - 1)
    i0 = np.clip(np.floor(np.nan_to_num(pos)).astype(int), 0, len(cols) - 2)
    f = np.nan_to_num(pos) - i0
    c = np.array(cols, dtype=np.float64)
    for ch in range(3):
        out[..., ch] = np.round(c[i0, ch] * (1 - f) + c[i0 + 1, ch] * f).astype(np.uint8)
    out[..., 3] = np.where(ok, 255, 0)
    if span > 0:
        legend = [dict(label=f"{lo:.3g}", rgba=[*cols[0], 255]), dict(label=f"{hi:.3g}", rgba=[*cols[-1], 255])]
    else:
        legend = [dict(label=f"{lo:.3g} everywhere it is mapped", rgba=[*cols[0], 255])]
    return out, legend


def catalog() -> list[dict]:
    """Layers listed in data/layers/layers.json plus GeoTIFFs dropped into data/layers/."""
    entries, folder = [], CATALOG.parent
    if CATALOG.exists():
        for e in json.loads(CATALOG.read_text(encoding="utf-8")).get("layers", []):
            entries.append(dict(e, source=str((folder / e["source"]).resolve())))
    listed = {Path(e["source"]).resolve() for e in entries}
    for tif in sorted(list(folder.glob("*.tif")) + list(folder.glob("*.tiff"))):
        if tif.resolve() in listed:
            continue
        side = tif.with_suffix(".layer.json")
        extra = json.loads(side.read_text(encoding="utf-8")) if side.exists() else {}
        entries.append(dict({"id": tif.stem, "name": tif.stem.replace("_", " ")}, **extra, source=str(tif.resolve())))
    return entries


def export(grid: MappingGrid, e: dict, out: Path, upsample: int) -> dict:
    from mars_mapping import GeoRaster, raster_to_matrix
    src = Path(e["source"])
    if not src.is_file():
        raise FileNotFoundError(f"{e['id']}: source not found: {src}")
    layer = GeoRaster(src)
    try:
        values = raster_to_matrix(layer, grid, band=e.get("band", 1)).astype(np.float32)
        units = e.get("units") or layer.ds.units[e.get("band", 1) - 1] or None
        src_crs = layer.ds.crs.to_string() if layer.ds.crs else None
    finally:
        layer.close()
    ok = np.isfinite(values)
    if not ok.any():
        raise ValueError(f"{e['id']}: the map does not cover the console grid")
    fine = bilinear_upsample(values.astype(np.float64), upsample) if upsample > 1 else values
    rgba, legend = colourize(fine, e.get("style", {}))
    lid = e["id"]
    Image.fromarray(rgba).save(out / f"{lid}.png")
    values.astype("<f4").tofile(out / f"{lid}.f32")
    rows, cols = np.nonzero(ok)
    meta = dict(
        schema_version=1, generator=GENERATOR, created_utc=datetime.now(timezone.utc).isoformat(),
        image=f"{lid}.png", image_path=f"data/layers/{lid}.png", numeric_file=f"layers/{lid}.f32",
        grid_file="../grid.json", grid_id=grid.grid_id, grid=grid.describe(), bounds=grid.bounds,
        width_px=grid.columns * upsample, height_px=grid.rows * upsample, pixels_per_cell=upsample,
        pixel_origin="northwest", sample_position="cell_center",
        sampling="GeoMapper raster_to_matrix: nearest neighbour at the centre of every console cell",
        smoothing="bilinear between cell centres, then coloured" if upsample > 1 else "none",
        nodata="transparent where the map has no data", units=units,
        source=dict(path=str(src.relative_to(ROOT)) if src.is_relative_to(ROOT) else str(src), band=e.get("band", 1),
                    crs=src_crs, note=e.get("source_note")),
        legend=legend, value_range=[float(np.nanmin(values)), float(np.nanmax(values))],
        covered_cells=int(ok.sum()), missing_cells=int((~ok).sum()),
        covered_box_cells=dict(col=[int(cols.min()), int(cols.max())], row=[int(rows.min()), int(rows.max())]),
        layer=dict(id=lid, name=e.get("name", lid), priority=e.get("priority", 20), opacity=e.get("opacity", 0.6),
                   visible=e.get("visible", False)),
        use="display only; read values from the .f32 grid, never from the picture",
    )
    (out / f"{lid}.json").write_text(json.dumps(meta, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return meta


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--data-dir", type=Path, default=DATA, help="folder with grid.json (default frontend/public/data)")
    p.add_argument("--upsample", type=int, default=4, help="display pixels per cell edge, 1..8")
    a = p.parse_args(argv)
    grid = MappingGrid.load(a.data_dir / "grid.json")
    out = a.data_dir / "layers"
    out.mkdir(parents=True, exist_ok=True)
    index = []
    slope = a.data_dir / "slope_10m.json"   # the slope picture of mapping_bridge.py is a layer too
    if slope.exists():
        sm = json.loads(slope.read_text(encoding="utf-8"))
        if sm.get("grid_id") == grid.grid_id:
            index.append("data/slope_10m.json")
        else:
            print("slope_10m.json belongs to another grid; re-export it with mapping_bridge.py export_slope", file=sys.stderr)
    failed = 0
    for e in catalog():
        try:
            m = export(grid, e, out, a.upsample)
            index.append(f"data/layers/{e['id']}.json")
            print(f"{e['id']}: {m['covered_cells']} of {grid.columns * grid.rows} cells covered, "
                  f"values {m['value_range'][0]:g}..{m['value_range'][1]:g} {m['units'] or ''}, source CRS {m['source']['crs'][:40] if m['source']['crs'] else '?'}")
        except Exception as exc:  # one broken map must not take the others down
            failed += 1
            print(f"{e.get('id')}: NOT exported: {exc}", file=sys.stderr)
    (out / "index.json").write_text(json.dumps(dict(
        generator=GENERATOR, created_utc=datetime.now(timezone.utc).isoformat(), grid_file="data/grid.json",
        grid_id=grid.grid_id, layers=index), indent=2) + "\n", encoding="utf-8")
    print(f"layers/index.json lists {len(index)} layer(s) on grid {grid.grid_id}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
