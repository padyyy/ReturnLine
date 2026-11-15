# Architecture

Status: planned architecture of the combined concept, agreed by the team on 2026-11-13. The tech lead (Magnus) confirms or changes it at kickoff. Background and reasoning: `docs/preparation/preparations.md`, sections "Architecture" and "Route".

## Overview

```text
NASA/USGS raw data ──► Python pipeline (offline) ──► overlays (PNG) + GeoJSON + grids
                                   │
                                   ▼
                       C# routing engine (offline) ──► time-to-base grid + return pointers,
                                                       routes, Curiosity comparison
                                   │
                                   ▼
                    Static web app (Vite + Leaflet 1.9.4) on GitHub Pages
```

There is **no backend**. The browser never computes a route; it looks up precomputed values.

## Components

Current Python implementation: `backend/geoMapper/mars_mapping/` maps GeoTIFF
and CSV sources onto one local metric grid. `backend/terrain_features.py` derives
slope and roughness; `backend/terrain_costs.py` turns cell features into costs.
`backend/mapper_route.py` prepares maps once and computes A* paths on them.
`backend/science_routes.py` exports independent base-to-target XY paths for the
sites in `backend/config/science_targets.json`, with optional overview plot.
Missing features are ignored in the mapper's explicit permissive mode; known
constraints still apply. The strict cost API remains available. Costs are not
calibrated travel times. `backend/radiation.py` generates a declared uniform
historical GCR background GeoTIFF on `backend/config/radiation_grid.json` and
integrates route dose equivalent from rates and an explicit constant-speed
assumption, including optional goal dwell. Missing radiation produces unknown
total dose. An optional nonnegative radiation weight adds movement dose costs
to A* and blocks unknown radiation; its default zero preserves terrain routing.
Scientific relevance remains metadata. See `backend/MAPPER_ROUTING.md` for
units, CLI options and the distinction between scenario pixels and measurements.
The console consumes static exports from `pipeline/astar_import.py`,
`pipeline/time_grid.py`, `pipeline/map_layers.py` and `pipeline/ortho_overlay.py`;
GeoMapper supplies the shared spatial mapping, while the routing and time-grid
modules calculate paths, return times and pointers.
Tests live in `backend/tests/`; former demo scripts were removed.
The C# sections below describe the earlier planned architecture.

### GeoMapper and reference-centred preparation

The [GeoMapper algorithm documentation](../backend/geoMapper/README.md) describes
how a fixed target grid is mapped through Mars longitude/latitude into each
source layer, how GeoTIFF pixels and nearby CSV measurements are selected, and
how aligned numeric matrices are exported. GeoMapper itself does not perform
route search or calculate terrain-derived slope.

The team used the [desktop preparation tool](../data/mars_mapper_preperation/README.md)
to crop and export map layers around the project's reference point. It shares
the grid and sampling foundation with GeoMapper and adds a Tkinter viewer plus
`mars_mapper/analysis_export.py` and `export_cli.py` for exports. All exported
GeoTIFFs use the same target CRS, affine transform, dimensions and orientation;
CSV inputs also retain their original in-region points in a separate export. Its
saved configuration centres a 1 km × 1 km area of 1 m cells at 137.3807° E,
4.8106° S. That preparation grid is independent of the production console grid;
its definition must not be substituted for `frontend/public/data/grid.json`.

### 1. Offline data pipeline (Python)

- numpy, scikit-image, tifffile (rasterio optional; the GDAL command-line tools are not available).
- Crops the DEM and the orthophoto to the map extent, computes 10 m slope, the 1 m ridge mask and hillshade.
- Exports one orthophoto image overlay downsampled to 1 m (about 4,700 px square). No tile pyramid.
- Owners: Magnus, Michael.

### 2. Offline routing engine (C#)

- Dijkstra from the habitat (A\* without the heuristic). Owners: Paul, Michael.
- Writes:
  - the time-to-base grid for every 10 m cell, with **return pointers** (the parent of each cell),
  - two variants: zones penalized (normal) and zones allowed (ABORT),
  - the routes between the stops as GeoJSON,
  - the leave-one-out comparison with Curiosity's drives.
- **Fallback at Saturday 18:00:** if no grid exists, Michael computes it with scikit-image `MCP_Geometric` in Python.

### 3. Static web app

- Vite and Leaflet 1.9.4, no UI framework, pinned and bundled. JavaScript, decided by the tech lead (Magnus) on 2026-11-14.
- Hosted on GitHub Pages. Deploy early, by Saturday 18:00.
- One page: the habitat console, with a read-only crew display inside.
- The way home from any cell is a few lines of code that follow the return pointers. The injury event multiplies walking times by a factor; no recomputation.
- Works offline: Leaflet bundled, fonts self-hosted, ground images downloaded, no CDN.
- Owners: Alex, Magnus; Patrick where needed.

## Data contract

- Images are for display only: orthophoto, hillshade, slope colours. Never read numbers back from a PNG through a canvas.
- Every number the app computes with comes as GeoJSON, JSON or a raw binary grid.
- **Grid spec first:** in hour 1, Paul writes one page: bounding box, 10 m cells (about 470 × 470), row order, float32 little-endian, encoding of the return pointers, file names. Nobody integrates without it. It goes into `shared/`.

## Coordinates

- DEM and orthophoto share one grid: equirectangular, center longitude 0, Mars 2000 sphere, R = 3,396,190 m. Nothing needs reprojecting.
- The map runs in plain longitude and latitude with a copy of Leaflet's EPSG:4326 CRS and the Mars radius:

  ```js
  const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: 3396190 });
  ```

- Only `map.distance()` and the scale bar use the Mars radius. `latlng.distanceTo()` and `L.circle` still use Earth's radius (about 1.88× too large) and must not be used. Draw range rings as polygons.
- Longitude is east-positive.

## Out of scope

Backend, 3D globe, machine learning, login, route computation in the browser, full viewshed, tile pyramid.
