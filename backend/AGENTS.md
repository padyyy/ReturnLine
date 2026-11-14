# Backend

## Stand und Zweck
- **Es gibt keinen Server und keine API.** Entschieden am 13.11.2026 beim Konzeptabgleich (siehe `../docs/architecture.md`). Die Web-App ist statisch und läuft auf GitHub Pages.
- Die C#-Arbeit ist eine **Offline-Routing-Engine** (Dijkstra vom Habitat, Rückweg-Zeiger, zwei Varianten, Routen, Vergleich mit Curiosity). Sie schreibt Dateien, die das Frontend nur liest.
- Ob dieser Ordner dafür umbenannt (etwa in `routing/`) oder entfernt wird, entscheidet der Tech Lead beim Kickoff.

## Python-A* (implementiert, noch nicht integriert)
- Auf ausdrücklichen Nutzerauftrag liegt eine eigenständige Offline-Implementierung in `astar.py`. Die C#-Angaben oben beschreiben die frühere Planung.
- `astar(costs, start, goal, *, cell_size_m=1.0, allow_diagonal=False)` benötigt nur die Standardbibliothek und Python >= 3.10.
- Eingabe: rechteckiges Raster mit endlichen positiven Kosten pro Meter; `None` sperrt Zellen. NoData vorher in `None` umwandeln. Höhenwerte allein sind kein Kostenraster.
- Koordinaten sind nullbasierte `(Zeile, Spalte)` in Eingabereihenfolge; quadratische Zellen, keine geografische Transformation.
- Ausgabe: `PathResult(path, total_cost)` mit Start und Ziel; `None` bei gesperrten Endpunkten oder fehlendem Weg. Ungültige Eingaben lösen `ValueError` aus.
- Schrittkosten: Länge in Metern mal Kosten der Zielzelle; Start ohne Eintrittskosten. Diagonalen sind optional und durchqueren keine gesperrten Ecken.
- Tests aus dem Repository-Stamm: `python -m unittest discover -s backend -v`.
- Keine Anbindung an Datenpipeline, Frontend oder Exportverträge; keine Erzeugung des geplanten Rückweg-Zeiger-Rasters.

## Umsetzung
- `grid_demo.py`: reproduzierbares synthetisches 100×100-Grid als Liste von Zeilen mit je 100 `TerrainCell`-Datensätzen. Aufruf aus dem Repository-Stamm: `uv run --extra plot python -m backend.grid_demo`.
- Ausgabe standardmäßig im ignorierten `tmp/grid_demo/` (änderbar mit `--output-dir`): `01_normalized_costs.png`, `02_astar_nodes.png` und `grid_example.json` mit Rohmerkmalen, Konfiguration, Kosten, ausgewerteten Knoten und Pfad. 1 m pro Zelle (100×100 m Fläche), Demo-Kosteneinheiten ohne Zeitkalibrierung. Steiler Grat mit Durchgang, raue Fläche und unzureichende Daten dienen nur dem Test.
- A* akzeptiert optional `on_expand`, einen Callback für ausgewertete Zellen nach dem Entfernen veralteter Heap-Einträge einschließlich Start/Ziel. Die Demo unterscheidet diese Suchknoten vom Ergebnispfad; noch offene Frontier-Knoten sind nicht markiert.
- Matplotlib ist ausschließlich über das optionale `plot`-Extra in `pyproject.toml` nötig. `test_grid_demo.py` prüft Form, Reproduzierbarkeit, Suchbeobachtung, begehbaren Pfad und aufsummierte Kosten.
- `terrain_costs.py` schaltet `build_cost_grid(terrain, config)` vor A*: `TerrainCell(elevation_m, slope_deg, roughness_m, valid_fraction, blocked=False)` je Zelle; Originaldaten bleiben erhalten.
- `CostConfig` verlangt `max_slope_deg`, `max_roughness_m`, `min_valid_fraction`, `base_cost_per_m`. Gewichte für Neigung, Rauigkeit und Unsicherheit sind nichtnegative konfigurierbare Zahlen (Standard jeweils 1). Konkrete Grenzwerte muss das Team festlegen.
- Kostenformel: `base * (1 + slope_weight*slope/max_slope + roughness_weight*roughness/max_roughness + uncertainty_weight*(1-valid_fraction))`. Feste Referenzen halten die Normalisierung unabhängig vom Kartenausschnitt. Kosten sind mindestens `base`; keine kalibrierte Reisezeit ohne entsprechendes Modell.
- Überschrittene Neigungs-/Rauigkeitsgrenzen, unterschrittener Mindestanteil gültiger Daten, explizite Sperren sowie fehlende/nichtendliche Merkmale erzeugen `None`. Exakt erreichte Grenzen bleiben erlaubt. Physikalisch ungültige endliche Werte lösen `ValueError` aus.
- Absolute Höhe wird nicht bestraft. Richtungsabhängige Bergauf-/Bergabkosten sind noch nicht implementiert. Strahlung und Temperatur gehen derzeit nicht in die Kosten ein.
- `test_terrain_costs.py` prüft Normalisierung, Sperren, Konfiguration, Unabhängigkeit vom Ausschnitt und Integration mit A*. CSV-Anbindung fehlt; separater DEM-Test siehe unten.
- Ausgaben der Engine folgen der Grid-Spezifikation in `../shared/` (Ausschnitt, 10-m-Zellen, Zeilenordnung, float32 little-endian, Kodierung der Rückweg-Zeiger, Dateinamen).
- Keine Laufzeit-Abhängigkeit des Frontends von diesem Code; der Browser rechnet keine Routen.
- Ergänze bei Implementierungen relevante Tests und dokumentiere Build, Aufruf und Prüfungen.
- Halte diese Datei mit tatsächlichen Einstiegspunkten und Abhängigkeiten aktuell.

