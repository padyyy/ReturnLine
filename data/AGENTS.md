# Projektdaten

- Bisher existiert nur `.gitkeep`; Datenformate und Verarbeitung sind noch nicht festgelegt.
- Verwende diesen Ordner für kleine, versionierbare Beispieldaten und dokumentierte Datenstrukturen.
- Große Rohdatensätze bleiben außerhalb des Repositories, beispielsweise im lokalen Arbeitsbereich unter `../../../data/raw/`.
- Beachte die bestehende `.gitignore`, bevor du Dateien hinzufügst.
- Dokumentiere Herkunft, Lizenz, Format, Einheiten und gegebenenfalls Koordinatensystem in `../docs/data-sources.md`.
- Halte erzeugte Daten von Originaldaten getrennt und beschreibe reproduzierbare Verarbeitungsschritte, sobald vorhanden.

## Kartenebenen (`layers/`)
- `layers/layers.json` listet Karten für die Konsole (Pfad relativ zur Datei, Band, Einheit, Farbskala, Deckkraft). GeoTIFFs, die direkt in `layers/` liegen, werden ohne Eintrag übernommen; eine `<name>.layer.json` daneben setzt Name, Einheit und Farben.
- `../pipeline/map_layers.py` legt jede Karte mit GeoMapper auf das Konsolen-Raster; danach `../pipeline/check_alignment.py`. GeoTIFFs selbst bleiben unversioniert (`*.tif` in `.gitignore`).
