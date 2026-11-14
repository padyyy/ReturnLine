# GeoMapper

- Offline-Python-Bibliothek in `mars_mapping/`; kein Server und keine API.
- `README.md` beschreibt Abhängigkeiten und öffentliche Module.
- `INTEGRATION.md` vergleicht die Bibliothek mit dem aktuellen Frontend-Vertrag und benennt noch nicht implementierte Schritte.
- Kern aus der ZIP übernommen; affine Array-Transformation in `matrix.py` auf `@` aktualisiert; keine Demo-Dateien oder produktive Rasterkonfiguration enthalten.
- Änderungen am Export erst mit `../../shared/data-contract.md` und der abgestimmten Grid-Spezifikation abgleichen. Kein NPZ-Import oder Python zur Laufzeit im Browser voraussetzen.
