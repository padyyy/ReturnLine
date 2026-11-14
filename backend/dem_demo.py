"""DEM -> local terrain features -> normalized costs -> offline A* plots.

Run: uv run --extra plot python -m backend.dem_demo /path/to/dem.tif
"""
import argparse
from collections import deque
from dataclasses import asdict
import json
from pathlib import Path

import numpy as np
import rasterio

from backend.astar import astar
from backend.terrain_costs import CostConfig, TerrainCell, build_cost_grid

# Test assumptions, NOT calibrated mission parameters or travel times.
CONFIG = CostConfig(20, 0.5, 0.8, 1, 2, 2, 1)


def box_sum(array, size):
    radius = size // 2
    padded = np.pad(array, radius, mode='constant')
    integral = np.pad(padded, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    return integral[size:, size:] - integral[:-size, size:] - integral[size:, :-size] + integral[:-size, :-size]


def derive_features(elevation, cell_size_m, window=11):
    """Fit a local plane on odd windows; roughness = RMS plane residual in m.

    Require a complete valid window (conservative: boundaries and windows near
    missing data are blocked). valid_fraction describes window coverage only,
    not the DEM's actual measurement accuracy. Input elevations must be metres.
    """
    if window < 3 or window % 2 != 1:
        raise ValueError('window must be odd and >= 3')
    if not np.isfinite(cell_size_m) or cell_size_m <= 0:
        raise ValueError('cell size must be finite and positive')
    z = np.asarray(elevation, dtype=float)
    valid = np.isfinite(z)
    if z.ndim != 2 or not valid.any():
        raise ValueError('elevation must be a 2D grid with valid values')
    count = box_sum(valid.astype(float), window)
    quality = count / (window * window)
    # Center elevations for numerical stability when squaring.
    z = np.where(valid, z - np.nanmedian(np.where(valid, z, np.nan)), 0)
    row, col = np.indices(z.shape)
    total = box_sum(z, window)
    n = window * window
    moment = window * sum(k*k for k in range(-(window//2), window//2 + 1))
    gx = (box_sum(z * col, window) - col * total) / moment
    gy = (box_sum(z * row, window) - row * total) / moment
    slope = np.degrees(np.arctan(np.hypot(gx, gy) / cell_size_m))
    variance = box_sum(z*z, window) / n - (total / n)**2
    residual = variance - (gx*gx + gy*gy) * moment / n
    roughness = np.sqrt(np.maximum(residual, 0))
    complete = count == n
    slope[~complete] = np.nan
    roughness[~complete] = np.nan
    return slope, roughness, quality


def nearest_open(costs, desired):
    cells = np.argwhere(np.isfinite(costs))
    if len(cells) == 0:
        raise ValueError('No traversable cells under the test thresholds')
    best = cells[np.argmin(np.sum((cells - desired)**2, axis=1))]
    return tuple(int(v) for v in best)


def largest_component(costs):
    """Four-connected passable area for automatic demo endpoints only."""
    remaining = np.isfinite(costs).copy()
    rows, cols = remaining.shape
    largest = []
    for r, c in np.argwhere(remaining):
        if not remaining[r, c]:
            continue
        remaining[r, c] = False
        queue = deque([(int(r), int(c))])
        component = []
        while queue:
            row, col = queue.popleft()
            component.append((row, col))
            for nr, nc in ((row-1, col), (row+1, col), (row, col-1), (row, col+1)):
                if 0 <= nr < rows and 0 <= nc < cols and remaining[nr, nc]:
                    remaining[nr, nc] = False
                    queue.append((nr, nc))
        if len(component) > len(largest):
            largest = component
    mask = np.zeros(costs.shape, dtype=bool)
    if largest:
        r, c = zip(*largest)
        mask[r, c] = True
    return mask


def save_plots(elevation, slope, costs, expanded, result, start, goal, out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    cmap = plt.get_cmap('YlOrRd').copy()
    cmap.set_bad('#293545')
    for filename, values, title, label, palette, route in (
        ('00_elevation.png', elevation, 'Gale: eingelesenes Höhenmodell', 'Höhe (m)', 'terrain', False),
        ('01_normalized_costs.png', costs, 'Normalisierte Geländekosten', 'Demo-Kosten pro Meter', cmap, False),
        ('02_astar_nodes.png', costs, 'A*: ausgewertete Zellen und gefundener Pfad', 'Demo-Kosten pro Meter', cmap, True),
    ):
        fig, ax = plt.subplots(figsize=(11, 9), layout='constrained')
        im = ax.imshow(np.ma.masked_invalid(values), cmap=palette, interpolation='nearest')
        fig.colorbar(im, ax=ax, shrink=0.85, label=label)
        if route:
            overlay = np.zeros((*expanded.shape, 4))
            overlay[expanded] = [0.05, 0.4, 0.9, 0.25]
            ax.imshow(overlay, interpolation='nearest')
            if result:
                r, c = zip(*result.path)
                ax.plot(c, r, color='#00e5ff', lw=2)
            ax.scatter([start[1]], [start[0]], color='#00c070', s=90, edgecolors='black', zorder=5)
            ax.scatter([goal[1]], [goal[0]], color='#f00090', marker='*', s=160, edgecolors='black', zorder=5)
            ax.legend(handles=[Line2D([], [], color='#2584ba', lw=7, alpha=0.5, label=f'Ausgewertet: {expanded.sum():,}'),
                               Line2D([], [], color='#00e5ff', label='Pfad' if result else 'Kein Weg gefunden'),
                               Line2D([], [], color='#00c070', marker='o', ls='', label=f'Start {start}'),
                               Line2D([], [], color='#f00090', marker='*', ls='', label=f'Ziel {goal}')],
                      loc='upper center', bbox_to_anchor=(0.5, -0.08), ncol=2)
        ax.set(title=title, xlabel='Spalte (Pixel)', ylabel='Zeile (Pixel)')
        fig.suptitle('Echtes DEM | lokale Ebene: 11 × 11 Pixel | Testgrenzen, keine Reisezeit', fontsize=11)
        fig.savefig(out / filename, dpi=160)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dem', type=Path)
    parser.add_argument('--output-dir', type=Path, default=Path('tmp/dem_demo'))
    parser.add_argument('--start', nargs=2, type=int, metavar=('ROW', 'COL'))
    parser.add_argument('--goal', nargs=2, type=int, metavar=('ROW', 'COL'))
    args = parser.parse_args()
    with rasterio.open(args.dem) as src:
        t = src.transform
        if (src.crs is None or not src.crs.is_projected or src.crs.linear_units != 'metre'
                or t.b != 0 or t.d != 0 or t.a <= 0 or t.e >= 0 or not np.isclose(t.a, -t.e)):
            raise ValueError('Expected north-up square pixels in a projected metre CRS')
        cell_size = float(t.a)
        elevation = src.read(1, masked=True).astype(float).filled(np.nan)
        metadata = {'crs': src.crs.to_wkt(), 'transform': list(t), 'source': str(args.dem.resolve()),
                    'source_band_unit': src.units[0], 'elevation_unit_assumption': 'metres'}
    slope, roughness, quality = derive_features(elevation, cell_size)
    terrain = [[TerrainCell(float(z), float(s), float(r), float(q)) for z, s, r, q in zip(*row)]
               for row in zip(elevation, slope, roughness, quality)]
    cost_grid = build_cost_grid(terrain, CONFIG)
    del terrain
    costs = np.array([[np.nan if v is None else v for v in row] for row in cost_grid])
    rows, cols = costs.shape
    # Explicit user endpoints are never relocated; only automatic demo points
    # are chosen from the largest component to illustrate a reachable route.
    selection = np.where(largest_component(costs), costs, np.nan) if not args.start or not args.goal else costs
    start = tuple(args.start) if args.start else nearest_open(selection, (rows//10, cols//10))
    goal = tuple(args.goal) if args.goal else nearest_open(selection, (rows*9//10, cols*9//10))
    expanded = np.zeros(costs.shape, dtype=bool)
    def observe(cell):
        expanded[cell] = True
    result = astar(cost_grid, start, goal, cell_size_m=cell_size, on_expand=observe)
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    summary = {**metadata, 'shape': list(costs.shape), 'cell_size_m': cell_size,
               'window_pixels': 11, 'baseline_m': 10*cell_size, 'config': asdict(CONFIG),
               'valid_elevation_cells': int(np.isfinite(elevation).sum()),
               'traversable_cells': int(np.isfinite(costs).sum()),
               'expanded_cells': int(expanded.sum()), 'start': start, 'goal': goal,
               'automatic_endpoint_policy': 'nearest to 10% / 90% grid index within largest four-connected passable component',
               'path': result.path if result else None, 'total_cost': result.total_cost if result else None,
               'route_length_m': (len(result.path)-1)*cell_size if result else None,
               'cost_units': 'uncalibrated demo cost; not seconds'}
    (out/'route_summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False), encoding='utf-8')
    np.savez_compressed(out/'terrain_arrays.npz', elevation=elevation, slope_deg=slope,
                        roughness_m=roughness, valid_fraction=quality, costs=costs, expanded=expanded)
    save_plots(elevation, slope, costs, expanded, result, start, goal, out)
    print(json.dumps({k: v for k, v in summary.items() if k not in ('crs', 'transform', 'path')}, indent=2))
    print(f'Outputs: {out.resolve()}')


if __name__ == '__main__':
    main()
