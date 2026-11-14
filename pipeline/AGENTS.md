# Pipeline

## Stand und Zweck
- Offline-Datenpipeline in Python (Komponente 1 in `../docs/architecture.md`). Erzeugt Bild-Overlays mit JSON-Grenzen und später Grids für Frontend und Routing-Engine.
- Ablageort `pipeline/` ist ein Vorschlag vom 14.11.2026; die Struktur entscheidet der Tech Lead.
- Mapping-Vorbereitung: `mapping_grid.py` adaptiert das vorhandene echte Grid ohne neue Projektion; `mapping_bridge.py` liefert JSON-Abfragen und den Hang-Layer-Export. Schnittstelle und offene Frontend-Arbeit: `MAPPING.md`. Keine Änderungen an Routing oder `frontend/src/`.
- Vorhanden: `ortho_overlay.py` (Orthofoto-Ausschnitt per Range Request, Ausgabe nach `../frontend/public/maps/`). Anleitung, Prüfungen und nächste Schritte: `README.md`.

## Umsetzung
- Python 3.11 in `../.venv/`, Abhängigkeiten in `requirements.txt`. Kein GDAL-Kommandozeilenwerkzeug; rasterio bringt GDAL mit.
- Große Quelldateien nie ins Repo; Fenster per `/vsicurl/` lesen oder nach `../data/raw/` cachen (ignoriert).
- Jede Ausgabe bekommt ein JSON mit Grenzen in Grad, Quelle und Pixelgröße. Bilder nur zur Anzeige; Zahlen als GeoJSON, JSON oder Binär-Grid nach der Grid-Spezifikation in `../shared/`.
- Orthofoto- und DEM-Raster sind gegeneinander versetzt; Grenzen immer aus der jeweiligen Ausgabe übernehmen.
- Neue Skripte und Befehle in `README.md` dokumentieren.
