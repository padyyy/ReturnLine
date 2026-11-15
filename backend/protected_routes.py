"""Compare protected-zone avoidance and unrestricted A* routes on mapped data."""
import argparse
import json
from pathlib import Path

import numpy as np

from backend.mapper_route import (
    add_map_arguments, prepare_maps_from_args, route_prepared, with_protected_penalty,
)


def calculate_variants(prepared, start_lonlat, goal_lonlat, avoidance_penalty=100):
    """Return two independent routes; require a complete binary protection mask.

    A finite penalty prefers avoidance but permits crossing if necessary.
    Zero removes only protection penalties, never terrain or radiation limits.
    """
    if not np.isfinite(avoidance_penalty) or avoidance_penalty <= 0:
        raise ValueError('avoidance_penalty must be finite and positive')
    zones = prepared.arrays['protected_zone']
    if not np.isin(zones, [0, 1]).all():
        raise ValueError('Two-route comparison requires a complete 0/1 protected_zone mask')
    routes = {}
    for name, penalty in [('avoid_protected', avoidance_penalty), ('allow_protected', 0)]:
        variant = with_protected_penalty(prepared, penalty)
        path, _, _, _, summary = route_prepared(variant, start_lonlat, goal_lonlat)
        summary['protected_cells_on_path'] = (
            sum(int(zones[y, x] == 1) for x, y in path) if path else None)
        summary['protected_distance_m'] = (
            sum(int(zones[y, x] == 1) for x, y in path[1:]) * prepared.grid.cell_size_m
            if path else None)
        routes[name] = {'path_xy': path, 'summary': summary}
    return routes


def export_comparison(out, prepared, routes, *, plot=False):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    prepared.grid.save(out / 'grid.json')
    (out / 'routes.json').write_text(json.dumps(
        routes, indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    for name, route in routes.items():
        directory = out / name
        directory.mkdir(exist_ok=True)
        for field, filename in [('path_xy', 'path_xy.json'), ('summary', 'summary.json')]:
            (directory / filename).write_text(json.dumps(
                route[field], indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    if plot:
        plot_comparison(out / 'routes.png', prepared, routes)


def plot_comparison(path, prepared, routes):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap

    fig, axes = plt.subplots(1, 2, figsize=(15, 7), layout='constrained', sharex=True, sharey=True)
    for ax, (name, route), color, label in zip(
            axes, routes.items(), ['#008855', '#0066ff'], ['Schutzzonen meiden', 'Schutzzonen erlaubt']):
        ax.imshow(prepared.arrays['elevation_m'], cmap='gray', interpolation='nearest')
        ax.imshow(np.ma.masked_where(prepared.arrays['protected_zone'] != 1,
                                    prepared.arrays['protected_zone']),
                  cmap=ListedColormap(['#ef8844']), alpha=.65, interpolation='nearest')
        ax.imshow(np.ma.masked_where(np.isfinite(prepared.arrays['costs']),
                                    np.ones_like(prepared.arrays['costs'])),
                  cmap=ListedColormap(['#29243d']), alpha=.8, interpolation='nearest')
        summary, points = route['summary'], route['path_xy']
        if points:
            x, y = zip(*points)
            ax.plot(x, y, color=color, lw=2, label=f"Route: {summary['length_m']:.1f} m")
        ax.scatter(*summary['start_xy'], color='#00ddaa', edgecolors='black', marker='s', s=65, label='Start', zorder=5)
        ax.scatter(*summary['goal_xy'], color='#ffdd00', edgecolors='black', marker='*', s=120, label='Ziel', zorder=5)
        protected_length = summary['protected_distance_m']
        protected_label = f'{protected_length:.1f} m' if protected_length is not None else 'unbekannt'
        ax.set_title(f"{label} | Zuschlag {summary['protected_penalty']:g}\n"
                     f"{summary['status']} | Strecke in Schutzzone: {protected_label}")
        ax.set_xlabel('x / Spalte'); ax.set_ylabel('y / Zeile'); ax.legend(loc='lower left')
    points = [point for route in routes.values() for point in (route['path_xy'] or [])]
    if points:
        xx, yy = zip(*points)
        axes[0].set_xlim(max(-.5, min(xx)-70), min(prepared.grid.columns-.5, max(xx)+70))
        axes[0].set_ylim(min(prepared.grid.rows-.5, max(yy)+70), max(-.5, min(yy)-70))
    fig.suptitle('A*-Vergleich | Orange: Schutzzone | Dunkel: gesperrt | Grau: Hoehe\n'
                 'Identisches Raster und Gelaende; Testgewichte, keine Gehzeiten')
    fig.savefig(path, dpi=160)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dem', type=Path)
    parser.add_argument('--start', nargs=2, type=float, required=True)
    parser.add_argument('--goal', nargs=2, type=float, required=True)
    add_map_arguments(parser)
    parser.add_argument('--avoidance-penalty', type=float, default=100)
    parser.add_argument('--plot', action='store_true')
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).parent / 'routes/protected_routes')
    args = parser.parse_args()
    if args.protected_penalty != 0:
        parser.error('Use --avoidance-penalty for the two-route comparison')
    prepared = prepare_maps_from_args(args)
    routes = calculate_variants(prepared, args.start, args.goal, args.avoidance_penalty)
    export_comparison(args.output_dir, prepared, routes, plot=args.plot)
    for name, route in routes.items():
        s = route['summary']
        print(f"{name}: {s['status']}, {s['length_m']} m, protected: {s['protected_distance_m']} m")


if __name__ == '__main__':
    main()
