# Übergabe an Pauls Agent: Branch `A-star`

Stand: Sonntag, 15.11.2026, nachts. Geprüft wurde `origin/A-star` bis Commit `62f66f4` gegen `origin/main` (`c1c72ff`). Diese Datei ist für den Agenten, der an Pauls Branch weiterarbeitet. Erst „Befund“ lesen, dann „Für alle Aufgaben“ in `docs/auftraege/datenteam.md`, dann die Aufgaben unten.

## Kurzfassung

Der Branch ist **so nicht mergebereit**:
- Er baut ein **zweites, paralleles Routing- und Geländesystem** neben dem, das in `main` läuft und die Konsole versorgt: eigenes Raster, eigene Höhen- und Hangableitung, eigene Kosten, eigene Ziele und ein eigenes Ausgabeformat.
- Er hat **vier Merge-Konflikte** mit `main`.

Wertvoll und gebraucht sind zwei Dinge: Pauls A* für den **Vergleich mit Curiosity** (Aufgabe 5 des Datenteams) und optional die **Rauigkeit**. Beides muss aber auf dem gemeinsamen Raster und mit dem gemeinsamen Gehmodell laufen.

Die von Paul genannten Lücken „Strahlungskarte“ und „Schutzzone“ sind **keine Lücken**:
- Die Schutzzonen sind in `main` vorhanden.
- Eine Strahlungskarte wird nicht gebraucht (Begründung unten).

## Was in `main` schon existiert (nicht neu bauen)

| Bereich | Wo in `main` | Stand |
|---|---|---|
| Gemeinsames Raster | `frontend/public/data/grid.json` | eqc auf der Mars-Kugel (R = 3 396 190 m), 10-m-Zellen auf dem 1-m-Pixelraster des USGS-DEM, 475 × 476, Index = Zeile · nx + Spalte, Zeile 0 = Norden |
| Höhe und Hang | `elev_10m.f32`, `slope_10m.f32` von `pipeline/time_grid.py` | aus dem USGS Gale DEM (4-m-Stufe, je 10-m-Zelle **gemittelt**), Hang über 10 m |
| Gehmodell | `pipeline/time_grid.py`, `frontend/src/route-duration.js`, `shared/walking-model-vectors.json` | **Tobler 1993**, normiert auf 1,5 km/h, gerichtet (Teamentscheidung). Alle Implementierungen treffen die 18 Testvektoren |
| Rückkehrzeiten und Zeiger | `ttb_penalized/allowed.f32`, `ptr_penalized/allowed.i32` | Dijkstra vom Habitat, 16 Nachbarn, keine Eckenabkürzung, über 20° gesperrt |
| Routen | `frontend/public/data/routes.json` | Track-Format: `vertices` mit `lon`, `lat`, `d_m`, `t_min`, `elev_m`, `slope_deg` |
| Schutzzonen | `zones.geojson` (Polygone, 80 m Puffer), im Grid Faktor 20 plus 30-m-Abstandsring Faktor 3 | in Routing, Konsole, Warnung (10 m) und ABORT-Protokoll umgesetzt |
| Strahlung | `scenario.json`: `dose_rate_msv_per_day` = 0,64 (Hassler et al. 2014); die Konsole rechnet Dosis = Rate × Zeit | Teamentscheidung: **nur Information, nie Sperre und nie Kosten**. Das Dosislimit pro EVA wurde am 12.11. gestrichen |
| Raster-Zugriff in Python | `pipeline/mapping_grid.py` (`MappingGrid`) von Magnus | liest `grid.json`, `read_float("elev")`, `read_float("slope")`, `xy(lon, lat)` |
| geoMapper | `backend/geoMapper/` in `main` | identisch mit Pauls Kopie |

## Befund im Einzelnen

1. **Eigenes Raster statt `grid.json`:**
   - `LocalMetricGrid`, 1000 × 1000 Zellen zu 1 m, Mitte 137,3807° O / −4,8106° (`config/radiation_grid.json`, `config/base.json`).
   - Diese „Basis“ liegt rund 265 m west-nordwestlich des Habitats (137,384902 / −4,812105).
   - Die Ausgabe `path_xy.json` sind Pixelindizes `[[x, y], …]` dieses lokalen Rasters, ohne Georeferenz.
   - Weder Konsole noch Engine können sie lesen.
2. **Zweite Höhen- und Hangableitung:**
   - `terrain_features.py` tastet das DEM per Nearest Neighbor ab und leitet Hang und Rauigkeit aus 11 × 11 Pixeln ab.
   - Damit entstünden zwei verschiedene Hangdatensätze, und A* würde anderes Gelände sehen als Dijkstra und Konsole.
