# Übergabe Mapper → Frontend

Stand: 14.11.2026. Implementiert sind ein Offline-JSON-Wrapper, der Adapter auf das **vorhandene** echte Grid und der Hang-Layer-Export. Keine neue Rasterdefinition, kein Server und kein Routing. Grundlage und Grenzen: `docs/auftraege/datenteam.md`, „Für alle Aufgaben“. Die Anzeige ist seit dem 14.11. abends in der Konsole eingebaut: Layers → Terrain → „Slope, 10 m baseline“.

## Voraussetzung für diesen Feature-Branch

Dieser Branch enthält ausschließlich die Mapper-Vorbereitung. Das echte `grid.json` und die Terrain-Binärdateien werden vom bereits in `main` integrierten Zeitgrid geliefert und sind hier bewusst nicht als fremde Änderungen mitgenommen. Vor dem Standardaufruf muss diese Datenbasis verfügbar sein, beispielsweise nach Integration mit aktuellem `main` oder über `--data-dir` auf einem vorhandenen Datenordner. Die mitgelieferten Hangdateien wurden auf dieser Datenbasis erzeugt.

## Gemeinsame Referenz

`frontend/public/data/grid.json` ist die Quelle der Rastergeometrie. Aktuell: **nx=475, ny=476, cell_m=10**, Nordwest-Ursprung `(8140783.492786024, -282731.075189438)` m. Projektion: sphärischer Mars eqc, R=3396190 m, lat_ts=0, lon_0=0. Nicht die frühere lokale Demo-Projektion mit cos(reference_latitude) verwenden.

`mapping_grid.py` liest diesen Header, prüft Projektion, Dimensionen, Ursprung, bbox und Dateilängen und stellt dieselben Zellmittelpunkte wie `frontend/src/model.js` bereit. Es lässt sich direkt als Grid-Adapter an `mars_mapping.raster_to_matrix()` übergeben. Es verändert keine Quellraster.

Mit `K = 3396190 * Math.PI / 180`:

```js
const index = row * grid.nx + column;
const lon = (grid.origin_m.x + (column + 0.5) * grid.cell_m) / K;
const lat = (grid.origin_m.y - (row + 0.5) * grid.cell_m) / K;
const columnFromLon = Math.floor((lon * K - grid.origin_m.x) / grid.cell_m);
const rowFromLat = Math.floor((grid.origin_m.y - lat * K) / grid.cell_m);
```

Spalten laufen nach Osten, Zeilen nach Süden. West-/Nordrand sind eingeschlossen; Ost-/Südrand ausgeschlossen. Positionen auf GeoJSON-/Dateiebene sind `[lon, lat]`, Leaflet verwendet `[lat, lon]`. Außerhalb gibt es keinen Messwert. Die Anzeigeprojektion und das numerische Grid werden nicht beim Layerwechsel verändert.

`grid_id` ist ein SHA-256-basierter Fingerabdruck der normalisierten Geometrie, nicht des Geländeinhalts und nicht der Routingparameter. Er steht im Wrapper und Hang-Metadaten, ohne den bestehenden Grid-Header zu verändern. Der aktuelle Wert ist `mars-eqc-76ee605d6394f17a713f`. Layer und Zellantworten müssen auf dieselbe Geometrie verweisen. Nach Änderungen an Ursprung, Auflösung oder Abmessungen das Overlay neu erzeugen. Auch nach Änderungen der Terrainwerte muss neu exportiert werden; die Grid-ID allein erkennt keine veralteten Messwerte.

## Was ausgeliefert wird

| Datei | Zweck |
|---|---|
| `data/grid.json` | Bestehender Header mit CRS, Ursprung, Zellgröße, nx/ny und numerischen Dateinamen |
| `data/elev_10m.f32` | Bestehende Höhen, float32 little-endian in m, zeilenweise |
| `data/slope_10m.f32` | Bestehende Hangneigung, float32 little-endian in Grad, zeilenweise |
| `data/slope_10m.png` | Neuer RGBA-Layer, **475×476 Pixel**, genau ein Pixel pro Gridzelle |
| `data/slope_10m.json` | Neue Bildgrenzen, Grid-ID/Geometrie, Anzeigepriorität, Deckkraft, Legende und Quellen |
| `maps/ortho_gale_1m.jpg` + `.json` | Bestehendes Orthofoto mit **seinen eigenen** tatsächlichen Grenzen |

