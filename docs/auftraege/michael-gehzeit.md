# Übergabe an Michaels Agent: Gehzeit-Modul (`feat(routeDuration)`)

Stand: Samstag, 14.11.2026, 22:45. **Erledigt um 23:00:** Michael hat das gemeinsame Track-Format, das Prüfskript und die Testvektoren umgesetzt (Commit 44d9500). Das Team hat auf Tobler umgestellt; die Engine rechnet seitdem mit derselben Formel (Branch `feat/tobler-walking-model`). Diese Datei ist für den Agenten, der an Michaels Branch `feat(routeDuration)` weiterarbeitet. Erst „Befund“ lesen, dann „Für alle Aufgaben“ in `docs/auftraege/datenteam.md`, dann die Aufgaben unten.

## Befund

**Was gut ist und bleibt:** Der Rechenkern `estimateDuration` in `frontend/src/route-duration.js`:
- Tobler (1993), auf die Grundgeschwindigkeit bei 0° normiert;
- Ereignisse (Verletzung, Wartezeit);
- sauber validiert, mit Tests und ehrlicher Doku.

Der Branch lässt sich konfliktfrei auf den aktuellen `main` mergen.

**Was nicht zum Projekt passt:**
1. **Falsches Raster:** Der Adapter `parseRoute` erwartet A*-Knoten auf einem **1-m-Raster mit 8 Nachbarn**.
   - Das gemeinsame Raster des Projekts ist das **10-m-Grid aus `frontend/public/data/grid.json`** mit 16 Nachbarn (Rösselsprung-Züge eingeschlossen).
   - Es gibt keine 1-m-Routen, und es wird keine geben (22,5 Millionen Zellen).
2. **Zweite Zeitquelle:** Die Konsole liest Gehzeiten nur aus `routes.json` (`t_min`) und den Zeit-Grids (`ttb_*.f32`). Ein zweites Zeitmodell im Browser würde andere Zahlen zeigen als Rückkehrbereich und Routen. Das Modul darf deshalb **nicht in die Konsole eingebaut** werden. `main.js` importiert es nicht.

**Vergleich auf den echten Routen** (Rauigkeit 0, Grundgeschwindigkeit 1,5 km/h):

| Strecke | Engine (`time_grid.py`) | Michaels Modell |
|---|---|---|
| Heimwege (Station → Habitat, bergauf) | 10,3–34,8 min | gleich bis −3 % |
| Hinwege (Habitat → Station, bergab) | 10,3–34,8 min | **20–27 % schneller** |

Grund: Die Engine nutzt derzeit eine symmetrische Form `exp(−3,5 · |g|)`. Bergauf stimmt sie mit Tobler überein, bergab ist sie zu langsam. Ob die Engine auf Michaels gerichtetes Tobler-Modell umstellt, entscheidet das Team. Die Umsetzung macht dann die Engine-Seite (`pipeline/time_grid.py`, `frontend/scripts/find-scenario.mjs`), nicht dieser Agent.

## Datenübergabe: Eingang

### 1. Quelle der Routen

`frontend/public/data/routes.json` (echt, von `pipeline/time_grid.py`).
- **Nicht** die Platzhalter-Datei in `…/placeholder/` verwenden: Dort ist `elev_m` überall `null`.
- Fehlt eine Höhe, mit klarer Meldung abbrechen, nie als 0 oder als flach behandeln.

Struktur:
```json
{ "stations": [ { "station": 1,
    "out": { "vertices": [ { "lon": 137.38, "lat": -4.81, "d_m": 0.0, "t_min": 0.0, "elev_m": -3591.4, "slope_deg": 5.6 }, "…" ],
             "length_m": 636.0, "minutes": 33.6, "zone_m": 0, "max_slope_deg": 12.5, "max_ttb_min": 33.6 },
    "ret": { "…": "gleiche Form" } } ] }
```

| Feld | Bedeutung | Verwendung |
|---|---|---|
| `d_m` | aufsummierte **Bodenstrecke** ab Track-Anfang in m, auf der Mars-Kugel (R = 3 396 190 m) | Abschnittslänge = Differenz zweier Punkte |
| `elev_m` | DEM-Höhe der 10-m-Zelle in m (USGS Gale DEM) | gerichtete Steigung |
| `slope_deg` | **richtungslose** 10-m-Hangneigung des Geländes | **nicht** als Steigung verwenden (nur für die 20°-Sperre) |
| `t_min` | Gehzeit der Engine ab Track-Anfang | nur zum Vergleich |
| `minutes` | Gesamtzeit der Engine | nur zum Vergleich |

### 2. Abschnitte bilden (ersetzt `parseRoute`)

Neue Funktion `sectionsFromTrack(track)` in `frontend/src/route-duration-input.js`:
```text
für i = 1 … n−1:
  distanceM  = d_m[i] − d_m[i−1]           (≤ 0 → Abschnitt überspringen)
  slopeDeg   = atan2(elev_m[i] − elev_m[i−1], distanceM) · 180 / π
  roughnessM = 0                           (keine Rauigkeitsdaten, siehe Punkt 5)
```
- Die Reihenfolge der Punkte ist die Gehrichtung: `out` vom Habitat zur Station, `ret` zurück.
- `parseRoute` (1 m, 8 Nachbarn) entfernen oder klar als ungenutzt markieren. Die Tests auf das neue Eingangsformat umstellen.

