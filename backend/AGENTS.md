# Offline-Routing

## Einstieg und Struktur
- Kein Server. Python bereitet Daten auf und berechnet Offline-Pfade; Frontend-Integration ist separat. Die C#-Abschnitte in älteren Konzeptunterlagen sind frühere Planung.
- `astar.py`: A* auf positiven Kosten pro Meter oder `None` für gesperrte Zellen, intern `(row,column)`, optional Diagonalen ohne Eckdurchquerung und `on_expand`-Callback. `PathResult` oder `None`, ungültige Endpunkte erzeugen `ValueError`.
- `terrain_features.py`: lokale Ebenenanpassung, Neigung und RMS-Rauigkeit, standardmäßig 11×11 Zellen. Unvollständige Fenster ergeben NaN; Routingpolicy entscheidet deren Behandlung.
- `terrain_costs.py`: `TerrainCell`, `CostConfig`, Normalisierung. Der strikte Standard sperrt fehlende Daten; Mapper nutzt explizit `ignore_missing=True`, fehlende Merkmale einschließlich Höhe erzeugen dort keine Einschränkung. Bekannte Sperren und überschrittene Grenzen bleiben wirksam.
- `geoMapper/mars_mapping/`: Bibliothek für Mars-CRS und GeoTIFF-/CSV-Zuordnung. Eigene Regeln in `geoMapper/AGENTS.md`.
- `mapper_route.py`: `prepare_maps` bereitet gemeinsame Karten einmal vor; `route_prepared` berechnet einzelne Routen darauf. `route_from_maps` bleibt die Komfortfunktion für einen Weg. CLI für einzelne Wege; öffentliche Parameter und Ausgabe in `MAPPER_ROUTING.md`.
- `radiation.py`: reproduzierbares räumlich konstantes GCR-Szenario als Mars-GeoTIFF; `DoseConfig`, zeitintegriertes Dosisäquivalent und optionale Bewegungskosten pro mSv. `config/radiation_grid.json` hält den 1-km-Ausschnitt fest. Keine räumliche Messkarte oder Abschirmungsmodellierung.
- `science_routes.py`: mehrere unabhängige Wege von einer Basis; Eingaben in `config/science_targets.json`. Dieselbe Karte und dasselbe Kostenraster für alle Ziele, kein Rundweg. Start/Ziel werden nicht verschoben.
- `tests/`: Tests der Kernfunktionen, Kartenintegration, XY-Exporte, Strahlungs-TIFF, Dosisintegration und optionalen Strahlungskosten. Abgelöste `grid_demo.py`/`dem_demo.py` und zugehörige reine Demo-Tests entfernt; aktuelle Basisrouten liegen unter `backend/routes/science_routes/`.

## Koordinaten und Merkmale
- Geoeingaben `(lon,lat)`, ostpositive Länge und Mars-CRS. Zellobjekte/Arrays `[row,column]`; exportierter Pfad `[[x=column,y=row],...]`, Start bis Ziel. Ursprung oben links, x nach rechts, y nach unten.
- Merkmale: Höhe (m), Neigung (Grad), Rauigkeit (m), Sperrstatus, Protected Zone, Strahlung (mSv/Tag), wissenschaftliche Relevanz; zusätzlich Anteil gültiger Höhen im Ableitungsfenster.
- TIFF: Nearest Neighbor, keine automatische Flächenmittelung oder Einheitenkonvertierung. CSV: nächster Messpunkt in explizitem Radius, keine räumliche Interpolation oder Zeitaggregation. Fehlende Felder None, in numerischen NPZ-Dateien NaN.
- Ohne Zusatzkarten Neigung/Rauigkeit aus DEM abgeleitet; Zusatzkarten laut expliziter semantischer JSON-Bindung. Wissenschaft nur Metadatum. Strahlung wird zeitlich integriert: mSv/24 h × Sekunden / 86400, konstante Geschwindigkeit als explizite Annahme (Standard 1 m/s), optionaler Aufenthalt am Ziel. Unbekannte Raten ergeben unbekannte Gesamtdosis, keine Nullstrahlung.
- `dose_config=DoseConfig(walking_speed_m_s=1, goal_dwell_seconds=0, radiation_weight=0)` in `prepare_maps`/`route_from_maps`. Gewicht > 0 addiert Bewegungskosten je mSv und sperrt unbekannte Strahlungszellen; Standard 0 belässt die bisherige Routenwahl. `summary.radiation` enthält Dosis, Dauer und kumulatives Profil; Kosten bleiben Demo-Einheiten. Protected-Zuschlag optional und nichtnegativ.
- Default-Testgrid ist lokal metrisch aus DEM-Mittelpunkt und Auflösung abgeleitet. Nicht automatisch das vereinbarte Frontend-Produktionsgrid.

