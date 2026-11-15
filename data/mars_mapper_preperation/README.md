# Mars Geo Data Analyzer

A desktop and command-line tool for inspecting, cropping and exporting georeferenced Mars maps and measurements onto a fixed regional grid. This extends the original `mars_geo_mapper_full_layer(1).zip` with a shared export engine. Route search belongs to the separate ReturnLine routing components.

## Role in ReturnLine and the shared mapping algorithm

The team used this tool to crop and export the map layers around the project's reference point. Its `mars_mapper` package and the production [GeoMapper library](../../backend/geoMapper/README.md) share the same grid, coordinate-transformation and measurement-query foundation. `local_grid.py` and `fixed_grid.py` are identical in both packages; the preparation tool adds the Tkinter interface, map preview and `analysis_export.py` export engine.

The [GeoMapper README](../../backend/geoMapper/README.md) explains the common algorithm: geographic cell centres, Mars coordinate transformations, GeoTIFF pixel lookup and nearest-point queries. This tool's export engine adds aligned GeoTIFF/PNG/CSV outputs and optional bilinear resampling for numerical rasters. The production GeoMapper library instead supplies numeric matrices to routing and the [offline pipeline](../../pipeline/README.md).

The included [`fixed_grid.json`](fixed_grid.json) currently defines **137.3807° E, 4.8106° S** at the centre of **1000 × 1000 cells**, each **1 m** wide. This gives a **1 km × 1 km** preparation area. It is independent of the console's 10 m grid, and preview zoom or panning does not change the export extent.

## Install and start

From the ReturnLine repository root, using a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r data/mars_mapper_preperation/requirements.txt
.venv/bin/python data/mars_mapper_preperation/app.py
```

On Windows, create the environment with `py -3.11 -m venv .venv` and use `.venv/Scripts/python` in place of `.venv/bin/python`. If a suitable project environment already exists, reuse it.

The GUI requires Tkinter, which is supplied by the Python installation rather than `requirements.txt`. With Homebrew Python, install the matching `python-tk@<version>` package if necessary. `python3 -m tkinter` opens a small window to check availability. The CLI does not require a display.

## Crop and export through the GUI

The interface currently uses German button labels; their English meanings are given below.

1. Select **Raster konfigurieren** (Configure grid) to set the reference coordinates, cell size and dimensions. Save the settings, or edit `fixed_grid.json` and select **Config neu laden** (Reload configuration).
2. Load inputs with **+ Karten-Layer** (Map layer), **+ GeoTIFF-Daten** (Numerical GeoTIFF) and **+ JMARS-CSV**. Set an appropriate CSV search radius when importing point measurements.
3. Select **Daten zuschneiden / exportieren** (Crop/export data) and choose a separate output directory.
4. Choose whether numerical layers should also produce per-cell CSV files.
5. The tool exports **all loaded layers, including hidden layers**, using the fixed grid. It reports completion and records individual layer failures in `manifest.json`.

The preview can show complete source layers beyond the grid. Export is restricted to the fixed grid. Layer visibility, panning and zoom do not change the export boundaries. The GUI runs export work in a background thread, stays responsive and prevents grid changes, source imports and removals during export.

## Reference point and grid configuration

The current project configuration is:

```json
{
  "mode": "local_metric",
  "reference_latitude": -4.8106,
  "reference_longitude": 137.3807,
  "reference_position": "center",
  "cell_size_m": 1,
  "columns": 1000,
  "rows": 1000,
  "mars_radius_m": 3396190
}
```

The geographic reference is at the centre of the entire region. Cell indices start at the north-west corner: `(X=0, Y=0)`, X increases eastwards and Y southwards. Arrays use `[row, column]`, or `[Y, X]`. Target pixel centres represent the grid cells. The output projection is local spherical equirectangular, anchored at the reference latitude and longitude.

Changing the reference coordinates moves the export area while preserving the source files. Width is `columns × cell_size_m`; height is `rows × cell_size_m`. To retain a 1 km × 1 km area with 10 m cells, for example, use 100 columns and 100 rows. A finer export grid increases the number of output cells, not the physical resolution of the measurements.

The export engine requires a centred `local_metric` grid. It derives one target CRS and affine transform from that grid, so all output GeoTIFFs share the same georeferencing and orientation.

## Output files

For one map, one elevation GeoTIFF and one measurement CSV, a typical output directory contains:

```text
export/
├── fixed_grid.json               # Grid used for this export
├── manifest.json                 # Sources, CRS, outputs, statistics, warnings and errors
├── analysis_summary.csv          # Valid-cell count and min/max/mean per band
├── 01_mars_map.tif               # Georeferenced image channels on the target grid
├── 01_mars_map.png               # Display image with transparent gaps
├── 02_elevation.tif              # Numerical bands, Float32 with NaN for missing data
├── 02_elevation_grid.csv         # Optional cell indices, lon/lat and measurements
├── 03_measurements_points.csv    # Original in-region rows plus Grid_X and Grid_Y
├── 03_measurements_grid.tif      # Nearest-point mapping within the search radius
└── 03_measurements_grid.csv      # Optional mapped measurements per valid cell
```

Names depend on layer names and loading order. Every GeoTIFF uses the same dimensions, target CRS and affine transform. Numerical outputs use Float32 and `NaN` for missing values. Per-cell CSVs contain only cells with at least one finite measurement; a layer with no regional coverage remains NoData, with a header-only CSV where applicable.

Review `manifest.json` before using an export: one failed layer does not prevent the others from being exported. Use a separate output directory; source files are read rather than modified.

## How the export algorithm works

### GeoTIFF inputs

`analysis_export.py` derives the local target CRS and north-west-origin affine transform from `LocalMetricGrid`. It uses `rasterio.warp.reproject` to map each source band into exactly `rows × columns` target pixels. Source CRS, affine transform and NoData metadata are passed into the reprojection.

The default is **nearest neighbour**, preserving the selected source pixel value. The CLI can request **bilinear** resampling for numerical GeoTIFFs. Map-image layers always use nearest neighbour. Bilinear resampling changes numerical values and is unsuitable for categorical masks. Outside source coverage, target pixels remain `NaN`.

### CSV inputs

The engine first selects measurement points whose Mars coordinates actually lie inside the target grid. It writes their original columns and text values to `_points.csv`, adding zero-based `Grid_X` and `Grid_Y` indices.

It then maps only these selected points onto the target cell centres using a spherical `cKDTree` and the configured nearest-point search radius. Each cell receives the nearest in-region measurement within that radius; there is no averaging or spatial interpolation. No match remains `NaN`. `_grid.tif` and optional `_grid.csv` contain these mapped measurements.

### Measurement values and display images

Map layers produce a georeferenced image-band TIFF and a PNG preview with transparent gaps. Those channels are display values, not automatically elevations or other physical measurements. In particular, Colorized Relief is not a numerical DEM. The viewer's display scaling is separate from the original numeric data used for queries and export.

GeoTIFFs need valid Mars CRS metadata and an affine geotransform. CSV coordinates are interpreted as planetocentric latitude and east-positive longitude on the configured Mars reference. Other latitude definitions, longitude conventions or reference bodies need a verified conversion. A plain, unreferenced PNG cannot be aligned from its image content alone.

## Command-line export

From the repository root, replace the example source and destination paths:

```sh
.venv/bin/python data/mars_mapper_preperation/export_cli.py \
  --config data/mars_mapper_preperation/fixed_grid.json \
  --map /absolute/path/to/orthophoto.tif \
  --raster /absolute/path/to/elevation.tif \
  --csv /absolute/path/to/measurements.csv \
  --csv-radius 1200 \
  --out /absolute/path/to/export
