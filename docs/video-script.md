# Videoskript: 30-Sekunden-Demo

Für die Aufnahme am Sonntag, 15.11.2026, bis 13:00 Uhr. Verantwortlich: Alex (Präsentation, siehe `docs/roles.md`). Sprechertext und Untertitel sind Englisch, alles andere ist Deutsch. Die Untertitel liegen auch als Datei bei: `docs/video/returnline-30s.en.srt`.

## Regeln aus dem Project Submission Guide 2026

- **Höchstens 30 Sekunden.** Längere Videos sind von der globalen Bewertung ausgeschlossen. Wir planen 28 Sekunden.
- **Englisch.** Gesprochen wird Englisch. Die englischen Untertitel kommen trotzdem ins Bild, weil viele Juroren ohne Ton schauen.
- **Öffentlicher Link ohne Login,** zum Beispiel YouTube (auch „nicht gelistet“). Im privaten Fenster prüfen.
- **Keine NASA-Logos** und keine Missionsabzeichen.
- **Keine Musik ohne Erlaubnis.** Am einfachsten ganz ohne Musik.
- **Keine KI-Stimme, keine KI-Musik, keine KI-Bilder.** Wer doch etwas davon nutzt, braucht ein sichtbares Wasserzeichen beziehungsweise einen Hinweis in Beschreibung und Metadaten und muss es auf der Projektseite nennen.
- **Keine Personen unter 18** im Bild oder Ton.

Laut Guide soll das Video kurz Team, Challenge, Projektname und Idee nennen und mit einem Blick in die Zukunft enden. Laut Council-Urteil öffnet es mit dem schrumpfenden Rückkehrbereich und zeigt die Beats 3, 5 und 6. Der Schnittplan unten verbindet beides.

## Der echte Ablauf der App

Gemessen am 15.11.2026 um 01:40 Uhr: Headless Chrome, 1920 × 1080, Build von `main`, Platzhalter-Layout, Tempo ×60. Die Zeiten zählen ab dem Klick auf **Start**.

| Rohzeit | EVA-Uhr | Was passiert |
|---|---|---|
| 0,0 s | 0:00 | Beat 1: Route zur Station 1, GO |
| 8,1 s | 4:45 | Beat 2: Zeitsprung-Banner |
| 13,2 s | 4:45 | Beat 3: Der Rückkehrbereich schrumpft. Ab 5:00 startet habitat control den Rückweg. |
| 31,2 s | 5:02 | Beat 4: Die Crew driftet zu Drill site A. |
| 37,2 s | 5:05 | Warnung und Reroute |
| 39,8 s | 5:06 | Beat 5: Banner „Crew member injured“, Urteil ABORT, 57 min ✗ gegen 52 min ✓ |
| 44,8 s | 5:06 | Beat 6 |
| 46,8 s | 5:06 | Klick auf „Confirm ABORT“, „Override logged“ |
| 50,1 s | 5:19 | Die Crew betritt Drill site B. |
| 59,8 s | 5:58 | HOME, „Override logged · 157 m inside Drill site B · reason: ABORT“, Zusammenfassung mit Slogan |

Ein ganzer Lauf dauert also gut 60 Sekunden. Kommen die Stationen und Zonen des Datenteams vorher, verschieben sich die Zeiten. Der Ablauf bleibt gleich. Die Beat-Nummer steht unten links im Untertitelstreifen der App.

## Schnittplan (28 s)

Die Ausschnitte sind in Pixeln einer Aufnahme mit 1920 × 1080 angegeben, links oben = 0/0. Keiner der Ausschnitte enthält den Untertitelstreifen der App (ab y = 892). So kollidieren unsere eingebrannten Untertitel nicht mit ihm.

| Video | Bild | Rohmaterial | Sprechertext = Untertitel |
|---|---|---|---|
| 0:00–0:04 | **Ausschnitt A** (x 0–1280, y 120–840): Karte mit Rückkehrbereich, links das Helm-HUD. Darüber eine Titelkarte: „ReturnLine“, darunter „Explore Mars. Return Safely. Preserve the Evidence.“, klein „Team Houston, we have a map · NASA Space Apps 2026 · Interplanetary Survival Guide: Martian Map“. | Beat 3, Rohzeit 13–17 s, Tempo ×1 | We're team Houston, we have a map. This is ReturnLine. |
| 0:04–0:10 | **Ausschnitt A.** Der grüne Rückkehrbereich zieht sich entlang des Geländes zurück. | Beat 3, Rohzeit 17–31 s, Tempo ×2,3 | It shows, for every ten meters of Gale crater, whether astronauts can still get home in time. |
| 0:10–0:16 | **Ausschnitt B** (x 400–1920, y 30–885): Banner „Crew member injured“, Karte, ABORT, 57 min ✗ und 52 min ✓, Knopf „Confirm ABORT“. Einblendung oben links: „Protected zone: keeps Earth microbes off a drill site“. | Beat 5, Rohzeit 39,8–44,8 s, Tempo ×1, letztes Bild 1 s halten | A crew member is hurt. Only the path through a protected zone gets them home in time. |
| 0:16–0:22 | **Ausschnitt C** (x 240–1320, y 220–828): Die rote ABORT-Route führt durch Drill site B zum Habitat. Einblendung oben links für 3 s: „Habitat control: the crew member inside who directs the walk“. | Beat 6, Rohzeit 46–60 s, Tempo ×2,3 | Habitat control overrides. Safety first, and the entry is logged. |
| 0:22–0:28 | **Ausschnitt D** (x 860–1920, y 56–652): HOME, „Override logged · 157 m inside Drill site B“, Zusammenfassung mit Slogan. Unten eingeblendet: „Live demo: padyyy.github.io/ReturnLine“ und „Data: USGS Gale DEM and orthophoto (NASA HiRISE, CTX, ESA HRSC) · Curiosity traverse (NASA JPL)“. | HOME, Rohzeit ab 60 s, als Standbild halten | Built on NASA maps, for the first crews on Mars. Explore Mars. Return safely. Preserve the evidence. |
| 0:28–0:29 | Standbild ausklingen lassen, kein Ton. Puffer bis zur 30-s-Grenze. | | |

