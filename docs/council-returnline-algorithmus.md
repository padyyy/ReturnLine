# Council: ReturnLine-Algorithmus

Stand: 14.11.2026. Drei unabhängige KI-Perspektiven (Routing, Sicherheitsprüfung, Umsetzung), Gegenprüfung durch den Vorsitz und Synthese. **Empfehlung, keine beschlossene Architekturänderung.** Auftrag: mögliche Lösungen diskutieren; keine Implementierung.

## Ausgangslage

Lokal auf Branch `A-star` existieren `backend/astar.py`, `backend/terrain_costs.py` und Tests. A* berechnet einzelne Pfade; TerrainCell-Merkmale werden in gewichtete Kosten umgewandelt. Ein integriertes Rückkehrzeitfeld und ein konkreter Grid-Vertrag fehlen im geprüften Stand. Die dokumentierte C#-Engine ist Planung. Parallel erschien `backend/grid_demo.py`, eine synthetische Darstellung, keine Missionsintegration.

## Diskussion der Alternativen

| Ansatz | Stärke | Einwand | Council-Empfehlung |
|---|---|---|---|
| A* je Ausgangszelle | Vorhandener Code, einzelne Zielrouten | Wiederholte Suche für jede Zelle des Rückkehrfelds | Für Einzelrouten und Vergleichsprüfungen behalten |
| Reverse Dijkstra | Ein Lauf liefert Rückkehrkosten und Pointer für alle erreichbaren Zellen | Benötigt korrekt umgekehrte Kanten und echte Zeitkosten | Kern des MVP |
| Gewichteter Score für Zeit, Schutz, Wissenschaft | Einfach zu formulieren | Ein Gewicht kann Schutz gegen Zeit verrechnen; Score ist keine Gehzeit | Keine globale Missionsentscheidung auf dieser Basis |
| Ein lexikografisches Label je Zelle | Klare Reihenfolge der Ziele | Minimaler Zoneneingriff kann Zeitbudget überschreiten; zulässige Alternative geht verloren | Für Schutzminimierung unter wechselndem Budget unzureichend |
| Pareto-Labels für Zeit und Zonenmeter | Auswahl geringsten Eingriffs unter aktuellem Budget | Mehr Speicher, komplexere Pointer; Funk erzeugt weitere Zustände | Spätere Erweiterung bei explizitem Bedarf |
| Neue C#-Implementierung | Entspricht ursprünglicher Teamplanung | Zweiter Implementierungspfad neben vorhandenem Python | Nur mit belegtem Lieferfortschritt oder Teamvorgabe priorisieren |

## Austausch und Gegenprüfung

**Routing:** „Wir brauchen ein Rückkehrfeld, also Reverse Dijkstra. A* bleibt für einzelne Strecken sinnvoll.“

**Umsetzung:** „Dafür zuerst den bestehenden Python-Pfad erweitern. Sprache und Algorithmus sind getrennte Entscheidungen; eine Portierung erzeugt noch keine bessere Rückkehrrechnung.“

**Sicherheitsprüfung:** „Das Feld muss Zeit enthalten. Die bisherigen Gewichte für Rauigkeit und Datenqualität sind keine belegten Gehzeitfaktoren. Und eine schnelle Route kann die Funkregel verletzen.“

**Routing nach Gegenprüfung:** „Zwei Felder können Vermeidbarkeit und schnellste Rettung beantworten. Sie minimieren aber nicht automatisch die Zonenmeter unter einer Deadline. Dafür wären mehrere nichtdominierte Labels nötig.“

**Vorsitz:** „Der MVP bekommt eine präzise begrenzte Aussage: zonenfrei zurück, solange rechtzeitig möglich; sonst schnellster geprüfter Notrückweg mit Override. Die globale Fläche beschreibt zunächst Gelände und Zeit, solange Funk nicht flächendeckend in der Suche berücksichtigt ist.“

