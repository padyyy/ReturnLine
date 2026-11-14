# Anbindung an das Frontend – Analyse vom 14.11.2026

Status: Vorschlag anhand des lokalen Codes, noch nicht implementiert. Grundlage: `shared/data-contract.md`, `frontend/src/{data,model,map,sim}.js` und `pipeline/README.md`. Das Frontend bleibt statisch; kein Python-Server nötig.

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

Ein globales `+proj=eqc +lat_ts=0` und das lokale Raster ergeben bei gleicher nomineller Zellgröße unterschiedliche Longitude-Schritte. Ein bloßes Umbenennen der Metadaten würde einen räumlichen Versatz erzeugen. Die Grid-Spezifikation ist im Vertrag weiterhin ein offener Entwurf; keine Beispielkonfiguration als produktiven Standard veröffentlichen.

## Was im Frontend bereits vorhanden ist

- `data.js` lädt statische JSON-/GeoJSON-Dateien und die vier Zeit-/Zeigerdateien als `Float32Array` bzw. `Int32Array`. Dateinamen können über `header.files` kommen. Scheitert eine Binärdatei, wird das ganze Grid verworfen.
- `model.js` erwartet `routes.stations`, pro Eintrag `station`, `out`, `ret`. Tracks enthalten `vertices` mit `lon`, `lat`, `d_m`, `t_min`, `elev_m`, `slope_deg` sowie die Summen aus dem Datenvertrag. Das Frontend interpoliert Positionen auf diesen Tracks.
- `map.js` zeichnet Orthofoto, GeoJSON, Routen und Marker. Die Gruppe `area` existiert, enthält aber noch keine Rasterkonturen.

## Was im Frontend noch fehlt

1. Headerprüfung (CRS, nx/ny, Länge der Arrays, Zellgröße, Byteordnung und NoData) und exakte Umrechnung `lon/lat ↔ row/col`. Native TypedArrays dekodieren nicht ausdrücklich Little Endian; die vertragliche Byteordnung muss geprüft oder per DataView dekodiert werden.
2. Laden von `elev_10m.f32` und `slope_10m.f32`; diese stehen im Vertrag, werden vom aktuellen Loader aber nicht geladen.
3. Nutzung der Zeitfelder an der Crew-Position: `sim.js` bestimmt Rückkehrzeiten aktuell noch aus Routendistanzen/-zeiten; die Raster werden zwar geladen, aber dort nicht ausgewertet.
4. Darstellung der Rückkehrflächen und 60-Minuten-Konturen sowie Verfolgen der Rückweg-Zeiger für Reroute und ABORT. Die geladenen Pointer sind noch nicht in diese Funktionen integriert.

Allein Dateien nach `public/data/` zu kopieren aktiviert daher noch keine vollständige Raster-Navigation. Stationen, Szenario und Routen müssen ebenfalls vorliegen; ohne diese Pflichtdateien bricht `loadData()` ab oder verwendet vorhandene Platzhalter.

## Empfohlene Umsetzungsschritte

1. Grid-Spezifikation mit Paul fixieren: DEM-ausgerichteter Ursprung, bbox, nx/ny, 10-m-Zellen, CRS, Zeilenordnung, NoData und Dateinamen. Gemeinsame bekannte Kontrollpunkte festhalten.
2. Echten DEM-Ausschnitt mit der Pipeline vorbereiten; GeoMapper-Abtastung nur auf dem identischen Raster verwenden. Aggregation und Hangneigung fachlich prüfen.
3. Offline-Exportadapter erstellen: Terrain als `<f4` in C-Reihenfolge, explizite Einheiten (m, Grad), Header mit Quelle, Generator und Datum. Keine erfundenen Routingwerte exportieren.
4. Terrain an die Routing-Engine übergeben; beide Zeit-/Pointervarianten und Stationsrouten erzeugen und zusammen mit Szenario/GeoJSON nach `frontend/public/data/` ausliefern.
5. Frontend um Rasterzugriff, Terrainwerte, Konturen und Pointer-Navigation ergänzen; bestehende Routeninterpolation weiterverwenden.
6. Durchgängiger Kontrolltest: bekannte Geo-Koordinate → erwartete Zelle → DEM-Wert → korrekte Kartenposition. Dateilängen `nx*ny*4`, Nord/Süd-Orientierung, Zellzentren, NoData und Pointer-Ziel/-Zyklen prüfen; anschließend Frontend-Build und Browseransicht kontrollieren.

## Prüfstand

Vor dem Entfernen der Tests bestanden alle 13 Unit-Tests. Auf Nutzerwunsch wurden die Testdateien anschließend aus dem Repository entfernt. Keine Prüfung gegen ein reales DEM und keine abgeschlossene Frontend- oder Routing-Anbindung. Die affine Array-Transformation in `matrix.py` verwendet `@`.
