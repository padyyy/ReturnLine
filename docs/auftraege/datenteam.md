# Auftrag an das Datenteam

Stand: Sonntag, 15.11.2026, 10:30. Fortschreibung der Fassung von 02:15.

**Zeitplan:**
- Fest stehen: Videoaufnahme So 13:00, Checkpoint 14:30, Abgabe 15:45.
- **Vorschlag: Was im Video zu sehen ist, muss bis 12:00 gemergt sein.** Das betrifft Namen und Positionen von Stationen und Zonen. Danach keine Änderungen an Namen oder Positionen mehr, damit Video und Live-Demo übereinstimmen.
- Andere Werte, etwa der Curiosity-Vergleich, spätestens bis 13:30, damit die Projektseite bis 14:30 fertig wird.
- Die Zeiten legt Paul fest.
- Was bis dahin nicht fertig ist, bleibt Platzhalter. Das ist erlaubt, weil Konsole und Projektseite es offen sagen.

**So benutzt ihr diese Datei:** Jedes Teammitglied gibt seinem Agenten den Abschnitt „Für alle Aufgaben“ und genau eine Aufgabe. Die Namen bei den Aufgaben sind Vorschläge; die Verteilung macht Paul.

## Lage

- Die Habitat-Konsole (`frontend/`) spielt alle sechs Beats ab, auf einem Zeit-Grid aus dem echten Gale-DEM (`pipeline/time_grid.py`). Live: https://padyyy.github.io/ReturnLine/
- Echte Dateien in `frontend/public/data/` ersetzen die Platzhalter aus `frontend/public/data/placeholder/` ohne Codeänderung. Solange noch Platzhalter im Spiel sind, zeigt die Konsole oben „Placeholder data“.

**Stand der Aufgaben, 15.11.2026, 10:30:**

