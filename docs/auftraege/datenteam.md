# Auftrag an das Datenteam

Stand: Sonntag, 15.11.2026, 02:15. Diese Fassung ersetzt die vom Samstag, 20:15.

**Zeitplan:**
- Der Feature Freeze ist verschoben (Teamentscheidung).
- Fest stehen: Videoaufnahme So 13:00, Checkpoint 14:30, Abgabe 15:45.
- Video und Projektseite brauchen die endgültigen Daten. **Vorschlag: alle Daten-PRs bis So 10:00 gemergt.** Die Zeiten legt Paul fest.
- Was bis dahin nicht fertig ist, bleibt Platzhalter. Das ist erlaubt, weil Konsole und Projektseite es offen sagen.

**So benutzt ihr diese Datei:** Jedes Teammitglied gibt seinem Agenten den Abschnitt „Für alle Aufgaben“ und genau eine Aufgabe. Die Namen bei den Aufgaben sind Vorschläge; die Verteilung macht Paul.

## Lage

- Die Habitat-Konsole (`frontend/`) spielt alle sechs Beats ab, auf einem Zeit-Grid aus dem echten Gale-DEM (`pipeline/time_grid.py`). Live: https://padyyy.github.io/ReturnLine/
- Bis auf Orthofoto, Curiosity-Spur und Grid sind alle Daten noch markierte Platzhalter in `frontend/public/data/placeholder/`. Die Konsole zeigt deshalb oben „Placeholder data“.
- Echte Dateien in `frontend/public/data/` ersetzen die Platzhalter ohne Codeänderung.
- Stand 15.11., 02:00: Auf GitHub liegt noch kein Daten-PR.

## Was sich seit Samstagabend geändert hat

1. **Gehmodell ist Tobler** (Teamentscheidung, in `main`).
   - Geschwindigkeit = 1,5 km/h · exp(−3,5 · (|g + 0,05| − 0,05)), g = Höhenänderung / Bodenstrecke in Gehrichtung. Bergauf und bergab sind verschieden.
   - Umgesetzt in `pipeline/time_grid.py`, `frontend/scripts/find-scenario.mjs` und `frontend/src/route-duration.js`.
   - Referenz: die 18 Testvektoren in `shared/walking-model-vectors.json`. Kontrolle: `cd frontend && node scripts/check-route-times.mjs` (erwartet unter 0,5 % Abweichung).
2. **Die Geschichte ist knapp geworden.** Mit Tobler tragen nur noch **2 Kombinationen** (vorher 5). Beide haben dasselbe Habitat, Station Sol 4596 und Drift-Zone Sol 4633; die ABORT-Zone liegt bei Sol 4818 oder 4830. Der größte Abstand am Verletzungspunkt beträgt 2,6 min.
   - Voller Demo-Lauf in der Konsole:
     - 5:05 Warnung, 5:06 Verletzung;
     - geschützter Heimweg 57 min ✗ gegen die Grenze von 54 min, Weg durch Drill site B 52 min ✓;
     - 157 m in der Zone, zu Hause um 5:58, **2 min Reserve**.
   - Jede Änderung an Positionen, Zonen oder Grat-Maske kann die Geschichte brechen. Dann melden, nicht zurechtbiegen (siehe Regel 11).
3. **Beat 5 zeigt beide Heimwege auf der Karte**, beschriftet mit dem Zonennamen („Through Drill site B · 52 min · fits“). Der Knopf heißt „Confirm ABORT through Drill site B“. Zonennamen stehen also groß im Bild: kurz halten (höchstens 20 Zeichen) und nur Wahres schreiben.
4. **`injury_factor` aus `scenario.json` wirkt jetzt wirklich.** Vorher war der Faktor 2 im Code fest eingebaut. Den Wert nicht ändern; er ist eine Annahme des Teams.
5. **Grat-Regel:** Die Konsole zeigt „ridge mask pending“, bis `grid.json` unter `files` einen Eintrag `"ridge"` hat. Erst dann steht dort „ridge crossings: 0“. Das feste „0“ von Samstag gibt es nicht mehr.
6. **Funkschwelle:** Die 5 min sind unsere eigene Planungsschwelle, keine NASA-Zahl. NASA beschreibt nur das Vorgehen nach einem Funkverlust: zuerst zurück in Sichtlinie zum Habitat (xEVA §9.5). Am Datenformat von Aufgabe 3 ändert das nichts.
7. **Paul hat eine eigene Übergabe:** `docs/auftraege/paul-astar.md`. Aufgabe 5 (Curiosity-Vergleich) ist dort enthalten. Die Engine ist `pipeline/time_grid.py` in `main`; sie versorgt die Konsole.
8. **Projektseite:** Der Entwurf liegt in `docs/project-page.md` (PR offen, nach dem Merge in `main`). Dort stehen Werte als `⟨…⟩`, die aus euren Lieferungen kommen: Stationen, Bohrstellen, REMS-Sol, Funkcheck, Curiosity-Vergleich. Jede Quelle, die ihr nutzt, muss dort unter „NASA Data“ oder „References“ stehen.
9. **Hilfen in `main`:** `pipeline/mapping_grid.py` (`MappingGrid` von Magnus) liest `grid.json`. Es bietet `read_float("elev")`, `read_float("slope")` und `xy(lon, lat)`.

