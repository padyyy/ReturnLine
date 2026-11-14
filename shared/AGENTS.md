# Gemeinsame Schnittstellen

- Vorgesehener Ort für gemeinsam genutzte Datenverträge, Typen und kleine gemeinsame Hilfsfunktionen.
- Entwurf vom 14.11.2026: `data-contract.md` listet die Dateien, die das Frontend liest (Konsole, Crew-Ansichten, Navigation, HUD), mit Erzeuger und Verbraucher. Noch nicht beschlossen; die Grid-Spezifikation (Paul) legt Raster und Dateinamen fest.
- Beschreibe bei neuen Verträgen Pflichtfelder, optionale Felder, Einheiten und Fehlerformate.
- Lege bei räumlichen Daten Koordinatensystem und Koordinatenreihenfolge ausdrücklich fest.
- Stimme Änderungen mit Frontend und Backend ab und aktualisiere beide Verbraucher bei Vertragsänderungen.
- Vermeide Abhängigkeiten auf UI-Komponenten oder serverseitige Infrastruktur.
- Ergänze hier die tatsächlich eingeführten Dateien und ihre Verbraucher.
