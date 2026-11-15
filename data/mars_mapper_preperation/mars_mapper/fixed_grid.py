"""Permanentes Koordinatenraster, unabhängig von geladenen Karten oder Datenquellen.

Raster-(0,0) = links oben (West/Nord), X geht nach Osten, Y nach Süden.
Die Rastergrenzen werden in Marskoordinaten angegeben, nicht aus dem GeoTIFF
oder dem größten importierten Datensatz abgeleitet.

Die geografische Rasterweite (Grad) ist konstant, NICHT die physische
Ost-West-Zellbreite in Metern; letztere hängt vom Breitengrad ab. Für echte
Routenlängen müssen die Mars-Geodäsie oder eine lokale metrische Projektion
verwendet werden.
"""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json
import math
import numpy as np
from .local_grid import LocalMetricGrid

MARS_RADIUS_M = 3_396_190.0


@dataclass(frozen=True)
class FixedGrid:
    mode = 'geographic_bounds'

    west: float
    east: float
    south: float
    north: float
    columns: int
    rows: int

    def __post_init__(self):
        if not all(math.isfinite(v) for v in (self.west, self.east, self.south, self.north)):
            raise ValueError('Rastergrenzen müssen endliche Zahlen sein.')
        if not (-90 <= self.south < self.north <= 90):
            raise ValueError('Raster: south < north und Breiten zwischen -90 und 90 erforderlich.')
        if not (0 < self.east - self.west < 360):
            raise ValueError('Raster: 0 < east-west < 360 Grad erforderlich (ggf. Ostgrenze > 360).')
        if not (1 <= self.rows <= 20_000 and 1 <= self.columns <= 20_000):
            raise ValueError('Rasterdimensionen müssen zwischen 1 und 20.000 liegen.')
        if self.rows * self.columns > 8_000_000:
            raise ValueError('Maximal 8 Millionen Rasterzellen erlaubt.')

    @classmethod
    def from_approximate_meters(cls, *, west: float, east: float, south: float,
                                north: float, cell_m: float) -> 'FixedGrid':
        if not math.isfinite(cell_m) or cell_m <= 0:
            raise ValueError('Zellgröße muss positiv sein.')
        deg_per_cell = math.degrees(cell_m / MARS_RADIUS_M)
        return cls(west, east, south, north,
                   math.ceil((east-west) / deg_per_cell),
                   math.ceil((north-south) / deg_per_cell))

    @property
    def step_lon(self) -> float:
        return (self.east-self.west)/self.columns

    @property
    def step_lat(self) -> float:
        return (self.north-self.south)/self.rows

    @property
    def approx_north_south_cell_m(self) -> float:
        return math.radians(self.step_lat) * MARS_RADIUS_M

    def lon_unwrapped(self, lon: float) -> float:
        """-10° und 350° für ein 345..355°-Raster als dieselbe Position behandeln."""
        return self.west + ((lon - self.west) % 360)

    def xy(self, lon: float, lat: float) -> tuple[int,int] | None:
        """Lon/Lat -> (X,Y), mit (0,0) am Nordwest-Rand; Grenzen Ost/Süd exklusiv."""
        if not (math.isfinite(lon) and math.isfinite(lat)):
            return None
        dlon = (lon - self.west) % 360
        if not (0 <= dlon < self.east-self.west and self.south < lat <= self.north):
            return None
        x = min(self.columns-1, math.floor(dlon/self.step_lon))
        y = min(self.rows-1, math.floor((self.north-lat)/self.step_lat))
        return int(x), int(y)

    def lonlat_center(self, x: int, y: int) -> tuple[float,float]:
        if not (0 <= x < self.columns and 0 <= y < self.rows):
            raise IndexError(f'Rasterzelle ({x},{y}) liegt außerhalb des Koordinatenrasters.')
        return (self.west + (x+0.5)*self.step_lon,
                self.north - (y+0.5)*self.step_lat)

    def lonlat_mesh(self) -> tuple[np.ndarray,np.ndarray]:
        lons = self.west + (np.arange(self.columns, dtype=np.float64)+0.5)*self.step_lon
        lats = self.north - (np.arange(self.rows, dtype=np.float64)+0.5)*self.step_lat
        return np.broadcast_to(lons, (self.rows,self.columns)), np.broadcast_to(lats[:,None], (self.rows,self.columns))

    def boundary_points(self, per_side: int = 30) -> list[tuple[float,float]]:
        t = np.linspace(0,1,per_side+1)
        p = [(self.west+(self.east-self.west)*v, self.north) for v in t]
        p += [(self.east, self.north+(self.south-self.north)*v) for v in t[1:]]
        p += [(self.east+(self.west-self.east)*v, self.south) for v in t[1:]]
        p += [(self.west, self.south+(self.north-self.south)*v) for v in t[1:]]
        return p

    def to_dict(self) -> dict:
        return {'mode': self.mode, 'west': self.west, 'east': self.east,
                'south': self.south, 'north': self.north,
                'columns': self.columns, 'rows': self.rows,
                'origin': 'upper-left', 'index_order': '(x=column, y=row)',
                'latitude_definition': 'planetocentric',
                'longitude_definition': 'east-positive',
                'approx_cell_north_south_m': self.approx_north_south_cell_m}

    @classmethod
    def load(cls, filename: str | Path) -> 'FixedGrid':
        data = json.loads(Path(filename).read_text(encoding='utf-8'))
        mode = data.get('mode', 'geographic_bounds')
        if mode == 'local_metric':
            return LocalMetricGrid(**{k: data[k] for k in (
                'reference_latitude', 'reference_longitude', 'cell_size_m', 'columns', 'rows')},
                reference_position=data.get('reference_position','center'),
                mars_radius_m=data.get('mars_radius_m', MARS_RADIUS_M))
        if mode != 'geographic_bounds':
            raise ValueError(f'Unbekannter Raster-Modus: {mode}')
        return cls(**{k:data[k] for k in ('west','east','south','north','columns','rows')})

    def save(self, filename: str | Path) -> None:
        Path(filename).write_text(json.dumps(self.to_dict(), indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
