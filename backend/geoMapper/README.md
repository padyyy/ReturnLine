# GeoMapper: Offline Mapping for ReturnLine

GeoMapper maps georeferenced Mars maps and CSV measurements onto a common grid. Each target cell receives source values at its geographic centre. This lets elevation, protection masks and radiation layers share the same spatial matrix layout even when their sources have different pixel sizes, extents or projections.

The `mars_mapping/` package is a Python library without a user interface. It provides coordinate transformations, point queries, fixed grids and matrix export. Other ReturnLine components calculate slope, roughness, routes, walking times and return pointers.

## Role and origin

The core originated in `mars_mapping_algorithm_standalone.zip`; the existing import was compared byte for byte with that archive on 14 November 2026. The affine array transformation in `matrix.py` now uses `@` instead of `*`. Earlier demo TIFFs, a demo CSV, `example.py` and example configurations were removed from this package. They did not define ReturnLine's production grid.

The separate [preparation and export tool](../../data/mars_mapper_preperation/README.md) prepares and exports map regions centred on a geographic reference point. It uses the same grid, coordinate-transformation and measurement-query foundation in its own `mars_mapper` package. Its Tkinter GUI and command-line exporter use a separate [`analysis_export.py`](../../data/mars_mapper_preperation/mars_mapper/analysis_export.py) engine for regional crop and export operations. Its README documents the controls and output formats. The tool is not a runtime dependency of this library, and the two copies are not automatically synchronized. The production library's matrix functions and the preparation tool's GUI/CLI export layer have different output interfaces.

| File | Responsibility |
|---|---|
| [`mars_mapping/core.py`](mars_mapping/core.py) | CRS transformations, `GeoRaster`, `CsvPointLayer`, `LayerSample` and `MarsMapper` |
| [`mars_mapping/local_grid.py`](mars_mapping/local_grid.py) | `LocalMetricGrid`: a local metric grid anchored at a geographic reference point |
| [`mars_mapping/fixed_grid.py`](mars_mapping/fixed_grid.py) | `FixedGrid`: a grid defined by geographic bounds; loading both configuration formats |
| [`mars_mapping/matrix.py`](mars_mapping/matrix.py) | Sampling sources at cell centres and saving common matrices as NPZ |
| [`mars_mapping/__init__.py`](mars_mapping/__init__.py) | Public imports |
| [`requirements.txt`](requirements.txt) | NumPy, rasterio, pyproj and SciPy |

## Installation and imports

Run the following commands and Python examples from the repository root. The project requires Python 3.10 or later; the environment must also satisfy the versions in the requirements files.

```sh
# macOS / Linux
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/geoMapper/requirements.txt
```

On Windows, use `py -3.11 -m venv .venv` and `.venv/Scripts/python -m pip install -r backend/geoMapper/requirements.txt`. The complete data pipeline also has `pipeline/requirements.txt`.

```python
from backend.geoMapper.mars_mapping import (
    LocalMetricGrid, FixedGrid, GeoRaster, CsvPointLayer,
    MarsMapper, LayerSample, GeoMappingError,
    MARS_SPHERE_GEO_CRS, convert_xy,
    raster_to_matrix, csv_to_matrices, save_npz,
)
```

The package has no installation metadata or standalone CLI. Code using the shorter `from mars_mapping import ...` form must put `backend/geoMapper` on the Python module search path; ReturnLine's pipeline configures that path itself.

## Coordinates, cell indices and units

| Quantity | Convention |
|---|---|
| Geographic coordinate | `(lon, lat)` in degrees, east-positive longitude |
| Default reference | Mars sphere with `R = 3_396_190 m`, `MARS_SPHERE_GEO_CRS` |
| Grid coordinate | `(x, y) = (column, row)`, zero-based |
| Origin and direction | `(0, 0)` is at the north-west corner; columns increase eastwards and rows southwards |
| Matrix access | `values[row, column]`, equivalent to `values[y, x]` |
| Flat index | For row-major flattening: `index = row * columns + column` |
| Sampling position | Cell centre, adding `+0.5` in both grid directions |
| Matrix dtype | `numpy.float32`; spatially missing or masked values are `NaN` |