Das Hangbild hat außerhalb gültiger DEM-/Hangzellen Alpha=0, innerhalb Alpha=255. Die Gesamtdeckkraft ist eine separate Leaflet-Einstellung. Farben nach DESIGN.md: Vermessungspapier `#EDF0E6` bis 10°, Graphit `#51575B` über 10° bis 20°, Rot `#C8361F` über 20° (gesperrt). Grün und Gelb sind in der Konsole für die Rückkehr-Stufen reserviert und hier bewusst nicht verwendet (Teamentscheidung vom 14.11.). Diese Klassengrenzen sind die bestehenden Anzeigeannahmen aus dem Datenvertrag. Die Höhen-/Hangwerte sind aus dem echten DEM; Szenarioeingaben bleiben laut Grid-Header teilweise Platzhalter.

Wichtig: Das Orthofoto hat einen leicht versetzten Pixelursprung gegenüber dem DEM und bleibt hochauflösend. Ihm dürfen **nicht** die Grenzen des Grids zugewiesen werden. Leaflet legt beide anhand ihrer tatsächlichen geografischen Grenzen korrekt übereinander. Für das Hangbild selbst gilt dagegen exakt die gesamte Gridfläche.

Beispiel aus `slope_10m.json` (gekürzt):

```json
{
  "schema_version": 1,
  "image": "slope_10m.png",
  "image_path": "data/slope_10m.png",
  "grid_file": "grid.json",
  "grid_id": "mars-eqc-76ee605d6394f17a713f",
  "width_px": 475,
  "height_px": 476,
  "pixels_per_cell": 1,
  "bounds": [[-4.8501483297557,137.33994154226008],[-4.769844250631072,137.42007691533613]],
  "layer": {"id":"slope","name":"Slope","priority":10,"opacity":0.6,"visible":false}
}
```

`image_path` ist relativ zur App-Basis, `image` relativ zum JSON-Ordner. `grid_file` ist relativ zum JSON-Ordner und bezeichnet die kanonische Geometrie, nicht eine zweite Rasterdefinition. Die weiteren Felder enthalten `grid`, `source`, `generator`, `created_utc`, `numeric_file`, `legend`, `placeholder_inputs` und die Zahl gültiger/fehlender Zellen. `terrain_sha256` enthält zusätzlich Prüfsummen der verwendeten Höhen- und Hangraster, damit sich die Datengrundlage des Bildexports nachvollziehen lässt. Wird mit `--out-dir` in ein anderes Verzeichnis exportiert, ist das ein Staging-Verzeichnis: PNG und JSON zusammen in `public/data/` ausliefern, wo der bestehende Header liegt.

## Python-Wrapper: JSON hinein, JSON heraus

Aus dem Repository-Wurzelordner. Installation einmal pro Rechner: `.venv/Scripts/python -m pip install -r pipeline/requirements.txt`. Die Datei enthält seit dem 14.11. auch pyproj und SciPy für `sample_raster`. Auf macOS oder Linux statt `.venv/Scripts/python` den Pfad `.venv/bin/python` verwenden. Der Wrapper ist ein Offline-Werkzeug für Node.js oder die Shell, kein Browser-Endpunkt.

```sh
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"describe"}'
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"query","points":[{"column":266,"row":250}]}'
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"query","points":[{"lon":137.38,"lat":-4.81}]}'
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"export_slope"}'
```

Alternativ einen Request über stdin übergeben. `--data-dir` wählt einen anderen Ordner mit `grid.json` und Terrain-Binärdateien. `--out-dir` gilt nur für den Bildexport. Der Standardexport schreibt **nur** `slope_10m.png` und `slope_10m.json` und verändert weder Terrain noch Stationen, Szenario, Zonen, Routen, Zeiten oder Zeiger.

