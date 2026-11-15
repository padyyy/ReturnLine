# Mapper → A* → XY-Pfad

Aus dem Repositoryordner:

```sh
uv sync --extra plot
uv run --extra plot python -m backend.mapper_route "/pfad/zum/dem.tif" --start 137.38138513 -4.8138518 --goal 137.37929830 -4.80494991 --plot
```

IDE: Modul `backend.mapper_route`, Repository als Arbeitsverzeichnis, `.venv/bin/python`; TIFF-Pfad sowie `--start LON LAT --goal LON LAT --plot` als Argumente.

Ausgabe unter `backend/routes/mapper_route/` (änderbar durch `--output-dir`):

- `path_xy.json`: geordneter Array `[[x,y], ...]`, Start bis Ziel; `null` falls nicht erreichbar. Außerhalb liegende Endpunkte lösen einen Fehler aus und werden nicht verschoben.
- `summary.json`: Endpunkte, Geometrie, Herkunft der Merkmale, Konfiguration, Kosten, Weglänge und `radiation` mit Dauer, Dosisäquivalent und kumulativem Profil.
- `mapped_layers.npz` und Metadaten: gleich große numerische Matrizen für sieben Merkmale sowie Kosten. Fehlende Werte intern NaN; im Python-Zellobjekt None. NPZ ist ein Offline-Zwischenformat, kein Browservertrag.
- `route.png` bei `--plot`.

`x` wächst nach rechts, `y` nach unten, Ursprung ist die obere linke Rasterzelle `(0,0)`. A* arbeitet intern weiterhin mit `(row,column)`; nur der Adapter übersetzt. Vier Nachbarn, keine Diagonalen. Weglänge ist die Rasterlänge in der Kartenebene, keine 3D-Gehstrecke.

## Datenfluss und Schnittstellen

`route_from_maps(dem_path, start_lonlat, goal_lonlat, *, grid=None, layer_specs=None, config=DEFAULT_CONFIG, protected_penalty=0, derive=True, dose_config=DoseConfig())` liefert `(path_xy, grid, arrays, expanded_mask, summary)`. `prepare_maps` akzeptiert dieselbe `dose_config` und speichert sie in `PreparedMaps`. Karten werden über `GeoRaster`, `raster_to_matrix` und `csv_to_matrices` des GeoMappers geladen; gemeinsame Zellmittelpunkte bestimmen die Zuordnung.

Ohne `--grid` wird ein `LocalMetricGrid` aus Mittelpunkt, Dimensionen und vertikaler Pixelgröße des Referenz-DEMs erstellt. Beim geografischen DEM wird die vertikale Gradweite mit Marsradius 3396190 m umgerechnet. Das Testgrid ist nicht der frühere TIFF-Pixelindex und nicht automatisch das Frontend-Produktionsgrid. Das Defaultverfahren benötigt nordorientierte Pixel; zusätzliche Karten dürfen andere CRS/Auflösungen haben. Für Integration ein abgestimmtes lokales metrisches Grid mit `--grid` übergeben. Geografische `FixedGrid`-Raster werden vom Routingadapter abgelehnt, da sie keine konstant quadratischen Meterzellen garantieren.

`cell_grid(elevation, layers)` erzeugt `grid[row][column]` aus `TerrainCell` mit:

- `elevation_m`, `slope_deg`, `roughness_m`
- `blocked`, `protected_zone`, `radiation_msv_per_day`, `scientifically_relevant`
- zusätzlich `valid_fraction` als Anteil gültiger Höhen im Ableitungsfenster.

Numerische Quellwerte müssen bereits die benannten Einheiten besitzen. Höhen in Metern sind Voraussetzung. TIFF-Werte werden nearest-neighbour abgetastet, nicht flächig gemittelt. Fehlen Neigungs-/Rauigkeitskarten, werden diese standardmäßig aus einer lokalen 11×11-Ebene des gemappten DEMs abgeleitet; RMS-Resthöhe ist die Rauigkeit. Bei 1 m Zellgröße beträgt der Abstand äußerer Pixelzentren 10 m. `--no-derive` unterbindet die Ableitung. Explizit gelieferte Karten sind maßgeblich, auch wo sie NoData enthalten; dort keine heimliche Ersatzableitung.

