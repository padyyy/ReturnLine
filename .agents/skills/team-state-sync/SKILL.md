---
name: team-state-sync
description: Prüft zu Beginn und Abschluss einer Projektaufgabe Git-Stand, lokale Änderungen und AGENTS.md, erkennt neue oder geänderte Funktionalität und gleicht belegte Dokumentationslücken nach den Regeln der Haupt-AGENTS.md ab. Für den gemeinsamen Projektabgleich im KI-Team.
---

# Team-Stand und Dokumentation abgleichen

## Regeln aus dem Projekt laden

Ermittle das Repository mit `git rev-parse --show-toplevel`. Lies zuerst seine Haupt-`AGENTS.md`, geltende Anweisungen übergeordneter Ordner und dann die `AGENTS.md` der betroffenen Module, bevor du deren Code untersuchst. Lade Regeln bei jedem neuen Aufgabenbeginn erneut; kopiere sie nicht als feste Regeln in diesen Skill. Untergeordnete Dateien ergänzen die Hauptregeln. Melde Widersprüche, statt sie stillschweigend umzudeuten.

Ohne Repository oder Haupt-`AGENTS.md`: benenne die fehlende Grundlage, prüfe zugängliche lokale Dateien und behaupte keinen vollständigen Git- oder Regelabgleich. Erfinde keine Projektregeln.

## Git und lokalen Stand erfassen

Führe den Abgleich vor eigenen Änderungen und nochmals nach Abschluss der Aufgabe aus. Arbeite zunächst lesend:

```sh
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
```

- Unterscheide HEAD, gestagte Änderungen, ungestagte Änderungen und unversionierte Dateien. Lies relevante Diffs mit `git diff` und `git diff --cached` sowie den aktuellen Inhalt betroffener Dateien. Ein leerer Diff schließt undokumentierte Funktionalität in bestehenden Commits nicht aus.
- Prüfe den konfigurierten Upstream, falls vorhanden, etwa mit `git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'` und `git rev-list --left-right --count 'HEAD...@{upstream}'`. Lokale Remote-Referenzen können veraltet sein. Ohne aktualisierte Referenzen keine Aussage über den aktuellen Serverstand treffen.
- Für neue Commits nutze einen vom Nutzer genannten oder im bisherigen Aufgabenverlauf belegten Vergleichscommit. Andernfalls dient die gemeinsame Basis mit dem vorhandenen Upstream als Branchvergleich (`git merge-base HEAD '@{upstream}'`). Der Upstreamvergleich ist kein Beleg dafür, was seit dem letzten Dokumentationsabgleich neu ist.
- Fehlt eine verlässliche frühere Vergleichsbasis, kennzeichne dies. Prüfe dann den aktuellen Zustand gegen die Dokumentation und bezeichne Befunde als „vorhanden, bislang undokumentiert“, nicht als sicher neu.
- Verändere für diesen Abgleich weder Branch noch Index oder Arbeitsbaum per Git. Kein automatisches Pull, Merge, Rebase, Reset, Stash, Commit oder Push. Ein Fetch erfolgt nur, wenn eine aktuelle Remote-Prüfung zur Aufgabe gehört und die geltenden Regeln dies erlauben; melde Netzwerkfehler und arbeite mit dem belegten lokalen Stand weiter.
- Lies keine Geheimnisdateien, ignorierten Datenbestände, Build-Artefakte oder `.git/`-Interna. Bei benötigter Konfiguration verwende dokumentierte Variablennamen oder `.env.example` ohne geheime Werte.

## Funktionalität mit Markdown abgleichen

Starte bei den Pfaden aus `git status`, relevanten Commits und der Modulübersicht. Bei einer ausdrücklich vollständigen Bestandsprüfung erfasse alle fachlichen Module. Folge ansonsten nur den für Aufgabe und Änderungen relevanten Abhängigkeiten und öffentlichen Schnittstellen; kennzeichne den geprüften Umfang.

Vergleiche tatsächlichen Code, Konfiguration, vorhandene Tests und Einstiegspunkte mit den jeweiligen `AGENTS.md` und relevanten Projekt-Markdown-Dateien wie README, Architektur-, Schnittstellen- und Setup-Dokumentation. Prüfe insbesondere:

- neue, geänderte oder entfernte nutzbare Funktionen und öffentliche Schnittstellen;
- wichtige Einstiegspunkte, Dateipfade, Abhängigkeiten und Modulkommunikation;
- Datenformate, Einheiten, Konfiguration sowie vorhandene Start- und Prüfbefehle;
- veraltete Platzhalter, nicht mehr existierende Funktionen und widersprüchliche Angaben.

Belege jeden Befund durch konkrete Dateipfade und, wo sinnvoll, Symbole oder Zeilen. Eine Commit-Nachricht, ein Dateiname, ein TODO oder ein leerer Ordner beweist keine implementierte Funktion. Trenne implementiert, begonnen und geplant. Behaupte Funktionsfähigkeit nur im Umfang tatsächlich ausgeführter Prüfungen.

## Dokumentation gezielt nachführen

Der normale Skill-Aufruf umfasst das Aktualisieren belegter Dokumentationslücken in den geprüften Bereichen. Bei einem reinen Review- oder Berichtsauftrag melde nur Befunde und ändere keine Dateien.

- Dokumentiere Modulzweck, wichtige Pfade und Schnittstellen in der zuständigen Modul-`AGENTS.md`; ausführliche Nutzung, API-Details oder Setup gehören in die passenden Projektdokumente.
- Ersetze nachweislich überholte Starttexte und entferne belegte veraltete Angaben. Erfinde keine Architekturentscheidungen oder ausführbaren Befehle.
- Bewahre vorhandene Regeln und fremde Änderungen. Prüfe unmittelbar vor dem Schreiben den aktuellen Dateiinhalt; bei zwischenzeitlichen Änderungen passe den Patch an. Ändere keine Hauptregeln allein wegen einer neuen Implementierung.
- Ergänze fehlende Modul-`AGENTS.md` nur im geprüften Bereich. Dupliziere keine Hauptregeln und erzeuge keinen pauschalen Dokumentationsbaum.
- Offene fachliche Entscheidungen bleiben als Unsicherheit im Bericht; entscheide sie nicht durch einen Dokumentationseintrag.
- Dokumentiere lokale, noch nicht integrierte Funktionalität mit ihrem Status, ohne sie als bereits veröffentlicht darzustellen.

## Ergebnis prüfen und melden

Prüfe abschließend Dokumentationsdiffs, referenzierte Pfade und den erneuten Git-Status. Führe für Codeänderungen die nach Hauptregeln erforderlichen passenden Prüfungen aus. Bei reinen Textänderungen reicht die Prüfung von Inhalt, Pfaden und Diff; behaupte keine ausgeführten Funktionstests.

Berichte knapp:

1. **Stand und Umfang:** Branch, Vergleichsbasis, lokale Änderungen und Aktualität des Remote-Wissens.
2. **Befunde:** Funktion beziehungsweise Änderung, Codebeleg und fehlende oder veraltete Dokumentationsstelle.
3. **Erledigt:** aktualisierte Dateien und durchgeführte Prüfungen.
4. **Offen:** nicht geprüfte Bereiche, unklare Entscheidungen oder fehlende Vergleichsbasis.

Bei unverändertem Stand keine wiederholten Änderungen oder künstlichen Befunde erzeugen. Dieser Skill verteilt sich nicht selbst auf andere KI-Systeme; jedes Teammitglied muss die Projektanweisungen beziehungsweise den Skill in seinem Agent-Werkzeug laden.