**Sprechtempo:** etwa 2,8 Wörter pro Sekunde, also zügig, aber ohne Hast. Ist ein Satz zu lang für sein Fenster, wird der Satz gekürzt, nicht das Bild verlängert.

## Untertitel

Eingebrannt unten mittig, weiße Schrift auf dunklem Band, höchstens zwei Zeilen. Die Einblendungen (Titel, „Protected zone“, „Habitat control“, Links) stehen oben links, damit sie die Untertitel nicht überdecken. Die SRT-Datei zusätzlich bei YouTube als englische Untertitel hochladen:

```srt
1
00:00:00,300 --> 00:00:03,800
We're team Houston, we have a map.
This is ReturnLine.

2
00:00:04,000 --> 00:00:10,000
It shows, for every ten meters of Gale crater,
whether astronauts can still get home in time.

3
00:00:10,200 --> 00:00:16,000
A crew member is hurt. Only the path through
a protected zone gets them home in time.

4
00:00:16,200 --> 00:00:21,800
Habitat control overrides.
Safety first, and the entry is logged.

5
00:00:22,000 --> 00:00:24,800
Built on NASA maps,
for the first crews on Mars.

6
00:00:24,800 --> 00:00:28,000
Explore Mars. Return safely.
Preserve the evidence.
```

## Aufnahme

1. **Vorher:**
   - Die Beat-5-Beschriftungen auf der Karte sind gemergt (Schritt 5 der Nachtplanung): beide Heimwege mit Minuten und „fits“ beziehungsweise „too long“.
   - Liefert das Datenteam bis dahin, sind seine Daten gemergt und die Geschichte ist neu geprüft (`frontend/scripts/find-scenario.mjs`).
   - GitHub Pages zeigt den aktuellen Stand.
   - Solange Platzhalterdaten im Spiel sind, steht oben „Placeholder data“. Das bleibt im Bild; wir verstecken es nicht.
2. **Browser:** Chrome, Vollbild (F11), Zoom 100 %, Fenster 1920 × 1080 oder größer. https://padyyy.github.io/ReturnLine/ öffnen und warten, bis Karte und Rückkehrbereich geladen sind. Den Mauszeiger an den Bildrand schieben.
3. **Aufnahme:** mit OBS Studio (Bildschirmaufnahme, 30 fps) oder mit Win + Alt + R (Xbox Game Bar, nimmt das aktive Fenster auf).
4. **Lauf:** In der Zielliste die Station mit dem Hinweis „Plays the six beats“ wählen (derzeit Station 1), dann **Start**. Danach nichts mehr anklicken; die Demo klickt die Knöpfe von habitat control selbst. Zwei vollständige Läufe aufnehmen. Neu laden setzt die Demo zurück.
5. **Sprechertext:** getrennt aufnehmen, mit Headset in einem ruhigen Raum. Gut geht das direkt in Clipchamp oder mit dem Handy. Sprecher: ⟨wer⟩.
6. **Schnitt:** in Clipchamp (in Windows 11 enthalten) oder einem anderen Editor. Pro Abschnitt zuschneiden, Tempo setzen, auf den Ausschnitt zoomen, Text und Untertitel einfügen. Die automatischen Untertitel von Clipchamp nicht verwenden, sondern den Text oben abtippen, sonst gilt er als KI-erzeugt.
7. **Export:** 1080p, MP4. Die Länge im Player prüfen: höchstens 0:29.
8. **Hochladen:** YouTube, öffentlich oder nicht gelistet, SRT als englische Untertitel. Titel: „ReturnLine · NASA Space Apps 2026 · Houston, we have a map“. Den Link im privaten Fenster testen und in die Projektseite eintragen (`docs/project-page.md`, Feld „Link to Project Demo“).

## Wenn die Zeit knapp wird

Notfassung: nur die Abschnitte 0:10–0:28 (Beats 5 und 6), mit Titelkarte und Sprechertext 1 davor, etwa 22 Sekunden. Der schrumpfende Rückkehrbereich fehlt dann, die Kernaussage bleibt.
