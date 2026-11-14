# Checkliste Kickoff – Samstag, 14.11.2026

Team „Houston, we have a map“ · Produkt **ReturnLine** · NASA Space Apps Challenge 2026, Local Event Heilbronn

Grundlage sind die beiden Entscheidungspapiere `konzeptabgleich-returnline.md` und `council-urteil-prototyp.md` (auch als PDF in diesem Ordner). Alles in dieser Liste wird am Samstagmorgen vor Beginn abgehakt.

**Regeln, die heute gelten:**
- Vor 9:00 Uhr nur Vorbereitung: Recherche, Daten herunterladen, Rechner einrichten. Kein Lösungscode, kein Projekt-Repo.
- Aus der Vorbereitung kommt kein Code, kein Design und keine Zahl ins Produkt. Jede Zahl, die wir zeigen, wird vor Ort neu berechnet. (Nachtrag 14.11.: Die Vorbereitungsdokumente liegen als Nachweis in `docs/preparation/` im Repo ReturnLine.)
- Was nicht im Drehbuch steht, wird nicht gebaut.

## A. Vor 9:00 Uhr: nur Vorbereitung

**Team und Anmeldung**
- [ ] Teamseite [„Houston, we have a map“](https://www.spaceappschallenge.org/2026/find-a-team/houston-we-have-a-map/?tab=details) im Browser geprüft: Challenge „Interplanetary Survival Guide: Martian Map“, Local Event Heilbronn, alle fünf Mitglieder eingetragen. (Patrick)
- [ ] Alle fünf um 8:30 registriert.
- [ ] Alle haben den Konzeptabgleich und das Council-Urteil gelesen.

**Regeln und Abgabe**
- [ ] 2026 Project Submission Guide und Judging & Awards Guide gelesen (spaceappschallenge.org, Bereich Resources). Abweichungen von unserem Plan notiert: Videolänge, Untertitel, Projektseite, Angabe zur KI-Nutzung. (Alex)
- [ ] Resources-Tab der Challenge-Seite kopiert. Neue Quellen ändern höchstens die Streichliste, nicht das Konzept.

**Rechner, jeder Laptop**
- [ ] Git und Node 20 oder neuer installiert.
- [ ] GitHub-Account vorhanden.
- [ ] Python 3.11 mit numpy, scikit-image, tifffile und imagecodecs, Imports getestet. (Magnus, Michael)
- [ ] .NET SDK 8 oder neuer, ein „Hello World“ außerhalb jedes Repos läuft. (Paul, Michael)
- [ ] Leaflet 1.9.4 und die Schrift Atkinson Hyperlegible lokal heruntergeladen. Nichts hängt vom WLAN vor Ort ab.
- [ ] Ladegeräte, Mehrfachstecker, USB-Stick dabei.

**Daten auf USB-Stick oder geteiltem Laufwerk** (Herunterladen ist erlaubt, Verarbeiten erst ab Kickoff)
- [ ] DEM-Fenster für den Kartenausschnitt 137,34–137,42° O und 4,77–4,85° S, per Range Request. (Michael)
- [ ] Orthofoto-Fenster für denselben Ausschnitt. (Michael)
- [ ] Test außerhalb jedes Repos: Das DEM-Fenster lässt sich ohne GDAL mit tifffile lesen. Klappt das nicht, sofort melden, denn davon hängt alles ab. (Magnus)
- [ ] `MSL_traverse.json` und `MSL_waypoints.json` von Curiosity.
- [ ] REMS-Wetterdaten als JSON, mit Sonnenauf- und -untergang.
- [ ] Ein Curiosity-Bodenfoto pro Stopp für das Stationslog, mit Sol und Kamera notiert.

**Inhalt und Recherche**
- [ ] 4–5 Stopps entlang der Curiosity-Route, je mit Sol und einem Satz Begründung aus den NASA-Blogposts zur Boxwork-Kampagne.
- [ ] Bohrstellen der Boxwork-Kampagne mit Sol notiert, z. B. „Altadena“. Sie werden die Schutzzonen.
- [ ] Quellen zur Planetary Protection geprüft: COSPAR-Richtlinien für bemannte Mars-Missionen, NASA NID 8715.129. Dazu der Gale-Aufhänger: organische Moleküle und Methan, von Curiosity gemessen.
- [ ] **Drehbuch geschrieben:** eine Seite, sechs Beats. Pro Beat: was auf dem Bildschirm steht, welche Zahl gezeigt wird, aus welcher Datei sie kommt, welche Simulationszeit gilt, dazu ein englischer Untertitel. (Alex, Patrick)

## B. Kickoff 9:00–10:30 Uhr: ab jetzt darf gearbeitet werden

- [ ] Kickoff-Infos und Challenge-Ressourcen auf Änderungen geprüft.
- [ ] Umfang in 15 Minuten gegen das Council-Urteil bestätigt: Pflichtliste, Reihenfolge nach dem Freeze, Streichliste.
- [ ] Neues Repo angelegt, alle fünf haben Zugriff, Regeln für Branches und Pull Requests abgesprochen, GitHub Pages aktiviert. (Magnus)
- [ ] Kanban-Board steht, die Issues sind aus dem Drehbuch abgeleitet. (Paul)
- [x] JavaScript oder TypeScript entschieden. (Magnus) Stand 14.11.: JavaScript.
- [ ] Standort von Habitat und Rover als Koordinate festgelegt. Von dort rechnet der Dijkstra.
- [ ] Grid-Spezifikation auf einer Seite: Ausschnitt, 10-m-Zellen (etwa 470 × 470), Zeilenordnung, float32 little-endian, Kodierung der Rückweg-Zeiger, Dateinamen. (Paul)
- [ ] Annahmen festgelegt und benannt: Hangabschlag (Tobler-Form, skaliert auf 1,5 km/h), Puffer-Radius der Schutzzonen, Verletzungsfaktor 0,5, EVA-Dauer 6 h plus 1 h Reserve.
- [ ] Design: Darstellung von Rückkehrzone, 60-Minuten-Linie und Schutzzonen aus dem Design-Brief bestätigt.
- [ ] Plan für die erste Stunde bestätigt:
  - Paul: Grid-Spezifikation
  - Magnus und Michael: DEM zuschneiden, 10-m-Hangneigung, Orthofoto-Overlay; danach prüfen, ob die Stopps trotz der Grat-Regel erreichbar sind
  - Alex: Konsolen-Layout gegen Fake-JSON, mit einem Punkt, der eine feste Linie entlangwandert
  - Patrick: Untertitel, Gerüst der Projektseite, Quellenliste, danach die Timeline des Demo-Knopfs

## C. Meilensteine am Wochenende

- [ ] **Sa 14:00** – Der Punkt wandert über das echte Orthofoto.
- [ ] **Sa 18:00** – App läuft auf GitHub Pages. Das Raster „Zeit zur Basis“ ist da, sonst Umstieg auf `MCP_Geometric` in Python (Michael).
- [ ] **Sa 22:30** – Feature-Freeze: Alle sechs Beats laufen mit echten Daten.
- [ ] **So 11:00** – Harter Freeze, nur noch Bugfixes.
- [ ] **So 13:00** – Video aufgenommen (Beats 3, 5 und 6), höchstens 30 Sekunden, englische Untertitel.
- [ ] **So 14:30** – Alles eingereicht: Video, Projektseite mit Vorab-Recherche und KI-Nutzung, Demo-Link, Repo.
- [ ] **So 15:45** – Abgabeschluss. Ab 16:00 Live-Pitch.

## Fertig, wenn …

- [ ] der Demo-Knopf alle sechs Beats offline dreimal hintereinander fehlerfrei abspielt,
- [ ] die Rückkehrzone in Beat 3 sichtbar schrumpft und in Beat 5 einbricht,
- [ ] der Override mit Zone, Metern und Grund im Log steht,
- [ ] jede Zahl eine Quelle hat oder als Annahme gekennzeichnet ist und das Wort „validiert“ nirgends vorkommt,
- [ ] jemand, der das Projekt nicht kennt, Projektseite, Video und Demo-Link ohne Erklärung versteht.
