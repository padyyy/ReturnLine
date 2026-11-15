# ReturnLine

**Explore Mars. Return Safely. Preserve the Evidence.**

ReturnLine plans and rehearses one crewed EVA (Marswalk) to the boxwork ridges at Mount Sharp in Gale crater on Mars. For every 10 m of the site it shows whether the crew can still get home in time, under four hard safety rules, protected zones for planetary protection and 4–5 science stops along Curiosity's traverse.

Team "Houston, we have a map" · NASA Space Apps Challenge 2026, challenge "Interplanetary Survival Guide: Martian Map" · Local event Heilbronn.

## Repository

| Path | Content |
|---|---|
| `frontend/` | Static web app: habitat console with crew display (Vite, Leaflet 1.9.4) |
| `backend/` | No server. Offline Python tools: GeoMapper, the A* router and a radiation dose model (`backend/MAPPER_ROUTING.md`, `backend/AGENTS.md`). The console's routes come from the A* through `pipeline/astar_import.py` |
| `pipeline/` | Offline Python data pipeline, e.g. the orthophoto overlay; see `pipeline/README.md` |
| `data/` | Small, versioned sample data and data structures |
| `shared/` | Data contracts, e.g. the grid spec |
| `docs/` | Architecture, mission scenario, data sources, roles, Scrum, Git workflow |
| `docs/preparation/` | Pre-kickoff research and team decision papers (record) |
| `docs/ai-log/` | Shared log of AI contributions, one file per event |
| `.agents/skills/` | Team skills for AI agents: state sync, contribution log |

Start with `AGENTS.md` (rules for developers and AI agents), then `docs/mission-scenario.md` and `docs/architecture.md`.

## Prior research and AI use

Before kickoff we chose the challenge and site and researched NASA data sources (see `docs/preparation/`). All code, designs and results were made during the hackathon. AI tools were used for research, planning and coding; details follow on the project page.

## Setup

Needs Node 20 or newer and Python 3.11.

```sh
# web app (the orthophoto overlay is committed in frontend/public/maps/)
cd frontend
npm install
npm run dev
# until the pipeline and the engine deliver data/, the console runs on marked
# placeholder files in public/data/placeholder/ (regenerate: npm run data:placeholder)

# only to regenerate the overlay, e.g. for a new extent
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
.venv/Scripts/python pipeline/ortho_overlay.py
```

Details: `pipeline/README.md` and `frontend/AGENTS.md`.

## Deployment

Every push to `main` builds `frontend/` and publishes it to GitHub Pages (`.github/workflows/deploy-pages.yml`), at https://padyyy.github.io/ReturnLine/. One-time repo setting: Settings > Pages > Build and deployment > Source: GitHub Actions. The workflow can also be started by hand under Actions.
