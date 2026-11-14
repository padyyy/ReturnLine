# Datenpipeline: Orthofoto-Overlay und Ausgangspunkt für DEM-Arbeit

Für das Datenteam (Magnus, Michael). Stand 14.11.2026, 13:40. Diese Datei beschreibt das erste Pipeline-Skript, was damit geprüft ist und wie dasselbe Muster für das DEM funktioniert. Der Ablageort `pipeline/` ist ein Vorschlag; über die endgültige Struktur entscheidet der Tech Lead.

## Was es gibt

`ortho_overlay.py` schneidet das Einsatzgebiet aus dem USGS-Orthofoto von Gale aus und speichert es als ein Bild plus JSON mit den Grenzen in Grad. Das reicht für den Meilenstein „Der Punkt wandert über das echte Orthofoto“.

- Quelle: [MSL Gale Merged Orthophoto Mosaic 25cm v3](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm), Datei `MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` (24 GB) mit der Übersichtsdatei `.tif.ovr` (4,2 GB) im öffentlichen USGS-Bucket.
- Das Skript lädt die Datei **nicht** herunter. Es liest per HTTP-Range-Request (GDAL `/vsicurl/`) nur die Kacheln der 1-m-Übersichtsebene, die im Ausschnitt liegen.
- Ausschnitt laut `docs/mission-scenario.md`: 137,34–137,42° O, 4,77–4,85° S (etwa 4,7 × 4,7 km).
- Ergebnis: `frontend/public/maps/ortho_gale_1m.jpg` (4743 × 4743 px, 1 m/px, 6,3 MB) und `frontend/public/maps/ortho_gale_1m.json`. Laufzeit am 14.11.: 14 Sekunden.

## Schnellstart

Einmalig, aus dem Repo-Wurzelordner (Windows, Git Bash):

```sh
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
```

Auf macOS oder Linux: `python3.11 -m venv .venv` und `.venv/bin/python`. `.venv/` ist in der `.gitignore`.

Overlay erzeugen:

```sh
.venv/Scripts/python pipeline/ortho_overlay.py --dry-run   # zeigt Ausschnitt und Grenzen, liest keine Pixel
.venv/Scripts/python pipeline/ortho_overlay.py             # schreibt Bild und JSON
```

Nützliche Optionen:

| Option | Wirkung |
|---|---|
| `--resolution 2` | 2 m/px statt 1 m (etwa ein Viertel der Dateigröße, z. B. fürs Handy) |
| `--format png` | verlustfrei statt JPEG (deutlich größer) |
| `--west --east --south --north` | anderer Ausschnitt in Grad (Süden ist die negativere Breite) |
| `--name`, `--out-dir` | Dateiname und Zielordner |
| `--source` | andere Quelle, URL oder lokaler Pfad (z. B. ein Fenster vom USB-Stick) |

## Ausgabe

Das JSON enthält alles, was das Frontend braucht, und woher es stammt:

```json
{
  "image": "ortho_gale_1m.jpg",
  "bounds": [[-4.850012, 137.339984], [-4.769995, 137.420001]],
  "bbox": { "west": 137.339984, "east": 137.420001, "south": -4.850012, "north": -4.769995 },
  "width_px": 4743, "height_px": 4743, "pixel_size_m": 1.0,
  "source": "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif",
  "source_level": { "overview_factor": 4, "pixel_size_m": 1.0 },
  "use": "display only; never read numbers from this image"
}
```

(gekürzt; die Datei enthält zusätzlich `source_crs`, `requested_bbox`, `created_utc` und `generator`)

- `bounds` ist in Leaflet-Reihenfolge `[[Süd, West], [Nord, Ost]]`, Grad, Längengrad ostpositiv.
- Die Grenzen sind auf das Pixelraster eingerastet und deshalb minimal größer als angefragt. Das Frontend soll immer die Werte aus dem JSON nehmen, nie die angefragten.
- Das Bild ist nur zur Anzeige da. Zahlen (Höhe, Hangneigung, Zeit) kommen nie aus einem Bild, sondern aus GeoJSON, JSON oder dem Binär-Grid.

Einbau in Leaflet (für das Frontend-Team):

