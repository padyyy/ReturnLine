# Projektdaten

- Bisher existiert nur `.gitkeep`; Datenformate und Verarbeitung sind noch nicht festgelegt.
- Verwende diesen Ordner für kleine, versionierbare Beispieldaten und dokumentierte Datenstrukturen.
- Große Rohdatensätze bleiben außerhalb des Repositories, beispielsweise im lokalen Arbeitsbereich unter `../../../data/raw/`.
- Beachte die bestehende `.gitignore`, bevor du Dateien hinzufügst.
- Dokumentiere Herkunft, Lizenz, Format, Einheiten und gegebenenfalls Koordinatensystem in `../docs/data-sources.md`.
- Halte erzeugte Daten von Originaldaten getrennt und beschreibe reproduzierbare Verarbeitungsschritte, sobald vorhanden.

## Kartenebenen (`layers/`)
- `layers/layers.json` listet Karten für die Konsole (Pfad relativ zur Datei, Band, Einheit, Farbskala, Deckkraft; bei CSV optional `radius_m` und `columns` mit Name und Stil je Spalte). GeoTIFFs und CSVs, die direkt in `layers/` liegen, werden ohne Eintrag übernommen; eine `<name>.layer.json` daneben setzt Name, Einheit, Farben und Suchradius.
- Seit 15.11.2026 (Branch `newData`) liegen hier `gale_dem_1000x1000_current.csv` (Höhe, 1 m), `boxwork_protection_mask_50m.csv` (Maske 0/1, 1 m) und `gale_orthophoto_25cm_1km_lat-4.8106_lon137.3807.tif` (25 cm), je 1 km um die A*-Basis; alle drei stehen in `layers/layers.json`.
- `../pipeline/map_layers.py` legt jede Karte mit GeoMapper auf das Konsolen-Raster; danach `../pipeline/check_alignment.py`. GeoTIFFs selbst bleiben unversioniert (`*.tif` in `.gitignore`).
