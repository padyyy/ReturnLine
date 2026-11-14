# Auftrag an das Datenteam

Stand: Samstag, 14.11.2026, 20:15. Zeitplan: Feature Freeze heute 22:30, Hard Freeze Sonntag 11:00, Video 13:00, Abgabe 14:30.

**So benutzt ihr diese Datei:** Jedes Teammitglied gibt seinem Agenten den Abschnitt „Für alle Aufgaben“ und genau eine Aufgabe. Die Namen bei den Aufgaben sind Vorschläge; die Verteilung macht Paul.

## Lage

- Die Habitat-Konsole (`frontend/`) spielt alle sechs Beats ab, auf einem Zeit-Grid aus dem echten Gale-DEM (`pipeline/time_grid.py`).
- Bis auf Orthofoto, Curiosity-Spur und Grid sind alle Daten noch markierte Platzhalter in `frontend/public/data/placeholder/`. Die Konsole zeigt deshalb oben „Placeholder data“.
- Echte Dateien in `frontend/public/data/` ersetzen die Platzhalter ohne Codeänderung.
- Der Demo-Ablauf trägt auf echtem Gelände nur mit bestimmten Positionen und 80 m Zonenpuffer. Siehe `pipeline/README.md`, Abschnitt „Zeit-Grid“. Wer Positionen ändert, muss den Ablauf neu prüfen (unten beschrieben).

## Für alle Aufgaben (verbindlich)

1. **Vorher lesen:**
   - `AGENTS.md` und die `AGENTS.md` des Ordners, in dem du arbeitest (`pipeline/`, `backend/`, `data/`, `shared/`)
   - `shared/data-contract.md`
   - `pipeline/README.md`
   - in `docs/demo-script.md` den Abschnitt „Data checks the real grid must pass“
2. **Basis:** `main`, nachdem der PR `feat/time-grid` gemergt ist. Prüfe, dass `frontend/public/data/grid.json` existiert. Wenn nicht, zweige von `origin/feat/time-grid` ab.
3. **Ein Branch je Aufgabe:** Namen siehe unten.
   - Commit-Nachrichten auf Englisch nach Conventional Commits (`docs/git-workflow.md`).
   - **Nicht ohne Freigabe deines Teammitglieds committen oder pushen.** PR gegen `main`.
4. **KI-Log:** Jeden wesentlichen Beitrag nach `.agents/skills/ai-contribution-log/SKILL.md` in `docs/ai-log/` eintragen.
5. **Nur Daten und Pipeline:**
   - Schreibe nach `frontend/public/data/` (genau die Dateinamen aus dem Datenvertrag), nach `pipeline/` und nach `data/raw/`. `data/raw/` ist ignoriert und für große Rohdaten gedacht.
   - Ändere **nichts in `frontend/src/`**; das macht das Frontend-Team.
   - Zeigt die Konsole ein Feld noch nicht an, schreibe das in den PR.
6. **Formate:**
   - GeoJSON-Koordinaten `[lon, lat]`, Länge ost-positiv, Mars-Kugel R = 3 396 190 m.
   - UTF-8, Einheiten m, min und Grad, Uhrzeiten als `"HH:MM"` LMST.
7. **Ehrlichkeit:**
   - Jede Zahl entsteht an der Veranstaltung in committetem Code, nichts aus der Vorbereitungszeit.
   - Jede Quelle wird genannt, jede Annahme als „assumption“ gekennzeichnet.
   - Nie „validated“ schreiben, sondern „compared with Curiosity“.
   - Nichts erfinden: Fehlt eine Angabe, bleibt das Feld `null` und es kommt in den PR.
8. **Netz:**
   - Zertifikatsprüfungen nie abschalten. Bei TLS-Fehlern das Teammitglied fragen.
   - Quellen-URLs stehen in `docs/data-sources.md`.