Diese Aussagen sind verdichtete Positionsdarstellungen des Councils, keine Nutzer- oder Teamzitate.

## Empfohlener MVP

1. **Passierbarkeit separat bestimmen.** NoData, harte Geländegrenzen und Gratquerungen sperren Übergänge beziehungsweise Zellen. Ein schmaler Grat darf beim Vergröbern nicht verschwinden. Diagonalen dürfen gesperrte Ecken nicht schneiden.
2. **Gehzeit explizit modellieren.** Kantenzeit = Weglänge / angenommene Geschwindigkeit; Steigungsfunktion und etwaige Rauigkeitsfaktoren separat deklarieren und per Sensitivität prüfen. Absolute Höhe ist keine Anstrengungsstrafe. Aus einem Dimensionsscore werden durch Umbenennen keine belastbaren Sekunden.
3. **Zwei Rückkehrfelder erzeugen.** `T_avoid`: Schutzzonen gesperrt. `T_allow`: Schutzzonen erlaubt, dieselben harten Geländegrenzen bleiben aktiv. Beide enthalten ausschließlich Gehzeit und passende Rückweg-Zeiger. Diese Sperrvariante ist ein Vorschlag zur Präzisierung der bisher geplanten Strafkostenvariante.
4. **Budget anwenden.** In einheitlichen Zeiteinheiten: `B(t) = min(60 min, verbleibende nutzbare Lebenserhaltung, Zeit bis Sonnenuntergang minus expliziter Puffer)`. Reserve genau einmal berücksichtigen. Die 60-min-Auslegung muss vorher geklärt werden (siehe unten).
5. **Route auswählen und beurteilen.** Ist `T_avoid <= B`, zonenfreien Kandidaten prüfen. Andernfalls bei `T_allow <= B` einen Notfallkandidaten mit nötigem Override prüfen. Beide Zeitprüfungen sind notwendig, ersetzen aber die vollständige Funk- und Missionsprüfung nicht. ABORT erlaubt einen Schutzzonen-Override, hebt aber keine harten Gelände-, Daten- oder Zeitgrenzen auf. Ein gescheiterter Kandidat beweist nicht, dass keine andere sichere Route existiert.
6. **Browser bleibt Anzeige.** Felder und vorberechnete Routen laden; Rückwege über Pointer verfolgen, Budget und Anzeige aktualisieren. Keine Suche im Browser.

### Wichtige Richtungsfalle

Der vorhandene A* verwendet bereits gerichtete Kosten: `w(u,v) = Entfernung(u,v) * Kosten(v)`. Deshalb ist selbst ohne Bergauf-/Bergabmodell ein normaler Vorwärtslauf vom Habitat nicht allgemein korrekt für Zeiten zum Habitat.

Bei Reverse Dijkstra gilt für eine ursprüngliche Kante `u -> v`: Wenn `v` bekannt ist, relaxiere `T(u)` mit `w(u,v) + T(v)` und setze den Rückweg-Zeiger von `u` auf `v`. Nicht stattdessen `w(v,u)` verwenden.

### Verletzung und 60-Minuten-Regel

Bei einer überall gleich halbierten Geschwindigkeit und unverändertem Graphen gilt `T_injured = 2 * T_normal`; der schnellste Pfad ändert sich dann nicht. Das ist eine Modellannahme, keine Rettungsvalidierung. Ändern sich Passierbarkeit, Funkzulässigkeit oder nur einzelne Kanten, reicht globales Skalieren nicht.

Die Produktbeschreibung begründet die 60 Minuten mit der Rettung einer handlungsunfähigen Person. Deshalb muss das Team entscheiden, welches Rettungsmodell diese Regel prüft. Nominale Rückkehrzeit und angenommene Rettungszeit getrennt behandeln. Bei unterschiedlicher Auslegung ist die Zone die Schnittmenge der jeweiligen Bedingungen, nicht einfach ein einzelnes Minimum gegen nominale Zeit.