```

- `--map`, `--raster` and `--csv` can be repeated; provide at least one input.
- `--config` selects a different grid definition. If omitted, `fixed_grid.json` is resolved relative to the current working directory.
- `--csv-radius` is in metres, default 1200. Choose it for the measurement spacing and coverage.
- `--resampling nearest` is the default. `--resampling bilinear` affects numerical GeoTIFF inputs; map images remain nearest neighbour.
- `--no-grid-csv` omits optional per-cell CSVs. Cropped original CSV points are still exported.
- A non-empty error list is reported by the CLI with a nonzero exit status; inspect the manifest for partial results.

## Python API

The GUI-independent engine is `mars_mapper/analysis_export.py`:

```python
export_region(
    grid,
    layers,
    output_directory,
    resampling="nearest",
    export_grid_csv=True,
    progress=None,
)
```

`layers` is an iterable of `ExportLayer(name, kind, source)` objects. `kind` is `map`, `raster` or `csv`; `source` is a `GeoRaster` or `CsvPointLayer`. The function returns the manifest dictionary. Use the tool directory on the Python module path when importing `mars_mapper`. The export module is separate from the production library's `raster_to_matrix`, `csv_to_matrices` and NPZ export; they share the spatial foundation but have different output interfaces.

## Tests

The test suite requires pytest in addition to the runtime requirements. From the repository root:

```sh
.venv/bin/python -m pip install pytest
PYTHONPATH=data/mars_mapper_preperation .venv/bin/python -m pytest -q data/mars_mapper_preperation/tests
```

Some mapping tests require synthetic fixtures under `demo/`; if missing, create them with `.venv/bin/python data/mars_mapper_preperation/make_demo_data.py`. These fixtures are not NASA measurements. The tests cover common georeferencing, zero-based indices, cropping outside the region, original CSV points and the 1 km Gale DEM when available. A separate GUI smoke test can run on Linux from the tool directory with `PYTHONPATH=. xvfb-run -a python tests/gui_export_smoke.py`.

## Files

```text
app.py                         # Tkinter entry point
export_cli.py                  # Headless export entry point
fixed_grid.json                # Geographic reference and fixed grid
mars_mapper/
  analysis_export.py           # Regional crop, reprojection, statistics and export
  core.py                      # Layers, source imports and point queries
  local_grid.py                # Fixed local metric grid and cell coordinates
  fixed_grid.py                # Grid configuration loader
  rendering.py                 # Preview rendering, independent of export extent
  viewer.py                    # Desktop interface
demo/                          # Synthetic example data
tests/                         # Existing automated tests
```
