# Konzeptabgleich: TheMartians × ReturnLine/PRISTINE

NASA Space Apps Challenge 2026 · „Interplanetary Survival Guide: Martian Map“ · Grundlage für die Teamplanung · Stand: 13.11.2026

Markdown-Fassung von `Konzeptabgleich_ReturnLine.pdf`. Der Inhalt ist unverändert. Anmerkungen mit **Stand 14.11.** zeigen, was seitdem entschieden oder durch das Council-Urteil (`council-urteil-prototyp.md`) ersetzt wurde.

## Urteil

Keines der beiden Konzepte ist allein klar besser. Sie ergänzen sich aber fast passgenau, deshalb kombinieren wir sie.

- Das TheMartians-Konzept ist das stärkere Fundament: geprüfte Daten, Sicherheitsregeln mit NASA-Quellen und ein Umfang, der in 20 Stunden machbar ist.
- ReturnLine × PRISTINE hat genau das, was TheMartians fehlt: ein echtes Alleinstellungsmerkmal, einen Namen und eine Geschichte für den Pitch.
- Kurz gesagt: das Gerüst von TheMartians, das Dach von ReturnLine × PRISTINE.

## 1. Analyse ReturnLine × PRISTINE

### Stärken

- **Planetary Protection ist eine echte Lücke.** Gemeint ist der Schutz des Mars vor Verunreinigung durch irdische Mikroben. Das ist ein offizielles Thema: Es gibt COSPAR-Richtlinien für bemannte Mars-Missionen und die NASA-Direktive NID 8715.129 von 2020. In unserer Konkurrenzliste taucht es nicht auf. Damit hebt sich das Projekt von den rund 7 Boxwork-Projekten ab, die wir gefunden haben.
- **Der Zielkonflikt eignet sich gut für die Demo.** Sicherheit, Wissenschaft und Schutz ziehen in verschiedene Richtungen, und das kann die Jury sofort sehen.
- **Name und Slogan sind gut.** „ReturnLine“ passt sogar genau zur 60-Minuten-Rückkehrzone aus dem TheMartians-Konzept.
- Annahmen werden ehrlich gekennzeichnet, wie bei TheMartians.
- Die Wearable-Idee passt zu NASAs Konzept eines Displays am Unterarm.

### Schwächen

- **Zu breit für 20 Stunden:** drei Ziele, dynamisches Umplanen, Wearable, Funksimulation und Strahlungsmodelle.
- **Eine „intelligente“ Optimierung mit Gewichten ist angreifbar.** Wer legt fest, wie viel Wissenschaft gegen Schutz zählt? Die Gewichte wären willkürlich, und genau das prüft die Jury beim Kriterium Validity.
- **Die Grenzwerte sind ausdrücklich „prototype assumptions“.** Hier ist die TheMartians-Recherche weiter: 60 Minuten bis zum Schutz, 20° Hangneigung, höchstens 5 Minuten Funklücke und Tageslicht stammen aus NASA-Dokumenten.
- **Viele Daten wären ausgedacht:** Schutzzonen als „Szenario“, Strahlung als Modell. In Jezero gibt es ohnehin keine Strahlungsmessung.
- **Der Hauptnutzer fehlt.** Laut NASA-Konzept steuert das Crewmitglied im Habitat (IV, im Produkt „Habitat control“) den Einsatz. Das Wearable ist nur die Nebenansicht.

## 2. Schwächen des TheMartians-Konzepts

- **Die Alleinstellung ist dünn.** Mindestens ein Boxwork-Projekt hat schon ein GO/NO-GO-Urteil, Rover-Fotos und Sonnensturmdaten.
- **Die Botschaft ist abstrakt.** „Regeln nach NASA“ ist solide, aber für eine Jury nüchtern.
- Name und Kernsatz für den Pitch fehlen.

## 3. Vergleich nach Jury-Kriterien

| Kriterium | TheMartians | ReturnLine × PRISTINE |
|---|---|---|
| Impact | mittel | hoch |
| Creativity | mittel | hoch |
| Validity | hoch | niedrig bis mittel |
| Relevance | hoch | hoch |
| Presentation | offen | stark |
| Machbarkeit in 20 h | hoch | niedrig |

## 4. Die Kombination

### Statt Gewichten eine feste Rangfolge

Das löst das Hauptproblem von ReturnLine × PRISTINE:

1. **Crew-Sicherheit:** die vier TheMartians-Regeln. Sie sind hart und können NO-GO auslösen.
2. **Planetary Protection:** Schutzzonen werden gemieden, solange die Sicherheit es erlaubt. Jeder Eintritt wird angezeigt und protokolliert.
3. **Wissenschaft:** Die 4–5 Stopps sind das Ziel. Welche davon erreichbar sind, ergibt sich aus 1 und 2.

### Demo mit vorberechneten Routen statt Live-Optimierung

