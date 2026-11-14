# Frontend

## Stand und Zweck
- Statische Web-App mit Vite 7.3.7 und Leaflet 1.9.4, kein UI-Framework, GitHub Pages. Sprache: JavaScript (Entscheidung des Tech Leads am 14.11.2026).
- Eine Seite: die Habitat-Konsole mit eingebettetem, schreibgeschütztem Crew-Display. Inhalt und Demo-Drehbuch: `../docs/mission-scenario.md` und `../docs/demo-script.md`, Datenformate: `../shared/data-contract.md`, Design: `../DESIGN.md` und `../docs/preparation/design-brief.md`.
- Design-Sketch (14.11.2026, alle sechs Beats, synthetische Daten): `../docs/design/habitat-console-sketch.html`. Vorlage für Layout, Zustände und Wortlaut. Markup und CSS wurden übernommen, der synthetische Datengenerator und die Routensuche im Browser nicht.
- Stand 14.11.2026, Konsolen-Gerüst: Planung mit Zielwahl, Start, sechs Beats per Demo-Knopf, Urteil, vier Regeln, Logbuch, Budget, Crew-Panel mit drei Ansichten (Werte, Cuff, HUD). Läuft auf markierten Platzhalterdaten, bis Pipeline und Engine echte Dateien liefern. Cuff und HUD sind Platzhalter, bis Alex' Komponenten sie ersetzen.

## Regeln aus Teamentscheidungen
- Jede Aktion kommt von der Habitat-Kontrolle. Die Crew-Ansichten sind schreibgeschützt; die Cuff-Tasten wechseln nur die Ansicht.
- Die Demo startet erst, wenn die Habitat-Kontrolle ein Ziel gewählt und Start gedrückt hat (Habitat → Ziel → Habitat). Die sechs Beats laufen nur für die Szenario-Station (`scenario_station` in `scenario.json`); andere Ziele navigieren ohne Ereignisse.
- Der Browser berechnet keine Routen. Routen, Rückkehrzeiten und Zeiger kommen aus der Engine (`routes.json`, Grid-Dateien). Rückkehr-Stufen mit Regel B bis zum Freeze.
- Werte, deren Daten fehlen, zeigen „not available“ oder „needs grid“, nie eine erfundene Zahl. Das Kopfband zeigt „Placeholder data“, solange eine Datei aus `public/data/placeholder/` kommt.

## Einstiegspunkte und Befehle
- `index.html`: Kopfband, Karte mit Crew-Panel und Legende, Untertitel und Transport, Budget, rechte Spalte (Zielwahl, Urteil, Regeln, Info, Logbuch, Annahmen).
- `src/main.js`: Start, Verdrahtung, Demo-Ablauf (`playDemo`), Sprung auf einen Beat (`goBeat`, auch per URL `?beat=1..6&target=N`).
- `src/data.js`: lädt `public/data/<datei>`, sonst `public/data/placeholder/<datei>` und merkt sich, welche Dateien Platzhalter sind oder fehlen. `loadGrid()` liest `grid.json` und die Binärdateien, falls vorhanden.
- `src/model.js`: Modell aus den Dateien, Position auf einer Route zu einer Zeit (`onTrack`), Aufenthaltsdauer, Zeilen der Zielwahl, Dosis.
- `src/sim.js`: Zustand eines EVA-Laufs (`st`), Crew-Position, Rückkehrgrenze nach Regel B, Stufen.
- `src/map.js`: Mars-CRS, Orthofoto, Ebenen (Curiosity-Spur, Schutzzonen schraffiert, Rückkehrbereich, Routen, Marker, Crew).
- `src/ui.js`: alle Panels der Konsole. `src/crew.js`: Crew-Panel mit den drei Ansichten. `src/beats.js`: Beat-Titel, englische Untertitel, Ansicht je Beat. `src/format.js`: Zahlenzellen, Quellen-Chips, Escaping.
- `src/styles/console.css` (aus dem Sketch), `src/styles/app.css` (Leaflet, Marker, Zielwahl, Platzhalter-Ansichten), Schriften in `src/assets/fonts/`.
- `src/boxwork-path.js`: Curiositys Wegpunkte der Boxwork-Kampagne, nur noch Eingabe für das Platzhalter-Skript.
- `scripts/make-placeholder-data.mjs`: schreibt Platzhalterdateien im Format des Datenvertrags nach `public/data/placeholder/` (echt: Stations- und Spurpositionen aus Curiositys Wegpunkten; Platzhalter: Habitat, Zonen, gerade Routen ohne Hang, Sonnenuntergang, Sol).
- `npm install`, dann `npm run dev` (Entwicklung), `npm run build` (nach `dist/`), `npm run preview` (Build ansehen, Port 4173), `npm run data:placeholder` (Platzhalterdaten neu schreiben).
- Echte Dateien kommen nach `public/data/` (gleiche Namen wie im Datenvertrag) und haben Vorrang vor den Platzhaltern. Der Platzhalter-Ordner bleibt, bis alle Dateien echt sind.
- Das Orthofoto liegt im Repo (`public/maps/ortho_gale_1m.jpg` und `.json`, Entscheidung vom 14.11.2026). Neu erzeugen nur bei geändertem Ausschnitt mit `../pipeline/ortho_overlay.py` (siehe `../pipeline/README.md`). Fehlt es, zeigt die Karte einen Hinweis statt eines Fehlers.
- Deployment: Jeder Push auf `main` baut und veröffentlicht die App auf GitHub Pages (`../.github/workflows/deploy-pages.yml`, Node 22, `npm ci`, `npm run build`).

## Umsetzung
- Lies vor der Implementierung `../docs/architecture.md` und `../shared/data-contract.md`.
- Kein Backend: Alle Daten kommen als statische Dateien (GeoJSON, JSON, Binär-Grid). Bilder nur zur Anzeige, nie Zahlen aus PNGs lesen.
- Mars-Distanzen nur mit `map.distance()`; `latlng.distanceTo()` und `L.circle` rechnen mit dem Erdradius. Kreise und Zonen als Polygone zeichnen.
- Offline lauffähig: Leaflet gebündelt, Schriften lokal, kein CDN, keine verlinkten Bilder.
- Datenzugriff (`data.js`), Rechenlogik (`model.js`, `sim.js`) und Darstellung (`map.js`, `ui.js`, `crew.js`) bleiben getrennt.
- Berücksichtige Ladezustände, leere Ergebnisse, Fehler und verständliche Eingaben.
- Lege keine Geheimnisse im Browser-Code ab.
- Wortlaut auf dem Bildschirm: „Habitat control“, klare Worte wie „Head home now“, nie „validated“, sondern „compared with Curiosity“.
