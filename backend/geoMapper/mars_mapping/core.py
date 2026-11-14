"""Wiederverwendbarer Kern: Karte <-> Marskoordinaten <-> Datenlayer.

Keine UI-Imports. Geeignet für Desktop, Node.js-Bridge, spätere externe Algorithmen oder REST-API.

Annahmen:
- Referenzbild und GeoTIFF-Layer sind *tatsächlich* georeferenziert (gültiges CRS
  und affine Transformation); normale PNG/JPG ohne Referenz werden abgelehnt.
- Für CSV müssen planetozentrische/planetografische Latitude und Längengrad-
  konvention explizit mit dem Import-CRS zusammenpassen. Default: kugelförmiger
  Mars mit east-positiver Länge, nicht Erd-WGS84.
- Punkt-CSV: nächster Messpunkt innerhalb eines konfigurierbaren Radius;
  keine flächenhafte Interpolation und keine erfundenen Messwerte.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any
import csv
import math
import re
import warnings

import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import CRS, Proj, Transformer
from scipy.spatial import cKDTree
from .fixed_grid import FixedGrid
from .local_grid import LocalMetricGrid

# Sphärische Mars-Referenz für DEMO und ausdrücklich entsprechend bezeichnete CSV.
# Reale JMARS-Datensätze können andere Referenzkörper und Konventionen verwenden.
MARS_RADIUS_M = 3_396_190.0
MARS_SPHERE_GEO_CRS = '+proj=longlat +R=3396190 +no_defs +type=crs'


class GeoMappingError(ValueError):
    """Fehler bei Projektion, fehlender Georeferenzierung oder Datenimport."""


@lru_cache(maxsize=64)
def _transformer(source_wkt: str, target_wkt: str) -> Transformer:
    try:
        return Transformer.from_crs(
            CRS.from_wkt(source_wkt),
            CRS.from_wkt(target_wkt),
            always_xy=True,
            allow_ballpark=False,
        )
    except Exception as exc:
        raise GeoMappingError(
            'Koordinatentransformation nicht möglich. Prüfe Mars-Referenzkörper, '
            'Breitengraddefinition, Längengradkonvention und CRS-Metadaten. '
            f'Technischer Grund: {exc}'
        ) from exc


@lru_cache(maxsize=64)
def _mars_compatible_proj_transformer(source_wkt: str, target_wkt: str) -> Transformer:
    """Fallback nur für verifizierbar kompatible Mars-Koordinatensysteme.

    PROJ kann bei benutzerdefinierten, nicht registrierten Mars-Datums (z.B.
    JMARS-'unknown'-WKT) an der automatischen CRS-Operationssuche scheitern.
    Dann sind direkte, überprüfte Projektions-Operationen geeignet.

    KEINE stille Annahme für Erde/Mars, abweichende Nullmeridiane oder
    planetografisch/planetozentrisch gemischte Ellipsoid-/Kugelbreiten.
    """
    source, target = CRS.from_wkt(source_wkt), CRS.from_wkt(target_wkt)

    def validated_body(crs: CRS) -> tuple[float, float]:
        geographic = crs if crs.is_geographic else crs.geodetic_crs
        if geographic is None or not geographic.is_geographic:
            raise GeoMappingError('Unbekannter Quell-/Zielprojektionstyp; keine sichere Marszuordnung.')
        ellipsoid = geographic.ellipsoid
        a, b = float(ellipsoid.semi_major_metre), float(ellipsoid.semi_minor_metre)
        if not (3_350_000 <= a <= 3_430_000 and 3_350_000 <= b <= 3_430_000):
            raise GeoMappingError(
                f'Kein kompatibler Mars-Referenzkörper (Achsen {a:g} / {b:g} m). '
                'Insbesondere WGS84/EPSG:4326 der Erde nicht für Mars verwenden.'
            )
        meridian = float(geographic.prime_meridian.longitude)
        if abs(meridian) > 1e-9:
            raise GeoMappingError(
                f'Nullmeridian {meridian:g}° ist nicht 0°. '
                'Eine automatische Zuordnung ist ohne bestätigte Längenkonvention nicht sicher.'
            )
        return a, b

    a1, b1 = validated_body(source)
    a2, b2 = validated_body(target)
    both_spherical = abs(a1 - b1) < 0.01 and abs(a2 - b2) < 0.01
    same_ellipsoid = abs(a1 - a2) < 0.01 and abs(b1 - b2) < 0.01
    if not (both_spherical or same_ellipsoid):
        raise GeoMappingError(
            'Die Referenzkörper unterscheiden sich (Kugel/Ellipsoid). '
            'Die Definition planetozentrischer/planetografischer Breiten muss geprüft werden.'
        )

    # PROJ führt dann die bekannten mathematischen Projektionen aus, statt
    # erfolglos einen Datumswechsel zwischen unbekannten Mars-Datums zu suchen.
    # Achtung: to_proj4 verliert manche CRS-Metadaten. Deshalb ausschließlich
    # nach obiger ausdrücklicher Prüfung und nur bei Transformationsfehlern.
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message='You will likely lose important projection information')
        src_proj = source.to_proj4()
        dst_proj = target.to_proj4()
    if not src_proj or not dst_proj:
        raise GeoMappingError('CRS lässt sich nicht in eine direkt ausführbare Projektion umsetzen.')
    try:
        return Transformer.from_proj(Proj(src_proj), Proj(dst_proj), always_xy=True)
    except Exception as exc:
        raise GeoMappingError(f'Auch die geprüfte Mars-Projektion ist nicht ausführbar: {exc}') from exc


def convert_xy(x: float, y: float, source: CRS, target: CRS) -> tuple[float, float]:
    """Projizierte/geografische Mars-Koordinaten sicher umrechnen."""
    if source.equals(target):
        return float(x), float(y)
    try:
        xx, yy = _transformer(source.to_wkt(), target.to_wkt()).transform(x, y, errcheck=True)
    except Exception as original:
        try:
            xx, yy = _mars_compatible_proj_transformer(
                source.to_wkt(), target.to_wkt()
            ).transform(x, y, errcheck=True)
        except Exception as fallback_error:
            raise GeoMappingError(
                'CRS-Konvertierung fehlgeschlagen. '
                f'PROJ: {original}. '
                f'Mars-Prüfung: {fallback_error}. '
                'Vergleiche das CRS der Karte mit dem der Messdaten. '
                'Die Längengradkonvention muss east-positive sein.'
            ) from fallback_error
    if not (math.isfinite(xx) and math.isfinite(yy)):
        raise GeoMappingError('CRS-Konvertierung ergab ungültige Koordinaten.')
    return float(xx), float(yy)


def _read_csv(path: Path) -> list[dict[str, str]]:
    try:
        with path.open('r', encoding='utf-8-sig', newline='') as f:
            preview = f.read(4096)
            f.seek(0)
            try:
                delimiter = csv.Sniffer().sniff(preview, delimiters=',;\t').delimiter
            except csv.Error:
                delimiter = ','
            return list(csv.DictReader(f, delimiter=delimiter))
    except UnicodeDecodeError as exc:
        raise GeoMappingError('CSV muss UTF-8 sein. Export ggf. als UTF-8 speichern.') from exc


def _as_number(value: Any) -> float | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in {'nan', 'null', 'none', 'nodata', '-'}:
        return None
    try:
        n = float(s.replace(',', '.'))
        return n if math.isfinite(n) else None
    except ValueError:
        return None


def _normalize_col_name(value: str) -> str:
    """JMARS schreibt z.B. 'Latitude (N)' und 'Longitude (E)'."""
    return re.sub(r'[^a-z0-9]', '', value.strip().lower())


def _match_column(cols: list[str], options: tuple[str, ...]) -> str | None:
    by_normalized = {_normalize_col_name(c): c for c in cols}
    for option in options:
        if (result := by_normalized.get(_normalize_col_name(option))) is not None:
            return result
    return None


def _csv_numeric_matrix(path: Path) -> tuple[list[str], np.ndarray, str, str]:
    """CSV spaltenorientiert einlesen, ohne Millionen Python-Dictionaries zu erzeugen.

    Besonders wichtig für große JMARS-Polygonexports (Millionen Messpunkte).
    Unterstützt beliebige numerische Messspalten, keine OID als Messwert.
    """
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        preview = f.read(8192)
        f.seek(0)
        try:
            delim = csv.Sniffer().sniff(preview, delimiters=',;\t').delimiter
        except csv.Error:
            delim = ','
        reader = csv.DictReader(f, delimiter=delim)
        cols = list(reader.fieldnames or [])
        if not cols:
            raise GeoMappingError('CSV enthält keinen Spaltenkopf.')
        lat_key = _match_column(cols, ('Latitude (N)', 'Latitude', 'Lat', 'N'))
        lon_key = _match_column(cols, ('Longitude (E)', 'Longitude', 'Lon', 'Long', 'E'))
        if lat_key is None or lon_key is None:
            raise GeoMappingError(
                'CSV benötigt Latitude/Longitude, auch JMARS Latitude (N)/Longitude (E). '
                f'Gefundene Spalten: {cols}'
            )
        ignored = {lat_key, lon_key}
        ignored.update(c for c in cols if _normalize_col_name(c) in {
            'pixelid', 'oid', 'id', 'row', 'column', 'col'
        })
        sample = []
        for _, row in zip(range(100), reader):
            sample.append(row)
        if not sample:
            raise GeoMappingError('CSV enthält keine Datenzeilen.')
        value_cols = [
            c for c in cols if c not in ignored and any(
                _as_number(row.get(c)) is not None for row in sample
            )
        ]
        if not value_cols:
            raise GeoMappingError('CSV enthält keine numerische Messspalte.')
        indices = [cols.index(lat_key), cols.index(lon_key)] + [cols.index(c) for c in value_cols]

    try:
        data = np.loadtxt(
            str(path), delimiter=delim, skiprows=1, usecols=indices,
            dtype=np.float64, encoding='utf-8-sig', ndmin=2,
        )
    except ValueError:
        # Unterstützt auch CSVs mit vereinzelten leeren Messfeldern.
        # Für reguläre, große JMARS-Exporte nutzt der schnelle Pfad np.loadtxt.
        matrix_rows = []
        with path.open('r', encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f, delimiter=delim)
            next(reader, None)
            for row in reader:
                if not row:
                    continue
                items = [_as_number(row[i]) if i < len(row) else None for i in indices]
                matrix_rows.append([float(v) if v is not None else math.nan for v in items])
        data = np.array(matrix_rows, dtype=np.float64)
    return value_cols, data, lat_key, lon_key


@dataclass
class LayerSample:
    name: str
    status: str
    values: dict[str, float] = field(default_factory=dict)
    unit: str = ''
    detail: str = ''


class GeoRaster:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        try:
            self.ds = rasterio.open(self.path)
        except Exception as exc:
            raise GeoMappingError(f'GeoTIFF kann nicht geöffnet werden: {self.path.name}: {exc}') from exc
        if self.ds.crs is None:
            self.ds.close()
            raise GeoMappingError(
                f'{self.path.name}: kein CRS im GeoTIFF. '
                'Ohne Georeferenzierung ist eine automatische Zuordnung nicht zuverlässig.'
            )
        if self.ds.transform.is_identity:
            self.ds.close()
            raise GeoMappingError(
                f'{self.path.name}: keine brauchbare affine GeoTransform. '
                'Das Programm unterstützt aktuell affine GeoTIFFs.'
            )
        try:
            self.crs = CRS.from_wkt(self.ds.crs.to_wkt())
        except Exception as exc:
            self.ds.close()
            raise GeoMappingError(f'CRS kann nicht eingelesen werden: {exc}') from exc
        self.name = self.path.stem

    def close(self) -> None:
        self.ds.close()

    def sample(self, source_crs: CRS, x: float, y: float) -> LayerSample:
        try:
            local_x, local_y = convert_xy(x, y, source_crs, self.crs)
            row, col = self.ds.index(local_x, local_y)
            if not (0 <= row < self.ds.height and 0 <= col < self.ds.width):
                return LayerSample(self.name, 'außerhalb')
            output: dict[str, float] = {}
            for band in range(1, min(self.ds.count, 8) + 1):
                arr = self.ds.read(band, window=Window(col, row, 1, 1), masked=True)
                cell = arr[0, 0]
                if np.ma.is_masked(cell) or not math.isfinite(float(cell)):
                    continue
                label = self.ds.descriptions[band - 1] or f'Band {band}'
                output[label] = float(cell)
            unit = next((x for x in (self.ds.units or ()) if x), '') or self.ds.tags(1).get('units', '')
            return LayerSample(self.name, 'ok' if output else 'NoData', output, unit)
        except Exception as exc:
            return LayerSample(self.name, 'Fehler', detail=str(exc))

    def metadata(self) -> dict[str, Any]:
        return {
            'name': self.name, 'file': str(self.path), 'type': 'GeoTIFF',
            'width': self.ds.width, 'height': self.ds.height,
            'bands': self.ds.count, 'crs': self.crs.to_string(),
            'pixel_size_crs_units': (self.ds.transform.a, self.ds.transform.e),
            'nodata': self.ds.nodata,
        }


class CsvPointLayer:
    """Geografische CSV-Punkte mit explizitem CRS und räumlicher Toleranz."""

    def __init__(
        self, path: str | Path, *, coordinate_crs: str | CRS = MARS_SPHERE_GEO_CRS,
        nearest_radius_m: float = 2500,
    ):
        self.path = Path(path)
        self.name = self.path.stem
        self.crs = CRS.from_user_input(coordinate_crs)
        if not self.crs.is_geographic:
            raise GeoMappingError('CSV-Koordinaten müssen ein geografisches Mars-CRS verwenden.')
        self.radius_m = float(nearest_radius_m)
        if self.radius_m <= 0:
            raise GeoMappingError('CSV-Suchradius muss positiv sein.')
        value_cols, data, lat_key, lon_key = _csv_numeric_matrix(self.path)
        if data.size == 0:
            raise GeoMappingError(f'{self.path.name} enthält keine gültigen Datenzeilen.')
        keep = (np.isfinite(data[:, 0]) & np.isfinite(data[:, 1]) &
                (data[:, 0] >= -90) & (data[:, 0] <= 90))
        data = data[keep]
        if not len(data):
            raise GeoMappingError('Keine gültigen Latitude/Longitude-Punkte in CSV.')

        # Eingabewerte sind in Grad; auch 0...360° Ostlänge ist gültig.
        # Die 3D-Einheitskugel berücksichtigt den 0/360°-Übergang automatisch.
        phi = np.deg2rad(data[:, 0])
        lam = np.deg2rad(data[:, 1])
        cos_phi = np.cos(phi)
        xyz = np.column_stack((
            cos_phi * np.cos(lam), cos_phi * np.sin(lam), np.sin(phi)
        ))
        self.tree = cKDTree(xyz)
        self.rows = data[:, 2:].astype(np.float32, copy=True)
        self.columns = value_cols
        self.radius_sphere = MARS_RADIUS_M
        # Colorized Relief = Visualisierung, KEINE physikalische Geländehöhe.
        self.semantic_warning = (
            'Colorized Relief: Farb-/Darstellungswert, nicht Höhe in Metern.'
            if any('colorizedrelief' in _normalize_col_name(c) for c in value_cols)
            else ''
        )

    def sample(self, source_crs: CRS, x: float, y: float) -> LayerSample:
        try:
            lon, lat = convert_xy(x, y, source_crs, self.crs)
            phi, lam = math.radians(lat), math.radians(lon)
            xyz = [math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)]
            chord_limit = 2 * math.sin(min(self.radius_m / self.radius_sphere, math.pi) / 2)
            chord, idx = self.tree.query(xyz, distance_upper_bound=chord_limit)
            if not math.isfinite(chord) or int(idx) >= len(self.rows):
                return LayerSample(self.name, 'kein naher CSV-Punkt', detail=f'Suchradius: {self.radius_m:g} m')
            distance = 2 * self.radius_sphere * math.asin(min(1., float(chord) / 2))
            row_values = self.rows[int(idx)]
            output = {
                name: float(value) for name, value in zip(self.columns, row_values)
                if np.isfinite(value)
            }
            detail = f'nächster Punkt: {distance:.0f} m entfernt (keine Interpolation)'
            if self.semantic_warning:
                detail += f'\n  ACHTUNG: {self.semantic_warning}'
            return LayerSample(
                self.name, 'ok' if output else 'NoData', output, detail=detail,
            )
        except Exception as exc:
            return LayerSample(self.name, 'Fehler', detail=str(exc))

    def metadata(self) -> dict[str, Any]:
        return {
            'name': self.name, 'file': str(self.path), 'type': 'CSV',
            'points': len(self.rows), 'columns': list(self.columns),
            'crs': self.crs.to_string(), 'nearest_radius_m': self.radius_m,
            'warning': self.semantic_warning,
        }


class MarsMapper:
    """Unabhängige API zum Austausch von Karten bei unveränderten Datenlayern."""

    def __init__(self, grid: FixedGrid | LocalMetricGrid | None = None):
        self.base_map: GeoRaster | None = None
        self.layers: list[GeoRaster | CsvPointLayer] = []
        self.grid: FixedGrid | LocalMetricGrid | None = grid

    def set_fixed_grid(self, grid: FixedGrid | LocalMetricGrid) -> None:
        """Rasterregion explizit setzen, unabhängig von geöffneten Karten."""
        self.grid = grid

    def load_map(self, path: str | Path) -> None:
        """Neue Hintergrundkarte; importierte Datenlayer bleiben erhalten."""
        new_map = GeoRaster(path)
        if self.base_map is not None:
            self.base_map.close()
        self.base_map = new_map

    def add_tiff(self, path: str | Path) -> GeoRaster:
        layer = GeoRaster(path)
        self.layers.append(layer)
        return layer

    def add_csv(self, path: str | Path, *, coordinate_crs: str | CRS = MARS_SPHERE_GEO_CRS,
                nearest_radius_m: float = 2500) -> CsvPointLayer:
        layer = CsvPointLayer(path, coordinate_crs=coordinate_crs, nearest_radius_m=nearest_radius_m)
        self.layers.append(layer)
        return layer

    def remove_layer(self, index: int) -> None:
        layer = self.layers.pop(index)
        if isinstance(layer, GeoRaster):
            layer.close()

    def inspect_raster_pixel(self, col: float, row: float) -> dict[str, Any] | None:
        """Referenzbild-Pixel -> Koordinaten -> sämtliche Datenquellen."""
        if self.base_map is None:
            raise GeoMappingError('Zuerst eine georeferenzierte Karte öffnen.')
        base = self.base_map
        if not (0 <= col < base.ds.width and 0 <= row < base.ds.height):
            return None
        x, y = base.ds.transform * (col + 0.5, row + 0.5)
        lonlat = None
        try:
            geodetic = base.crs.geodetic_crs
            if geodetic is not None:
                lonlat = convert_xy(x, y, base.crs, geodetic)
        except GeoMappingError:
            pass
        if self.grid is not None:
            # Nur innerhalb der FESTEN Rasterregion werden Pixel-/Geo-Koordinaten
            # und Datenwerte ausgegeben. Hintergrundbilder dürfen größer sein.
            lon, lat = convert_xy(x, y, base.crs, CRS.from_user_input(MARS_SPHERE_GEO_CRS))
            grid_xy = self.grid.xy(lon, lat)
            if grid_xy is None:
                return None
        else:
            grid_xy = None
        return {
            'pixel': (int(col), int(row)),
            'grid_xy': grid_xy,
            'native': (float(x), float(y)),
            'native_crs': base.crs.to_string(),
            'lonlat': lonlat,
            'layers': [layer.sample(base.crs, float(x), float(y)) for layer in self.layers],
        }

    def inspect_geo(self, longitude: float, latitude: float, *,
                    coordinate_crs: str | CRS = MARS_SPHERE_GEO_CRS) -> list[LayerSample]:
        """Daten direkt nach Marskoordinaten abfragen, ohne Hintergrundkarte/GUI.

        Achtung: `coordinate_crs` muss die tatsächliche Breiten-/Längenkonvention
        der übergebenen Koordinaten beschreiben (nicht einfach EPSG:4326).
        """
        if not (-90 <= latitude <= 90) or not math.isfinite(longitude):
            raise GeoMappingError('Ungültige geografische Koordinaten.')
        source = CRS.from_user_input(coordinate_crs)
        if self.grid is not None:
            lon, lat = convert_xy(longitude, latitude, source, CRS.from_user_input(MARS_SPHERE_GEO_CRS))
            if self.grid.xy(lon, lat) is None:
                return []
        return [layer.sample(source, longitude, latitude) for layer in self.layers]

    def inspect_grid_cell(self, x: int, y: int) -> list[LayerSample]:
        """Kartenunabhängiger Zugriff auf die feste Rasterzelle (x, y)."""
        if self.grid is None:
            raise GeoMappingError('Kein festes Raster konfiguriert.')
        lon, lat = self.grid.lonlat_center(x, y)
        return self.inspect_geo(lon, lat)

    def close(self) -> None:
        if self.base_map is not None:
            self.base_map.close()
            self.base_map = None
        for layer in self.layers:
            if isinstance(layer, GeoRaster):
                layer.close()
        self.layers.clear()
