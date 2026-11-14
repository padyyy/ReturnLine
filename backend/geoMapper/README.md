# GeoMapper: Offline-Mapping für ReturnLine

Quelle: `mars_mapping_algorithm_standalone.zip`. Der bereits vorhandene Import wurde am 14.11.2026 byteweise mit der ZIP verglichen. Der Mapping-Kern wurde übernommen; die affine Array-Transformation in `matrix.py` verwendet inzwischen `@` statt des veraltenden `*`. Demo-TIFFs, Demo-CSV, `example.py`, `fixed_grid.json` (300-m-Beispielraster) und `gale_dem_1km_config.json` (separater 1-km-Testausschnitt) wurden entfernt. Die ZIP im Downloads-Ordner bleibt erhalten.

## Benötigte Dateien

- `mars_mapping/core.py`: Mars-CRS-Transformationen, GeoTIFF-/CSV-Import, Punktabfrage und Layerverwaltung.
- `mars_mapping/local_grid.py`: lokales metrisches Raster, Nordwest-Ursprung, Zeilen nach Süden.
- `mars_mapping/fixed_grid.py`: geografisches Raster und JSON-Konfigurationsimport für beide Rastertypen.
- `mars_mapping/matrix.py`: Abtastung von GeoTIFFs und CSV-Punkten auf Zellmittelpunkte; NPZ-Export.
- `mars_mapping/__init__.py`: öffentliche Python-Schnittstelle.
- `requirements.txt`: NumPy, rasterio, pyproj und SciPy.

## Installation

Vom Repository-Verzeichnis:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/geoMapper/requirements.txt
```


Für produktive Nutzung muss eine abgestimmte Rasterkonfiguration separat bereitgestellt werden. Keine der entfernten Beispielkonfigurationen war das ReturnLine-10-m-Raster.

```python
from mars_mapping import FixedGrid, GeoRaster, raster_to_matrix

grid = FixedGrid.load('/absolute/path/to/agreed-grid.json')
layer = GeoRaster('/absolute/path/to/real-dem.tif')
try:
    heights = raster_to_matrix(layer, grid)  # float32 [row, col], fehlend = NaN
finally:
    layer.close()
```

Import aus diesem Ordner ausführen oder diesen Ordner in den Python-Suchpfad aufnehmen. Das Paket hat bisher keine Installationsmetadaten und keinen Produktions-CLI.

## Grenzen

GeoTIFF-Abtastung erfolgt per Nearest Neighbor, nicht durch Mitteln von 10 × 10 DEM-Pixeln. CSVs verwenden den nächsten Punkt innerhalb eines expliziten Radius; das ist keine Interpolation. Einheiten werden nicht vereinheitlicht. Colorized Relief darf nicht als Höhe verwendet werden. Höhen fehlen als NaN, nicht als 0. Das Paket berechnet weder Hangneigungen noch Routen, Zeitfelder oder Rückweg-Zeiger.

Die Integrationsanalyse steht in [INTEGRATION.md](INTEGRATION.md).
