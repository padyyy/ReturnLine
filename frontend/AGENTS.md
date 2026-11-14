# Frontend

## Stand und Zweck
- Vorgesehener Bereich für Benutzeroberfläche und Darstellung.
- Statische Web-App mit Vite 7.3.7 und Leaflet 1.9.4, kein UI-Framework, GitHub Pages. Sprache: JavaScript (Entscheidung des Tech Leads am 14.11.2026).
- Eine Seite: die Habitat-Konsole mit eingebettetem, schreibgeschütztem Crew-Display. Inhalt und Demo-Drehbuch: `../docs/mission-scenario.md`, Design: `../docs/preparation/design-brief.md`.
- Design-Sketch (14.11.2026, alle sechs Beats, synthetische Daten): `../docs/design/habitat-console-sketch.html`, Erläuterung und übertragbare Tokens in `../docs/design/README.md`. Vorlage für Layout, Zustände und Wortlaut, kein Code zum Übernehmen.
- Stand 14.11.2026 (Meilenstein „Der Punkt wandert über das echte Orthofoto“): Karte mit Mars-CRS, Orthofoto-Overlay und einem Punkt, der Curiositys Wegpunkte der Boxwork-Kampagne abfährt (1,5 km/h, Zeitraffer ×60). Noch keine Konsole.

## Einstiegspunkte und Befehle
- `index.html` (Kopfband, Kartenfläche), `src/main.js` (Mars-CRS, Overlay, Animation), `src/boxwork-path.js` (Demo-Pfad, Platzhalter bis zur Route aus der Engine), `src/style.css` (Tokens aus `../DESIGN.md`), `vite.config.js` (`base: './'` für GitHub Pages).
- `npm install`, dann `npm run dev` (Entwicklung), `npm run build` (nach `dist/`), `npm run preview` (Build ansehen, Port 4173).
- Das Orthofoto liegt im Repo (`public/maps/ortho_gale_1m.jpg` und `.json`, Entscheidung vom 14.11.2026). Neu erzeugen nur bei geändertem Ausschnitt mit `../pipeline/ortho_overlay.py` (siehe `../pipeline/README.md`). Fehlt es, zeigt die Karte einen Hinweis statt eines Fehlers.
- Deployment: Jeder Push auf `main` baut und veröffentlicht die App auf GitHub Pages (`../.github/workflows/deploy-pages.yml`, Node 22, `npm ci`, `npm run build`).

## Umsetzung
- Lies vor der Implementierung `../docs/architecture.md` und die vereinbarten Schnittstellen in `../shared/`, soweit vorhanden.
- Kein Backend: Alle Daten kommen als statische Dateien (GeoJSON, JSON, Binär-Grid). Bilder nur zur Anzeige, nie Zahlen aus PNGs lesen.
- Mars-Distanzen nur mit `map.distance()`; `latlng.distanceTo()` und `L.circle` rechnen mit dem Erdradius.
- Offline lauffähig: Leaflet gebündelt, Schriften lokal, kein CDN, keine verlinkten Bilder.
- Halte Datenzugriff, Darstellungslogik und UI-Komponenten nachvollziehbar getrennt.
- Berücksichtige Ladezustände, leere Ergebnisse, Fehler und verständliche Eingaben.
- Lege keine Geheimnisse im Browser-Code ab.
- Dokumentiere beim Einrichten Installation, Start und passende Prüfungen in der Projekt-README.
- Ergänze hier die tatsächlichen Einstiegspunkte und Befehle, sobald sie existieren.
