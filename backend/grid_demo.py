"""Synthetic 100x100 terrain demo. Run: uv run --extra plot python -m backend.grid_demo"""

import argparse
from dataclasses import asdict, replace
import json
from pathlib import Path
from random import Random

from backend.astar import astar
from backend.terrain_costs import CostConfig, TerrainCell, build_cost_grid

GRID_SIZE = 100
START = (10, 10)
GOAL = (80, 80)
CELL_SIZE_M = 1
# Illustrative limits and dimensionless cost/m, not mission safety thresholds.
CONFIG = CostConfig(20, 0.5, 0.8, 1, slope_weight=2, roughness_weight=2,
                    uncertainty_weight=1)


def create_example_grid() -> list[list[TerrainCell]]:
    """Grid = [[Datum, Datum, ...], ...], 100 rows of 100 feature records.

    Gently rising terrain, a rough patch, a ridge with a passage in rows 60-69,
    one explicit obstacle and one cell with insufficient observations.
    Features are invented independently, not derived from a measured DEM.
    """
    rng = Random(42)
    grid = []
    for row in range(GRID_SIZE):
        cells = []
        for col in range(GRID_SIZE):
            rough_patch = 20 <= row < 50 and 20 <= col < 40
            cells.append(TerrainCell(
                elevation_m=round(-3600 + row * 0.08 + col * 0.05 + rng.uniform(-0.1, 0.1), 2),
                slope_deg=round(rng.uniform(10, 16) if rough_patch else rng.uniform(2, 8), 2),
                roughness_m=round(rng.uniform(0.25, 0.45) if rough_patch else rng.uniform(0.02, 0.12), 3),
                valid_fraction=round(rng.uniform(0.9, 1.0), 3),
            ))
        grid.append(cells)
    for row in range(90):
        if not 60 <= row < 70:
            for col in range(50, 60):
                grid[row][col] = replace(grid[row][col], slope_deg=27)
    for row in range(30, 40):
        for col in range(10, 20):
            grid[row][col] = replace(grid[row][col], blocked=True)
    for row in range(70, 80):
        for col in range(70, 80):
            grid[row][col] = replace(grid[row][col], valid_fraction=0.5)
    return grid


def save_plots(costs, result, expanded, output_dir):
    import matplotlib
    matplotlib.use('Agg')  # Also works without a GUI; images are always saved.
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch
    import numpy as np

    values = np.array([[np.nan if x is None else x for x in row] for row in costs])
    cmap = plt.get_cmap('YlOrRd').copy()
    cmap.set_bad('#293545')
    for show_path, filename in ((False, '01_normalized_costs.png'), (True, '02_astar_nodes.png')):
        fig, ax = plt.subplots(figsize=(10, 9), layout='constrained')
        image = ax.imshow(np.ma.masked_invalid(values), cmap=cmap,
                          vmin=np.nanmin(values), vmax=np.nanmax(values))
        fig.colorbar(image, ax=ax, shrink=0.8, label='Gewichtete Kosten pro Meter (Demo)')
        handles = [Patch(facecolor='#293545', label='Gesperrt / Daten unzureichend')]
        if show_path:
            er, ec = zip(*expanded)
            # Mark evaluated cell centers separately from the resulting route.
            ax.scatter(ec, er, s=4,
                       marker='s', color='#2584ba', alpha=0.45, zorder=3)
            pr, pc = zip(*result.path)
            ax.plot(pc, pr, color='#0658c4', lw=2, alpha=0.75, zorder=3)
            ax.scatter(pc, pr, s=9, facecolors='none', edgecolors='#0658c4', linewidths=0.6, zorder=4)
            for cell, marker, color in ((START, 'o', '#00945e'), (GOAL, '*', '#ba0073')):
                ax.scatter(cell[1], cell[0], s=160, marker=marker, color=color, zorder=5)
            handles += [Line2D([], [], marker='s', ls='', color='#2584ba', label=f'Ausgewertet: {len(set(expanded))} Knoten'),
                        Line2D([], [], marker='o', color='#0658c4', markerfacecolor='none', label=f'Gefundener Pfad: {len(result.path)} Knoten'),
                        Line2D([], [], marker='o', ls='', color='#00945e', label=f'Start {START}'),
                        Line2D([], [], marker='*', ls='', color='#ba0073', label=f'Ziel {GOAL}')]
        ax.set(xticks=range(0, GRID_SIZE, 10), yticks=range(0, GRID_SIZE, 10), xlabel='Spalte', ylabel='Zeile',
               title=('A*: ausgewertete Knoten und optimaler Pfad' if show_path else '100 x 100: normalisiertes Kostenraster'))
        ax.legend(handles=handles, loc='upper center', bbox_to_anchor=(0.5, -0.08), ncol=2, fontsize=9)
        fig.suptitle('Synthetische Beispieldaten | 1 m pro Zelle | keine kalibrierte Reisezeit', fontsize=11)
        fig.savefig(output_dir / filename, dpi=160)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('tmp/grid_demo'))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    grid = create_example_grid()
    costs = build_cost_grid(grid, CONFIG)
    expanded = []
    result = astar(costs, START, GOAL, cell_size_m=CELL_SIZE_M, on_expand=expanded.append)
    if result is None:
        raise RuntimeError('Example unexpectedly has no route')
    payload = {'synthetic': True, 'cell_size_m': CELL_SIZE_M, 'config': asdict(CONFIG),
               'grid': [[asdict(cell) for cell in row] for row in grid], 'costs': costs,
               'start': START, 'goal': GOAL, 'expanded': expanded,
               'path': result.path, 'total_cost': result.total_cost}
    (args.output_dir / 'grid_example.json').write_text(json.dumps(payload, indent=2, allow_nan=False), encoding='utf-8')
    save_plots(costs, result, expanded, args.output_dir)
    print(f'Grid: 100x100; ausgewertet: {len(set(expanded))}; Pfad: {len(result.path)} Knoten')
    print(f'Gesamtkosten: {result.total_cost:.2f} (Demo-Kosteneinheiten, keine Sekunden)')
    print(f'Ergebnisse: {args.output_dir.resolve()}')


if __name__ == '__main__':
    main()