## Fehlende Daten und Regeln

Die neue Integration ruft `build_cost_grid(..., ignore_missing=True)` auf. Fehlende Werte werden als None gespeichert und erzeugen weder Zuschläge noch eine Sperre. Auch eine fehlende Höhe allein sperrt in diesem permissiven Modus nicht. `blocked=True` und bekannte überschrittene Neigungs-/Rauigkeitsgrenzen sperren weiterhin. Ein bekannter unzureichender `valid_fraction` kann ebenfalls sperren. Der bisherige strikte Modus bleibt Standard für bestehende Aufrufer. Unbekannte Merkmale sind keine bestätigte Sicherheit; insbesondere werden lokale kleine Hindernisse nicht vollständig modelliert.

Aktuelle DEM-Testannahmen: Neigung höchstens 20°, Rauigkeit höchstens 0,5 m, Mindestanteil gültiger Werte 0,8, Basis 1, Gewichte Neigung/Rauigkeit/Unsicherheit 2/2/1. Keine kalibrierte Gehzeit. Absolute Höhe ist keine Kostenstrafe.

Schutzstatus bleibt separat: `--protected-penalty N` multipliziert Geländekosten bekannter Schutzzellen mit `1+N`, N muss nichtnegativ sein (Standard 0). Explizit harte Sperren als `blocked`-Maske liefern. Der optionale Strahlungszuschlag wird danach addiert und dadurch nicht vom Schutzgebietsmultiplikator verändert. Wissenschaftliche Relevanz bleibt Information.

## Strahlungs-TIFF und aufgenommene Dosis

`radiation.py` erzeugt ein räumlich konstantes, historisches GCR-Hintergrundszenario auf dem in `config/radiation_grid.json` festgehaltenen aktuellen Ausschnitt: 1000 × 1000 Zellen, etwa 1 m, Zentrum 137,3807° E / −4,8106°. Eine alternative lokale Grid-JSON lässt sich mit `--grid` übergeben.

```sh
uv run python -m backend.radiation
```

Ergebnis unter `backend/routes/radiation/`: `radiation_background_msv_per_day.tif`, zugehörige `.metadata.json`, `grid.json` und eine fertige `layers.json`. Das TIFF ist ein komprimiertes Float32-Raster, Band 1 = `radiation_msv_per_day`, NoData −9999, nordorientierte lokale Equirectangular-Projektion auf der Marskugel R = 3396190 m. Auflösung, Zellmittelpunkte und Ausdehnung entsprechen genau dem gewählten Grid. TIFF/NPZ sind gemäß `.gitignore` vom Tracking ausgenommen; JSON-/PNG-Ausgaben können versioniert sein. Generator und Gridkonfiguration ermöglichen die Reproduktion der TIFF.