9. **Bilder:** herunterladen und ins Repo legen, nie verlinken; die Herkunft immer mit angeben.
10. **Echte Dateien ersetzen Platzhalter vollständig.** Wer `frontend/public/data/scenario.json` anlegt, kopiert die Platzhalter-Datei und ändert nur die eigenen Felder. Alle anderen Felder müssen erhalten bleiben.
11. **Prüfen vor dem PR:**
    - Konsole ansehen: `cd frontend && npm install && npm run dev`, dann http://localhost:5173 öffnen. Fährt man über „Placeholder data“, zeigt die Konsole, welche Dateien noch Platzhalter sind.
    - Nach jeder Änderung an Habitat, Stationen oder Zonen den Ablauf neu prüfen (aus dem Repo-Wurzelordner):
      ```sh
      .venv/Scripts/python pipeline/time_grid.py
      cd frontend && BUFFER=80 node scripts/find-scenario.mjs
      ```
      Die Suche gibt Kombinationen aus, bei denen alle sechs Beats tragen. Trägt die gewählte nicht mehr, sag es im PR, statt Werte zurechtzubiegen.
    - Danach in der Konsole einmal „Start“ für Station 1 drücken. Erwartet werden: Warnung in Beat 4, in Beat 5 der geschützte Weg ✗ und der Weg durch die Zone ✓, der ABORT-Eintrag mit Metern in der Zone und die Crew vor EVA 6:00 zu Hause.

---

## Aufgabe 1: Echte Stationen mit Bodenfoto

**Vorschlag:** Magnus · **Branch:** `feat/stations-data` · **Bis:** heute 22:30

**Ziel:** `frontend/public/data/stations.geojson` mit echten Namen, Begründungen, Höhen und einem Bodenfoto je Station.

**Vorgaben:**
- Positionen beibehalten, weil der Ablauf darauf geprüft ist: Curiositys Wegpunkte der Sols **4596 (Station 1, Szenario-Station), 4609, 4667, 4839**. Koordinaten wie in `frontend/public/data/placeholder/stations.geojson`; die Quelle ist `MSL_waypoints.json`.
- Nur wenn ein Sol gar nicht zu beschreiben ist, darf ein anderer Wegpunkt genommen werden. Dann den Ablauf neu prüfen (siehe oben).
- **Name:** kurz, höchstens 24 Zeichen, aus dem, was Curiosity dort untersucht hat (NASA-Blogposts zur Boxwork-Kampagne, siehe `docs/data-sources.md`).
- **Begründung (`reason`):** ein bis zwei englische Sätze, warum die Crew dorthin geht, mit Quellen-URL.
- **Höhe (`elev_m`):** aus `frontend/public/data/elev_10m.f32` an der Station. Das Raster ist in `grid.json` beschrieben (Zeile 0 = Norden, Index = Zeile × nx + Spalte). Nicht `elev_geoid` aus den Wegpunkten nehmen, das ist ein anderer Bezug.
- **Bodenfoto:**
  - aus der Raw-Image-API für genau diesen Sol (Mastcam oder Navcam);
  - herunterladen, auf höchstens 1200 px Breite und etwa 300 KB verkleinern;
  - speichern als `frontend/public/images/stations/stn<n>_sol<sol>_<instrument>.jpg`.
- **Wichtig:** Das Foto zeigt Curiositys Blick vom Mast an dieser Stelle, nicht den Blick der Crew. So beschriften.

**Format je Feature:**
```json
{ "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [137.38xxxx, -4.81xxxx] },
  "properties": {
    "n": 1, "name": "…", "sol": 4596,
    "reason": "…", "source_url": "https://science.nasa.gov/blog/…",
    "elev_m": -4xxx.x,
    "image": { "path": "images/stations/stn1_sol4596_mastcam.jpg", "instrument": "…", "sol": 4596,
               "credit": "NASA/JPL-Caltech/MSSS", "caption": "Curiosity at this spot, sol 4596" } } }
```

**Fertig, wenn:**
- vier Stationen mit `n` 1–4 vorhanden sind;
- die Konsole Namen und Begründungen im Picker und im Logbuch zeigt;
- `stations.geojson` nicht mehr unter „Placeholder data“ steht.

