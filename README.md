# ReturnLine

**Explore Mars. Return Safely. Preserve the Evidence.**

ReturnLine plans and rehearses one crewed EVA (Marswalk) to the boxwork ridges at Mount Sharp in Gale crater on Mars. For every 10 m of the site it shows whether the crew can still get home in time, under four hard safety rules, protected zones for planetary protection and 4–5 science stops along Curiosity's traverse.

Team "Houston, we have a map" · NASA Space Apps Challenge 2026, challenge "Interplanetary Survival Guide: Martian Map" · Local event Heilbronn.

## Repository

| Path | Content |
|---|---|
| `frontend/` | Static web app: habitat console with crew display (Vite, Leaflet 1.9.4) |
| `backend/` | No server. Offline Python tools: GeoMapper, the A* router and a radiation dose model (`backend/MAPPER_ROUTING.md`, `backend/AGENTS.md`). The console's routes come from the A* through `pipeline/astar_import.py` |
| `backend/geoMapper/` | [GeoMapper algorithm and API](backend/geoMapper/README.md): align Mars GeoTIFFs and CSV measurements on a shared grid |
| `pipeline/` | Offline Python data pipeline, e.g. the orthophoto overlay; see `pipeline/README.md` |
| `data/` | Small, versioned sample data and data structures |
| `data/mars_mapper_preperation/` | [Reference-centred crop and export tool](data/mars_mapper_preperation/README.md): the desktop and CLI tool used to prepare our map cutouts, built on the same mapping foundation as GeoMapper |
| `shared/` | Data contracts, e.g. the grid spec |
| `docs/` | Architecture, mission scenario, data sources, roles, Scrum, Git workflow |
| `docs/preparation/` | Pre-kickoff research and team decision papers (record) |
| `docs/ai-log/` | Shared log of AI contributions, one file per event |
| `.agents/skills/` | Team skills for AI agents: state sync, contribution log |

Start with `AGENTS.md` (rules for developers and AI agents), then `docs/mission-scenario.md` and `docs/architecture.md`.

## GeoMapper and map preparation

[GeoMapper](backend/geoMapper/README.md) is the common spatial foundation for
ReturnLine's offline routing and map pipeline. It keeps the target grid independent
of the source maps: each cell has a defined position on Mars, and each input layer
is sampled at that cell's geographic centre. GeoTIFF coordinates are transformed
into the source CRS before looking up a pixel; CSV measurements use the nearest
point within a specified search radius. The resulting matrices share the same
cell layout. Terrain analysis and A* route search use those matrices in separate
modules.

The [GeoMapper README](backend/geoMapper/README.md) explains the algorithm,
coordinate conventions, grid types, missing-data handling, Python API and limits.
Production consumers include `backend/mapper_route.py`,
`pipeline/time_grid.py`, `pipeline/map_layers.py` and `pipeline/ortho_overlay.py`.

The team used the desktop tool in
[`data/mars_mapper_preperation/`](data/mars_mapper_preperation/README.md) to
crop and export the reference-centred map layers used in the project.
Its `mars_mapper` package uses the same coordinate and sampling algorithms as
GeoMapper, with an additional Tkinter interface and map preview. The saved
[`fixed_grid.json`](data/mars_mapper_preperation/fixed_grid.json) defines the
project reference at **137.3807° E, 4.8106° S**, centred in a **1000 × 1000** grid
with **1 m** cells: a **1 km × 1 km** preparation area. This is a separate grid
from the console's 10 m routing grid.

The preparation tool's **Crop/export data** action exports all
loaded layers onto that fixed grid, including layers hidden in the preview.
Its export engine, `mars_mapper/analysis_export.py`, writes aligned GeoTIFFs,
map PNGs, cropped original CSV points and optional per-cell CSVs, plus a manifest
and summary statistics. Numerical rasters use nearest-neighbour sampling by
default; optional bilinear resampling is available through the CLI. Source files
remain unchanged. The subsequent ReturnLine pipeline produces the static image
and numeric-grid files consumed by the web app.

Start the preparation interface from the repository root with
`python3 data/mars_mapper_preperation/app.py`. Headless exports are available
through `data/mars_mapper_preperation/export_cli.py`. Installation, export options
and output formats are documented in the tool's
[README](data/mars_mapper_preperation/README.md).

## Prior research and AI use

Before kickoff we chose the challenge and site and researched NASA data sources (see `docs/preparation/`). All code, designs and results were made during the hackathon. AI tools were used for research, planning and coding; details follow on the project page.

## Setup

Needs Node 20 or newer and Python 3.11.

```sh
# web app (the orthophoto overlay is committed in frontend/public/maps/)
cd frontend
npm install
npm run dev
# mission files are read from public/data/; setup and data generation are documented below
```

To regenerate the offline overlay, run these commands from the repository root:

```sh
# only to regenerate the overlay, e.g. for a new extent
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
.venv/Scripts/python pipeline/ortho_overlay.py
```

Details: `pipeline/README.md` and `frontend/AGENTS.md`.

## Deployment

Every push to the deploy branch `navigation-view-/-hud` (team decision 2026-11-15) or to `main` builds `frontend/` and publishes it to GitHub Pages (`.github/workflows/deploy-pages.yml`), at https://padyyy.github.io/ReturnLine/. The last push wins. One-time repo setting: Settings > Pages > Build and deployment > Source: GitHub Actions. The workflow can also be started by hand under Actions.
