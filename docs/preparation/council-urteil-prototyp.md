# Council-Urteil: Darstellung des ReturnLine-Prototyps

NASA Space Apps Challenge 2026 · Grundlage für die Teamplanung · Stand: 13.11.2026, vom Team am selben Tag angenommen

Markdown-Fassung von `Council-Urteil_Prototyp.pdf`. Der Inhalt ist unverändert. Anmerkungen mit **Stand 14.11.** zeigen, was seitdem umgesetzt oder präzisiert wurde. Die aktuelle Bauplanung steht in `../mission-scenario.md` und `../architecture.md`.

## Wie dieses Urteil entstanden ist

Fünf KI-Berater mit bewusst gegensätzlichen Blickwinkeln (Contrarian, First Principles, Expansionist, Außenseiter, Umsetzer) haben unseren Vorschlag zur Prototyp-Darstellung unabhängig geprüft. Danach haben sich die Antworten anonym gegenseitig begutachtet, und ein Vorsitzender hat alles zusammengefasst. Fakten aus unseren Vorbereitungsdocs haben dabei Vorrang vor Annahmen der Berater.

Geprüft wurde: interaktive EVA-Simulation als Webseite mit Karte, Layern, Stationen, Routenplanung, bewegtem Astronauten, HUD, schrumpfender Rückkehrzone und Event-Menü, sowie die Frage, ob das HUD vor das Unterarm-Display gezogen werden soll.

## 1. Wo der Council übereinstimmt

- **Erst das Demo-Drehbuch, dann die Features.** Das Drehbuch ist das Rückgrat des Projekts, nicht der letzte Punkt auf der Liste. Gebaut wird nur, was im Drehbuch vorkommt.
- **HUD gegen Unterarm-Display ist eine Scheinfrage.** Wir brauchen eine Anzeige-Komponente mit fünf Werten, die zwei verschiedene Optiken bekommen kann.
- **Die schrumpfende Rückkehrzone ist unser stärkstes Bild.** Sie folgt der Form des Geländes, das hat kein Rivale.
- **Im Browser wird keine Route berechnet.** Alles ist vorberechnet, die Webseite schlägt nur nach.
- **Der Vergleich mit Curiosity fehlte bei den Pflichtpunkten.** Er ist unser Unterscheidungsmerkmal. Rover-Fotos und Sonnenstürme hat ein Rivale schon.

## 2. Wo der Council uneins ist

| Frage | Positionen | Urteil |
|---|---|---|
| HUD über Rover-Foto | Pflicht (Expansionist, Außenseiter) gegen streichen (Contrarian, First Principles) | Streichen. Das Foto zeigt den Standort des Rovers, nicht den der Crew. Das ist eine Falle bei Validity. |
| Wer ist die Hauptfigur? | Astronaut (Außenseiter) gegen Leitstand im Habitat (Contrarian) | Beide, mit getrennten Rollen (siehe 4f). |
| Höhepunkt der Demo | Sonnensturm (bisheriger Plan) gegen bewusster ABORT durch eine Schutzzone | ABORT. Beim Sonnensturm ist der Rivale schon. |
| Mehr Umfang (Sprachausgabe, Debrief-Export, Replay) | Expansionist dafür, alle anderen dagegen | Nein. Die Zusammenfassung am Ende ist bereits der Debrief. |
| A\* in C# | Contrarian: streichen, Python reicht | Behalten, aber umwidmen (siehe 4e). |

## 3. Blinde Flecken, die erst die Begutachtung aufgedeckt hat

