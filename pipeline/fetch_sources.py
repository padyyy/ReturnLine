"""Copy the operating area out of the two USGS Gale mosaics into local GeoTIFFs, pixels unchanged.

GeoMapper (backend/geoMapper) opens local GeoTIFFs; the USGS mosaics are 24 GB files on S3. This
script only cuts the needed window out of them over HTTP range requests (GDAL /vsicurl/): no
resampling, no new grid, every pixel value as in the source, CRS and pixel grid kept. Placing the
values on the console grid is GeoMapper's job afterwards (pipeline/time_grid.py, ortho_overlay.py).

- DEM: MSL_Gale_DEM_Mosaic_1m_v3.tif, its 4 m overview level  -> data/raw/gale_dem_4m.tif
- Orthophoto: MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif, its 1 m overview level -> data/raw/gale_ortho_1m.tif
Each file gets a sidecar .json with the source URL, the level, the window and the origin of the
source's full-resolution pixel grid (time_grid.py puts its 10 m cells on that grid).

Run (repo root):  .venv/Scripts/python pipeline/fetch_sources.py [--only dem|ortho]
The GeoTIFFs stay out of git (*.tif in .gitignore); this script makes them again.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
M_PER_DEG = 3396190.0 * math.pi / 180.0
EXTENT = dict(west=137.34, east=137.42, north=-4.77, south=-4.85)   # docs/mission-scenario.md, as time_grid.py
MARGIN_M = 100.0
S3 = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/"
SOURCES = {
    "dem": dict(url=S3 + "MSL_Gale_DEM_Mosaic_1m_v3.tif", level_m=4.0, out="gale_dem_4m.tif"),
    "ortho": dict(url=S3 + "MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif", level_m=1.0, out="gale_ortho_1m.tif"),
}
GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="YES", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.ovr",
                GDAL_HTTP_MULTIRANGE="YES", GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                CPL_VSIL_CURL_USE_HEAD="NO", VSI_CACHE="TRUE", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2")


def fetch(key: str) -> Path:
    import rasterio
    from rasterio.windows import Window, transform as window_transform
    s = SOURCES[key]
    t0 = time.time()
    path = "/vsicurl/" + s["url"]
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(path) as base:
            native = abs(base.transform.a)
            factors = base.overviews(1)
            level = next((i for i, f in enumerate(factors) if abs(f * native - s["level_m"]) < 1e-6), None)
            if level is None:
                raise SystemExit(f"{key}: no {s['level_m']:g} m overview level (overviews {factors} at {native:g} m)")
            colormap = None
            try:
                colormap = base.colormap(1)
            except ValueError:
                pass
            base_origin = dict(x=base.transform.c, y=base.transform.f, pixel_m=native)
            crs, nodata, dtype = base.crs, base.nodata, base.dtypes[0]
        with rasterio.open(path, overview_level=level) as src:
            res = abs(src.transform.a)
            x_w, x_e = EXTENT["west"] * M_PER_DEG - MARGIN_M, EXTENT["east"] * M_PER_DEG + MARGIN_M
            y_n, y_s = EXTENT["north"] * M_PER_DEG + MARGIN_M, EXTENT["south"] * M_PER_DEG - MARGIN_M
            c0 = math.floor((x_w - src.transform.c) / res)
            r0 = math.floor((src.transform.f - y_n) / res)
            c1 = math.ceil((x_e - src.transform.c) / res)
            r1 = math.ceil((src.transform.f - y_s) / res)
            win = Window(c0, r0, c1 - c0, r1 - r0)
            print(f"{key}: {s['url']}\n  level {level} ({res:g} m/px), window cols {c0}+{c1 - c0}, rows {r0}+{r1 - r0}", flush=True)
            data = src.read(1, window=win)
            tf = window_transform(win, src.transform)
    RAW.mkdir(parents=True, exist_ok=True)
    out = RAW / s["out"]
    prof = dict(driver="GTiff", width=data.shape[1], height=data.shape[0], count=1, dtype=dtype, crs=crs,
                transform=tf, nodata=nodata, compress="deflate", tiled=True, blockxsize=256, blockysize=256)
    with rasterio.open(out, "w", **prof) as dst:
        dst.write(data, 1)
        if colormap:
            dst.write_colormap(1, colormap)
    side = dict(source=s["url"], source_level_m=res, source_pixel_grid=base_origin, window=dict(col=c0, row=r0, cols=c1 - c0, rows=r1 - r0),
                extent_deg=EXTENT, margin_m=MARGIN_M, crs=crs.to_proj4(), nodata=nodata,
                note="Pixels copied unchanged from the source level (no resampling). GeoMapper places them on the console grid.",
                generator="pipeline/fetch_sources.py", created_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    out.with_suffix(".json").write_text(json.dumps(side, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f} s", flush=True)
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--only", choices=sorted(SOURCES), help="fetch one source only")
    a = p.parse_args(argv)
    for key in ([a.only] if a.only else SOURCES):
        fetch(key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