### Funkregel

Eine Funklücke ist ein zusammenhängender Zeitabschnitt entlang eines Pfads, kein lokaler Zellpreis. Für den MVP die festen Demorouten vollständig prüfen, auch die verletzungsbedingt längeren Funklücken. Die Fläche bis dahin als zeit-/geländebasierte Erreichbarkeit kennzeichnen. Allgemeines funkzulässiges Routing benötigt zusätzlichen Suchzustand; einfach den kürzesten unzulässigen Weg zu verwerfen ist keine vollständige Lösung.

### Schutzzonen: ehrliche Grenze

Bei 60 Minuten Budget können 50 Minuten mit 100 Zonenmetern gegenüber 40 Minuten mit 500 Zonenmetern der Schutzpriorität besser entsprechen. `T_allow` würde die zweite Route wählen. Soll das System die erste garantieren, braucht es budgetabhängige Mehrzielsuche, etwa Pareto-Labels `(Zeit, Zonenmeter)` mit labelabhängigen Rückweg-Zeigern. Das Schutzmaß selbst (Meter, Fläche, bestimmte Zonen) muss das Team festlegen.

## Datenvertrag und Prüfungen vor Integration

Der vorgeschlagene Vertrag in `shared/` muss Rasterausdehnung, Projektion, Zellgröße, Zeilenrichtung, Geotransformation, Einheiten, Byte-Reihenfolge und Pointerkodierung festlegen. NoData, gesperrt, nicht erreichbar und Habitat brauchen unterscheidbare Zustände; außerdem Modellparameter und Variantenkennung exportieren. Rastergrenzen sind keine Evidenz für sichere Wege außerhalb des Ausschnitts.

Vor Integration gezielt prüfen: asymmetrisches Zwei-Zellen-Beispiel; Feldwerte gegen Punkt-zu-Punkt-Suche auf kleinen Rastern; Pointer enden ohne Schleife am Habitat und ihre summierten Zeiten stimmen; `T_allow <= T_avoid` bei identischen sonstigen Bedingungen; Grenzen/NoData/Grate/Diagonalen; Verletzungsfaktor; Budgetgrenzen und Reserve; Funkprüfung beider Demovarianten. Das sind vorgeschlagene Prüfungen für die neue Funktion, noch keine durchgeführten Tests des Rückkehrfelds.

## Offene Entscheidungen

- Zeitfunktion und Annahmen, Rettungsmodell für die 60 Minuten, Reserve und Sunset-Puffer.
- Schutzzonenradius und Bedeutung der minimalen Kontamination.
- Python als kurzfristiger Lieferpfad versus konkret vorhandener C#-Fortschritt.
- Globale zeitbasierte Fläche versus vollständige Funkzulässigkeit.
- Demotiming: Bei genau 6 Stunden nutzbarer Lebenserhaltung bleiben um 4:45 noch 75 Minuten. Die 60-Minuten-Zone schrumpft durch diese Grenze erst ab 5:00. Eine zusätzliche Backup-Stunde verschiebt das erneut; der Zeitsprung allein löst die Dramaturgie nicht.

## Nachweise und Grenzen

Grundlage: `../PRODUCT.md`, `architecture.md`, `mission-scenario.md`, `../backend/AGENTS.md`, `../backend/astar.py`, `../backend/terrain_costs.py`, `../shared/AGENTS.md`. Keine externe Prüfung von NASA-Regeln oder wissenschaftliche Kalibrierung in dieser Diskussion. Vorhandene Sicherheitsschwellen werden als Projektvorgaben behandelt.

Der Umsetzungsberater meldet 12 bestandene Tests mit `python3 -m unittest discover -s backend -v`; das prüft vorhandenen A* und Geländekosten, kein noch zu bauendes Rückkehrfeld. Keine Produktdateien implementiert oder bestehende Architekturentscheidungen überschrieben. Beitragsereignisse liegen in `ai-log/`.