## Reihenfolge

Die Aufgaben hängen voneinander ab. Vorschlag für die Merge-Reihenfolge:

1. **Aufgabe 2 (Zonen) und Aufgabe 1 (Stationen):** legen die Positionen fest. Danach `time_grid.py` und `find-scenario.mjs`.
2. **Aufgabe 6 (Grat-Maske):** ändert das Grid und damit alle Zeiten und Routen. Danach wieder `time_grid.py` und `find-scenario.mjs`.
3. **Aufgabe 3 (Funk):** zuletzt, auf dem endgültigen `routes.json`. Ändert sich `routes.json` danach noch einmal, die Funkprüfung neu laufen lassen.
4. **Aufgabe 4 (REMS):** jederzeit. Sie ändert `scenario.json` wie Aufgabe 2, also abstimmen (Regel 10).
5. **Aufgabe 5 (Paul):** jederzeit. Kommt die Grat-Maske vorher, gesperrte Grat-Zellen übernehmen.

## Für alle Aufgaben (verbindlich)

1. **Vorher lesen:**
   - `AGENTS.md` und die `AGENTS.md` des Ordners, in dem du arbeitest (`pipeline/`, `backend/`, `data/`, `shared/`)
   - `shared/data-contract.md`
   - `pipeline/README.md`, Abschnitt „Zeit-Grid“
   - in `docs/demo-script.md` den Abschnitt „Data checks the real grid must pass“
2. **Basis:** aktueller `main` (`git pull`). Wer auf einem älteren Stand angefangen hat, holt zuerst `git merge origin/main`.
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
10. **`scenario.json` gemeinsam pflegen.**
    - Wer `frontend/public/data/scenario.json` als Erster anlegt, kopiert die Platzhalter-Datei und ändert nur die eigenen Felder. Alle anderen Felder bleiben erhalten, auch `drift_zone`, `zone_clearance_m`, `zone_warn_m` und `injury_factor`.
    - Eigene Felder aus `placeholder_fields` entfernen und unter `sources` die Quelle eintragen.
    - Wer später kommt, ändert nur seine Felder in der vorhandenen Datei.
11. **Prüfen vor dem PR:**
    - **Konsole ansehen:** `cd frontend && npm install && npm run dev`, dann http://localhost:5173 öffnen. Fährt man über „Placeholder data“, zeigt die Konsole, welche Dateien noch Platzhalter sind.
    - **Nach jeder Änderung an Habitat, Stationen, Zonen oder Grid den Ablauf neu prüfen** (aus dem Repo-Wurzelordner):
      ```sh
      .venv/Scripts/python pipeline/time_grid.py
      cd frontend && BUFFER=80 node scripts/find-scenario.mjs
      node scripts/check-route-times.mjs
      ```
      Die Suche gibt die Kombinationen aus, bei denen alle sechs Beats tragen; heute sind es zwei (siehe oben). Trägt die gewählte nicht mehr, sag es im PR, statt Werte zurechtzubiegen.
    - **Demo-Lauf:** In der Konsole die Station mit dem Hinweis „Plays the six beats“ wählen und „Start“ drücken. Erwartet werden:
      - in Beat 4 die Warnung;
      - in Beat 5 auf der Karte der geschützte Weg mit ✗ „too long“ und der Weg durch die Zone mit ✓ „fits“;
      - in Beat 6 der Eintrag „Override logged · N m inside …“;
      - die Crew vor EVA 6:00 zu Hause.
      Die neuen Zahlen in den PR schreiben.

