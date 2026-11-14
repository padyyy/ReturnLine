# ReturnLine

**Explore Mars. Return Safely. Preserve the Evidence.**

ReturnLine plans and rehearses one crewed EVA (Marswalk) to the boxwork ridges at Mount Sharp in Gale crater on Mars. For every 10 m of the site it shows whether the crew can still get home in time, under four hard safety rules, protected zones for planetary protection and 4–5 science stops along Curiosity's traverse.

Team "Houston, we have a map" · NASA Space Apps Challenge 2026, challenge "Interplanetary Survival Guide: Martian Map" · Local event Heilbronn.

## Repository

| Path | Content |
|---|---|
| `frontend/` | Static web app: habitat console with crew display (Vite, Leaflet 1.9.4) |
| `backend/` | No server. Reserved, see `backend/AGENTS.md` |
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

Follows once the tech lead has fixed the stack at kickoff.