## DEM-Test mit echten Höhenwerten
- `dem_demo.py`: `uv run --extra plot python -m backend.dem_demo /pfad/zum/dem.tif`. Optionale Argumente `--output-dir`, `--start ZEILE SPALTE`, `--goal ZEILE SPALTE`. Benötigt Rasterio, NumPy (über Rasterio installiert) und Matplotlib.
- Erwartet nordorientierte quadratische Pixel in projiziertem Meter-CRS; Höhen in Metern (Annahme im Ergebnis dokumentiert, falls die Band-Einheit fehlt). Liest NoData maskiert, keine Veränderung der Quelldatei und keine Erd-Reprojektion.
- Neigung aus lokaler Ausgleichsebene; Rauigkeit als RMS-Höhenrest zu dieser Ebene. 11×11-Fenster = 10 m zwischen äußeren Pixelzentren bei 1-m-Pixeln. Unvollständige Fenster am Rand oder nahe NoData konservativ gesperrt. `valid_fraction` bedeutet gültiger Fensteranteil, keine vermessene Genauigkeit. Kein vollständiges Hindernis-/Fahrzeugmodell.
- Kosten über bestehendes `build_cost_grid`; Testgrenzen 20° und 0,5 m Rauigkeit, Mindestanteil 0,8, Basis 1 und Gewichte 2/2/1 sind keine kalibrierten Missionsparameter. Kosten bleiben Demo-Einheiten pro Meter, keine Sekunden.
- Automatische Start-/Zielwahl nahe 10%/90% der Rasterindizes im größten vierfach zusammenhängenden begehbaren Bereich. Explizite Endpunkte werden nicht verschoben. A* nutzt vier Nachbarn. Ergebnis darf keinen Weg enthalten; Grenzen werden deshalb nicht gelockert.
- Ausgabe nach `tmp/dem_demo/`: Höhenplot, Kostenplot, Such-/Pfadplot, `route_summary.json` mit Rastermetadaten und Route sowie `terrain_arrays.npz` mit Höhen, Merkmalen, Kosten und Suchmaske. Neue Läufe überschreiben diese Dateien. Keine Frontend-Anbindung.
- `test_dem_demo.py`: analytische Ebene, Auflösungsskalierung, RMS-Rauigkeit, NoData/Ränder sowie zusammenhängende automatische Endpunktwahl.
