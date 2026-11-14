# Backend

## Stand und Zweck
- **Es gibt keinen Server und keine API.** Entschieden am 13.11.2026 beim Konzeptabgleich (siehe `../docs/architecture.md`). Die Web-App ist statisch und läuft auf GitHub Pages.
- Die C#-Arbeit ist eine **Offline-Routing-Engine** (Dijkstra vom Habitat, Rückweg-Zeiger, zwei Varianten, Routen, Vergleich mit Curiosity). Sie schreibt Dateien, die das Frontend nur liest.
- Lokal importiert: `geoMapper/mars_mapping/`, eine Python-Bibliothek für Mars-CRS, GeoTIFF-/CSV-Import und Matrixexport; keine Routing-Engine. Demo-Dateien entfernt. Einstieg: `geoMapper/README.md`; Integrationsbedarf: `geoMapper/INTEGRATION.md`.

## Umsetzung
- Ausgaben der Engine folgen der Grid-Spezifikation in `../shared/` (Ausschnitt, 10-m-Zellen, Zeilenordnung, float32 little-endian, Kodierung der Rückweg-Zeiger, Dateinamen).
- Keine Laufzeit-Abhängigkeit des Frontends von diesem Code; der Browser rechnet keine Routen.
- Ergänze bei Implementierungen relevante Tests und dokumentiere Build, Aufruf und Prüfungen.
- Halte diese Datei mit tatsächlichen Einstiegspunkten und Abhängigkeiten aktuell.