```js
const MarsCRS = L.extend({}, L.CRS.EPSG4326, { R: 3396190 });
const map = L.map('map', { crs: MarsCRS });
const meta = await (await fetch('maps/ortho_gale_1m.json')).json();
L.imageOverlay(`maps/${meta.image}`, meta.bounds).addTo(map);
map.fitBounds(meta.bounds);
```

Das Bild ist äquirektangulär und passt deshalb ohne Umprojektion auf Leaflets EPSG:4326-Karte. Distanzen nur mit `map.distance()`; `latlng.distanceTo()` und `L.circle` rechnen mit dem Erdradius.

## Wie es funktioniert

1. **Projektion.** Orthofoto und DEM liegen in Mars-Equirectangular (`+proj=eqc +lat_ts=0 +lon_0=0 +R=3396190`). Daher gilt Längengrad = x / 59 274,70 und Breite = y / 59 274,70. Das Skript rechnet nicht mit dieser Konstante, sondern über PROJ (`rasterio.warp.transform` mit `+proj=longlat +R=3396190`), und funktioniert damit auch bei anderen Quellen.
2. **Übersichtsebene.** Die `.ovr`-Datei hat die Faktoren 4, 8, 16 … 256. Bei 0,25 m nativ ist Faktor 4 genau 1 m/px. Das Skript wählt die gröbste Ebene, die noch mindestens so fein ist wie `--resolution`, und rechnet nur bei Bedarf herunter (Mittelwert).
3. **Lesen.** Das Fenster wird in Streifen zu 512 Zeilen gelesen, damit man den Fortschritt sieht. GDAL fasst benachbarte Kacheln zu Mehrfach-Range-Requests zusammen.
4. **Palette.** Das Orthofoto ist 8 Bit mit Graustufen-Palette (Index = Grauwert). Ein Graubild wird direkt geschrieben; eine echte Farbpalette würde in RGB umgesetzt.
5. **Schutz.** Ein Ausschnitt über 12 000 × 12 000 px bricht mit Meldung ab, damit niemand versehentlich die volle Auflösung zieht.

Wichtige GDAL-Einstellung: `GDAL_DISABLE_READDIR_ON_OPEN=YES`. Mit dem oft empfohlenen `EMPTY_DIR` findet GDAL die `.ovr`-Datei nicht und würde aus der 0,25-m-Ebene lesen (16-mal so viele Daten).

## Geprüft

- `--dry-run` und echter Lauf am 14.11.: Fenster bei Faktor 4, Spalten 14538–19281, Zeilen 41576–46319, Ausgabe 4743 × 4743 px, 14 s, keine Fehler.
- **Georeferenzierung:** Curiositys Fahrspur (`MSL_traverse.json`) und Wegpunkte (`MSL_waypoints.json`) von MMGIS wurden allein anhand der JSON-Grenzen auf das Bild gezeichnet. 18 458 Spurpunkte und 318 Wegpunkte (Sol 3898 bis 5073) liegen im Ausschnitt, und die Spur folgt sichtbar den Fahrwegen im Gelände; in der 1:1-Vergrößerung bei 137,379–137,383° O ist das Boxwork-Netz erkennbar. Das Prüfskript liegt nicht im Repo; der Ablauf ist oben beschrieben und in wenigen Zeilen nachzubauen.
- Keine automatisierten Tests; es gibt noch kein Test-Setup.

## Nächste Schritte für das Datenteam

Dasselbe Muster trägt die DEM-Arbeit. Die Funktionen `gdal_path`, `pick_overview`, `lonlat_to_xy` und `GDAL_ENV` aus `ortho_overlay.py` lassen sich direkt importieren.

**DEM-Fakten (am 14.11. per Range Request gelesen):**

- Datei `MSL_Gale_DEM_Mosaic_1m_v3.tif` (3,9 GB) plus `.tif.ovr` (650 MB), gleicher Bucket.
- 32 980 × 57 440 px, float32, LZW, **eine Zeile pro Strip**, NoData −32767, Übersichten 4 … 256.
- Einsatzgebiet bei 1 m: Spalten ab 12 793, Zeilen ab 37 959, 4742 × 4742 px.
- Weil jede Zeile ein Strip über die volle Breite ist, lädt ein 1-m-Fenster ganze Zeilen: grob einige hundert MB. Erst mit `--resolution 4` (Übersicht, schnell) testen, für 1 m das Fenster einmal als GeoTIFF nach `data/raw/` cachen (ist in der `.gitignore`).

