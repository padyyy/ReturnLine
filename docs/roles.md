# Hackathon – Roles & Responsibilities

## Team Coordinator – Paul
- Monitor the schedule and milestones.
- Organize short team meetings.
- Track task progress on the Kanban board.
- Identify blockers early and coordinate priorities with the team.

## Tech Lead – Magnus
- Define the software architecture and interfaces.
- Coordinate technical decisions with the team.
- Ensure clean and easily integrable solutions.

## Integration & QA – Magnus & Paul
- Regularly integrate software components.
- Test features and interfaces.
- Prioritize bugs and ensure demo stability.

## Developers – Magnus, Paul, Alex & Michael
- Independently implement assigned GitHub Issues.
- Submit changes through branches and pull requests.
- Test implemented features and report issues early.
- Keep task statuses up to date on the Kanban board.

## Developer Responsibilities

Updated on 2026-11-13 after the concept merge: the C# work is an **offline routing engine** (Dijkstra from the habitat, return pointers, two variants, routes, Curiosity comparison), not live A\* in a backend. See `docs/architecture.md`.

### Alex
- Frontend Development – JavaScript (decided by the tech lead on 2026-11-14)
- Presentation (pitch, video)
### Michael
- Routing Engine (offline Dijkstra) – C#
- Data Analysis & Preparation – Python
- Owns the fallback: scikit-image `MCP_Geometric` if no grid exists by Saturday 18:00
### Paul
- Routing Engine (offline Dijkstra) – C#; writes the one-page grid spec in hour 1
- Flexible Support Across Development Tasks
### Magnus
- Frontend Development – JavaScript
- Data Analysis & Preparation – Python
### Patrick
- Flexible frontend and data work where needed
- Hour 1: subtitles for the six demo beats, project page skeleton and source list, then the demo-button timeline

## First Hour (Sat 10:30–11:30)
- **Paul:** grid spec (bounding box, 10 m cells, row order, float32 little-endian, return-pointer encoding, file names).
- **Magnus & Michael:** crop the DEM, compute 10 m slope, export one orthophoto overlay; then check that the stops are reachable under the ridge rule.
- **Alex:** console layout against fake JSON, with a dot moving along a hardcoded line.
- **Patrick:** subtitles, project page skeleton, source list, demo-button timeline.
