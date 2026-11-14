"""Independent base-to-target A* routes on one shared mapped terrain grid."""
import argparse
import json
from pathlib import Path
import re

from backend.mapper_route import prepare_maps, route_prepared
from backend.geoMapper.mars_mapping import save_npz

DEFAULT_MISSION = Path(__file__).parent / 'config/science_targets.json'


def calculate_routes(prepared, mission):
    base = mission['base']
    routes = []
    seen = set()
    for target in mission['targets']:
        key = target['id']
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', key) or key in seen:
            raise ValueError('Target IDs must be unique and safe file names')
        seen.add(key)
        path, _, _, _, summary = route_prepared(
            prepared, (base['lon'], base['lat']), (target['lon'], target['lat']))
        routes.append({'id': key, 'name': target['name'], 'sol': target.get('sol'),
                       'path_xy': path, 'summary': summary})
    return routes


def export_routes(out, prepared, mission, routes):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    prepared.grid.save(out/'grid.json')
    save_npz(out/'mapped_layers.npz', prepared.grid, prepared.arrays)
    for route in routes:
        directory = out/route['id']
        directory.mkdir(exist_ok=True)
        (directory/'path_xy.json').write_text(json.dumps(route['path_xy'], indent=2, allow_nan=False))
        (directory/'summary.json').write_text(json.dumps(
            {key: value for key, value in route.items() if key != 'path_xy'},
            indent=2, ensure_ascii=False, allow_nan=False))
    (out/'paths_xy.json').write_text(json.dumps(
        {route['id']: route['path_xy'] for route in routes}, indent=2, allow_nan=False))
    (out/'routes_summary.json').write_text(json.dumps(
        {'base': mission['base'], 'grid_file': 'grid.json',
         'coordinate_order': '[x=column, y=row]; top-left=(0,0)',
         'routes': [{key: value for key, value in route.items() if key != 'path_xy'} for route in routes]},
        indent=2, ensure_ascii=False, allow_nan=False))


def plot_routes(out, prepared, mission, routes):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np
    cmap = plt.get_cmap('YlOrRd').copy(); cmap.set_bad('#293545')
    fig, ax = plt.subplots(figsize=(12, 10), layout='constrained')
    im = ax.imshow(np.ma.masked_invalid(prepared.arrays['costs']), cmap=cmap, interpolation='nearest')
    fig.colorbar(im, ax=ax, label='Demo-Kosten pro Meter', shrink=.85)
    colors = ['#00e5ff', '#004cff', '#a800ff', '#00aa55']
    base = prepared.grid.xy(mission['base']['lon'], mission['base']['lat'])
    ax.scatter(*base, s=160, marker='s', color='white', edgecolors='black', zorder=6, label=f'Basis {base}')
    for route, color in zip(routes, colors):
        path, summary = route['path_xy'], route['summary']
        if path:
            x, y = zip(*path)
            ax.plot(x, y, color=color, lw=2.5, label=f"Sol {route['sol']}: {summary['length_m']:.0f} m")
        else:
            ax.plot([], [], color=color, label=f"Sol {route['sol']}: kein Weg")
        ax.scatter(*summary['goal_xy'], color=color, s=140, marker='*', edgecolors='black', zorder=5)
        ax.annotate(str(route['sol']), summary['goal_xy'], xytext=(8, 8), textcoords='offset points',
                    color='black', fontsize=10, bbox={'facecolor':'white', 'alpha':.8, 'edgecolor':'none'})
    ax.set(title='Vier unabhängige Wege von der Basis zu den Wissenschaftsorten',
           xlabel='x (nach rechts)', ylabel='y (nach unten)')
    ax.legend(loc='lower right')
    fig.suptitle('Gale DEM | etwa 1 m pro Zelle | Testgrenzen, keine Gehzeiten', fontsize=11)
    fig.savefig(Path(out)/'routes.png', dpi=160)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dem', type=Path)
    parser.add_argument('--targets', type=Path, default=DEFAULT_MISSION)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parent / 'routes/science_routes')
    parser.add_argument('--plot', action='store_true')
    args = parser.parse_args()
    mission = json.loads(args.targets.read_text(encoding='utf-8'))
    prepared = prepare_maps(args.dem)
    routes = calculate_routes(prepared, mission)
    export_routes(args.output_dir, prepared, mission, routes)
    if args.plot:
        plot_routes(args.output_dir, prepared, mission, routes)
    for route in routes:
        s = route['summary']
        print(f"{route['id']}: {s['status']}, XY {s['start_xy']} -> {s['goal_xy']}, "
              f"{s['node_count']} Knoten, {s['length_m']} m")
    print(f'Outputs: {args.output_dir.resolve()}')


if __name__ == '__main__':
    main()
