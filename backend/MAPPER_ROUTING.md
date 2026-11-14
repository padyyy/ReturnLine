# Mapper → A* → XY-Pfad

Aus dem Repositoryordner:

```sh
uv sync --extra plot
uv run --extra plot python -m backend.mapper_route "/pfad/zum/dem.tif" --start 137.38138513 -4.8138518 --goal 137.37929830 -4.80494991 --plot
```

IDE: Modul `backend.mapper_route`, Repository als Arbeitsverzeichnis, `.venv/bin/python`; TIFF-Pfad sowie `--start LON LAT --goal LON LAT --plot` als Argumente.

Ausgabe im ignorierten `backend/tmp/mapper_route/` (änderbar durch `--output-dir`):

- `path_xy.json`: geordneter Array `[[x,y], ...]`, Start bis Ziel; `null` falls nicht erreichbar. Außerhalb liegende Endpunkte lösen einen Fehler aus und werden nicht verschoben.
- `summary.json`: Endpunkte, Geometrie, Herkunft der Merkmale, Konfiguration, Kosten und Weglänge.
- `mapped_layers.npz` und Metadaten: gleich große numerische Matrizen für sieben Merkmale sowie Kosten. Fehlende Werte intern NaN; im Python-Zellobjekt None. NPZ ist ein Offline-Zwischenformat, kein Browservertrag.
- `route.png` bei `--plot`.

`x` wächst nach rechts, `y` nach unten, Ursprung ist die obere linke Rasterzelle `(0,0)`. A* arbeitet intern weiterhin mit `(row,column)`; nur der Adapter übersetzt. Vier Nachbarn, keine Diagonalen. Weglänge ist die Rasterlänge in der Kartenebene, keine 3D-Gehstrecke.

## Datenfluss und Schnittstellen

`route_from_maps(dem_path, start_lonlat, goal_lonlat, *, grid=None, layer_specs=None, config=DEFAULT_CONFIG, protected_penalty=0, derive=True)` liefert `(path_xy, grid, arrays, expanded_mask, summary)`. Karten werden über `GeoRaster`, `raster_to_matrix` und `csv_to_matrices` des GeoMappers geladen; gemeinsame Zellmittelpunkte bestimmen die Zuordnung.

Ohne `--grid` wird ein `LocalMetricGrid` aus Mittelpunkt, Dimensionen und vertikaler Pixelgröße des Referenz-DEMs erstellt. Beim geografischen DEM wird die vertikale Gradweite mit Marsradius 3396190 m umgerechnet. Das Testgrid ist nicht der frühere TIFF-Pixelindex und nicht automatisch das Frontend-Produktionsgrid. Das Defaultverfahren benötigt nordorientierte Pixel; zusätzliche Karten dürfen andere CRS/Auflösungen haben. Für Integration ein abgestimmtes lokales metrisches Grid mit `--grid` übergeben. Geografische `FixedGrid`-Raster werden vom Routingadapter abgelehnt, da sie keine konstant quadratischen Meterzellen garantieren.

`cell_grid(elevation, layers)` erzeugt `grid[row][column]` aus `TerrainCell` mit:

- `elevation_m`, `slope_deg`, `roughness_m`
- `blocked`, `protected_zone`, `radiation_msv_per_day`, `scientifically_relevant`
- zusätzlich `valid_fraction` als Anteil gültiger Höhen im Ableitungsfenster.

Numerische Quellwerte müssen bereits die benannten Einheiten besitzen. Höhen in Metern sind Voraussetzung. TIFF-Werte werden nearest-neighbour abgetastet, nicht flächig gemittelt. Fehlen Neigungs-/Rauigkeitskarten, werden diese standardmäßig aus einer lokalen 11×11-Ebene des gemappten DEMs abgeleitet; RMS-Resthöhe ist die Rauigkeit. Bei 1 m Zellgröße beträgt der Abstand äußerer Pixelzentren 10 m. `--no-derive` unterbindet die Ableitung. Explizit gelieferte Karten sind maßgeblich, auch wo sie NoData enthalten; dort keine heimliche Ersatzableitung.

## Fehlende Daten und Regeln