`grid.xy(lon, lat)` returns the cell or `None` outside the grid. The west and north edges are included; the east and south edges are excluded. `grid.lonlat_center(x, y)` returns the geographic cell centre and raises `IndexError` for invalid indices. `grid.lonlat_mesh()` returns two coordinate matrices with shape `(rows, columns)`.

Values retain their source units and meaning. A DEM supplies metres only if its product specification establishes that unit. CSV column names, mask values and colour indices are not automatically interpreted or converted. Even 0/1 masks are exported as `float32`. `Colorized Relief` is a display value rather than elevation in metres; `CsvPointLayer` reports a warning for that case.

## Two grid definitions

### Local metric grid: `LocalMetricGrid`

This grid defines a rectangular local region through a geographic reference point, cell size in metres, and row and column counts:

```python
grid = LocalMetricGrid(
    reference_latitude=-4.8106,
    reference_longitude=137.3807,
    cell_size_m=10,
    columns=5,
    rows=5,
    reference_position="center",
)

lon, lat = grid.lonlat_center(2, 2)
assert grid.xy(lon, lat) == (2, 2)
assert grid.width_m == 50 and grid.height_m == 50
```

The mapping is local equirectangular on the Mars sphere. For reference point `λ₀, φ₀`, angles in radians and the shortest longitude difference `Δλ`:

```text
E = R · cos(φ₀) · Δλ
N = R · (φ − φ₀)
right = E − left
down  = top − N
column = floor(right / cell_size_m)
row    = floor(down  / cell_size_m)
```

With `reference_position="center"`, `left = −width_m/2` and `top = height_m/2`: the reference point is at the centre of the complete region. With `"northwest_corner"`, both are 0 and the reference point is the region's north-west corner. The inverse calculation substitutes `right = (column + 0.5) · cell_size_m` and `down = (row + 0.5) · cell_size_m`. Output longitudes are normalized to `[0, 360)`.

Cell size is metric within this local projection. It does not guarantee identical geodetic distances over arbitrarily large regions. The code restricts reference latitude to `−89° < φ₀ < 89°`, disallows crossing a pole, and rejects longitude spans of at least 180°. Both grid classes limit each dimension to 20,000 and the total to 8 million cells; available memory can impose a lower limit.

### Geographic bounds: `FixedGrid`

```python
grid = FixedGrid(
    west=137.37, east=137.39,
    south=-4.82, north=-4.80,
    columns=100, rows=100,
)
```

This grid has constant angular steps:

```text
step_lon = (east − west) / columns
step_lat = (north − south) / rows
lon_center = west  + (column + 0.5) · step_lon
lat_center = north − (row    + 0.5) · step_lat
```

The physical east-west width of a cell therefore varies with latitude. `FixedGrid.from_approximate_meters(..., cell_m=...)` estimates cell counts from the Mars sphere; it does not create an exactly square metric grid. A region crossing the prime meridian can use an east bound above 360°; `xy()` treats, for example, −10° and 350° as the same longitude.

### Saving and loading configurations

Both classes provide `grid.save(path)` and `grid.to_dict()`. `FixedGrid.load(path)` is the shared loader: `mode="local_metric"` produces a `LocalMetricGrid`, while `mode="geographic_bounds"` produces a `FixedGrid`. Without `mode`, the geographic format is assumed.

```json
{
  "mode": "local_metric",
  "reference_latitude": -4.8106,
  "reference_longitude": 137.3807,
  "reference_position": "center",
  "cell_size_m": 10,
  "columns": 100,
  "rows": 100,
  "mars_radius_m": 3396190
}
```

