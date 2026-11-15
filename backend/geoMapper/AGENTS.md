# GeoMapper

- Offline-Bibliothek in `mars_mapping/`, aus lokalem Branch `geoMapper` übernommen; kein Server und keine Routinglogik.
- Mars-CRS und Zellzuordnung: `core.py`, Rasterdefinitionen: `local_grid.py` / `fixed_grid.py`, gemeinsame Matrizen: `matrix.py`.
- Integration mit Routing: `../mapper_route.py`, Anleitung: `../MAPPER_ROUTING.md`.
- TIFF-Abtastung ist Nearest Neighbor, CSV nutzt expliziten Radius. Keine Einheitenkonvertierung oder automatische Interpretation von Layernamen.
- Quelldaten unverändert lassen; keine Erd-CRS für Mars verwenden. Exportverträge des Frontends werden durch diese lokale Routingintegration nicht geändert.
- Offline-Python-Bibliothek in `mars_mapping/`; kein Server und keine API.
- `README.md` beschreibt Abhängigkeiten und öffentliche Module.
- `INTEGRATION.md` vergleicht die Bibliothek mit dem aktuellen Frontend-Vertrag und benennt noch nicht implementierte Schritte.
- Kern aus der ZIP übernommen; affine Array-Transformation in `matrix.py` auf `@` aktualisiert; keine Demo-Dateien oder produktive Rasterkonfiguration enthalten.
- Änderungen am Export erst mit `../../shared/data-contract.md` und der abgestimmten Grid-Spezifikation abgleichen. Kein NPZ-Import oder Python zur Laufzeit im Browser voraussetzen.