Die neue Integration ruft `build_cost_grid(..., ignore_missing=True)` auf. Fehlende Werte werden als None gespeichert und erzeugen weder Zuschläge noch eine Sperre. Auch eine fehlende Höhe allein sperrt in diesem permissiven Modus nicht. `blocked=True` und bekannte überschrittene Neigungs-/Rauigkeitsgrenzen sperren weiterhin. Ein bekannter unzureichender `valid_fraction` kann ebenfalls sperren. Der bisherige strikte Modus bleibt Standard für bestehende Aufrufer. Unbekannte Merkmale sind keine bestätigte Sicherheit; insbesondere werden lokale kleine Hindernisse nicht vollständig modelliert.

Aktuelle DEM-Testannahmen: Neigung höchstens 20°, Rauigkeit höchstens 0,5 m, Mindestanteil gültiger Werte 0,8, Basis 1, Gewichte Neigung/Rauigkeit/Unsicherheit 2/2/1. Keine kalibrierte Gehzeit. Absolute Höhe ist keine Kostenstrafe.

Schutzstatus bleibt separat: `--protected-penalty N` multipliziert Kosten bekannter Schutzzellen mit `1+N`, N muss nichtnegativ sein (Standard 0). Explizit harte Sperren als `blocked`-Maske liefern. Strahlung und wissenschaftliche Relevanz werden eingelesen und gespeichert, aber derzeit nicht in Bewegungskosten umgerechnet. Ein Dosis-/Zeitmodell bzw. die Auswahl wissenschaftlicher Ziele ist nicht implementiert.

## Optionale Karten binden

`--layers /pfad/layers.json`: Pfade relativ zu dieser JSON-Datei. Ohne Eintrag oder bei `null` bleibt das Feld unbekannt. Fehlerhafte Pfade/Formate führen zu Fehlern statt stillschweigend fehlende Daten vorzutäuschen.

```json
{
  "slope_deg": {"path": "slope.tif", "band": 1},
  "roughness_m": {"path": "roughness.tif"},
  "blocked": {"path": "blocked.tif"},
  "protected_zone": {"path": "protected.tif"},
  "radiation_msv_per_day": {
    "path": "radiation.csv", "column": "dose_rate", "radius_m": 5
  },
  "scientifically_relevant": null
}
```

Die Beispieldateien müssen bereitgestellt werden. Boolesche Karten enthalten 0/1 oder NoData; Strahlungsraten dürfen nicht negativ sein. CSV-Radius ist verpflichtend und fachlich zu begründen; keine flächige Interpolation. CSV-Koordinaten standardmäßig planetozentrisch, ostpositive Länge, Marskugel; abweichendes geprüftes `coordinate_crs` optional angeben. Keine automatische Zeitaggregation von Messreihen. Polygone müssen vorher zu einer Maske rasterisiert werden.

## Prüfung

`uv run python -m unittest discover -s backend/tests -v`

Zusätzliche Integrationstests: TIFF-Sperrmaske, XY-Routenfolge, None-Policy, CSV-Radius, unbekannte Strahlung, Schutzgebietszuschlag und abgewiesene Endpunkte außerhalb des Grids.

## Mehrere Wege von derselben Basis

```sh
uv run --extra plot python -m backend.science_routes "/pfad/zum/dem.tif" --plot
```

Basis und Ziele stehen in `config/science_targets.json` (oder eigener Datei mit `--targets`). `prepare_maps` lädt und normalisiert die Karten einmal; `route_prepared` führt A* für jedes Ziel unabhängig von derselben Basis aus. `route_from_maps` für einzelne Wege bleibt unverändert verfügbar. Die Höhenableitung liegt in `terrain_features.py`; alte Demo-Skripte wurden entfernt.

Ausgabe unter `backend/tmp/science_routes/`: `sol_4612/path_xy.json`, `sol_4671/path_xy.json`, `sol_4709/path_xy.json`, `sol_4818/path_xy.json` sowie `paths_xy.json` mit allen vier Arrays nach Ziel-ID. `routes_summary.json` dokumentiert die Ausgangskoordinaten, Endzellen, Parameter und Längen; `grid.json` definiert die gemeinsame XY-Geometrie. Gemeinsame Karten werden nur einmal als NPZ gespeichert. `routes.png` zeigt die Wege zusammen. Alle Koordinatenarrays sind vom Start zur jeweiligen Zielzelle geordnet. Nicht erreichbare Wege werden als null ausgegeben. Koordinaten außerhalb des Rasters sind Eingabefehler; sie werden nicht abgeschnitten oder verschoben.
