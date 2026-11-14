# Frontend

## Stand und Zweck
- Vorgesehener Bereich für Benutzeroberfläche und Darstellung.
- Geplant (13.11.2026): statische Web-App mit Vite und Leaflet 1.9.4, kein UI-Framework, GitHub Pages. JavaScript oder TypeScript entscheidet der Tech Lead beim Kickoff.
- Eine Seite: die Habitat-Konsole mit eingebettetem, schreibgeschütztem Crew-Display. Inhalt und Demo-Drehbuch: `../docs/mission-scenario.md`, Design: `../docs/preparation/design-brief.md`.
- Bisher existiert nur `.gitkeep`; Build-System und Startbefehle sind noch nicht eingerichtet.

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
