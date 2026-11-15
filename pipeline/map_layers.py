"""Anchor every map layer on the console grid with GeoMapper, so a new map only needs to be listed.

Sources: GeoTIFFs (any Mars CRS) and CSV point tables with latitude and longitude columns, such as
JMARS exports ("Latitude (N)", "Longitude (E)"); every further numeric column of a CSV becomes a layer.
GeoMapper maps a GeoTIFF with raster_to_matrix (nearest pixel at each cell centre) and a CSV with
CsvPointLayer + csv_to_matrices (nearest point within a search radius; no interpolation). The radius
defaults to twice the point spacing, so a point never fills cells far beyond the data.

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
DEFAULT_RAMP = ["#EDF0E6", "#80878B", "#2B2D2F"]
MAX_DISPLAY_PX = 4096                              # longest edge of a detail picture


class WindowGrid:
    """A finer grid inside a window of console cells: k x k sub-cells per cell, on the same edges.
    GeoMapper samples it like any grid (rows, columns, lonlat_mesh), for detail pictures of fine maps."""

    def __init__(self, grid: MappingGrid, col0: int, row0: int, cols: int, rows: int, k: int):
        self.k, self.col0, self.row0 = k, col0, row0
        self.columns, self.rows = cols * k, rows * k
        self.cell = grid.cell_size_m / k
        self.x0 = grid.x0 + col0 * grid.cell_size_m
        self.y0 = grid.y0 - row0 * grid.cell_size_m

    def lonlat_mesh(self):
        m = 3396190.0 * math.pi / 180
        lon = (self.x0 + (np.arange(self.columns) + .5) * self.cell) / m
        lat = (self.y0 - (np.arange(self.rows) + .5) * self.cell) / m
        return np.broadcast_to(lon, (self.rows, self.columns)), np.broadcast_to(lat[:, None], (self.rows, self.columns))

    @property
    def bounds(self):
        m = 3396190.0 * math.pi / 180
        return [[(self.y0 - self.rows * self.cell) / m, self.x0 / m], [self.y0 / m, (self.x0 + self.columns * self.cell) / m]]


class Source:
    """One mappable quantity of a map file (a GeoTIFF band or a CSV column), sampled by GeoMapper."""

    def __init__(self, path: Path, column: str | None = None, band: int = 1, radius_m: float | None = None):
        from mars_mapping import CsvPointLayer, GeoRaster
        self.path, self.column, self.band, self.csv = path, column, band, path.suffix.lower() == ".csv"
        if self.csv:
            probe = CsvPointLayer(path, nearest_radius_m=1e6)
            xyz = probe.tree.data[:: max(1, len(probe.tree.data) // 2000)]
            d, _ = probe.tree.query(xyz, k=2)                        # chord on the unit sphere to the next point
            self.spacing_m = float(np.median(d[:, 1])) * 3396190.0
            self.radius_m = float(radius_m) if radius_m else max(1.0, 2 * self.spacing_m)
            self.layer = CsvPointLayer(path, nearest_radius_m=self.radius_m)
            if column is not None and column not in self.layer.columns:
                raise ValueError(f"{path.name}: no column {column!r}; columns: {self.layer.columns}")
            self.crs = self.layer.crs.to_string()
            self.res_m = self.spacing_m
            self.units = None
        else:
            self.layer = GeoRaster(path)
            ds = self.layer.ds
            self.crs = ds.crs.to_string() if ds.crs else None
            self.units = ds.units[band - 1] or ds.tags(band).get("units") or None
            res = abs(ds.transform.a)
            self.res_m = res if ds.crs and not ds.crs.is_geographic else res * 3396190.0 * math.pi / 180

    def sample(self, grid) -> np.ndarray:
        from mars_mapping import csv_to_matrices, raster_to_matrix
        if self.csv:
            return csv_to_matrices(self.layer, grid)[self.column].astype(np.float32)
        return raster_to_matrix(self.layer, grid, band=self.band).astype(np.float32)

    def close(self):
        if not self.csv:
            self.layer.close()


def csv_columns(path: Path) -> list[str]:
    from mars_mapping import CsvPointLayer
    return list(CsvPointLayer(path, nearest_radius_m=1e6).columns)   # survey paper to graphite; green, amber and red stay for the return stages


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def colourize(values: np.ndarray, style: dict) -> tuple[np.ndarray, list]:
    """RGBA picture and legend for sampled values; NaN stays transparent."""
    ok = np.isfinite(values)
    out = np.zeros(values.shape + (4,), dtype=np.uint8)
    if style.get("kind") == "classes":
        th, cols = style["thresholds"], [None if c is None else rgb(c) for c in style["colors"]]
        labels = style.get("labels") or [f"class {k + 1}" for k in range(len(cols))]
        cls = np.digitize(np.where(ok, values, 0), th, right=True)
        for k, c in enumerate(cols):
            if c is not None:                                         # a class without colour stays transparent
                out[ok & (cls == k)] = (*c, 255)
        return out, [dict(label=l, rgba=[*c, 255]) for l, c in zip(labels, cols) if c is not None]
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
        num = lambda v: f"{v:.0f}" if abs(v) >= 100 else f"{v:.3g}"
        legend = [dict(label=num(lo), rgba=[*cols[0], 255]), dict(label=num(hi), rgba=[*cols[-1], 255])]
    else:
        legend = [dict(label=f"{lo:.3g} everywhere it is mapped", rgba=[*cols[0], 255])]
    return out, legend


def slugify(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in s.lower()).strip("_")[:48] or "layer"


def catalog() -> list[dict]:
    """Layers listed in data/layers/layers.json plus GeoTIFFs and CSVs dropped into data/layers/.
    A CSV entry without "column" becomes one layer per numeric column; "columns" can name and style them."""
    entries, folder = [], CATALOG.parent
    raw = []
    if CATALOG.exists():
        for e in json.loads(CATALOG.read_text(encoding="utf-8")).get("layers", []):
            raw.append(dict(e, source=str((folder / e["source"]).resolve())))
    listed = {Path(e["source"]).resolve() for e in raw}
    for f in sorted([*folder.glob("*.tif"), *folder.glob("*.tiff"), *folder.glob("*.csv")]):
        if f.resolve() in listed:
            continue
        side = f.with_suffix(".layer.json")
        extra = json.loads(side.read_text(encoding="utf-8")) if side.exists() else {}
        raw.append(dict({"id": f.stem, "name": f.stem.replace("_", " ")}, **extra, source=str(f.resolve())))
    for e in raw:
        src = Path(e["source"])
        if src.suffix.lower() != ".csv" or e.get("column"):
            entries.append(e)
            continue
        try:
            cols = csv_columns(src)
        except Exception as exc:
            entries.append(dict(e, error=f"CSV not readable: {exc}"))
            continue
        per = e.get("columns", {})
        for c in cols:
            spec = per.get(c, {})
            if spec.get("skip"):
                continue
            base = {k: v for k, v in e.items() if k not in ("columns",)}
            lid = spec.get("id") or (e["id"] if len(cols) == 1 else f"{e['id']}_{slugify(c)}")
            name = spec.get("name") or (e.get("name", e["id"]) if len(cols) == 1 else f"{c.replace('_', ' ')} ({e.get('name', e['id'])})")
            entries.append({**base, **spec, "id": lid, "name": name, "column": c})
    return entries


def export(grid: MappingGrid, e: dict, out: Path, upsample: int) -> dict:
    if e.get("error"):
        raise ValueError(e["error"])
    src = Path(e["source"])
    if not src.is_file():
        raise FileNotFoundError(f"{e['id']}: source not found: {src}")
    source = Source(src, column=e.get("column"), band=e.get("band", 1), radius_m=e.get("radius_m"))
    try:
        values = source.sample(grid)                                   # the value grid: one value per console cell
        ok = np.isfinite(values)
        if not ok.any():
            raise ValueError(f"{e['id']}: the map does not cover the console grid")
        rows, cols = np.nonzero(ok)
        r0, r1, c0, c1 = int(rows.min()), int(rows.max()) + 1, int(cols.min()), int(cols.max()) + 1
        # the picture: maps finer than half a cell get a detail picture, sampled by GeoMapper on sub-cells
        # inside their own footprint; coarse maps get the whole grid, smoothed between cell centres
        k = int(min(16, max(1, round(grid.cell_size_m / max(source.res_m, 1e-6)))))
        k = min(k, max(1, MAX_DISPLAY_PX // max(r1 - r0, c1 - c0)))
        if k >= 2:
            wg = WindowGrid(grid, c0, r0, c1 - c0, r1 - r0, k)
            pic, window, ppc = source.sample(wg), dict(col0=c0, row0=r0, cols=c1 - c0, rows=r1 - r0), k
            smoothing, bounds = f"none: GeoMapper sampled {k} x {k} sub-cells per console cell", wg.bounds
        else:
            pic = bilinear_upsample(values.astype(np.float64), upsample) if upsample > 1 else values
            window, ppc = None, upsample
            smoothing, bounds = ("bilinear between cell centres, then coloured" if upsample > 1 else "none"), grid.bounds
        units = e.get("units") or source.units
        src_crs = source.crs
    finally:
        source.close()
    style = e.get("style", {})
    if not style and source.csv and set(np.unique(values[ok])) <= {0.0, 1.0}:   # a 0/1 mask: show the 1s only
        style = {"kind": "classes", "thresholds": [0.5], "colors": [None, "#2459A8"], "labels": ["0", "1"]}
    rgba, legend = colourize(pic, style)
    lid = e["id"]
    Image.fromarray(rgba).save(out / f"{lid}.png")
    values.astype("<f4").tofile(out / f"{lid}.f32")
    # an elevation map (role "elevation") also keeps its fine values: the crew views read elevation and
    # the 10 m slope at the crew from them (GeoMapper's sub-cell samples, the same ones as the picture)
    detail = None
    if e.get("role") == "elevation" and window:
        np.asarray(pic, dtype="<f4").tofile(out / f"{lid}_detail.f32")
        detail = dict(numeric_file=f"layers/{lid}_detail.f32", cols=window["cols"] * ppc, rows=window["rows"] * ppc,
                      bounds=bounds, step_m=round(grid.cell_size_m / ppc, 3), sample_position="sub-cell centre",
                      sampling="GeoMapper, the same sub-cell samples as the detail picture")
    meta = dict(
        schema_version=1, generator=GENERATOR, created_utc=datetime.now(timezone.utc).isoformat(),
        image=f"{lid}.png", image_path=f"data/layers/{lid}.png", numeric_file=f"layers/{lid}.f32",
        grid_file="../grid.json", grid_id=grid.grid_id, grid=grid.describe(), bounds=bounds, window=window,
        width_px=(window["cols"] if window else grid.columns) * ppc, height_px=(window["rows"] if window else grid.rows) * ppc,
        pixels_per_cell=ppc, pixel_origin="northwest", sample_position="cell_center",
        sampling=("GeoMapper csv_to_matrices: nearest CSV point within the search radius at the centre of every cell, no interpolation"
                  if source.csv else "GeoMapper raster_to_matrix: nearest neighbour at the centre of every cell"),
        smoothing=smoothing, nodata="transparent where the map has no data", units=units,
        source=dict(path=str(src.relative_to(ROOT)) if src.is_relative_to(ROOT) else str(src), band=None if source.csv else e.get("band", 1),
                    column=e.get("column"), crs=src_crs, resolution_m=round(source.res_m, 3),
                    search_radius_m=round(source.radius_m, 2) if source.csv else None, note=e.get("source_note")),
        legend=legend, value_range=[float(np.nanmin(values)), float(np.nanmax(values))],
        covered_cells=int(ok.sum()), missing_cells=int((~ok).sum()),
        covered_box_cells=dict(col=[int(cols.min()), int(cols.max())], row=[int(rows.min()), int(rows.max())]),
        layer=dict(id=lid, name=e.get("name", lid), priority=e.get("priority", 20), opacity=e.get("opacity", 0.6),
                   visible=e.get("visible", False), role=e.get("role")),
        detail=detail,
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