Bilder zeigt die Konsole noch nicht an; das macht das Frontend-Team.

---

## Aufgabe 2: Schutzzonen auf echte Bohrstellen prüfen

**Vorschlag:** Michael · **Branch:** `feat/zones-data` · **Bis:** heute 22:30

**Problem:** Die Platzhalter-Zonen „Drill site A“ (Sol 4633) und „Drill site B“ (Sol 4818) sind nur gewählt, weil der Demo-Ablauf dort trägt. Ob Curiosity dort gebohrt hat, ist **nicht geprüft**. Die Konsole nennt sie aber „Drill site“.

**Schritte:**
1. In den NASA-Missionsberichten und Blogposts herausfinden, bei welchen Sols zwischen 4591 und 4839 Curiosity in der Boxwork-Region gebohrt hat. Gesucht sind Probenname, Sol und Quelle.
2. Liegen diese Sols unter den Wegpunkten (`frontend/src/boxwork-path.js`), den Ablauf mit genau diesen Zonen prüfen:
   ```sh
   cd frontend && BUFFER=80 ZONE_SOLS=<sol1>,<sol2> node scripts/find-scenario.mjs
   ```
3. **Trägt eine Kombination:**
   - `frontend/public/data/zones.geojson` schreiben, mit den echten Bohrstellen als Kreis-Polygon (32 Ecken, Radius `buffer_m`) um die Wegpunkt-Koordinate.
   - In `frontend/public/data/scenario.json` (siehe Regel 10) `habitat`, `scenario_station` und `drift_zone` so setzen, wie die Suche sie ausgibt.
   - Weichen die Stationen ab, mit Aufgabe 1 abstimmen.
   - Danach `pipeline/time_grid.py` laufen lassen und in der Konsole prüfen.
4. **Trägt keine Kombination oder gibt es keine echten Bohrstellen:** nichts umbiegen.
   - Die Platzhalter-Zonen bleiben, aber sie dürfen nicht „Drill site“ heißen. Im PR einen ehrlichen Namen vorschlagen, z. B. „Protected site A (assumed)“.
   - Das Team entscheidet dann.

**Format je Feature:**
```json
{ "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[[lon, lat], "…", [lon, lat]]] },
  "properties": { "id": "A", "name": "Drill site <Probenname>", "drill_sol": 4xxx, "buffer_m": 80,
                  "source_url": "https://…" } }
```

**Fertig, wenn:**
- die Zonen entweder belegt echte Bohrstellen sind und der Ablauf trägt,
- oder der PR klar sagt, dass es keine gibt, und einen ehrlichen Namen vorschlägt.

---

## Aufgabe 3: Funkprüfung entlang der Routen

**Vorschlag:** Paul oder Magnus · **Branch:** `feat/radio-check` · **Bis:** heute 22:30

**Ziel:** Die vierte harte Regel bekommt Daten. „Längste Funklücke ≤ 5 min“ zeigt in der Konsole bisher „not available“.

**Methode:**
- Neues Skript `pipeline/radio_check.py`. Für jeden Punkt der Routen in `frontend/public/data/routes.json` (`out` und `ret` je Station) prüft es die Sichtlinie von der Habitat-Antenne zur Crew-Antenne.
- Gelände entlang der Linie alle 5 m aus `elev_10m.f32` abtasten (bilinear) und die Mars-Krümmung berücksichtigen: Absenkung d² / (2R).
- Antennenhöhen sind Annahmen und so zu kennzeichnen. Vorschlag: Habitat 3 m, Crew 2 m.
- Eine Lücke ist ein zusammenhängender Abschnitt ohne Sicht, gemessen in Minuten über `t_min` der Routenpunkte.
- Die Prüfung gilt nur entlang der Routen, keine Sichtbarkeitsfläche (Council-Entscheidung).