- **Die Kernmechanik stand im bisherigen Plan fast still.** Das ist der wichtigste Befund. Bei 6 Stunden Lebenserhaltung greift die feste 60-Minuten-Regel viel früher. Die Zone schrumpft also erst in der letzten Stunde, und im damals geplanten Drehbuch endete der Einsatz vorher. → Gelöst durch den Zeitsprung auf EVA-Stunde 4:45 und den Verletzungsfaktor.
- **Die Funkregel braucht eine Sichtlinie.** Das ist echte GIS-Arbeit, und niemand war dafür eingeteilt. Vereinfachung: die Sichtlinie nur für die Routenpunkte prüfen, indem man das Geländeprofil zum Habitat abtastet. Das sind etwa 30 Zeilen Code ohne GIS-Bibliothek.
- **„Keine Gratquerung“ kann unsere eigenen Ziele unerreichbar machen.** Liegen Stopps zwischen den Rücken, kommt man nach den eigenen Regeln nicht hin. Das ist die erste Prüfung am Samstag (Magnus und Michael, nach dem DEM-Zuschnitt). Ist ein Stopp unerreichbar, wird er an den Fuß des Rückens gelegt, und wir sagen das offen.
- **Die Gehgeschwindigkeit ist belegt.** Hier lagen die Gutachter falsch: 2 km/h bzw. 1,5 km/h auf dem Mars und die Apollo-Umwegfaktoren stehen mit Quelle in den Docs. Offen ist nur, wie stark Steigungen bremsen. Dafür setzen wir eine benannte Annahme ein (Tobler-Form, skaliert auf 1,5 km/h) und zeigen einmal, wie sich die Zone bei ±30 % Tempo verändert.
- **Die globale Jury sieht uns nie live.** Projektseite, Video und Demo-Link müssen ohne Erklärung verständlich sein. Dafür brauchen wir Klartext statt Jargon, etwa „Head home now“ statt „TERMINATE“.

## 4. Die Empfehlung

### (a) Interaktive Simulation: Ja, als EVA-Probelauf, nicht als Spiel

- Die Simulation spielt vorberechnete Daten ab.
- Gesteuert wird sie vom Leitstand im Habitat („Habitat control“), nicht von einem Spieler.
- Es gibt kein freies Herumlaufen und keine Punktzahl. Der Instinkt mit Bewegung und ablaufender Zeit ist richtig.

### (b) Anzeige

Das Produkt ist die Konsole im Habitat. Darin steckt eine Crew-Anzeige mit fünf Werten:

1. nächstes Ziel
2. Zeit zur Basis
3. Reserve bis zum Umkehrpunkt
4. Lebenserhaltung, als Annahme gekennzeichnet
5. Zeit bis Sonnenuntergang

Die Strahlung erscheint als aufsummierte Dosis in der Konsole (0,64 mSv/Tag nach Hassler et al. 2014), nicht als feste Zahl in der Crew-Anzeige. Das Unterarm-Display ist eine zweite Optik derselben Komponente nach dem Feature-Freeze, etwa 30 Minuten CSS.

### (c) Neues Demo-Drehbuch

1. **Plan:** „Route planen“ zeigt eine Route um die Schutzzonen, alle Regeln grün, GO. Curiosity-Spur und Vergleichszahl (Leave-one-out) sind eingeblendet.
2. **Zeitsprung:** Der Autopilot (x60) springt sichtbar beschriftet auf EVA-Stunde 4:45 an Stopp 4. Die Zone liegt noch auf der 60-Minuten-Linie.
3. **Die Zone schrumpft:** Jetzt bindet die Lebenserhaltung. Die Zone schrumpft entlang des Geländes, bei x60 dauert das etwa 30 Sekunden. Alternative: Der Sonnenuntergang aus den REMS-Zeiten bindet.
4. **Abweichung abgefangen:** Die Crew driftet auf eine Bohrloch-Zone zu. Die Konsole warnt, der Leitstand leitet um und sieht den Umweg in Minuten.
5. **Crewmitglied verletzt:** Das Gehtempo halbiert sich, als Annahme gekennzeichnet. Das ist ein Faktor auf dem Raster, keine Neuberechnung. Die Zone bricht in einem einzigen Moment ein. Nur der Weg durch die Schutzzone passt noch in die Reserve: ABORT.
6. **Bewusster Override:** Der Leitstand bestätigt, das Log hält den Eintritt fest, etwa „Zone entered · Drill site X · 140 m · reason: ABORT“. Die Crew kommt heim, es folgt die Bilanz (Meter in Schutzzonen, ausgelöste Regeln) und der Slogan.

Jeder Beat bekommt einen einzeiligen englischen Untertitel. Das 30-Sekunden-Video besteht aus den Beats 3, 5 und 6.

### (d) Neue Liste