## Ausführen und prüfen
- Einzelweg: `uv run --extra plot python -m backend.mapper_route /pfad/dem.tif --start LON LAT --goal LON LAT --plot`.
- Vier Wissenschaftsorte: `uv run --extra plot python -m backend.science_routes /pfad/dem.tif --plot`.
- Tests: `uv run python -m unittest discover -s backend/tests -v`.
- Ausgaben standardmäßig nach ignoriertem `backend/routes/` (CLI `--output-dir`). Batch: pro Ziel `path_xy.json`/`summary.json`, gemeinsam `paths_xy.json`, `routes_summary.json`, `grid.json`, `mapped_layers.npz` mit Metadaten sowie `routes.png` bei `--plot`.
- `uv run python -m backend.radiation --paths backend/routes/science_routes/paths_xy.json`: erzeugt unter `backend/routes/radiation/` TIFF, Metadaten, Grid-/Layer-JSON sowie `routes_dose.json` für vorhandene Pfade. Ohne `--paths` nur den Layer erzeugen. Beide Routing-CLIs akzeptieren `--layers`, `--grid` und die Dosisoptionen; Details in `MAPPER_ROUTING.md`.
- Ergebniswerte sind Demo-Kosten, keine kalibrierten Gehzeiten. Aktuelle Grenzen 20° Neigung/0,5 m Rauigkeit und Gewichte sind Testannahmen. Kein Fahrzeug-/Astronauten-Footprint oder vollständiges Hindernismodell.
- Vor Frontend-Export mit `../shared/data-contract.md` abstimmen; lokale NPZ-/XY-Ausgaben sind kein neuer Browservertrag. Kein Commit/Push ohne Auftrag.

- `config/base.json` und `config/science_locations.json`: einfache Koordinatenexporte (lon/lat in Grad sowie x/y im aktuellen Grid aus `backend/routes/science_routes/grid.json`). Snapshots aus `science_targets.json` und berechneten Routen, nicht separate Routing-Eingaben; bei Geometrieänderung neu ableiten.
# Backend

## Stand und Zweck
- **Es gibt keinen Server und keine API.** Entschieden am 13.11.2026 beim Konzeptabgleich (siehe `../docs/architecture.md`). Die Web-App ist statisch und läuft auf GitHub Pages.
- Die C#-Arbeit ist eine **Offline-Routing-Engine** (Dijkstra vom Habitat, Rückweg-Zeiger, zwei Varianten, Routen, Vergleich mit Curiosity). Sie schreibt Dateien, die das Frontend nur liest.
- Lokal importiert: `geoMapper/mars_mapping/`, eine Python-Bibliothek für Mars-CRS, GeoTIFF-/CSV-Import und Matrixexport; keine Routing-Engine. Demo-Dateien entfernt. Einstieg: `geoMapper/README.md`; Integrationsbedarf: `geoMapper/INTEGRATION.md`.

## Umsetzung
- Ausgaben der Engine folgen der Grid-Spezifikation in `../shared/` (Ausschnitt, 10-m-Zellen, Zeilenordnung, float32 little-endian, Kodierung der Rückweg-Zeiger, Dateinamen).
- Keine Laufzeit-Abhängigkeit des Frontends von diesem Code; der Browser rechnet keine Routen.
- Ergänze bei Implementierungen relevante Tests und dokumentiere Build, Aufruf und Prüfungen.
- Halte diese Datei mit tatsächlichen Einstiegspunkten und Abhängigkeiten aktuell.