- Route A: die kürzeste Route. Sie führt durch eine Schutzzone, also wird ein Verstoß angezeigt.
- Route B: umgeht die Zone und braucht einige Minuten länger, bleibt aber unter 60 Minuten bis zum Schutz. Ergebnis: GO mit Auflage, das ist die Empfehlung.
- Ereignis-Knopf, z. B. „Crewmitglied verletzt“: Es folgt ein ABORT, und der schnellste Rückweg führt durch die Zone. Die Sicherheit gewinnt, und der Eintritt wird protokolliert. Dieser Moment zeigt die ganze Rangfolge in einem Bild.

**Stand 14.11.:** Das Prinzip (vorberechnet, kein Live-Optimieren, ABORT durch die Zone als Höhepunkt) gilt. Den konkreten Ablauf hat das Council-Urteil durch das Sechs-Beat-Drehbuch ersetzt (`../mission-scenario.md`). Statt zweier fester Routen liefert die C#-Engine ein Raster „Zeit zur Basis“ in zwei Varianten: Zonen bestraft und Zonen erlaubt.

### Schutzzonen auf echten Daten aufbauen

- Die Zonen liegen um reale Orte, etwa Bohrstellen von Curiosity (z. B. „Altadena“). Diese lassen sich aus den Waypoints und dem jeweiligen Sol bestimmen.
- Der Radius der Zonen ist eine gekennzeichnete Annahme und als Schieberegler einstellbar.
- Als Quellen dienen die COSPAR-Richtlinien und NID 8715.129.
- Eine Fußabdruck-Ebene zeigt den Weg des simulierten Einsatzes und wie viele Meter davon in Schutzzonen lagen. Das ist mit wenig Aufwand machbar.

**Stand 14.11.:** Die Meter in Schutzzonen stehen als Pflicht im Log und in der Bilanz am Ende (Beat 6). Die sichtbare Fußspur ist nach dem Council-Urteil Punkt 4 der Liste nach dem Feature-Freeze.

### Was übernehmen wir von wem?

| Von ReturnLine × PRISTINE | Von TheMartians |
|---|---|
| Name „ReturnLine“ und Slogan | Belegte Sicherheitsregeln, Urteilslogik |
| Planetary Protection und Fußabdruck-Ebene | Geprüfte Datenquellen, Pipeline-Plan |
| Routenvergleich als Demo-Kern | IV-Konsole als Hauptansicht, Design-Brief |
| Akustische Signale fürs Unterarm-Display (Stretch; jetzt: „ein Satz Sprachausgabe“ nach dem Freeze) | Abgleich mit der Rover-Route |

Die Farbcodierung Grün/Blau/Rot von ReturnLine × PRISTINE passt bereits zur Field-Book-Palette von TheMartians (`design-brief.md`): Grün für GO, Blaustift für Wissenschaft und Schutzzonen, Rotstift für Befunde.

### Was wir von ReturnLine × PRISTINE streichen

- die gewichtete „intelligente“ Optimierung und das dynamische Umplanen,
- Strahlungsmodelle,
- eine berechnete Punktzahl für den „wissenschaftlichen Wert“.

Das sind alles Stellen, an denen die Jury bei Validity ansetzen würde.

## 5. Standort, neu bewertet

Planetary Protection verschiebt die Geschichte etwas Richtung Jezero. Dort hat Perseverance 2025 im Gestein „Cheyava Falls“ eine mögliche Biosignatur gefunden, und „Preserve the Evidence“ passt dazu wörtlich. Gale hat aber ein eigenes Argument: Curiosity hat dort organische Moleküle und Methan gemessen. Genau solche Messungen könnte menschliche Verunreinigung verfälschen.

Die praktischen Gründe für Gale gelten weiter: Vorbereitung, Strahlungsmessung vor Ort und Gelände mit Rücken, an dem die Hangregel wirklich greift. Der Vorsprung ist aber kleiner geworden.

Empfehlung: Gale, außer das Team hat die Jezero-Daten bis zum Vorabend des Kickoffs ähnlich gründlich geprüft.

**Stand 14.11.:** Gale, Boxwork-Region, am 13.11. bestätigt.

## 6. Zu entscheiden vor dem Kickoff – alle am 13.11.2026 entschieden

| Frage | Entscheidung |
|---|---|
| Kombination: Rangfolge Sicherheit → Planetary Protection → Wissenschaft als gemeinsame Grundlage? | Ja. |
| Standort: Gale oder Jezero? | Gale crater, Boxwork-Region. |
| Name: „ReturnLine“ als Produktname, Slogan „Explore Mars. Return Safely. Preserve the Evidence.“? | Ja. |
| Unterarm-Display: bauen oder nur die IV-Konsole? | Eine Seite, die Habitat-Konsole, mit eingebetteter schreibgeschützter Crew-Anzeige. Die Unterarm-Optik kommt nach dem Feature-Freeze (Council-Urteil). |
| Rollen: Verteilung auf fünf Personen | Siehe `../roles.md`. |

## Hinweis zu den Quellen

Die Angaben zu Planetary Protection (COSPAR, NID 8715.129) und zu Cheyava Falls stammen aus allgemeinem Wissen, nicht aus der TheMartians-Recherche. **Vor dem Pitch gegen die Primärtexte prüfen** (steht auch auf der Kickoff-Checkliste). Alle übrigen Daten und Regeln sind mit Quellen in `preparations.md` belegt.