### 3. Parameter

Aus `frontend/public/data/scenario.json`, sonst aus `…/placeholder/scenario.json`. Nie fest einbauen.
- `baseSpeedMps = walk_speed_kmh / 3.6` (derzeit 1,5 km/h).
- Verletzung: `speedFactor = injury_factor` (derzeit 0,5).

### 4. A*-Pfade von Paul

Kein eigenes Knotenformat. Paul liefert seine Pfade **im selben Track-Format** wie `routes.json`: `vertices` mit `lon`, `lat`, `d_m`, `elev_m`, auf dem 10-m-Grid. Dann gilt Punkt 2 unverändert.

Wer doch mit Zellindizes arbeitet, nimmt die Geometrie aus `grid.json`:
- Index = Zeile × nx + Spalte, Zeile 0 = Norden.
- Zellmitte: lon = (x0 + (Spalte + 0,5) · 10) / 59 274,70 und lat = (y0 − (Zeile + 0,5) · 10) / 59 274,70.
- Bodenstrecke ost-west = Δx · cos(Breite).
- Höhen aus `elev_10m.f32` (float32, little-endian).

### 5. Rauigkeit

Es gibt keine Rauigkeitsdaten. `roughnessM = 0` und der Rauigkeitsfaktor bleiben als Annahme gekennzeichnet.

Soll Rauigkeit später einfließen, braucht es vom Datenteam ein Raster `roughness_10m.f32`: Standardabweichung der 1-m-DEM-Pixel je 10-m-Zelle, eingetragen unter `files` in `grid.json`. Das gehört zu Aufgabe 6 (1-m-DEM) und braucht eine begründete Kalibrierung.

## Datenübergabe: Ausgang

### Aufgabe A: Prüfskript für die Routenzeiten

`frontend/scripts/check-route-times.mjs` (Node, offline):
- liest `routes.json` und `scenario.json` (Regeln oben);
- berechnet je Track (`out`, `ret`, alle Stationen) die Dauer mit `estimateDuration(sectionsFromTrack(track), …)`;
- gibt eine Tabelle aus: Strecke, Engine-Minuten, Modell-Minuten, Abweichung in min und %, größte Abweichung eines Zwischenpunkts gegen `t_min`;
- dazu einmal dieselbe Rechnung mit Verletzung (`speedFactor = injury_factor` ab der Hälfte von `ret`);
- Ausgabe nur auf die Konsole (`--json` optional nach stdout), Exit-Code 0. Keine Datei in `public/data/`.
- Erwartung mit den heutigen Daten: Heimwege gleich bis −3 %, Hinwege 20–27 % schneller (siehe Befund).

### Aufgabe B: Testvektoren für ein gemeinsames Gehmodell

`shared/walking-model-vectors.json` legt Michaels Formel als Referenz fest. So können Engine (Python), Szenario-Suche (Node) und Pauls A* nachweisen, dass sie dieselben Kantenzeiten rechnen, falls das Team das Modell übernimmt:
```json
{ "model": "Tobler 1993, normalised to v(0) = base speed: speed = base · exp(−3.5 · (|g + 0.05| − 0.05)), g = Δh / horizontal distance",
  "source": "Tobler, NCGIA Technical Report 93-1",
  "base_speed_kmh": 1.5,
  "vectors": [ { "distance_m": 10, "dz_m": 0.0, "minutes": 0.4 }, "…" ] }
```
Mindestens die Steigungen −20°, −10°, −5°, −2,86° (Maximum), 0°, +5°, +10°, +20° bei 10 m und bei 22,36 m (Rösselsprung). `minutes` aus `estimateDuration` mit Rauigkeit 0.

### Nicht Teil dieses Auftrags
- Kein Import in `frontend/src/main.js` und keine Anzeige in der Konsole.
- Keine Änderung an `pipeline/time_grid.py`, `frontend/scripts/find-scenario.mjs` oder den Daten in `frontend/public/data/`. Ein Modellwechsel ist eine Teamentscheidung und wird auf der Engine-Seite umgesetzt, danach wird der Demo-Ablauf neu geprüft.

## Arbeitsweise

1. Den Branch zuerst mit dem aktuellen `main` zusammenführen (`git merge origin/main`, konfliktfrei). Dort liegen `routes.json`, `grid.json` und `elev_10m.f32`.
2. `npm test` (Node-Testläufer) muss grün sein, mit Tests für `sectionsFromTrack` (inklusive Abbruch bei `elev_m = null`) und für das Prüfskript.
3. Commit-Nachrichten auf Englisch. **Nicht ohne Michaels Freigabe committen oder pushen.** PR gegen `main`.
4. KI-Log nach `.agents/skills/ai-contribution-log/SKILL.md`.
5. **Ehrlichkeit:** Tobler gilt für Fußgänger auf der Erde. Die Übertragung auf Raumanzüge und Mars ist eine Annahme, keine Validierung; so steht es auch in `route-duration.md`.

**Im PR angeben:** die Ausgabe von `check-route-times.mjs`, die Testvektoren und was offen bleibt.