3. **Kosten sind keine Zeit:**
   - Neigung, Rauigkeit und Unsicherheit werden mit 2/2/1 gewichtet, dimensionslos.
   - Die Strahlungsdosis rechnet mit **1 m/s** (3,6 km/h) statt mit Tobler bei 1,5 km/h.
   - Nur 4 Nachbarn ohne Diagonalen, die Konsole nutzt 16.
4. **Andere Ziele:**
   - `config/science_locations.json` nutzt die Sols 4612, 4671, 4709 und **4818**.
   - Die Stationen in `main` liegen bei 4596, 4609, 4667 und 4839 und sind auf den Demo-Ablauf geprüft.
   - **Sol 4818 ist das Zentrum der Schutzzone „Drill site B“.** Eine Station dort widerspricht der Planetary-Protection-Regel und zerstört Beat 5–6.
   - Echte Namen und Begründungen der Stationen liefert Aufgabe 1 (Magnus) in `stations.geojson`.
5. **Strahlungskarte:**
   - `radiation.py` erzeugt ein Raster mit überall **demselben** Wert 0,64 mSv/Tag. Es enthält keine Information, die die Konsole nicht schon hat.
   - Eine räumlich variierende Karte gibt es nicht: RAD misst nur am Rover. Erfundene Abschirmung wäre gegen die Projektregeln.
   - Ein Strahlungsterm in den A*-Kosten widerspricht „nur Information, nie Sperre“.
6. **Schutzzonen:** Sie existieren als Polygone in `zones.geojson` und wirken im Grid. Eine eigene Schutzzonen-Maske oder ein eigener Zuschlag (`--protected-penalty`) wird nicht gebraucht.
7. **Erzeugte Dateien im Repo:**
   - 17 Dateien unter `backend/routes/`, darunter `routes.png` (1,4 MB) und `routes_dose.json` (229 KB).
   - Laut Pauls eigener Doku sollen sie lokal bleiben.
   - `.gitignore` entfernt außerdem die Zeile `tmp/`.
8. **Zweites Python-Setup:** `pyproject.toml` und `uv.lock` (uv) neben `pipeline/requirements.txt` mit `.venv`. Zwei Wege, dieselben Pakete zu installieren.
9. **Merge-Konflikte** mit `main`: `.gitignore`, `README.md`, `backend/AGENTS.md`, `backend/geoMapper/AGENTS.md` (doppelt angelegt).
10. **Gut:** saubere Tests (`unittest`), ehrliche Doku zu Grenzen und Einheiten, A* mit Eckensperre. Das lässt sich weiterverwenden.

## Aufgaben

### Aufgabe 1: Branch auf `main` bringen und aufräumen (zuerst)

1. Neuen Branch `feat/astar-comparison` von aktuellem `origin/main` anlegen. Aus `A-star` nur übernehmen, was die Aufgaben unten brauchen: `backend/astar.py`, Tests, gegebenenfalls Teile von `terrain_features.py`.
2. **Nicht übernehmen:**
   - die Kopie von `backend/geoMapper/` (liegt identisch in `main`);
   - `backend/routes/**` (erzeugte Dateien);
   - `config/base.json`, `config/radiation_grid.json`, `config/science_*.json`;
   - `radiation.py`;
   - die `.gitignore`-Änderung.
3. Konflikte immer zugunsten von `main` lösen. `backend/AGENTS.md` nur um den A*-Abschnitt ergänzen.
4. **Python-Setup:** Pakete in `pipeline/requirements.txt` ergänzen (feste Versionen), Aufruf mit `.venv/Scripts/python`. `pyproject.toml`/`uv.lock` nur behalten, wenn das Team uv will; das bitte im PR ansprechen.
5. `docs/architecture.md`: Den Abschnitt auf den Stand bringen.
   - Engine = `pipeline/time_grid.py` (Python, Dijkstra, Tobler).
   - A* = Vergleich mit Curiosity.
   - Die C#-Engine wurde nicht gebaut.

### Aufgabe 2: Vergleich mit Curiosity (Aufgabe 5 des Datenteams)

Ziel: Die Info-Zeile „Compared with Curiosity“ in der Konsole bekommt Werte.

- **Raster:** `MappingGrid.load("frontend/public/data/grid.json")`, Höhe über `read_float("elev")`. Kein eigenes Raster, keine eigene Höhenableitung.
- **Gehmodell:**
  - Kantenzeit = Bodenstrecke / (1,5 km/h · exp(−3,5 · (|g + 0,05| − 0,05))), g = Δh / Bodenstrecke in Gehrichtung.
  - Bodenstrecke ost-west = Δx · 10 m · cos(Breite), nord-süd = Δy · 10 m.
  - **Prüfung gegen `shared/walking-model-vectors.json`**: Abweichung unter 1e-9 min, als Test.
