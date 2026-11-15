# Added targets

`points.json` lists positions that become stations with a route in the console:

```json
{ "points": [ { "id": "ridge_contact_north", "name": "Ridge contact north", "lon": 137.3818, "lat": -4.8088, "reason": "why go there" } ] }
```

- Longitude east-positive, latitude in degrees, on the Mars sphere (as everywhere in the console).
- `pipeline/astar_import.py` places each point on the console grid with GeoMapper (`MappingGrid`), routes habitat → point with `backend/astar.py` and times the way with the Tobler model. Run `py pipeline/astar_import.py`, then `.venv/Scripts/python pipeline/check_alignment.py`.
- Easier: the console's Layers → "Add data" panel in `npm run dev` writes this file and runs the pipeline.
- A point inside a protected zone or on ground over 20° gets no route; the console says why.