This is an example local 1 km region, not a production configuration. The frontend uses its own header, [`frontend/public/data/grid.json`](../../frontend/public/data/grid.json). [`pipeline/mapping_grid.py`](../../pipeline/mapping_grid.py) adapts its Mars eqc geometry with `lat_ts=0`. A local grid using `cos(reference_latitude)` has different longitude steps; matching cell counts and nominal cell sizes do not make those grids interchangeable.

## The mapping algorithm

There are two query directions. A single query starts at a geographic position or an image pixel. Matrix export starts at **every target cell centre** and retrieves source values there. Source files remain unchanged, and replacing a background map does not change the target grid.

```text
Point query:   lon/lat → optional target-grid bounds check → value from each layer
Matrix export: target cell → lon/lat of its centre → source CRS → source pixel/point → matrix[row, col]
```

### 1. Transforming Mars coordinates

`convert_xy(x, y, source_crs, target_crs)` uses pyproj/PROJ with `always_xy=True`, so X precedes Y and longitude precedes latitude. Ballpark transformations are disabled by default; failed transformations raise `GeoMappingError`.

Automatic PROJ operation discovery can fail for unknown Mars datums. The direct projection fallback then checks for plausible Mars semi-axes of 3.35–3.43 million metres, a prime meridian of 0°, and either two spherical references or the same ellipsoid. It rejects an unconfirmed sphere/ellipsoid combination. This fallback does not replace scientific verification of reference bodies and latitude conventions.

The raster-to-matrix path additionally checks the source CRS explicitly for Mars semi-axes and rejects, for example, Earth WGS84. GeoTIFFs need a readable CRS and a usable affine GeoTransform; an identity transform is rejected. A plain PNG/JPG without this georeferencing is insufficient. Planetographic and planetocentric latitudes, or west-positive and east-positive longitudes, must not be treated as interchangeable without verification.

### 2. GeoTIFF → matrix: inverse sampling

The signature is:

```text
raster_to_matrix(layer, grid, *, band=1, chunk_rows=32,
                 max_window_pixels=3_000_000)
```

The steps in `matrix.py` are:

1. Initialize an output matrix of shape `(grid.rows, grid.columns)` with `NaN`. Band numbers are one-based and checked against the TIFF band count.
2. Generate geographic target-cell centres with `grid.lonlat_mesh()`.
3. For each block of rows, transform those coordinates from the spherical Mars CRS into the source TIFF's CRS.
4. Apply the inverse affine GeoTransform to obtain continuous pixel coordinates: `col_float, row_float = (~ds.transform) @ (x_source, y_source)`.
5. Use `floor(col_float)` and `floor(row_float)` to select the source pixel whose cell contains that position. Locations outside the image dimensions or with invalid pixel coordinates remain `NaN`.
6. Copy that source pixel's value. There is no averaging over the target cell, no bilinear interpolation, and no increase in physical resolution from using finer target cells.

The package calls this **nearest-neighbour** sampling. With a 1 m DEM and 10 m target cells, it selects one pixel at each target-cell centre rather than averaging 100 DEM values. Conversely, multiple target cells can receive the same coarse source pixel.

For each block, only the required source window is read while its size is at most `max_window_pixels`. Larger windows use point reads for the selected source pixels. This fallback preserves the selection rule. The function still holds the complete output matrix in memory; chunking is not a streaming export.

Masked source values become `NaN`. Existing infinite source values are not uniformly sanitized by the matrix path; downstream processing should use `np.isfinite(values)`. The `GeoRaster.sample(...)` point query explicitly filters out nonfinite band values.

### 3. CSV → matrices: nearest point within a search radius

```python
points = CsvPointLayer(
    "measurement_points.csv",
    coordinate_crs=MARS_SPHERE_GEO_CRS,
    nearest_radius_m=20,
)
matrices = csv_to_matrices(points, grid, chunk_rows=128)
```

