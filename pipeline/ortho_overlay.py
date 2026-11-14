"""Cut the operating area out of the USGS Gale orthophoto and save it as a map overlay.

Reads only the needed tiles over HTTP range requests (GDAL /vsicurl/), so the
24 GB source file is never downloaded. Writes one image plus a JSON file with
the bounds in degrees, ready for Leaflet's L.imageOverlay.

The image is for display only. Never read numbers back from it.

Usage (from the repository root):
    .venv/Scripts/python pipeline/ortho_overlay.py            # defaults: mission extent, 1 m/px, JPEG
    .venv/Scripts/python pipeline/ortho_overlay.py --dry-run  # print window and bounds, read no pixels
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform as warp_transform
from rasterio.windows import Window, from_bounds

ORTHO_URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/"
             "MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif")
MARS_RADIUS_M = 3396190.0
MARS_LONLAT = f"+proj=longlat +R={MARS_RADIUS_M:.0f} +no_defs"
# Map extent from docs/mission-scenario.md ("Operating area")
DEFAULT_EXTENT = dict(west=137.34, east=137.42, north=-4.77, south=-4.85)
MAX_PIXELS = 12000 * 12000  # guard against pulling a full-resolution window by mistake

GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="YES",           # no directory listing, but still find the .ovr sidecar
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.ovr",
    GDAL_HTTP_MULTIRANGE="YES",
    GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
    CPL_VSIL_CURL_USE_HEAD="NO",
    VSI_CACHE="TRUE",
    GDAL_HTTP_MAX_RETRY="4",
    GDAL_HTTP_RETRY_DELAY="2",
)

ROOT = Path(__file__).resolve().parents[1]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    for k, v in DEFAULT_EXTENT.items():
        p.add_argument(f"--{k}", type=float, default=v, help=f"{k} edge in degrees (default {v})")
    p.add_argument("--resolution", type=float, default=1.0, help="target metres per pixel (default 1.0)")
    p.add_argument("--format", choices=("jpg", "png"), default="jpg", help="image format (default jpg)")
    p.add_argument("--quality", type=int, default=90, help="JPEG quality (default 90)")
    p.add_argument("--name", default=None, help="output base name (default ortho_gale_<resolution>m)")
    p.add_argument("--out-dir", type=Path, default=ROOT / "frontend" / "public" / "maps",
                   help="output folder (default frontend/public/maps, git-ignored)")
    p.add_argument("--source", default=ORTHO_URL, help="source GeoTIFF URL or local path")
    p.add_argument("--dry-run", action="store_true", help="print window and bounds, read no pixels")
    return p.parse_args(argv)


def gdal_path(src: str) -> str:
    return "/vsicurl/" + src if src.startswith(("http://", "https://")) else src


def pick_overview(native_res: float, overviews: list[int], target: float) -> tuple[int | None, int]:
    """Coarsest overview that is still at least as fine as the target. Returns (overview index, factor)."""
    best_idx, best_factor = None, 1
    for i, f in enumerate(overviews):
        if native_res * f <= target + 1e-9:
            best_idx, best_factor = i, f
    return best_idx, best_factor


def lonlat_to_xy(crs, lons, lats):
    xs, ys = warp_transform(MARS_LONLAT, crs, list(lons), list(lats))
    return xs, ys


def xy_to_lonlat(crs, xs, ys):
    lons, lats = warp_transform(crs, MARS_LONLAT, list(xs), list(ys))
    return lons, lats


def main(argv: list[str] | None = None) -> int:
    a = parse_args(argv)
    if not (a.west < a.east and a.south < a.north):
        print("Extent is invalid: need west < east and south < north (south is the more negative latitude).", file=sys.stderr)
        return 2
    t0 = time.time()
    path = gdal_path(a.source)
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(path) as base:
            native = abs(base.transform.a)
            ovs = base.overviews(1)
            ov_idx, factor = pick_overview(native, ovs, a.resolution)
            crs = base.crs
            cmap = None
            try:
                cmap = base.colormap(1)
            except ValueError:
                pass
            print(f"source: {a.source}")
            print(f"  {base.width} x {base.height} px at {native:g} m, overviews {ovs}, crs {crs.to_proj4()}")
        open_kw = {} if ov_idx is None else {"overview_level": ov_idx}
        with rasterio.open(path, **open_kw) as src:
            res = abs(src.transform.a)
            xs, ys = lonlat_to_xy(crs, [a.west, a.east], [a.south, a.north])
            win = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
            win = Window(math.floor(win.col_off), math.floor(win.row_off),
                         math.ceil(win.col_off + win.width) - math.floor(win.col_off),
                         math.ceil(win.row_off + win.height) - math.floor(win.row_off))
            full = Window(0, 0, src.width, src.height)
            if (win.col_off < 0 or win.row_off < 0 or win.col_off + win.width > full.width
                    or win.row_off + win.height > full.height):
                print("Extent reaches outside the source mosaic.", file=sys.stderr)
                return 2
            out_w = round(win.width * res / a.resolution)
            out_h = round(win.height * res / a.resolution)
            if out_w * out_h > MAX_PIXELS:
                print(f"Output would be {out_w} x {out_h} px; raise --resolution or shrink the extent.", file=sys.stderr)
                return 2
            # exact bounds of the snapped window, back in degrees
            left, top = src.transform * (win.col_off, win.row_off)
            right, bottom = src.transform * (win.col_off + win.width, win.row_off + win.height)
            (w_deg, e_deg), (s_deg, n_deg) = (lambda l: (l[0], l[1]))(xy_to_lonlat(crs, [left, right], [bottom, top]))
            print(f"read level: factor {factor} ({res:g} m/px), window cols {win.col_off}+{win.width}, rows {win.row_off}+{win.height}")
            print(f"output: {out_w} x {out_h} px at {a.resolution:g} m/px")
            print(f"bounds: west {w_deg:.6f}, east {e_deg:.6f}, south {s_deg:.6f}, north {n_deg:.6f}")
            if a.dry_run:
                return 0
            # read in strips so progress is visible
            data = np.zeros((out_h, out_w), dtype=np.uint8)
            strip = 512
            for r0 in range(0, int(win.height), strip):
                rows = min(strip, int(win.height) - r0)
                sub = Window(win.col_off, win.row_off + r0, win.width, rows)
                o0 = round(r0 * res / a.resolution)
                o1 = round((r0 + rows) * res / a.resolution)
                if o1 <= o0:
                    continue
                data[o0:o1] = src.read(1, window=sub, out_shape=(o1 - o0, out_w), resampling=Resampling.average)
                print(f"  read {min(r0 + rows, int(win.height))}/{int(win.height)} rows ({time.time() - t0:.0f} s)", flush=True)

    from PIL import Image  # imported late so --dry-run works without Pillow
    identity = cmap is None or all(cmap.get(i, (i, i, i))[:3] == (i, i, i) for i in range(256))
    if identity:
        img = Image.fromarray(data, mode="L")
    else:
        lut = np.array([cmap.get(i, (0, 0, 0, 255))[:3] for i in range(256)], dtype=np.uint8)
        img = Image.fromarray(lut[data], mode="RGB")

    a.out_dir.mkdir(parents=True, exist_ok=True)
    name = a.name or f"ortho_gale_{a.resolution:g}m"
    img_path = a.out_dir / f"{name}.{a.format}"
    if a.format == "jpg":
        img.save(img_path, quality=a.quality, optimize=True, progressive=True)
    else:
        img.save(img_path, optimize=True)
    meta = {
        "image": img_path.name,
        "bounds": [[s_deg, w_deg], [n_deg, e_deg]],
        "bounds_note": "Leaflet order [[south, west], [north, east]], degrees, east-positive longitude",
        "bbox": {"west": w_deg, "east": e_deg, "south": s_deg, "north": n_deg},
        "requested_bbox": {k: getattr(a, k) for k in DEFAULT_EXTENT},
        "width_px": out_w,
        "height_px": out_h,
        "pixel_size_m": a.resolution,
        "source": a.source,
        "source_crs": crs.to_proj4(),
        "source_level": {"overview_factor": factor, "pixel_size_m": res},
        "mars_radius_m": MARS_RADIUS_M,
        "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "pipeline/ortho_overlay.py",
        "use": "display only; never read numbers from this image",
    }
    meta_path = a.out_dir / f"{name}.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    mb = img_path.stat().st_size / 1e6
    print(f"wrote {img_path.relative_to(ROOT) if img_path.is_relative_to(ROOT) else img_path} ({mb:.1f} MB)")
    print(f"wrote {meta_path.relative_to(ROOT) if meta_path.is_relative_to(ROOT) else meta_path}")
    print(f"done in {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
