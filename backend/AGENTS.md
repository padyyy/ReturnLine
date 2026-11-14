# Offline-Routing

## Einstieg und Struktur
- Kein Server. Python bereitet Daten auf und berechnet Offline-Pfade; Frontend-Integration ist separat. Die C#-Abschnitte in älteren Konzeptunterlagen sind frühere Planung.
- `astar.py`: A* auf positiven Kosten pro Meter oder `None` für gesperrte Zellen, intern `(row,column)`, optional Diagonalen ohne Eckdurchquerung und `on_expand`-Callback. `PathResult` oder `None`, ungültige Endpunkte erzeugen `ValueError`.
- `terrain_features.py`: lokale Ebenenanpassung, Neigung und RMS-Rauigkeit, standardmäßig 11×11 Zellen. Unvollständige Fenster ergeben NaN; Routingpolicy entscheidet deren Behandlung.
- `terrain_costs.py`: `TerrainCell`, `CostConfig`, Normalisierung. Der strikte Standard sperrt fehlende Daten; Mapper nutzt explizit `ignore_missing=True`, fehlende Merkmale einschließlich Höhe erzeugen dort keine Einschränkung. Bekannte Sperren und überschrittene Grenzen bleiben wirksam.
- `geoMapper/mars_mapping/`: Bibliothek für Mars-CRS und GeoTIFF-/CSV-Zuordnung. Eigene Regeln in `geoMapper/AGENTS.md`.
- `mapper_route.py`: `prepare_maps` bereitet gemeinsame Karten einmal vor; `route_prepared` berechnet einzelne Routen darauf. `route_from_maps` bleibt die Komfortfunktion für einen Weg. CLI für einzelne Wege; öffentliche Parameter und Ausgabe in `MAPPER_ROUTING.md`.
- `science_routes.py`: mehrere unabhängige Wege von einer Basis; Eingaben in `config/science_targets.json`. Dieselbe Karte und dasselbe Kostenraster für alle Ziele, kein Rundweg. Start/Ziel werden nicht verschoben.
- `tests/`: nur Tests der beibehaltenen Kernfunktionen, Kartenintegration und XY-Exporte. Abgelöste `grid_demo.py`/`dem_demo.py` und zugehörige reine Demo-Tests entfernt; Alte Berechnungen wurden auf Nutzerauftrag entfernt; aktuelle Basisrouten liegen unter `backend/tmp/science_routes/`.

## Koordinaten und Merkmale
- Geoeingaben `(lon,lat)`, ostpositive Länge und Mars-CRS. Zellobjekte/Arrays `[row,column]`; exportierter Pfad `[[x=column,y=row],...]`, Start bis Ziel. Ursprung oben links, x nach rechts, y nach unten.
- Merkmale: Höhe (m), Neigung (Grad), Rauigkeit (m), Sperrstatus, Protected Zone, Strahlung (mSv/Tag), wissenschaftliche Relevanz; zusätzlich Anteil gültiger Höhen im Ableitungsfenster.
- TIFF: Nearest Neighbor, keine automatische Flächenmittelung oder Einheitenkonvertierung. CSV: nächster Messpunkt in explizitem Radius, keine räumliche Interpolation oder Zeitaggregation. Fehlende Felder None, in numerischen NPZ-Dateien NaN.
- Ohne Zusatzkarten Neigung/Rauigkeit aus DEM abgeleitet; Zusatzkarten laut expliziter semantischer JSON-Bindung. Strahlung/Wissenschaft nur Metadaten. Protected-Zuschlag optional und nichtnegativ.
- Default-Testgrid ist lokal metrisch aus DEM-Mittelpunkt und Auflösung abgeleitet. Nicht automatisch das vereinbarte Frontend-Produktionsgrid.

## Ausführen und prüfen
- Einzelweg: `uv run --extra plot python -m backend.mapper_route /pfad/dem.tif --start LON LAT --goal LON LAT --plot`.
- Vier Wissenschaftsorte: `uv run --extra plot python -m backend.science_routes /pfad/dem.tif --plot`.
- Tests: `uv run python -m unittest discover -s backend/tests -v`.
- Ausgaben nur nach ignoriertem `backend/tmp/` (CLI `--output-dir`). Batch: pro Ziel `path_xy.json`/`summary.json`, gemeinsam `paths_xy.json`, `routes_summary.json`, `grid.json`, `mapped_layers.npz` mit Metadaten sowie `routes.png` bei `--plot`.
- Ergebniswerte sind Demo-Kosten, keine kalibrierten Gehzeiten. Aktuelle Grenzen 20° Neigung/0,5 m Rauigkeit und Gewichte sind Testannahmen. Kein Fahrzeug-/Astronauten-Footprint oder vollständiges Hindernismodell.
- Vor Frontend-Export mit `../shared/data-contract.md` abstimmen; lokale NPZ-/XY-Ausgaben sind kein neuer Browservertrag. Kein Commit/Push ohne Auftrag.

- `config/base.json` und `config/science_locations.json`: einfache Koordinatenexporte (lon/lat in Grad sowie x/y im aktuellen Grid aus `backend/routes/science_routes/grid.json`). Snapshots aus `science_targets.json` und berechneten Routen, nicht separate Routing-Eingaben; bei Geometrieänderung neu ableiten.