Antwort bei Erfolg: `{"ok":true,"result":{...}}`, Prozesscode 0. Bei ungültiger Eingabe/fehlenden Dateien: `{"ok":false,"error":{"code":"MAPPING_ERROR","message":"..."}}`, Prozesscode 1. stdout enthält nur ein JSON-Objekt, Diagnoseausgaben gehen an stderr. JSON verwendet `null` für fehlende Werte; nie NaN oder Infinity.

`query` akzeptiert bis zu 10000 Punkte. Pro Punkt entweder `column` und `row` (Ganzzahlen), oder `lon` und `lat` (Grad). Optional `grid_id` zum Ablehnen fremder Raster. Antwort je Punkt:

- `status`: `ok`, `no_data` oder `outside_grid`.
- `cell`: `column`, `row`, `index`, `lon`, `lat`, Zell-`bounds` und normalisierte `image_uv`; außerhalb `null`.
- `elev_m`, `slope_deg`: Messwerte oder `null`.

`image_uv` bezeichnet die Zellmitte relativ zum **griddeckenden Bild**. Bei Bildabmessungen W,H gilt `pixelX=u*W`, `pixelY=v*H`. Diese Formel gilt nicht für das anders zugeschnittene Orthofoto. Dort die geografische Position verwenden.

### Weitere lokale GeoTIFFs auf dasselbe Grid abbilden

```sh
.venv/Scripts/python pipeline/mapping_bridge.py --request '{"action":"sample_raster","path":"/absolute/path/to/mars-dem.tif","band":1}'
```

Dieser Pfad verwendet den vorhandenen Python-Mapper mit `MappingGrid`, übernimmt dessen Mars-CRS-Prüfung und liefert `values` als flaches Array in derselben Zellreihenfolge. Enthalten sind `grid_id`, nx/ny, Band, Quelle und Einheiten (`null`, falls die Quelle keine nennt). Die Abtastung ist **Nearest Neighbor**. Sie ersetzt weder die gemittelte Terrainaufbereitung in `time_grid.py` noch eine Grat-Maske. Der Wrapper überschreibt die produktiven Terrainwerte nicht.

Aufruf aus Node.js, ohne Shell-Interpolation:

```js
import { spawnSync } from 'node:child_process';
const PY = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const child = spawnSync(PY, ['pipeline/mapping_bridge.py'], {
  cwd: repositoryRoot,
  input: JSON.stringify({ action: 'query', points: [{ column: 266, row: 250 }] }),
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
});
if (child.error) throw child.error;
const response = JSON.parse(child.stdout);
if (child.status !== 0 || !response.ok) throw new Error(response.error?.message || child.stderr);
```

Nur eine lokale Werkzeug-Schnittstelle; nicht ungeprüft als öffentliches Upload-/Dateizugriffs-API bereitstellen. Das Frontend braucht Python nicht zur Laufzeit.

## Auftrag an das Frontend-Team

Stand 14.11. abends: Die Schritte 1–3 und 6 sind in `frontend/src/` umgesetzt. Die Hang-Ebene wird nur gezeichnet, wenn ihre Pixelgröße zu `nx`/`ny` aus `grid.json` passt; sie liegt unter Rückkehrbereich, Routen und Markern, ist beim Start aus und zeigt die Zellen scharf (ohne Glättung). Schritt 4 ist nicht nötig, Schritt 5 ist offen (die Konsole lädt `elev_10m.f32` und `slope_10m.f32` nicht; Höhe und Hang entlang der Routen kommen aus `routes.json`). Ursprüngliche Schritte:

