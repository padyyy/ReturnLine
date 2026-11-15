# Project data

- Contains project configurations and small sample datasets for points/map layers, plus the preparation tool described below. Numeric frontend outputs live separately in `../frontend/public/data/`.
- Use this directory for small, versionable sample data and documented data structures.
- Keep large raw datasets outside the repository, for example in the local workspace at `../../../data/raw/`.
- Check the existing `.gitignore` before adding files.
- Document provenance, licence, format, units and coordinate systems where applicable in `../docs/data-sources.md`.
- Keep generated data separate from original inputs and document reproducible processing steps as they become available.

## Reference point and map extent (`mars_mapper_preperation/`)

- Standalone tool used by the team to crop and export maps around the reference point. GUI entry point: `mars_mapper_preperation/app.py`; headless export: `mars_mapper_preperation/export_cli.py`; usage: `mars_mapper_preperation/README.md`.
- Its `mars_mapper` package shares the grid/CRS/sampling foundation with `../backend/geoMapper/mars_mapping/`; the production library adds matrix export. Algorithm documentation: `../backend/geoMapper/README.md`.
- The saved `fixed_grid.json` centres 1000 × 1000 cells of 1 m each at 137.3807° E / 4.8106° S. This is the preparation grid, separate from the 10 m frontend grid.
- The GUI crop/export action and CLI call `mars_mapper/analysis_export.py:export_region`. All loaded layers are exported onto the same centred grid: GeoTIFFs, map PNGs, cropped original point CSVs, optional per-cell CSVs, a manifest and statistics. Numerical GeoTIFFs use nearest neighbour by default, with optional bilinear resampling through the CLI. CSV points use a search radius without interpolation. Sources remain unchanged; previews and original numeric measurements stay separate.

## Map layers (`layers/`)

- `layers/layers.json` lists console layers: source path relative to the file, band, units, colour scale and opacity; CSV entries can also specify `radius_m` and per-column names/styles under `columns`. GeoTIFFs and CSVs placed directly in `layers/` are discovered automatically; an adjacent `<name>.layer.json` sets name, units, colours and search radius.
- The built-in `id: "slope"` layer has no `source`: `name`, `units`, `priority`, `opacity` and `visible` configure the already calculated slope map. `../pipeline/mapping_bridge.py` and `../pipeline/map_layers.py` apply these settings to `frontend/public/data/slope_10m.json`; a metadata-only update reuses its image and numeric grid.
- Since 2026-11-15 (branch `newData`), the project inputs include `gale_dem_1000x1000_current.csv` (elevation, 1 m), `boxwork_protection_mask_50m.csv` (0/1 mask, 1 m) and `gale_orthophoto_25cm_1km_lat-4.8106_lon137.3807.tif` (25 cm), covering 1 km around the A* base and listed in `layers/layers.json`.
- `../pipeline/map_layers.py` maps each source onto the console grid through GeoMapper; run `../pipeline/check_alignment.py` afterwards. GeoTIFF source files remain unversioned (`*.tif` in `.gitignore`).