**Format** (`frontend/public/data/radio_check.json`):
```json
{ "generator": "pipeline/radio_check.py",
  "method": "line of sight from the habitat antenna to the crew antenna over the 10 m DEM grid along each route, sampled every 5 m, Mars curvature included",
  "habitat_antenna_m": 3.0, "crew_antenna_m": 2.0, "assumptions": ["habitat_antenna_m", "crew_antenna_m"],
  "longest_gap_min": 1.6,
  "stations": [ { "station": 1,
                  "out": { "longest_gap_min": 0.0, "gaps": [] },
                  "ret": { "longest_gap_min": 1.6, "gaps": [ { "from_t_min": 12.0, "to_t_min": 13.6, "from_d_m": 230, "to_d_m": 262 } ] } } ] }
```
- Die Konsole liest bisher nur das oberste `longest_gap_min`. Das ist das Maximum über alle Strecken.
- Die Werte je Station sind für das Frontend-Team (Anzeige je gewählter Station).

**Fertig, wenn:**
- die Regel „Radio gap“ in der Konsole einen Wert zeigt;
- der PR nennt, ob eine Strecke über 5 min liegt. In diesem Fall wäre der Plan NO-GO, und das Team muss es sofort wissen.

---

## Aufgabe 4: Tageslicht aus REMS

**Vorschlag:** Michael · **Branch:** `feat/rems-daylight` · **Bis:** heute 22:00

**Ziel:** Sonnenauf- und -untergang sowie der gezeigte Sol kommen aus echten Messdaten, nicht aus Platzhaltern.

**Schritte:**
1. REMS-Feed laden (URL in `docs/data-sources.md`). Der JSON-Schlüssel ist `soles`, der neueste Eintrag steht zuerst, je Sol gibt es `sunrise` und `sunset`.
2. Einen Sol wählen, möglichst innerhalb der Boxwork-Kampagne (4591–4839). Wenn es dort keinen gibt, den nächstliegenden nehmen und das im PR sagen.
3. `frontend/public/data/scenario.json` nach Regel 10 aus dem Platzhalter kopieren, dann:
   - `sol`, `sunrise_lmst` und `sunset_lmst` setzen;
   - diese drei Felder aus `placeholder_fields` entfernen;
   - `sources.sunset_lmst` auf `"REMS, sol <N>"` setzen.
4. **Prüfen:** Die EVA beginnt 09:00 LMST und dauert 6 h. Liegt der Sonnenuntergang vor etwa 15:30, bindet die Tageslicht-Regel statt der Lebenserhaltung. Das prüft `find-scenario.mjs` nicht mit, also im PR melden.

**Fertig, wenn:** Die Tageslicht-Regel und „Time to sunset“ echte Werte zeigen, und `scenario.json` steht nur noch mit den übrigen Platzhalter-Feldern im Hinweis.

**Abstimmung:** Aufgabe 2 ändert dieselbe Datei. Wer zuerst mergt, legt `scenario.json` an; die andere Aufgabe ändert danach nur ihre eigenen Felder.

---

## Aufgabe 5: Vergleich mit Curiositys Fahrten

**Vorschlag:** Paul (sein A* passt dafür) · **Branch:** `feat/curiosity-comparison` · **Bis:** Sonntag 10:00

**Ziel:** Die Info-Zeile „Compared with Curiosity“ bekommt einen Wert.

**Methode:**
- Fahrten sind aufeinanderfolgende Wegpunkte (Sols 4591–4839) mit mehr als 50 m Abstand.
- Jede Fahrt zwischen ihren Endpunkten auf dem 10-m-Grid routen, mit **demselben Gehmodell wie `pipeline/time_grid.py`**: Kantenzeit = Strecke / (1,5 km/h · exp(−3,5 · |Δh/Strecke|)), gesperrt über 20°, 16 Nachbarn, keine Eckenabkürzung, Zonen erlaubt.
- Abweichung = mittlerer Abstand der Routenpunkte von Curiositys tatsächlicher Spur zwischen diesen Sols (`MSL_traverse.json`).
- Vergleichswert ist derselbe Abstand für die Luftlinie.
- „Leave-one-out“: kein Parameter wird an der verglichenen Fahrt eingestellt.
- Im Methodentext ehrlich bleiben: Curiosity ist ein Rover und fährt anders, als ein Mensch geht. Das ist ein Vergleich, keine Validierung.

