# GeoMapper

- Offline Python library in `mars_mapping/`, imported from the `geoMapper` branch; no server, HTTP API or routing logic. The package exposes a Python API.
- `README.md` documents installation, public interfaces, grid geometry, the actual TIFF/CSV mapping algorithm and export limits with examples. `INTEGRATION.md` is the historical integration analysis from 14 November; compare its statements with the current pipeline and frontend contract.
- Mars CRS transformations and cell queries: `core.py`; grid definitions: `local_grid.py` / `fixed_grid.py`; common matrices: `matrix.py` (affine array transformation updated to use `@`).
- Routing integration: `../mapper_route.py`; instructions: `../MAPPER_ROUTING.md`.
- TIFF sampling uses nearest neighbour; CSV sampling uses an explicit radius. There is no unit conversion or automatic interpretation of layer names.
- The CSV matrix function requires matching geographic conventions between the grid and CSV; it performs no additional CRS transformation. Point queries transform through `convert_xy`. Check matrix values with `np.isfinite` before using them for domain calculations.
- `../../data/mars_mapper_preperation/` is a separate preparation and export tool with its own `mars_mapper` copy of the shared grid and coordinate foundation. Its GUI/CLI export layer uses its separate `analysis_export.py`; it is not a runtime dependency of this package.
- Leave source data unchanged; do not use Earth CRS definitions for Mars.
- Check export changes against `../../shared/data-contract.md` and the agreed grid specification. Do not assume NPZ import or Python execution in the browser; local routing integration does not change the frontend export contracts.