| Pflicht | Danach, in dieser Reihenfolge | Streichen |
|---|---|---|
| Orthofoto, Schutzzonen und Stopps auf der Karte | 1. Optik für das Unterarm-Display | HUD über Rover-Foto |
| Raster „Zeit zur Basis“ in zwei Varianten: Zonen bestraft und Zonen erlaubt | 2. „Was wäre wenn“-Klick des Leitstands | freies Steuern des Astronauten |
| Rückkehrzone als engste der drei Grenzen: 60 Minuten, Lebenserhaltung, Sonnenuntergang | 3. Sonnensturm-Event (SEP WATCH, SEP ALERT) | Routenberechnung live im Browser |
| Autopilot mit Zeitsprung | 4. Fußspur | flächige Sichtlinien-Berechnung |
| Crew-Anzeige, Urteil und Log | 5. Rover-Foto als Vorschau im Log | das Wort „validiert“ |
| Event „verletzt“ mit protokolliertem ABORT-Override | 6. ein Satz Sprachausgabe | Debrief-Export, Replay |
| Demo-Knopf mit Untertiteln | | |
| Vergleich mit Curiosity | | |
| Funk-Check entlang der Route | | |

### (e) C#-Rolle

Paul und Michael behalten die Routing-Engine und machen daraus einen Dijkstra ab dem Habitat. Das ist A\* ohne Heuristik, also fast derselbe Code. Die Engine läuft offline und liefert:

- das Raster „Zeit zur Basis“ samt Rückweg-Zeigern, in zwei Varianten (Zonen bestraft, Zonen erlaubt),
- die Routen zwischen den Stopps,
- den Leave-one-out-Vergleich mit Curiosity.

Damit gehört das Unterscheidungsmerkmal dem C#-Team. Liegt am Samstag um 18:00 kein Raster vor, rechnet Michael es mit `MCP_Geometric` (scikit-image) in Python, und Paul übernimmt die QA des Drehbuchs.

**Stand 14.11.:** Das Rasterformat legt Paul in der ersten Stunde in einer einseitigen Grid-Spezifikation fest (Ausschnitt, 10-m-Zellen, etwa 470 × 470, Zeilenordnung, float32 little-endian, Kodierung der Rückweg-Zeiger, Dateinamen). Ablage in `shared/`.

### (f) Astronaut oder Leitstand?

Die Geschichte gehört der Crew, die Entscheidungen trifft der Leitstand.

- Der Pitch beginnt mit der schrumpfenden Zone.
- Zweiter Satz: „Wer das sieht, sitzt im Habitat und entscheidet.“
- Erklärsatz für die Schutzzonen: „Astronauten tragen Erdmikroben. Ein Schritt über ein Bohrloch kann es verseuchen oder einen Lebensfund vortäuschen.“

## 5. Das Eine, das wir zuerst tun sollten

Das Drehbuch schreiben: eine Seite, sechs Beats. Pro Beat festhalten, was auf dem Bildschirm steht, welche Zahl gezeigt wird, aus welcher Datei sie kommt und welche Simulationszeit gilt, dazu ein englischer Untertitel. Ab Kickoff dient es als Bauliste, aus der Paul die Kanban-Issues ableitet.

**Stand 14.11.:** Aufgabe von Alex und Patrick laut Kickoff-Checkliste. Die sechs Beats stehen in `../mission-scenario.md`. Die Tabelle pro Beat (Bildschirm, Zahl, Datei, Simulationszeit, Untertitel) gehört als eigene Datei daneben, sobald sie geschrieben ist.

## 6. Was sich gegenüber unseren bisherigen Entscheidungen ändert

1. **Freie Steuerung des Astronauten:** Das war ein ausdrücklicher Wunsch des Teams, und der Council streicht sie. Als Kompromiss bleibt der „Was wäre wenn“-Klick des Leitstands in der zweiten Liste.
2. **Anzeigen:** Festgehalten war „Konsole, Unterarm-Display, HUD wenn Zeit bleibt“. Neu ist: eine Crew-Anzeige in der Konsole, das Unterarm-Display als zweite Optik, kein HUD über Fotos. Die frühere Empfehlung, das HUD vorzuziehen, ist damit hinfällig.
3. **C#-Team:** Paul und Michael bauen einen Dijkstra statt A\*, liefern zusätzlich den Vergleich mit Curiosity und haben einen festen Fallback auf Python um 18:00.

## Hinweise

- Dieses Urteil wurde mit KI-Unterstützung erstellt (Claude, LLM-Council-Methode). Das gehört in die Angaben zur KI-Nutzung auf der Projektseite.
- Die Gutachter hielten das Gehgeschwindigkeits-Modell und den Strahlungswert für Lücken. Beides ist in den Vorbereitungsdocs bereits belegt bzw. bereinigt (0,64 ± 0,12 mSv/Tag nach Hassler et al. 2014, nicht 0,67 aus der Pressemitteilung).
