# GeoMapper

- Offline-Bibliothek in `mars_mapping/`, aus lokalem Branch `geoMapper` übernommen; kein Server und keine Routinglogik.
- Mars-CRS und Zellzuordnung: `core.py`, Rasterdefinitionen: `local_grid.py` / `fixed_grid.py`, gemeinsame Matrizen: `matrix.py`.
- Integration mit Routing: `../mapper_route.py`, Anleitung: `../MAPPER_ROUTING.md`.
- TIFF-Abtastung ist Nearest Neighbor, CSV nutzt expliziten Radius. Keine Einheitenkonvertierung oder automatische Interpretation von Layernamen.
- Quelldaten unverändert lassen; keine Erd-CRS für Mars verwenden. Exportverträge des Frontends werden durch diese lokale Routingintegration nicht geändert.