---

## Aufgabe 1: Echte Stationen mit Bodenfoto

**Vorschlag:** Magnus · **Branch:** `feat/stations-data` · **Bis (Vorschlag):** So 09:00

**Ziel:** `frontend/public/data/stations.geojson` mit echten Namen, Begründungen, Höhen und einem Bodenfoto je Station.

**Vorgaben:**
- **Positionen beibehalten,** weil der Ablauf darauf geprüft ist: Curiositys Wegpunkte der Sols **4596 (Station 1, Szenario-Station), 4609, 4667, 4839**. Koordinaten wie in `frontend/public/data/placeholder/stations.geojson`; die Quelle ist `MSL_waypoints.json`.
  - Sol 4596 ist in beiden tragenden Kombinationen die Szenario-Station. Ihn nicht tauschen.
  - Die anderen drei nur, wenn ein Sol gar nicht zu beschreiben ist. Dann den Ablauf neu prüfen.
- **Name:** kurz, höchstens 24 Zeichen, aus dem, was Curiosity dort untersucht hat (NASA-Blogposts zur Boxwork-Kampagne, siehe `docs/data-sources.md`).
- **Begründung (`reason`):** ein bis zwei englische Sätze, warum die Crew dorthin geht, mit Quellen-URL.
- **Höhe (`elev_m`):** aus `frontend/public/data/elev_10m.f32` an der Station, am einfachsten mit `MappingGrid`. Nicht `elev_geoid` aus den Wegpunkten nehmen, das ist ein anderer Bezug.
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
- `stations.geojson` nicht mehr unter „Placeholder data“ steht;
- der PR die Blogposts mit Titel und URL für die Projektseite nennt.

Bilder zeigt die Konsole noch nicht an; das macht das Frontend-Team.

---

## Aufgabe 2: Schutzzonen auf echte Bohrstellen prüfen

**Vorschlag:** Michael · **Branch:** `feat/zones-data` · **Bis (Vorschlag):** So 09:00

**Problem:** Die Platzhalter-Zonen „Drill site A“ (Sol 4633) und „Drill site B“ (Sol 4818) sind nur gewählt, weil der Demo-Ablauf dort trägt. Ob Curiosity dort gebohrt hat, ist **nicht geprüft**. Die Konsole nennt sie aber „Drill site“, seit Beat 5 sogar auf der Karte und auf dem ABORT-Knopf.

**Schritte:**
1. In den NASA-Missionsberichten und Blogposts herausfinden, bei welchen Sols zwischen 4591 und 4839 Curiosity in der Boxwork-Region gebohrt hat. Gesucht sind Probenname, Sol und Quelle.
2. Liegen diese Sols unter den Wegpunkten (`frontend/src/boxwork-path.js`), den Ablauf mit genau diesen Zonen prüfen:
   ```sh
   cd frontend && BUFFER=80 ZONE_SOLS=<sol1>,<sol2> node scripts/find-scenario.mjs
   ```
   Heute tragen nur Drift-Zone 4633 mit ABORT-Zone 4818 oder 4830. Mit anderen Sols trägt es vermutlich nicht. Das ist ein Ergebnis, kein Fehler.
3. **Trägt eine Kombination:**
   - `frontend/public/data/zones.geojson` schreiben, mit den echten Bohrstellen als Kreis-Polygon (32 Ecken, Radius `buffer_m`) um die Wegpunkt-Koordinate.
   - In `frontend/public/data/scenario.json` (Regel 10) `habitat`, `scenario_station` und `drift_zone` (die `id` der Drift-Zone, z. B. `"A"`) so setzen, wie die Suche sie ausgibt.
   - Weichen die Stationen ab, mit Aufgabe 1 abstimmen.
   - Danach `pipeline/time_grid.py` laufen lassen und in der Konsole prüfen.
4. **Trägt keine Kombination oder gibt es keine echten Bohrstellen:** nichts umbiegen.
   - Die Platzhalter-Zonen bleiben, aber sie dürfen nicht „Drill site“ heißen. Im PR einen ehrlichen, kurzen Namen vorschlagen, z. B. „Protected site B“, mit dem Hinweis „(assumed)“ in der Beschreibung.
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