**Achtung, versetzte Raster:** Das DEM-Pixelraster ist gegenüber dem 1-m-Raster des Orthofotos um etwa 0,49 m (Ost–West) und 0,08 m (Nord–Süd) verschoben (Ursprung DEM x = 8 127 993,4928 m, y = −244 781,0752 m; Orthofoto x = 8 126 248 m, y = −241 164 m). Jede Ausgabe braucht deshalb ihre eigenen Grenzen; niemand sollte annehmen, dass Orthofoto-Pixel und DEM-Zellen deckungsgleich sind. Für das 10-m-Grid legt die Grid-Spezifikation in `shared/` (Paul) Ursprung und Ausdehnung fest; das DEM-Skript sollte auf genau dieses Raster mitteln.

**Vorgeschlagene Reihenfolge:**

1. `pipeline/dem_window.py`: DEM-Fenster des Einsatzgebiets bei 1 m lesen, NoData maskieren, als GeoTIFF nach `data/raw/` schreiben.
2. 10-m-Hangneigung: DEM auf das 10-m-Grid der Spezifikation mitteln, Gradient in Grad. Ausgabe als float32-Binär-Grid nach Spezifikation plus kleines JSON mit Grenzen.
3. Grat-Maske bei 1 m (die 1–2 m hohen Rücken verschwinden bei 10 m).
4. Danach prüfen, ob die geplanten Stopps unter der Grat-Regel erreichbar sind (offene Prüfung aus `docs/mission-scenario.md`).
5. Optional für die Anzeige: Hangneigung und Schummerung als Bilder, wieder mit JSON-Grenzen.

## Zeit-Grid (Fallback für die Routing-Engine): `time_grid.py`

Stand 14.11.2026, abends. Das ist der geplante Python-Fallback für die Engine. Er schreibt genau die Dateien der Grid-Spezifikation in `shared/data-contract.md`, sodass die Konsole sie ohne Codeänderung lädt. Sobald die Engine eigene Dateien im selben Format liefert, ersetzen sie diese.

```sh
.venv/Scripts/python pipeline/time_grid.py      # etwa 15 s, liest rund 20 MB per Range Request
```

- **Ausgabe nach `frontend/public/data/`:**
  - `grid.json`
  - `ttb_penalized.f32`, `ttb_allowed.f32`
  - `ptr_penalized.i32`, `ptr_allowed.i32`
  - `elev_10m.f32`, `slope_10m.f32` (je 475 × 476 Zellen, je 0,9 MB)
  - `routes.json` (Habitat ↔ jede Station entlang der Zeiger)
- **Höhe:** 4-m-Übersicht des DEM, gemittelt auf 10-m-Zellen. Die Zellen liegen auf dem 1-m-Pixelraster des DEM. Die Hangneigung kommt aus diesem Raster.
- **Gesperrt:** keine Daten oder Hang über 20° (`slope_block_deg`).
  - Lücke: Die 1-m-Grat-Maske fehlt. Sie braucht das 1-m-DEM; schmale Boxwork-Rücken sind bei 4 m nicht sichtbar.
- **Gehzeit:** 1,5 km/h auf ebenem Boden, am Hang verlangsamt mit `exp(−3,5 · |Δh/Strecke|)`. Das ist dieselbe symmetrische Tobler-Form wie in beiden Design-Sketches und eine gekennzeichnete Annahme, keine belegte Funktion. Weil sie symmetrisch ist, ist der Weg A→B so lang wie B→A. Deshalb reicht eine Suche vom Habitat aus.
- **Suche:** Dijkstra vom Habitat, 16 Nachbarn, keine Ecken über gesperrte Zellen.
  - „penalized“: Zonen ×20, Ring von `zone_clearance_m` um jede Zone ×3.
  - „allowed“: Zonen sind normaler Boden (für ABORT).
  - Gespeichert ist immer die echte Gehzeit entlang des gewählten Wegs, nie die bestrafte Kostensumme.