**Format** (`frontend/public/data/curiosity_comparison.json`):
```json
{ "generator": "…", "method": "…",
  "mean_deviation_m": 21.4, "straight_line_m": 58.0, "drives": 12,
  "per_drive": [ { "from_sol": 4591, "to_sol": 4594, "length_m": 63, "deviation_m": 18.2, "straight_m": 41.0 } ] }
```
Die Konsole liest `mean_deviation_m` und `straight_line_m`.

**Fertig, wenn:** Die Info-Zeile zeigt beide Werte, und die Methode steht im PR.

---

## Aufgabe 6: Grat-Maske aus dem 1-m-DEM

**Vorschlag:** Michael oder Paul · **Branch:** `feat/ridge-mask` · **Bis:** Sonntag 10:00

**Ziel:** Die Regel „keine Gratquerung“ gilt wirklich. Bisher sperrt das Grid nur Hänge über 20°, und die schmalen Boxwork-Rücken sind im 4-m-Raster unsichtbar.

**Schritte:**
1. `pipeline/ridge_mask.py`:
   - Das DEM-Fenster des Einsatzgebiets einmal bei 1 m lesen und als GeoTIFF nach `data/raw/` cachen. Das sind einige hundert MB; Muster und Hinweise stehen in `pipeline/README.md`.
   - Grat-Pixel finden, z. B. örtliches Relief = Höhe − Median der Umgebung (etwa 15 m) ≥ 1 m. Die Schwelle ist eine Annahme; am Orthofoto auf Sicht prüfen.
2. Auf das 10-m-Raster von `grid.json` aggregieren (gleicher Ursprung, gleiches nx und ny): Eine Zelle ist Grat, wenn genug Grat-Pixel darin liegen.
   - Ausgabe `frontend/public/data/ridge_10m.u8` (uint8 0/1), dazu ein Eintrag `"ridge": "ridge_10m.u8"` unter `files` in `grid.json`.
3. `pipeline/time_grid.py` erweitern: Liegt `ridge_10m.u8` vor, gelten Grat-Zellen als gesperrt.
4. `time_grid.py` und `find-scenario.mjs` neu laufen lassen.
   - **Achtung:** Grate können Stationen unerreichbar machen. Das ist ein offener Punkt aus `docs/mission-scenario.md`.
   - Dann im PR den nächsten erreichbaren Wegpunkt vorschlagen und mit Aufgabe 1 abstimmen.

**Fertig, wenn:**
- alle vier Stationen erreichbar sind und der Ablauf trägt, oder der PR genau sagt, was nicht mehr geht;
- ein Bild der Maske über dem Orthofoto im PR liegt.

Die Konsole schreibt bei der Hang-Regel fest „ridge crossings: 0“. Das an das Frontend-Team melden, damit der Wert aus den Daten kommt.

---

## Für Paul: die Engine

- Bitte entscheiden: Entweder übernimmst du `pipeline/time_grid.py` als Engine und baust es weiter, oder deine Engine schreibt dieselben Dateien im selben Format. Zwei parallele Wege kosten nur Zeit.
- Dein Council-Papier auf dem Branch `A-star` empfiehlt genau das, was `time_grid.py` macht: Umkehr-Dijkstra mit Gehzeit, zwei Varianten, Zeiger.
- Dein A* ist ideal für Aufgabe 5, mit demselben Gehmodell.
- `docs/architecture.md` beschreibt noch die C#-Engine; bitte an den tatsächlichen Stand angleichen.

## Rückmeldung im PR

Jeder PR nennt:
- was geliefert wurde (Dateien);
- welche Quellen und welche Annahmen;
- die Ausgabe der Prüfungen (`find-scenario.mjs`, falls Positionen berührt wurden);
- was offen bleibt.

Was die Konsole noch nicht anzeigt, ist ein Auftrag an das Frontend-Team, keine Änderung in `frontend/src/`.