**Vorschlag:** Paul oder Magnus · **Branch:** `feat/radio-check` · **Bis (Vorschlag):** So 10:00, nach den Aufgaben 1, 2 und 6

**Ziel:** Die Regel „Längste Funklücke ≤ 5 min“ bekommt Daten. Sie zeigt in der Konsole bisher „not available“. Die 5 min sind unsere eigene Schwelle (siehe „Was sich geändert hat“, Punkt 6).

**Methode:**
- Neues Skript `pipeline/radio_check.py`. Für jeden Punkt der Routen in `frontend/public/data/routes.json` (`out` und `ret` je Station) prüft es die Sichtlinie von der Habitat-Antenne zur Crew-Antenne.
- Gelände entlang der Linie alle 5 m aus `elev_10m.f32` abtasten (bilinear) und die Mars-Krümmung berücksichtigen: Absenkung d² / (2R).
- Antennenhöhen sind Annahmen und so zu kennzeichnen. Vorschlag: Habitat 3 m, Crew 2 m.
- Eine Lücke ist ein zusammenhängender Abschnitt ohne Sicht, gemessen in Minuten über `t_min` der Routenpunkte.
- Die Prüfung gilt nur entlang der Routen, keine Sichtbarkeitsfläche (Council-Entscheidung).
- **Zuletzt laufen lassen:** Ändert sich `routes.json` (neue Positionen, Grat-Maske), die Prüfung neu laufen lassen.

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
- der PR nennt, ob eine Strecke über 5 min liegt. Vor allem die Strecken der Szenario-Station (Sol 4596) sind wichtig: Liegt dort eine über 5 min, wäre Beat 1 ein NO-GO, und das Team muss es sofort wissen.

---

## Aufgabe 4: Tageslicht aus REMS

**Vorschlag:** Michael · **Branch:** `feat/rems-daylight` · **Bis (Vorschlag):** So 09:00

**Ziel:** Sonnenauf- und -untergang kommen aus echten Messdaten von Curiosity, nicht aus Platzhaltern.

**Wichtig, geändert gegenüber der ersten Fassung:** `sol` in `scenario.json` ist der Sol der Crew-EVA, und der muss in der Zukunft liegen (`docs/mission-scenario.md`, Abschnitt „Operating area“). **`sol` also nicht auf den REMS-Messtag setzen.** Der Messtag bekommt ein eigenes Feld.

**Schritte:**
1. REMS-Feed laden (URL in `docs/data-sources.md`). Der JSON-Schlüssel ist `soles`, der neueste Eintrag steht zuerst, je Sol gibt es `sunrise` und `sunset`.
2. Einen Sol wählen, möglichst innerhalb der Boxwork-Kampagne (4591–4839). Wenn es dort keinen gibt, den nächstliegenden nehmen und das im PR sagen.
3. `frontend/public/data/scenario.json` nach Regel 10 anlegen oder ergänzen:
   - `sunrise_lmst` und `sunset_lmst` aus diesem Sol setzen;
   - neues Feld `daylight_source_sol` mit der Nummer des REMS-Sols;
   - `sunrise_lmst` und `sunset_lmst` aus `placeholder_fields` entfernen; `sol` bleibt dort;
   - `sources.sunset_lmst` auf `"REMS, sol <N>, measured by Curiosity; used for the EVA sol (assumption)"` setzen.
4. **Prüfen:** Die EVA beginnt 09:00 LMST, die Crew ist im Demo-Lauf um 14:58 LMST zu Hause. Liegt der Sonnenuntergang vor etwa 15:30, wird die Tageslicht-Regel knapp oder bindet statt der Lebenserhaltung. Das prüft `find-scenario.mjs` nicht mit, also im PR melden.

**Hinweis:** Sonnenzeiten hängen von der Mars-Jahreszeit ab. Einen gemessenen Tag für die künftige EVA zu verwenden, ist eine Annahme; so steht es in `sources`. Das Feld `daylight_source_sol` zeigt die Konsole noch nicht an; das an das Frontend-Team melden.

**Fertig, wenn:** Die Tageslicht-Regel und „Time to sunset“ echte Werte zeigen, und in `scenario.json` stehen unter `placeholder_fields` nur noch die übrigen Felder.

---

## Aufgabe 5: Vergleich mit Curiositys Fahrten