- **Eingaben:** Habitat, Stationen, Zonen und Konstanten aus `frontend/public/data/`, sonst aus `…/placeholder/`. Solange das Platzhalter sind, steht das in `grid.json` unter `placeholder_inputs`.
- **Datenprüfung für den Demo-Ablauf:** `frontend/scripts/find-scenario.mjs` (Node, etwa 30 s) prüft auf diesem Grid viele Kombinationen aus Habitat, Szenario-Station, Drift-Zone und ABORT-Zone mit derselben Logik wie die Konsole.
  - Bedingungen: Plan heim vor 6:00, Drift auf 10 m möglich, nach der Verletzung ist der geschützte Weg zu lang und der Weg durch die Zone reicht.
  - Mit 40 m Zonenpuffer trug keine Kombination (höchstens 1,9 min Unterschied). Mit 80 m trugen fünf.
  - Gewählt (Platzhalter, in `frontend/scripts/make-placeholder-data.mjs`): Habitat 137.384902° O, 4.812105° S; Stationen auf Curiositys Wegpunkten der Sols 4596 (Szenario), 4609, 4667, 4839; Drill site A bei Sol 4633 (Drift), Drill site B bei Sol 4818 (ABORT); Puffer 80 m.
- **Ergebnis in der Konsole, voller Demo-Lauf:**
  - 5:05 Warnung „Crew 10 m from Drill site A“, Umleitung +1 min.
  - 5:06 Verletzung: geschützter Weg 56 min ✗, durch die Zone 49 min ✓.
  - ABORT mit 157 m in Drill site B, protokolliert. Crew um 5:55 zu Hause, 5 min Reserve.
- **Reihenfolge bei Änderungen:** `npm run data:placeholder` (in `frontend/`), dann `.venv/Scripts/python pipeline/time_grid.py`, dann `node scripts/find-scenario.mjs` zur Kontrolle.

## Stolperstellen

- **Deployment:** Entschieden am 14.11.: Das 1-m-Overlay (`ortho_gale_1m.jpg` und `.json`) ist in der `.gitignore` freigegeben und liegt im Repo, damit GitHub Pages und die Offline-Demo nicht vom USGS-Server abhängen. Andere erzeugte Dateien in `frontend/public/maps/` bleiben ignoriert; wer ein neues Overlay ausliefern will, gibt es dort gezielt frei.
- **Dateigröße:** 6,3 MB bei 1 m. Für schwache Verbindungen zusätzlich eine 2-m-Version erzeugen.
- **Netz:** Auf Patricks Rechner fängt ein Proxy oder Virenscanner TLS für einige NASA-Seiten ab. Der USGS-Bucket auf S3 und `mars.nasa.gov` (MMGIS) gingen am 14.11. ohne Probleme. Zertifikatsprüfungen nie abschalten.
- **Quellenangabe:** Das Orthofoto auf der Projektseite mit dem USGS-Datensatz zitieren (Link oben).

## Mapping → Frontend vorbereiten (ohne Routing)

`mapping_grid.py` liest das vorhandene echte `frontend/public/data/grid.json` unverändert. `mapping_bridge.py` bietet JSON-Anfragen für Gridbeschreibung, Zell-/Koordinatenabfragen, Abtastung weiterer GeoTIFFs durch den bestehenden GeoMapper und den Export von `slope_10m.png` + `.json` auf exakt diesem Grid.

```sh
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"describe"}'
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"export_slope"}'
```

Ausgabe: ein RGBA-Pixel pro Gridzelle, NoData transparent, Klassen bis 10°, 10–20° und über 20°. Numerische Dateien und Routing bleiben unverändert. Das bestehende Orthofoto behält seine eigenen georeferenzierten Grenzen. Installation: `pipeline/requirements.txt`, sie enthält seit dem 14.11. auch pyproj und SciPy für `sample_raster`. Farben: Vermessungspapier bis 10°, Graphit 10–20°, Rot über 20° (gesperrt).

Vollständige Schnittstelle, Node.js-Aufruf, Quellen/Annahmen, Zellformeln und noch offene Frontend-Schritte: [MAPPING.md](MAPPING.md). Nach Datenteam-Auftrag wurde nichts in `frontend/src/` geändert. Die Konsole zeigt den Hang-Layer im Layers-Menü (Terrain → „Slope, 10 m baseline“).