`CsvPointLayer` expects UTF-8 text and a header row. Commas, semicolons and tabs are recognized as possible delimiters. Supported coordinate column names include `Latitude (N)`/`Longitude (E)`, `Latitude`/`Longitude` and `Lat`/`Lon`. Numeric measurement columns are detected from the first 100 data rows; a column that is empty or entirely textual in that sample is not discovered later. Identifier columns such as `OID`, `id`, `row`, `column` and `pixelid` are excluded.

Rows with nonfinite coordinates or latitudes outside `[-90, 90]` are removed. Longitudes in `0…360°` are supported. Empty measurement fields and recognized missing-value markers can become `NaN` through the parser fallback. Dates, times and repeated observations are not automatically interpreted or grouped.

The spatial search works as follows:

1. Map geographic CSV points onto a three-dimensional **unit sphere**: `p = (cos φ · cos λ, cos φ · sin λ, sin φ)`.
2. Build a SciPy `cKDTree` over those points. Points on opposite sides of 0°/360° remain close in the search space.
3. Convert search radius `r` in metres into a maximum chord length using `R = 3_396_190 m`: `2 · sin(min(r/R, π)/2)`.
4. Map target-cell centres onto the same unit sphere. A KD-tree query selects at most one nearest CSV point per cell within the search bound.
5. Copy every detected measurement column from that point into its own `float32` matrix. Cells without a match remain `NaN`.

This does not average points or interpolate intermediate values. If a measurement column is missing at the selected point, the algorithm does not search for another point for that column. Multiple CSV points at the same location are not aggregated over time; domain-specific preprocessing must determine which observation to use.

The library default for `nearest_radius_m` is **2500 m**. This is not a universal choice for a dataset's resolution, so set an appropriate radius explicitly. [`pipeline/map_layers.py`](../../pipeline/map_layers.py) uses its own setting derived from point spacing.

A current limitation: `csv_to_matrices()` does not perform an additional CRS transformation between `grid.lonlat_mesh()` and the CSV points. They must already use the same geographic latitude and longitude conventions. Setting a different `coordinate_crs` alone does not correct this matrix path. The `CsvPointLayer.sample(source_crs, x, y)` point query does use `convert_xy` to transform into the CSV CRS. Both distance searches remain spherical approximations using the fixed Mars radius above.

## Point queries with `MarsMapper`

Direct data queries do not require a background map:

```python
from backend.geoMapper.mars_mapping import MarsMapper, LocalMetricGrid

grid = LocalMetricGrid(-4.8106, 137.3807, 10, 100, 100)
mapper = MarsMapper(grid)
try:
    mapper.add_tiff("/absolute/path/to/elevation.tif")
    mapper.add_csv("/absolute/path/to/measurement_points.csv", nearest_radius_m=20)
    samples = mapper.inspect_grid_cell(50, 50)  # x=column, y=row
    for sample in samples:
        print(sample.name, sample.status, sample.values, sample.unit)
finally:
    mapper.close()
```

The file paths must point to existing source data. The main methods are:

| Method | Behaviour |
|---|---|
| `set_fixed_grid(grid)` | Explicitly set the target grid |
| `load_map(path)` | Replace the georeferenced background map while retaining data layers |
| `add_tiff(path)` / `add_csv(path, ...)` | Add a data layer and return its layer object |
| `inspect_geo(lon, lat, coordinate_crs=...)` | Query at the actual geographic position; return an empty list outside a configured target grid |
| `inspect_grid_cell(x, y)` | Query the centre of the specified grid cell |
| `inspect_raster_pixel(col, row)` | Background-map pixel centre → geographic position → all layers; return `None` outside the image or target grid |
| `remove_layer(index)` / `close()` | Remove a layer or close open TIFF files |

`inspect_geo()` does not snap a query to the cell centre; the grid only supplies a bounds check there. `inspect_grid_cell()` explicitly queries the cell centre. In `inspect_raster_pixel()`, pixel indices refer to the background map rather than the target grid. Replacing that map therefore leaves the numeric grid definition unchanged.