**Zuständig:** Paul, siehe `docs/auftraege/paul-astar.md` · **Branch:** `feat/curiosity-comparison` · **Bis (Vorschlag):** So 10:00

Methode, Format und Prüfung stehen in Pauls Übergabe. Kurzfassung:
- **Gehmodell:** dasselbe wie `pipeline/time_grid.py`, also Tobler gerichtet (siehe oben). Es muss alle Testvektoren aus `shared/walking-model-vectors.json` treffen. Die alte symmetrische Formel aus der ersten Fassung dieser Datei gilt nicht mehr.
- **Ergebnis:** `frontend/public/data/curiosity_comparison.json` mit `mean_deviation_m` und `straight_line_m`. Die Konsole zeigt beide in der Info-Zeile „Compared with Curiosity“.
- **Formulierung:** Immer „compared with Curiosity“, nie „validated“. Curiosity ist ein Rover und fährt anders, als ein Mensch geht.

---

## Aufgabe 6: Grat-Maske aus dem 1-m-DEM

**Vorschlag:** Michael oder Paul · **Branch:** `feat/ridge-mask` · **Bis (Vorschlag):** So 09:30

**Ziel:** Die Regel „keine Gratquerung“ gilt wirklich. Bisher sperrt das Grid nur Hänge über 20°, und die schmalen Boxwork-Rücken sind im 4-m-Raster unsichtbar. Die Konsole sagt das offen („ridge mask pending“).

**Schritte:**
1. `pipeline/ridge_mask.py`:
   - Das DEM-Fenster des Einsatzgebiets einmal bei 1 m lesen und als GeoTIFF nach `data/raw/` cachen. Das sind einige hundert MB; Muster und Hinweise stehen in `pipeline/README.md`.
   - Grat-Pixel finden, z. B. örtliches Relief = Höhe − Median der Umgebung (etwa 15 m) ≥ 1 m. Die Schwelle ist eine Annahme; am Orthofoto auf Sicht prüfen.
2. Auf das 10-m-Raster von `grid.json` aggregieren (gleicher Ursprung, gleiches nx und ny): Eine Zelle ist Grat, wenn genug Grat-Pixel darin liegen.
   - Ausgabe `frontend/public/data/ridge_10m.u8` (uint8 0/1).
   - Dazu den Eintrag `"ridge": "ridge_10m.u8"` unter `files` in `grid.json`. Erst damit schaltet die Konsole von „ridge mask pending“ auf „ridge crossings: 0“. Darum gehört der Eintrag nur hinein, wenn Schritt 3 die Grate auch wirklich sperrt.
3. `pipeline/time_grid.py` erweitern: Liegt `ridge_10m.u8` vor, gelten Grat-Zellen als gesperrt. `time_grid.py` schreibt `grid.json` selbst; den `ridge`-Eintrag dort mit erzeugen, nicht von Hand nachtragen.
4. `time_grid.py`, `find-scenario.mjs` und `check-route-times.mjs` neu laufen lassen.
   - **Achtung:** Grate können Stationen unerreichbar machen (offener Punkt aus `docs/mission-scenario.md`). Bei 2 min Reserve kann schon ein kleiner Umweg die Geschichte brechen.
   - Dann im PR genau sagen, was nicht mehr trägt, und den nächsten erreichbaren Wegpunkt vorschlagen. Mit Aufgabe 1 abstimmen.
   - Danach muss Aufgabe 3 neu laufen.

**Fertig, wenn:**
- alle vier Stationen erreichbar sind und der Ablauf trägt, oder der PR genau sagt, was nicht mehr geht;
- ein Bild der Maske über dem Orthofoto im PR liegt.

**Wenn es bis So 09:30 nicht trägt:** nicht mergen. Die Konsole sagt weiter ehrlich „ridge mask pending“, und die Projektseite nennt es als offene Grenze.

---

## Rückmeldung im PR

Jeder PR nennt:
- was geliefert wurde (Dateien);
- welche Quellen, mit Titel und URL, damit sie in die Projektseite übernommen werden können;
- welche Annahmen;
- die Ausgabe der Prüfungen (`find-scenario.mjs` und `check-route-times.mjs`, falls Positionen oder Grid berührt wurden) und die neuen Zahlen des Demo-Laufs;
- was offen bleibt.

Was die Konsole noch nicht anzeigt, ist ein Auftrag an das Frontend-Team, keine Änderung in `frontend/src/`.
