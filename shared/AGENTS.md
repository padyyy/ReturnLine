# Gemeinsame Schnittstellen

- Vorgesehener Ort für gemeinsam genutzte Datenverträge, Typen und kleine gemeinsame Hilfsfunktionen.
- Entwurf vom 14.11.2026: `data-contract.md` listet die Dateien, die das Frontend liest (Konsole, Crew-Ansichten, Navigation, HUD), mit Erzeuger und Verbraucher. Noch nicht beschlossen; die Grid-Spezifikation (Paul) legt Raster und Dateinamen fest.
- Beschreibe bei neuen Verträgen Pflichtfelder, optionale Felder, Einheiten und Fehlerformate.
- Lege bei räumlichen Daten Koordinatensystem und Koordinatenreihenfolge ausdrücklich fest.
- Stimme Änderungen mit Frontend und Backend ab und aktualisiere beide Verbraucher bei Vertragsänderungen.
- Vermeide Abhängigkeiten auf UI-Komponenten oder serverseitige Infrastruktur.
- Ergänze hier die tatsächlich eingeführten Dateien und ihre Verbraucher.

## Gehmodell-Referenzen
- `walking-model-vectors.json`: 18 Referenzkanten der auf v(0) normierten Tobler-Kurve für 10 m und 22,36 m, Basisgeschwindigkeit in km/h, Höhenunterschied in m, Ergebnis in min, Rauigkeit 0 als Annahme. Enthält Geschwindigkeitsgrenzen und Toleranz.
- Verbraucher: `frontend/test/walking-model-vectors.test.js`; vorgesehen zum Vergleich durch Python-Engine, Node-Szenariosuche und A*, falls das Team das Modell übernimmt. Keine Änderung des bestehenden Gehmodells durch Bereitstellung dieser Referenzen.
