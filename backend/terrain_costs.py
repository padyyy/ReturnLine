"""Convert terrain features to a cost grid for backend.astar."""

from dataclasses import dataclass
from math import isfinite
from numbers import Real
from typing import Sequence


@dataclass(frozen=True)
class TerrainCell:
    elevation_m: float | None
    slope_deg: float | None
    roughness_m: float | None
    valid_fraction: float | None
    blocked: bool | None = False
    protected_zone: bool | None = None
    radiation_msv_per_day: float | None = None
    scientifically_relevant: bool | None = None


@dataclass(frozen=True)
class CostConfig:
    # Required: the team must choose terrain limits and a base cost.
    max_slope_deg: float
    max_roughness_m: float
    min_valid_fraction: float
    base_cost_per_m: float
    slope_weight: float = 1.0
    roughness_weight: float = 1.0
    uncertainty_weight: float = 1.0

    def __post_init__(self) -> None:
        values = vars(self)
        if any(not isinstance(v, Real) or not isfinite(v) for v in values.values()):
            raise ValueError("configuration values must be finite numbers")
        if not 0 < self.max_slope_deg <= 90 or self.max_roughness_m <= 0:
            raise ValueError("slope limit must be in (0, 90]; roughness limit must be positive")
        if not 0 <= self.min_valid_fraction <= 1 or self.base_cost_per_m <= 0:
            raise ValueError("quality limit must be in [0, 1]; base cost must be positive")
        if min(self.slope_weight, self.roughness_weight, self.uncertainty_weight) < 0:
            raise ValueError("weights must be nonnegative")


def build_cost_grid(
    terrain: Sequence[Sequence[TerrainCell]], config: CostConfig, *, ignore_missing: bool = False
) -> list[list[float | None]]:
    """Normalize features with fixed reference limits and apply weighted penalties.

    cost = base * (1 + ws*slope/max_slope + wr*roughness/max_roughness
                   + wu*(1-valid_fraction)).

    With ignore_missing=True, unavailable slope/roughness/quality and unknown
    blocked status are ignored. Missing elevation also adds no restriction;
    this permissive mode does not certify that unknown terrain is traversable.
    Protected/science/radiation fields are metadata here, not travel-time costs.

    Limits are inclusive: values ABOVE slope/roughness limits or BELOW minimum
    valid fraction are blocked. Explicitly blocked cells and cells containing
    missing/nonfinite features are blocked too, even with zero feature weights.
    Finite features outside their physical ranges raise ValueError. Elevation
    is retained in the original grid but is not penalized: absolute altitude
    is not the same as climbing effort. Input grids are not modified.
    The result has the base cost's units; it is not a calibrated travel-time
    estimate unless the base and penalties have been calibrated accordingly.
    """
    if len(terrain) == 0 or len(terrain[0]) == 0:
        raise ValueError("terrain must be a nonempty rectangular grid")
    width = len(terrain[0])
    result = []
    for row in terrain:
        if len(row) != width:
            raise ValueError("terrain must be rectangular")
        costs = []
        for cell in row:
            if not isinstance(cell, TerrainCell):
                raise ValueError("each cell must be a TerrainCell")
            if not isinstance(cell.blocked, bool) and not (ignore_missing and cell.blocked is None):
                raise ValueError("blocked must be a boolean")
            if cell.blocked:
                costs.append(None)
                continue
            values = (cell.elevation_m, cell.slope_deg, cell.roughness_m, cell.valid_fraction)
            if any(v is not None and not isinstance(v, Real) for v in values):
                raise ValueError("terrain features must be numeric or None")
            if not ignore_missing and any(v is None or not isfinite(v) for v in values):
                costs.append(None)
                continue
            # Neutral terms for unavailable optional inputs; the cell retains None.
            slope = cell.slope_deg if cell.slope_deg is not None and isfinite(cell.slope_deg) else 0.0
            roughness = cell.roughness_m if cell.roughness_m is not None and isfinite(cell.roughness_m) else 0.0
            quality = cell.valid_fraction if cell.valid_fraction is not None and isfinite(cell.valid_fraction) else 1.0
            if not 0 <= slope <= 90 or roughness < 0 or not 0 <= quality <= 1:
                raise ValueError("invalid slope, roughness or valid fraction")
            if (slope > config.max_slope_deg or roughness > config.max_roughness_m
                    or quality < config.min_valid_fraction):
                costs.append(None)
                continue
            cost = config.base_cost_per_m * (
                1 + config.slope_weight * slope / config.max_slope_deg
                + config.roughness_weight * roughness / config.max_roughness_m
                + config.uncertainty_weight * (1 - quality)
            )
            if not isfinite(cost):
                raise ValueError("computed cost overflowed; reduce base cost or weights")
            costs.append(cost)
        result.append(costs)
    return result
