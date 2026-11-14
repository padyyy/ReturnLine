**Ziel:** Schnell parallel entwickeln, Änderungen nachvollziehbar integrieren und `main` während des zweitägigen Hackathons lauffähig halten.

## 1. Commit-Konvention

Wir orientieren uns an **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**:

```text
<type>(<bereich>): <kurze Beschreibung>
```

Der Bereich ist optional. Commit-Messages schreiben wir einheitlich **auf Englisch**.

| Typ | Wann verwenden? | Beispiel |
|---|---|---|
| `feat` | Neue Funktion | `feat(routing): add Dijkstra time-to-base grid` |
| `fix` | Fehlerbehebung | `fix(safety): correct return time calculation` |
| `docs` | Dokumentation | `docs: describe grid file format` |
| `test` | Tests | `test(routing): cover blocked terrain cells` |
| `refactor` | Umstrukturierung ohne Funktionsänderung | `refactor(frontend): extract map controls` |
| `chore` | Projektpflege | `chore: update gitignore` |

**Regeln:** Kleine, thematisch zusammengehörige Commits; keine Zugangsdaten oder großen Rohdatensätze committen. Vor dem Commit `git status` und Änderungen prüfen.

## 2. Branches und Pull Requests

- `main` = **stabiler, vorführbarer Stand**. Möglichst keine direkten Pushes.
- Für jede Aufgabe einen kurzen Branch erstellen: `feat/map-view`, `feat/dijkstra`, `feat/return-to-base`, `fix/grid-coordinates`, `docs/setup`.
- Kurze Branches spätestens im nächsten oder übernächsten Sprint integrieren. Keine tagelangen Parallelversionen.
- Gemeinsame JSON-Schnittstellen und Koordinatenformate **vor** paralleler Entwicklung festlegen.

**Typischer Ablauf im Terminal:**

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/dijkstra

# Code ändern und testen
git add .
git commit -m "feat(routing): add initial Dijkstra grid search"
git push -u origin feat/dijkstra
```

Danach auf GitHub einen **Pull Request (PR) nach `main`** öffnen, einen Reviewer anfordern, Feedback einarbeiten und nach Freigabe möglichst per **Squash and merge** integrieren. Den Feature-Branch danach löschen.