Standardrate 0,64 mSv je 24 h; Quelle [Hassler et al. 2014](https://doi.org/10.1126/science.1244797), Messzeitraum 2012–2013. Die Quellunsicherheit ±0,12 mSv/Tag steht in den Metadaten. Die Pixel sind **keine einzelnen Messungen**. Es sind weder lokale Gelände-/Anzugabschirmung noch aktuelles Weltraumwetter oder solare Teilchenereignisse modelliert. `--rate-msv-per-day` ändert die Szenariorate; die gespeicherte Quellreferenz und deren Unsicherheit bleiben als Referenz gekennzeichnet. Die Quelle ist ein Dosisäquivalent in mSv, keine absorbierte Dosis in Gy oder berechnete menschliche Effektivdosis. Gy/h nicht ohne Strahlungsqualitätsmodell als mSv/Tag binden.

Zusätzlich liegt ein Export der TIFF-Werte unter `backend/routes/radiation/radiation_background_msv_per_day.csv` vor: eine Million Zeilen, Spalten `x,y,Longitude,Latitude,radiation_msv_per_day`, UTF-8, Kommatrennung und Dezimalpunkt. x/y sind nullbasierte Zellindices; Longitude/Latitude beschreiben die Mars-Zellmittelpunkte. Reihenfolge: zeilenweise von oben links. Leere Werte kennzeichnen NoData. `radiation_background_msv_per_day.csv.metadata.json` beschreibt Schema und Szenario. Für den CSV-Import dieselbe Griddatei und `--layers backend/routes/radiation/layers_csv.json` verwenden. Der Suchradius von 0,1 m dient ausschließlich dem Abgleich identischer Zellmittelpunkte. Die CSV enthält dieselben Szenariowerte, keine zusätzlichen Messungen; sie wird derzeit separat aus der TIFF exportiert, nicht vom Generator-CLI erzeugt.

Beispiel mit Dosis und zehn Minuten Aufenthalt am Ziel:

```sh
uv run python -m backend.mapper_route "/pfad/zum/dem.tif" \
  --grid backend/routes/radiation/grid.json \
  --layers backend/routes/radiation/layers.json \
  --start 137.3807 -4.8106 --goal 137.379296 -4.804945 \
  --walking-speed-m-s 1 --goal-dwell-seconds 600 \
  --output-dir backend/routes/mapper_route_with_dose
```

Für vorhandene `paths_xy.json` kann die Dosis ohne neue Wegsuche berechnet werden:

```sh
uv run python -m backend.radiation --paths backend/routes/science_routes/paths_xy.json
```

Dies schreibt zusätzlich `backend/routes/radiation/routes_dose.json` mit Dosis und Profil pro Routen-ID. Dieselben Geschwindigkeits-/Aufenthaltsoptionen gelten. Die Pfade müssen zum übergebenen Grid gehören; das einfache XY-Format enthält selbst keine Georeferenz.

Die zeitliche Annahme ist eine konstante Gehgeschwindigkeit, standardmäßig 1 m/s, ausdrücklich keine kalibrierte EVA-Gehzeit. Jede Bewegung verwendet wie A* die Zielzelle: `dt = Schrittlänge / Geschwindigkeit`, `dH = Dosisrate[Zielzelle] * dt / 86400`. Der Start hat keine Eintrittsdosis. Am Ziel kommt `Dosisrate[Ziel] * goal_dwell_seconds / 86400` hinzu. Die Geländekosten und der Schutzgebietszuschlag werden nicht als Sekunden interpretiert.

`summary.radiation` enthält `status`, `duration_seconds`, `moving_dose_msv`, `goal_dwell_dose_msv`, `total_dose_msv`, `known_dose_msv`, `unknown_duration_seconds` und `profile`. Das Profil hat einen Eintrag pro Pfadknoten mit `x`, `y`, `elapsed_seconds`, `rate_msv_per_day` und `cumulative_dose_msv`; der letzte Eintrag schließt den Zielaufenthalt ein. Ohne bekannten Wert für ein Zeitintervall bleiben Gesamt- und anschließende kumulative Dosis `null`, Status `incomplete`; `known_dose_msv` ist nur die explizit benannte Teilsumme. Bei nicht erreichbarem Ziel sind Dosis und Dauer `null`, Status `unreachable`. Start = Ziel ergibt bei null Aufenthalt null Dosis.

Optional verändert `--radiation-weight W` die A*-Bewegungskosten: `Kosten/m = bisherige Kosten/m + W * Dosisrate / (86400 * Geschwindigkeit)`, W ≥ 0 in Demo-Kosteneinheiten/mSv. Standard 0 berechnet und berichtet Dosis ohne Einfluss auf die Route. Bei W > 0 sperren unbekannte Strahlungsraten die betroffenen Zellen; sonst bleibt die bisherige permissive Routingpolicy bestehen. Für festes Ziel ist die Aufenthaltsdosis konstant und daher nicht Bestandteil von `total_cost`. Ein einheitlicher Hintergrund erzeugt keine lokalen Abschirmungsvorteile. Harte kumulative Dosislimits und zeitabhängige Strahlung sind nicht implementiert.

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

Zusätzliche Integrationstests: TIFF-Sperrmaske, XY-Routenfolge, None-Policy, CSV-Radius, unbekannte Strahlung, Schutzgebietszuschlag und abgewiesene Endpunkte außerhalb des Grids. Strahlungstests prüfen Mars-Georeferenzierung und TIFF-Roundtrip, Einheiten-/Zeitintegration, räumliche Raten, Aufenthalt, NoData, Umwege durch Strahlungskosten sowie Einzel- und Batch-CLI.

## Mehrere Wege von derselben Basis

```sh
uv run --extra plot python -m backend.science_routes "/pfad/zum/dem.tif" --plot
```

Basis und Ziele stehen in `config/science_targets.json` (oder eigener Datei mit `--targets`). `prepare_maps` lädt und normalisiert die Karten einmal; `route_prepared` führt A* für jedes Ziel unabhängig von derselben Basis aus. `route_from_maps` für einzelne Wege bleibt verfügbar. Die Höhenableitung liegt in `terrain_features.py`; alte Demo-Skripte wurden entfernt. Batch unterstützt dieselben `--grid`, `--layers`, `--walking-speed-m-s`, `--goal-dwell-seconds`, `--radiation-weight`, `--protected-penalty` und `--no-derive` wie der Einzelweg; der Aufenthalt gilt je Ziel.

Ausgabe unter `backend/routes/science_routes/`: `sol_4612/path_xy.json`, `sol_4671/path_xy.json`, `sol_4709/path_xy.json`, `sol_4818/path_xy.json` sowie `paths_xy.json` mit allen vier Arrays nach Ziel-ID. `routes_summary.json` dokumentiert die Ausgangskoordinaten, Endzellen, Parameter, Längen und Routendosen; `grid.json` definiert die gemeinsame XY-Geometrie. Gemeinsame Karten werden nur einmal als NPZ gespeichert. `routes.png` zeigt die Wege zusammen. Alle Koordinatenarrays sind vom Start zur jeweiligen Zielzelle geordnet. Nicht erreichbare Wege werden als null ausgegeben. Koordinaten außerhalb des Rasters sind Eingabefehler; sie werden nicht abgeschnitten oder verschoben.

## Zwei Varianten mit Schutzmaske

`protected_routes.py` lädt die Karten einmal über den GeoMapper und berechnet
zwei unabhängige A*-Wege auf demselben Raster. Die explizite `protected_zone`-
Bindung muss nach dem Mapping für jede Zelle 0 oder 1 liefern; fehlende Werte
werden für diesen Vergleich abgelehnt.

```sh
uv run --extra plot python -m backend.protected_routes /pfad/dem.tif \
  --layers /pfad/layers.json --start 137.3807 -4.8106 \
  --goal 137.379296 -4.804945 --avoidance-penalty 100 --plot
```

`layers.json`: `{"protected_zone": {"path": "/pfad/schutzmaske.tif"}}`.
CSV-Masken können mit `column` und `radius_m` wie andere Layer gebunden werden.

- `avoid_protected`: Geländekosten geschützter Zellen × (1 + Zuschlag), Standard 100.
- `allow_protected`: Zuschlag 0. Durchquerung erlaubt, nicht erzwungen.
- Harte Sperren bleiben in beiden Varianten bestehen. Ein endlicher Zuschlag
  garantiert keine vollständige Umgehung, etwa wenn das Ziel in der Zone liegt.
- Strahlungskosten werden danach addiert. A* bewertet weiterhin Schrittlänge ×
  Kosten der Zielzelle; die Startzelle hat keine Eintrittskosten.

API: `calculate_variants(prepared, start_lonlat, goal_lonlat, avoidance_penalty=100)`.
`with_protected_penalty` erzeugt neue Kostenraster aus den in `PreparedMaps.terrain_costs`
gespeicherten unveränderten Geländekosten, ohne erneuten Kartenimport und ohne
Zuschläge aufzusummieren. Kartenarrays werden gemeinsam lesend verwendet.

Ausgabe standardmäßig `backend/routes/protected_routes/`: `grid.json`,
`routes.json`, je Variante `path_xy.json` und `summary.json`, bei `--plot`
`routes.png` mit zwei Ansichten. Die Zusammenfassungen enthalten
`protected_cells_on_path` (inklusive Start) und `protected_distance_m`
(Schrittlängen mit geschützter Zielzelle, ohne Eintritt am Start). Diese Distanz
folgt der Rasterkostenkonvention und ist keine exakte Polygon-Schnittlänge.
Kosten unterschiedlicher Varianten haben unterschiedliche Zielfunktionen und
sind nicht als gemeinsame Reisezeit vergleichbar.
