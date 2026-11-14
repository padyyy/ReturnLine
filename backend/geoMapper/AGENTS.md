# GeoMapper

- Offline-Python-Bibliothek in `mars_mapping/`, aus dem Branch `geoMapper` übernommen; kein Server, keine API und keine Routinglogik.
- `README.md` beschreibt Abhängigkeiten und öffentliche Module; `INTEGRATION.md` vergleicht die Bibliothek mit dem aktuellen Frontend-Vertrag und benennt noch nicht implementierte Schritte.
- Mars-CRS und Zellzuordnung: `core.py`, Rasterdefinitionen: `local_grid.py` / `fixed_grid.py`, gemeinsame Matrizen: `matrix.py` (affine Array-Transformation auf `@` aktualisiert).
- Integration mit Routing: `../mapper_route.py`, Anleitung: `../MAPPER_ROUTING.md`.
- TIFF-Abtastung ist Nearest Neighbor, CSV nutzt expliziten Radius. Keine Einheitenkonvertierung oder automatische Interpretation von Layernamen.
- Quelldaten unverändert lassen; keine Erd-CRS für Mars verwenden.
- Änderungen am Export erst mit `../../shared/data-contract.md` und der abgestimmten Grid-Spezifikation abgleichen. Kein NPZ-Import oder Python zur Laufzeit im Browser voraussetzen; die lokale Routingintegration ändert die Exportverträge des Frontends nicht.