A `LayerSample` contains `name`, `status`, `values` (column/band name → Python `float`), `unit` and `detail`. The exact status strings returned by the existing Python API are `ok`, `außerhalb` (outside), `NoData`, `kein naher CSV-Punkt` (no nearby CSV point) and `Fehler` (error). Layer-query failures return a sample with `detail`; import and matrix failures can raise exceptions. Check status and missing values before using a result.

TIFF point queries read at most the first eight bands, using the band description or the existing `Band N` label as the dictionary key. Matrix sampling reads exactly the requested band. TIFF point-query units come from available source metadata; CSV queries do not automatically determine physical units.

## Exporting multiple layers on the same grid

This example combines a TIFF band with every detected measurement column in a CSV. Replace the source file paths with existing data. It creates a separate output directory and leaves source files unchanged.

```python
from pathlib import Path
from backend.geoMapper.mars_mapping import (
    LocalMetricGrid, GeoRaster, CsvPointLayer,
    raster_to_matrix, csv_to_matrices, save_npz,
)

grid = LocalMetricGrid(-4.8106, 137.3807, 10, 100, 100)
dem = GeoRaster("/absolute/path/to/elevation.tif")
try:
    matrices = {"elevation_m": raster_to_matrix(dem, grid, band=1)}
finally:
    dem.close()

points = CsvPointLayer("/absolute/path/to/measurement_points.csv", nearest_radius_m=20)
for column, values in csv_to_matrices(points, grid).items():
    matrices[f"measurements__{column}"] = values  # Prefix keys to avoid overwriting a layer

output = Path("output/mapping")
output.mkdir(parents=True, exist_ok=True)
save_npz(output / "mapped_layers.npz", grid, matrices)
grid.save(output / "grid.json")
```

`save_npz()` checks each layer's shape against `(rows, columns)`, converts values to `float32` and rejects an empty collection. It writes:

- `mapped_layers.npz`: compressed NumPy arrays, one named entry per supplied layer.
- `mapped_layers.metadata.json`: grid definition, layer names, dimensions, the `NaN` convention and sampling position `cell_center`. The metadata only states that units are **not standardized**; complete source and unit information must be maintained separately.

The example also writes `grid.json` through `grid.save()`. Existing output files can be overwritten, so choose a dedicated destination. NPZ is an internal Python interchange format rather than GeoTIFF or the frontend's raw `<f4` format. The mapper checks matrix shapes, but does not establish that independently created arrays of the same shape share the same geometry or compatible physical units. Use the same grid object for all sampling operations.

## Use in ReturnLine and domain limits

- [`backend/mapper_route.py`](../mapper_route.py) uses these matrices to prepare features and routing costs. A* search is outside GeoMapper; see [`backend/MAPPER_ROUTING.md`](../MAPPER_ROUTING.md).
- [`pipeline/map_layers.py`](../../pipeline/map_layers.py), [`pipeline/time_grid.py`](../../pipeline/time_grid.py) and [`pipeline/ortho_overlay.py`](../../pipeline/ortho_overlay.py) use the same sampling foundation with an adapter for the console grid. The pipeline's image processing and display interpolation are additional steps, not capabilities of `raster_to_matrix()`.
- The package does not calculate slope, roughness, line of sight, shielding, walking time or routes. It also does not verify that a value labelled elevation is an elevation measurement.
- NoData is not an elevation of 0 or evidence of safe, radiation-free or traversable terrain. The downstream consumer determines how to handle nonfinite or missing values.
- Smaller target cells increase the number of output values, not the source's measurement resolution. An excessive CSV radius can spread measurements into areas without meaningful data coverage.
- Overlaying layers requires matching geometry and verified Mars coordinate conventions; similar-looking maps or matching array dimensions are insufficient.

The browser contract is in [`shared/data-contract.md`](../../shared/data-contract.md), and pipeline integration is described in [`pipeline/MAPPING.md`](../../pipeline/MAPPING.md). [`INTEGRATION.md`](INTEGRATION.md) records the historical integration analysis of 14 November; its outstanding items from that date do not describe the current implementation status.