1. `data/slope_10m.json` zusätzlich laden, `schema_version`, Gridgeometrie, Bildabmessungen und Grenzen mit `grid.json` vergleichen; inkonsistente Layer nicht zeichnen. Fehlt der Hang-Layer, bleibt die bestehende Karte nutzbar.
2. `image_path` relativ zu `import.meta.env.BASE_URL` laden und bei Bildfehler einen verständlichen Hinweis anzeigen.
3. Overlay unter Routen/Markern einordnen, Priorität und Sichtbarkeit verwenden. Die PNG-Transparenz lässt das Orthofoto durchscheinen. Beispiel:

   ```js
   const overlay = L.imageOverlay(BASE + meta.image_path, meta.bounds, {
     opacity: meta.layer.opacity,
     zIndex: meta.layer.priority
   });
   if (meta.layer.visible) overlay.addTo(map);
   // Layer-Menü: overlay.addTo(map) / map.removeLayer(overlay)
   ```

4. Für Zellmarker die **bereits vorhandenen** Funktionen `cellCenter(g, index)` und `cellIndex(g, position)` aus `model.js` verwenden. Zellenpolygone aus deren Zellgrenzen zeichnen. Rasterwerte niemals aus dem PNG auslesen.
5. Für einzelne Messwerte die Binärdateien aus `header.files.elev/slope` laden, Länge `nx*ny*4` prüfen und Little Endian explizit dekodieren. Diese Dateien stehen aktuell im Vertrag, werden von `data.js` noch nicht geladen. NaN/Infinity als fehlend behandeln.
6. Karte, Cuff und HUD müssen dieselbe Zellzuordnung verwenden. Kein neues Grid aus Bildpixeln ableiten. Für das grobe Hangbild ist Nearest-Neighbor-Darstellung sinnvoll, damit Zellklassen beim Skalieren nicht optisch gemischt werden.

## Prüfstand und Grenzen

Die Grid-/Zellumrechnung wird gegen die bestehenden Frontend-Funktionen geprüft, die Ausgabe gegen die echten Terrain-Binärdateien. PNG-Größe, RGBA/Alpha, Klassengrenzen, NoData und JSON-Fehlerverhalten werden in temporären Smoke-Prüfungen kontrolliert; gemäß Nutzerwunsch werden keine Testdateien im Repo angelegt.

Es gibt keinen neuen Routenalgorithmus, keine neue A*-Schnittstelle und keine Änderungen an `time_grid.py`. Positionen und Szenariokonstanten bleiben gleich. Die Aufgaben zu echten Stationsfotos, belegten Bohrstellen, REMS, Funkprüfung und Grat-Maske sind separate Datenteam-Aufgaben und wurden hier nicht als erledigt ausgegeben.

### Ergebnis des lokalen Abgleichs

- Alle 226100 Zellmittelpunkte erfolgreich zurück in ihre Originalzellen umgerechnet.
- Bounds und fünf Kontrollzellen einschließlich Habitat und Rasterecken stimmen exakt mit `frontend/src/model.js` überein (JavaScript-Ausführung über die lokale Node-Laufzeit).
- PNG visuell geprüft: 475×476 Pixel, RGBA, Klassenfarben entsprechen den echten Hangwerten. Alle Zellen des aktuellen Terrainrasters sind gültig.
- Temporäre Prüfungen für NoData/Transparenz, exakt 10°/20°, ungültige Requests, falsche Grid-ID, gekürzte Binärdatei und echten Mapper-Aufruf auf erzeugtem GeoTIFF erfolgreich.
- Bestehende Terrain-/Routingdateien bytegleich zur Basis; `frontend/src/` und `pipeline/time_grid.py` unverändert.
- Syntaxprüfung und `git diff --check` erfolgreich. Keine Testdateien im Repo angelegt.
- `npm run build` konnte mangels npm und installierter Frontend-Abhängigkeiten nicht ausgeführt werden; Konsole und Layer-Menü deshalb nicht im Browser geprüft.
- Nachtrag 14.11. abends (Frontend): eingebaut, `npm run build` erfolgreich, im Browser geprüft (Headless Chrome: Ebene lädt 475 × 476 px, an und aus ohne Laufzeitfehler). Keine Demo-Positionen geändert, daher keine Neuberechnung des Szenarios.