| Aufgabe | Stand |
|---|---|
| 1 Stationen | offen, keine Lieferung auf GitHub |
| 2 Bohrstellen und Zonen | offen, keine Lieferung auf GitHub |
| 3 Funkprüfung | **erledigt** (Patrick, PR #31): längste Lücke 2,9 min, die Regel besteht |
| 4 Tageslicht aus REMS | **erledigt** (Patrick, PR #30): Sol 4596, Untergang 17:31 LMST |
| 5 Curiosity-Vergleich | offen (Paul) |
| 6 Grat-Maske | offen; Empfehlung: nicht mehr anfangen (siehe Aufgabe 6) |

Seit 10:19 haben in der Konsole alle vier Sicherheitsregeln Daten und bestehen. Beat 1 zeigt GO und „all four safety rules pass“.

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
8. **Projektseite:** Der Entwurf liegt in `docs/project-page.md` (in `main`; die Texte stehen schon im Formular). Dort stehen Werte als `⟨…⟩`, die aus euren Lieferungen kommen: Stationen, Bohrstellen, REMS-Sol, Funkcheck, Curiosity-Vergleich. Jede Quelle, die ihr nutzt, muss dort unter „NASA Data“ oder „References“ stehen.
9. **Hilfen in `main`:** `pipeline/mapping_grid.py` (`MappingGrid` von Magnus) liest `grid.json`. Es bietet `read_float("elev")`, `read_float("slope")` und `xy(lon, lat)`.
10. **Neu seit 09:30, die Regeln können NO-GO sagen** (PR #26). Jede Regel wird gegen ihre Grenze geprüft, über Hin- und Rückweg. Bricht eine, zeigen Urteil, Zielliste und Beat-1-Untertitel NO-GO. Wer Daten ändert, prüft also, dass Beat 1 bei der Szenario-Station weiter GO zeigt.
11. **`frontend/public/data/scenario.json` gibt es jetzt** (seit Aufgabe 4). Wer weitere Felder setzt, ändert nur seine Felder in dieser Datei (Regel 10). Die Funkschwelle steht dort als `radio_gap_max_min`.
12. **Zwei Skripte müssen nach Änderungen neu laufen:**
    - `py -3.11 pipeline/radio_check.py` nach jeder Änderung an `routes.json`, also nach `time_grid.py`;
    - `py -3.11 pipeline/rems_daylight.py`, wenn sich die Szenario-Station oder ihr Sol ändert.
13. **Die Funkprüfung hängt an den angenommenen Antennenhöhen** (Habitat 3 m, Crew 2 m). Mit 2 m und 1,5 m läge Station 1 bei 5,4 min, also NO-GO in Beat 1. Die Höhen nicht ändern, ohne das Team zu fragen.

## Reihenfolge

Die Aufgaben hängen voneinander ab. Vorschlag für die Merge-Reihenfolge:

1. **Aufgabe 2 (Zonen) und Aufgabe 1 (Stationen):** legen Positionen und Namen fest, bis 12:00 (Video). Danach `time_grid.py`, `radio_check.py` und `find-scenario.mjs`. Ändert sich der Sol der Szenario-Station, auch `rems_daylight.py`.
2. **Aufgabe 5 (Paul):** unabhängig von den Positionen, bis 13:30.
3. **Aufgabe 6 (Grat-Maske):** würde Grid, Zeiten und Routen ändern. Nach dem Video nicht mehr mergen (siehe dort).
4. **Aufgaben 3 und 4:** erledigt. Sie müssen nur neu laufen, wenn sich ihre Eingaben ändern (Punkt 12 oben).

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
    - Die Datei `frontend/public/data/scenario.json` existiert seit Aufgabe 4. Jede Aufgabe ändert nur ihre eigenen Felder in dieser Datei. Alle anderen Felder bleiben erhalten, auch `drift_zone`, `zone_clearance_m`, `zone_warn_m`, `injury_factor`, `radio_gap_max_min` und die Tageslichtfelder.
    - Eigene Felder aus `placeholder_fields` entfernen und unter `sources` die Quelle eintragen.
11. **Prüfen vor dem PR:**
    - **Konsole ansehen:** `cd frontend && npm install && npm run dev`, dann http://localhost:5173 öffnen. Fährt man über „Placeholder data“, zeigt die Konsole, welche Dateien noch Platzhalter sind.
    - **Nach jeder Änderung an Habitat, Stationen, Zonen oder Grid den Ablauf neu prüfen** (aus dem Repo-Wurzelordner):
      ```sh
      .venv/Scripts/python pipeline/time_grid.py
      py -3.11 pipeline/radio_check.py
      cd frontend && BUFFER=80 node scripts/find-scenario.mjs
      node scripts/check-route-times.mjs
      ```
      Die Suche gibt die Kombinationen aus, bei denen alle sechs Beats tragen; heute sind es zwei (siehe oben). Trägt die gewählte nicht mehr, sag es im PR, statt Werte zurechtzubiegen.
    - **Demo-Lauf:** In der Konsole die Station mit dem Hinweis „Plays the six beats“ wählen und „Start“ drücken. Erwartet werden:
      - in Beat 1 GO und im Regel-Panel „4 of 4 with data“ ohne „fails“;
      - in Beat 4 die Warnung;
      - in Beat 5 auf der Karte der geschützte Weg mit ✗ „too long“ und der Weg durch die Zone mit ✓ „fits“;
      - in Beat 6 der Eintrag „Override logged · N m inside …“;
      - die Crew vor EVA 6:00 zu Hause.
      Die neuen Zahlen in den PR schreiben.

---

## Aufgabe 1: Echte Stationen mit Bodenfoto

**Vorschlag:** Magnus · **Branch:** `feat/stations-data` · **Bis (Vorschlag):** So 12:00, weil die Namen im Video stehen

**Ziel:** `frontend/public/data/stations.geojson` mit echten Namen, Begründungen, Höhen und einem Bodenfoto je Station.

**Wenn die Zeit knapp ist:** zuerst Namen, Begründungen mit Quelle und Höhen. Die Fotos zeigt die Konsole ohnehin noch nicht; sie können als `image: null` nachkommen.

**Vorgaben:**
- **Positionen beibehalten,** weil der Ablauf darauf geprüft ist: Curiositys Wegpunkte der Sols **4596 (Station 1, Szenario-Station), 4609, 4667, 4839**. Koordinaten wie in `frontend/public/data/placeholder/stations.geojson`; die Quelle ist `MSL_waypoints.json`.
  - Sol 4596 ist in beiden tragenden Kombinationen die Szenario-Station. Ihn nicht tauschen. Er ist auch der Quell-Sol der Sonnenzeiten (Aufgabe 4).
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

**Vorschlag:** Michael · **Branch:** `feat/zones-data` · **Bis (Vorschlag):** So 12:00, weil die Zonennamen im Video stehen

**Problem:** Die Platzhalter-Zonen „Drill site A“ (Sol 4633) und „Drill site B“ (Sol 4818) sind nur gewählt, weil der Demo-Ablauf dort trägt. Ob Curiosity dort gebohrt hat, ist **nicht geprüft**. Die Konsole nennt sie aber „Drill site“, seit Beat 5 sogar auf der Karte und auf dem ABORT-Knopf. Auch die Projektseite und das Video sprechen von „drill sites“. Das Ergebnis dieser Aufgabe entscheidet über die Wortwahl dort.

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
   - Danach `pipeline/time_grid.py` und `pipeline/radio_check.py` laufen lassen und in der Konsole prüfen.
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

## Aufgabe 3: Funkprüfung entlang der Routen — erledigt

**Erledigt:** Patrick, PR #31, gemergt am 15.11.2026 um 10:19. Skript `pipeline/radio_check.py`, Ergebnis `frontend/public/data/radio_check.json`, Doku am Ende von `pipeline/README.md`.

- **Methode:**
  - Sichtlinie von der Habitat-Antenne (3 m) zur Crew-Antenne (2 m) über dem 10-m-Gelände, alle 5 m abgetastet, mit Mars-Krümmung;
  - Routenpunkte höchstens 5 m auseinander;
  - eine Lücke reicht von Mittelpunkt zu Mittelpunkt, gemessen in Gehminuten.
- **Ergebnis:**
  - Station 1: Hinweg 2,1 min, Rückweg 2,9 min;
  - Station 2: 2,1 bzw. 2,9 min;
  - Stationen 3 und 4: durchgehend Sicht.

  Alle Strecken liegen unter 5 min, die Regel besteht. Die Konsole wertet die Lücke der gewählten Station.
- **Empfindlich:** Mit 2 m und 1,5 m Antennenhöhe läge Station 1 bei 5,4 min (NO-GO). Die Höhen nur nach Absprache ändern.
- **Für andere Aufgaben:** Nach jeder Änderung an `routes.json` neu laufen lassen: `py -3.11 pipeline/radio_check.py`, unter einer Sekunde.

---

## Aufgabe 4: Tageslicht aus REMS — erledigt

**Erledigt:** Patrick, PR #30, gemergt am 15.11.2026 um 10:13. Skript `pipeline/rems_daylight.py`, Ergebnis in `frontend/public/data/scenario.json`.

- **Ergebnis:** Sol 4596 (11.07.2025), an dem Curiosity an der Szenario-Station stand: Sonnenaufgang 05:47, Sonnenuntergang 17:31 LMST.
  - Die Felder `sunrise_lmst`, `sunset_lmst` und `daylight_source_sol` sind gesetzt.
  - `sol` bleibt der künftige Sol der Crew-EVA.
  - Die Übertragung auf die EVA ist in `sources` als Annahme gekennzeichnet.
- **Tageslicht bindet nicht:** Die Crew ist um 14:58 LMST zu Hause.
- **Für andere Aufgaben:** Ändert sich die Szenario-Station oder ihr Sol, `py -3.11 pipeline/rems_daylight.py` neu laufen lassen.
- **Offen fürs Frontend-Team:** Das Feld `daylight_source_sol` zeigt die Konsole noch nicht an.

---

## Aufgabe 5: Vergleich mit Curiositys Fahrten

**Zuständig:** Paul, siehe `docs/auftraege/paul-astar.md` · **Branch:** `feat/curiosity-comparison` · **Bis (Vorschlag):** So 13:30

Der A*-Code in `backend/` (PRs #24, #28, #29) ist in `main`, aber noch nicht an die Konsole angebunden. Von ihm braucht die Konsole genau diese eine Datei.

Methode, Format und Prüfung stehen in Pauls Übergabe. Kurzfassung:
- **Gehmodell:** dasselbe wie `pipeline/time_grid.py`, also Tobler gerichtet (siehe oben). Es muss alle Testvektoren aus `shared/walking-model-vectors.json` treffen. Die alte symmetrische Formel aus der ersten Fassung dieser Datei gilt nicht mehr.
- **Ergebnis:** `frontend/public/data/curiosity_comparison.json` mit `mean_deviation_m` und `straight_line_m`. Die Konsole zeigt beide in der Info-Zeile „Compared with Curiosity“.
- **Formulierung:** Immer „compared with Curiosity“, nie „validated“. Curiosity ist ein Rover und fährt anders, als ein Mensch geht.

---

## Aufgabe 6: Grat-Maske aus dem 1-m-DEM

**Vorschlag:** Michael oder Paul · **Branch:** `feat/ridge-mask` · **Bis (Vorschlag):** So 09:30, verstrichen

**Empfehlung (Stand 10:30): nicht mehr anfangen.**
- Die Maske braucht einige hundert MB DEM-Daten und eine Erweiterung der Engine.
- Sie ändert alle Zeiten und Routen und kann die Geschichte mit 2 min Reserve brechen.
- Nach der Videoaufnahme darf sich die Demo nicht mehr ändern.

Die Konsole sagt ehrlich „ridge mask pending“, und die Projektseite nennt die Maske als offene Grenze. Die Anleitung unten bleibt für später.

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
- die Ausgabe der Prüfungen (`find-scenario.mjs`, `check-route-times.mjs` und `radio_check.py`, falls Positionen oder Grid berührt wurden) und die neuen Zahlen des Demo-Laufs;
- was offen bleibt.

Was die Konsole noch nicht anzeigt, ist ein Auftrag an das Frontend-Team, keine Änderung in `frontend/src/`.
