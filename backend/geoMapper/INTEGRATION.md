# Anbindung an das Frontend – Analyse vom 14.11.2026

Status: Analyse vom 14.11.2026 nachmittags, am Abend vom Stand in `main` überholt. Die aktuellen Abschnitte „Stand im Frontend“ und „Noch offen“ unten ersetzen die ursprüngliche Lückenliste. Das Frontend bleibt statisch; kein Python-Server nötig.

## Vorgesehener Datenfluss

Reales DEM / Messpunkt-CSV → GeoMapper / bestehende Pipeline → gemeinsames Terrainraster → Offline-Routing-Engine → JSON, GeoJSON und rohe Binärdateien → `frontend/public/data/` → Frontend.

Der GeoMapper übernimmt Import, Koordinatenumrechnung, Zellabfrage und gemeinsame Matrizen. Die bestehende Pipeline bleibt für Orthofoto, DEM-Aufbereitung und Hangneigung zuständig. Die Routing-Engine liefert Wege, Zeitfelder und Rückweg-Zeiger. Diese Rollen sind keine bereits fertiggestellte Integration.

## Kompatibilität und Lücken

| Bereich | Aktueller GeoMapper | Für ReturnLine erforderlich |
|---|---|---|
| Koordinaten | `(lon, lat)`, ostpositiv, Marskugel R=3396190 | Passt grundsätzlich. GeoJSON `[lon,lat]`; Leaflet `[lat,lon]`. Metadaten und Breitenkonvention der echten Quellen prüfen. |
| Rasterordnung | Matrix `[row, column]`, Nordwest-Ursprung | Passt zu `index = row * nx + col`; `columns/rows` in `nx/ny` abbilden. |
| Projektion | `LocalMetricGrid` skaliert Longitude mit cos(reference_latitude); `FixedGrid` nutzt geografische Grenzen | Vorgesehenes DEM-Raster: `eqc`, lat_ts=0, DEM-ausgerichtete 10-m-Zellen. Lokales Raster nicht unverändert übernehmen; Ursprung und Zellzentren müssen für Pipeline, Engine und Browser identisch sein. |
| DEM-Verarbeitung | Nearest Neighbor an Zellzentren | Pipeline sieht 10×10-Mittelung vor. Vor Abtastung auf dem vereinbarten Raster aggregieren oder expliziten Aggregationspfad ergänzen. Hangneigung separat berechnen. |
| Export | `save_npz`: komprimiertes NPZ plus eigenes Metadata-JSON | Exportadapter fehlt: rohe C-order `<f4`-Dateien für Terrain und ein Vertragsheader; NPZ kann internes Zwischenformat bleiben. |
| Fehlende Werte | NaN für fehlende Messdaten | Terrain: NoData ausdrücklich im Header dokumentieren und Zellen fürs Routing sperren. Zeitfelder: unerreichbar +Inf; Zeiger: -1. Diese Bedeutungen nicht vermischen. |
| Routing | Nicht enthalten | Engine muss `ttb_penalized/allowed.f32`, `ptr_penalized/allowed.i32` und `routes.json` liefern. |
| Kartenbild | GeoTIFF als optionale Hintergrundreferenz | Browser nutzt bereits JPG plus Bounds-JSON in `public/maps/`; Mapping-Paket muss dafür nicht im Browser laufen. |

Ein globales `+proj=eqc +lat_ts=0` und das lokale Raster ergeben bei gleicher nomineller Zellgröße unterschiedliche Longitude-Schritte. Ein bloßes Umbenennen der Metadaten würde einen räumlichen Versatz erzeugen. Die Rastergeometrie legt seit dem 14.11. abends `frontend/public/data/grid.json` fest, geschrieben von `pipeline/time_grid.py` (eqc, lat_ts=0, 10-m-Zellen auf dem 1-m-Pixelraster des DEM, 475 × 476). Keine andere Konfiguration als produktiven Standard verwenden.

## Stand im Frontend (14.11.2026 abends, `main`)

- `data.js` lädt `grid.json` und die vier Zeit- und Zeigerdateien (aus `data/`, sonst aus den Platzhaltern) sowie die Hang-Anzeige `slope_10m.json` und `.png`.
- `model.js` rechnet Position ↔ Zelle um (`cellIndex`, `cellCenter`, `gridBounds`), liest die Zeit nach Hause an einem Punkt (`ttbAt`) und folgt den Rückweg-Zeigern (`pointerTrack`).
- `sim.js` bestimmt die Rückkehr-Stufe an der Crew-Zelle nach Regel B aus `ttb_*`. Umleitung (Beat 4) und ABORT (Beat 5–6) folgen den Zeigern.
- `map.js` und `contour.js` zeichnen Rückkehrbereich und feste 60-Minuten-Linie als Konturen aus `ttb_penalized`. Die Hang-Ebene liegt im Layers-Menü.
- `crewviz.js`: Navigationskarte und Helm-HUD lesen dieselben Raster.
- Die Engine-Seite liefert `pipeline/time_grid.py` (Fallback, Python): Zeitfelder, Zeiger, Höhe, Hang und `routes.json` im Format des Datenvertrags.

## Noch offen

1. Kopfprüfung beim Laden: CRS sowie `nx·ny` gegen die Dateilänge. TypedArrays lesen in der Byteordnung der Plattform; alle Zielplattformen sind Little Endian, eine ausdrückliche Prüfung fehlt aber noch.
2. `elev_10m.f32` und `slope_10m.f32` werden im Browser nicht geladen. Höhe und Hang entlang der Routen kommen aus `routes.json`, der Hang als Bild aus `slope_10m.png`.
3. Weitere Ebenen des Datenteams (z. B. Grat-Maske) wie die Hang-Ebene: Bild + JSON mit Grenzen und `grid_id`.
4. Durchgängiger Kontrolltest von der Geokoordinate über Zelle und DEM-Wert bis zur Kartenposition, mit festen Kontrollpunkten.

## Prüfstand

Vor dem Entfernen der Tests bestanden alle 13 Unit-Tests. Auf Nutzerwunsch wurden die Testdateien anschließend aus dem Repository entfernt. Keine Prüfung gegen ein reales DEM und keine abgeschlossene Frontend- oder Routing-Anbindung. Die affine Array-Transformation in `matrix.py` verwendet `@`.