- **Nachbarn und Sperren:**
  - 16 Nachbarn wie die Engine (Diagonalen und Rösselsprünge, keine Ecken über gesperrte Zellen).
  - Gesperrt sind Zellen mit `slope_10m` > 20° oder ohne Höhe.
  - Schutzzonen für diesen Vergleich **erlaubt**: Curiosity ist durch die Bohrstellen gefahren.
- **Heuristik:** zulässig für Tobler, also nie überschätzen. Luftlinie / (Höchstgeschwindigkeit 1,5 km/h · exp(0,175)), weil leichtes Gefälle am schnellsten ist.
- **Fahrten:**
  - Aufeinanderfolgende Wegpunkte aus `frontend/src/boxwork-path.js` (Sols 4591–4839) mit mehr als 50 m Abstand.
  - Curiositys tatsächliche Spur aus `MSL_traverse.json` (MMGIS, URL in `docs/data-sources.md`).
- **Messgröße:**
  - mittlerer Abstand der A*-Routenpunkte von Curiositys Spur zwischen diesen Sols;
  - zum Vergleich derselbe Abstand für die Luftlinie;
  - „leave-one-out“: kein Parameter wird an einer Fahrt eingestellt.
- **Ausgabe:** `frontend/public/data/curiosity_comparison.json`. Die Konsole liest `mean_deviation_m` und `straight_line_m`.
  ```json
  { "generator": "backend/curiosity_comparison.py",
    "method": "each Curiosity drive over 50 m routed with A* on grid.json, Tobler walking time (shared/walking-model-vectors.json), 16 neighbours, slope over 20 deg blocked, zones allowed; deviation = mean distance of route points from the MSL traverse",
    "mean_deviation_m": 21.4, "straight_line_m": 58.0, "drives": 12,
    "per_drive": [ { "from_sol": 4591, "to_sol": 4594, "length_m": 63, "deviation_m": 18.2, "straight_m": 41.0 } ] }
  ```
- **Wortwahl:** „compared with Curiosity“, nie „validated“. Im Methodentext sagen: Curiosity ist ein Rover und fährt anders, als ein Mensch geht.
- **Fertig, wenn:** die Info-Zeile in der Konsole beide Werte zeigt (`cd frontend && npm run dev`) und die Tests grün sind.

### Aufgabe 3 (optional, nach Absprache mit Michael): Rauigkeit als Raster

Pauls Rauigkeitsableitung (RMS der Resthöhe) ist eine gute Idee. Sie gehört aber auf das gemeinsame Raster:
- Quelle ist das **1-m-DEM**. Das ist dieselbe Datei wie für die Grat-Maske (Aufgabe 6 des Datenteams), einmal nach `data/raw/` geladen.
- Je 10-m-Zelle von `grid.json` die RMS-Resthöhe der 100 Pixel berechnen.
- Ausgabe `frontend/public/data/roughness_10m.f32` (float32 LE, gleiche Reihenfolge), Eintrag `"roughness": "roughness_10m.f32"` unter `files` in `grid.json`.
- **Nicht** in Gehzeit oder Routing einrechnen, solange kein begründeter Faktor feststeht. Michaels Modul hat dafür `roughnessM`, derzeit 0.

### Nicht bauen
- Keine Strahlungskarte und keinen Strahlungsterm in Kosten oder Routing (siehe Befund 5). Dosis bleibt Information in der Konsole.
- Keine eigene Schutzzonen-Maske. Zonen kommen aus `zones.geojson`.
- Keine eigenen Ziele oder Stationen; die kommen aus `stations.geojson`.
- Kein eigenes Raster und keine eigene Höhen- oder Hangableitung.
- Kein Routing für die Konsole. Rückkehrzeiten, Zeiger und Routen liefert `pipeline/time_grid.py`; A* dient dem Vergleich.

## Arbeitsweise und Prüfung vor dem PR

1. Regeln aus `docs/auftraege/datenteam.md` („Für alle Aufgaben“): eigener Branch, englische Commits, **nicht ohne Pauls Freigabe committen oder pushen**, KI-Log, nichts in `frontend/src/` ändern.
2. Tests: `.venv/Scripts/python -m unittest discover -s backend/tests -v`, dazu der Test gegen die Gehmodell-Vektoren.
3. Merge-Probe: `git merge-tree --write-tree origin/main HEAD` darf keine Konflikte melden.
4. Keine erzeugten Bilder oder großen JSON-Zwischenstände committen. Nur `curiosity_comparison.json` (und optional `roughness_10m.f32`) gehören nach `frontend/public/data/`.
5. Im PR: Ausgabe der Tests, die Werte aus `curiosity_comparison.json`, offene Punkte.

Nach dem Merge kann der alte Branch `A-star` gelöscht werden, wenn Paul zustimmt.
