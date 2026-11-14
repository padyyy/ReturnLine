"""Kartenunabhängiges, lokales METRISCHES Koordinatenraster für den Mars.

Die Koordinaten aus der Konfiguration sind ECHTE geografische Marskoordinaten,
nicht Pixelkoordinaten eines bestimmten GeoTIFFs. Die Projektion ist eine
lokale sphärische Equidistant-Cylindrical/Equirectangular-Abbildung mit
Breitenreferenz reference_latitude und Längenreferenz reference_longitude.

Annahmen: planetozentrische Breite, Ost-positive Länge, Mars-Kugel mit dem
festgelegten Radius. Alle Eingabelayer müssen vorher auf dieselbe Breiten-
und Längenkonvention gebracht sein; das übernimmt core.py per GeoTIFF-CRS.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import math
import numpy as np

MARS_RADIUS_M = 3_396_190.0


@dataclass(frozen=True)
class LocalMetricGrid:
    reference_latitude: float
    reference_longitude: float
    cell_size_m: float
    columns: int
    rows: int
    reference_position: str = 'center'
    mars_radius_m: float = MARS_RADIUS_M

    mode = 'local_metric'

    def __post_init__(self) -> None:
        if not all(math.isfinite(v) for v in (
            self.reference_latitude, self.reference_longitude,
            self.cell_size_m, self.mars_radius_m
        )):
            raise ValueError('Referenzkoordinaten, Radius und Zellgröße müssen endlich sein.')
        if not (-89.0 < self.reference_latitude < 89.0):
            raise ValueError('Lokales equirektangulares Raster erfordert -89° < Latitude < 89°.')
        if self.cell_size_m <= 0 or self.mars_radius_m <= 0:
            raise ValueError('Zellgröße und Mars-Radius müssen positiv sein.')
        if self.reference_position not in ('center', 'northwest_corner'):
            raise ValueError('reference_position muss center oder northwest_corner sein.')
        if not (1 <= self.columns <= 20_000 and 1 <= self.rows <= 20_000):
            raise ValueError('Rasterdimensionen müssen zwischen 1 und 20.000 liegen.')
        if self.rows*self.columns > 8_000_000:
            raise ValueError('Maximal 8 Millionen Rasterzellen erlaubt.')
        lat_min = self._from_local(0, self.rows*self.cell_size_m)[1]
        lat_max = self._from_local(0, 0)[1]
        if not (-90 <= lat_min <= lat_max <= 90):
            raise ValueError('Das Raster reicht über die Mars-Pole hinaus.')
        lon_span_rad = self.columns * self.cell_size_m / (
            self.mars_radius_m * math.cos(math.radians(self.reference_latitude)))
        if lon_span_rad >= math.pi:
            raise ValueError('Raster zu breit (>180° Länge); lokale Projektion nicht eindeutig.')

    @property
    def width_m(self) -> float:
        return self.columns*self.cell_size_m

    @property
    def height_m(self) -> float:
        return self.rows*self.cell_size_m

    @property
    def _left_x(self) -> float:
        return -self.width_m/2 if self.reference_position == 'center' else 0.0

    @property
    def _top_y(self) -> float:
        return self.height_m/2 if self.reference_position == 'center' else 0.0

    def _from_local(self, right_m: float, down_m: float) -> tuple[float,float]:
        """Pixelnahe Position -> (Lon,Lat), right/down in Metern vom NW-Rasterrand."""
        east_m = self._left_x + right_m
        north_m = self._top_y - down_m
        latitude = self.reference_latitude + math.degrees(north_m/self.mars_radius_m)
        longitude = self.reference_longitude + math.degrees(east_m/(
            self.mars_radius_m * math.cos(math.radians(self.reference_latitude))))
        return longitude % 360.0, latitude

    def xy(self, lon: float, lat: float) -> tuple[int,int] | None:
        """Geografische Koordinaten -> feste (Spalte,Zeile), NW=(0,0)."""
        if not (math.isfinite(lon) and math.isfinite(lat) and -90 <= lat <= 90):
            return None
        delta_lon_deg = ((lon - self.reference_longitude + 180) % 360) - 180
        east_m = self.mars_radius_m * math.cos(math.radians(self.reference_latitude)) * math.radians(delta_lon_deg)
        north_m = self.mars_radius_m * math.radians(lat - self.reference_latitude)
        x_metres = east_m - self._left_x
        y_metres = self._top_y - north_m
        if not (0 <= x_metres < self.width_m and 0 <= y_metres < self.height_m):
            return None
        return int(math.floor(x_metres/self.cell_size_m)), int(math.floor(y_metres/self.cell_size_m))

    def lonlat_center(self, x: int, y: int) -> tuple[float,float]:
        if not (0 <= x < self.columns and 0 <= y < self.rows):
            raise IndexError(f'Rasterzelle ({x},{y}) liegt außerhalb des Koordinatenrasters.')
        return self._from_local((x+0.5)*self.cell_size_m, (y+0.5)*self.cell_size_m)

    def lonlat_mesh(self) -> tuple[np.ndarray,np.ndarray]:
        """Matrizen lon,lat mit shape=(rows, columns) aller Zellmittelpunkte."""
        xs = (np.arange(self.columns, dtype=np.float64)+0.5)*self.cell_size_m
        ys = (np.arange(self.rows, dtype=np.float64)+0.5)*self.cell_size_m
        lon = (self.reference_longitude + np.degrees((self._left_x + xs)/(
            self.mars_radius_m * math.cos(math.radians(self.reference_latitude))))) % 360.0
        lat = self.reference_latitude + np.degrees((self._top_y - ys)/self.mars_radius_m)
        return np.broadcast_to(lon, (self.rows, self.columns)), np.broadcast_to(lat[:, None], (self.rows, self.columns))

    def boundary_points(self, per_side: int = 30) -> list[tuple[float,float]]:
        """Geschlossene Rastergrenze als echte Marskoordinaten (für Karten-Overlay)."""
        w, h = self.width_m, self.height_m
        fractions = np.linspace(0.0, 1.0, per_side+1)
        xy = [(w*t, 0.0) for t in fractions]
        xy += [(w, h*t) for t in fractions[1:]]
        xy += [(w*(1-t), h) for t in fractions[1:]]
        xy += [(0.0, h*(1-t)) for t in fractions[1:]]
        return [self._from_local(x,y) for x,y in xy]

    def to_dict(self) -> dict:
        return {
            'mode': self.mode,
            'reference_latitude': self.reference_latitude,
            'reference_longitude': self.reference_longitude,
            'reference_position': self.reference_position,
            'cell_size_m': self.cell_size_m,
            'columns': self.columns,
            'rows': self.rows,
            'mars_radius_m': self.mars_radius_m,
            'origin': 'upper-left',
            'index_order': '(x=column, y=row)',
            'latitude_definition': 'planetocentric',
            'longitude_definition': 'east-positive',
            'projection': 'local_equirectangular',
            'reference_role': 'Geografischer Projektionsanker, unabhängig von der Hintergrundkarte',
        }

    def save(self, filename: str | Path) -> None:
        Path(filename).write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
