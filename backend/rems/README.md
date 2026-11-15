# REMS: Lufttemperatur

Herkunft: Pauls Branch `feat/rems-daylight-temperature` (Commit `f5e3734`, 15.11.2026). Übernommen sind unverändert:
- `rems_temperature.py`;
- `fill_temperature_gaps.py`;
- `data/temperature.json`;
- der Test `backend/tests/test_rems_temperature.py`.

Die Sonnenzeiten kommen aus `pipeline/rems_daylight.py`, nicht aus diesem Modul.

- **Daten:** REMS-Lufttemperatur von Sol 4839, aus der PDS-MODRDR-Tabelle samt XML-Label des NASA PDS Atmospheres Node (URLs und SHA-256 in `data/temperature.json`). Daraus 5-Minuten-Mediane der Proben, die den Qualitätsfilter bestehen; leere Fenster bleiben `null`.
- **Schätzwerte:** `air_model_c` ist eine Sinus-Tageskurve aus `fill_temperature_gaps.py`. Bei der Stunden-Auslassprüfung beträgt der Fehler bis zu 94 °C. Die Konsole zeigt diese Werte **nie**, nur `air_c`.
- **In der Konsole:** `frontend/public/data/temperature.json` ist eine unveränderte Kopie von `data/temperature.json`. Die Info-Zeile „Air temperature now“ zeigt den Messwert zur selben Ortszeit oder „no measurement“. Nur Information, keine Sicherheitsregel.
- **Tests:** aus dem Repo-Wurzelordner `py -3.11 -m unittest backend.tests.test_rems_temperature -v`.
- **Neuer Sol:** Wer die Temperatur für einen anderen Sol erzeugt (`python -m backend.rems.rems_temperature --table … --label … --source-url …`), kopiert sie nach `frontend/public/data/` und stellt die Sonnenzeiten mit `py -3.11 pipeline/rems_daylight.py --sol <Sol>` auf denselben Tag.
