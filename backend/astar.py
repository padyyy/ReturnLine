"""Offline A* for square, weighted grid cells; Python standard library only."""

from dataclasses import dataclass
from heapq import heappop, heappush
from math import isfinite, sqrt
from numbers import Integral, Real
from typing import Callable, Sequence

Cell = tuple[int, int]  # (row, column), in input order


@dataclass(frozen=True)
class PathResult:
    path: tuple[Cell, ...]
    total_cost: float


def astar(
    costs: Sequence[Sequence[float | None]],
    start: Cell,
    goal: Cell,
    *,
    cell_size_m: float = 1.0,
    allow_diagonal: bool = False,
    on_expand: Callable[[Cell], None] | None = None,
) -> PathResult | None:
    """Return an optimal path including endpoints, or None if unreachable.

    Costs are finite positive costs per metre; None marks blocked/unknown cells.
    Each step costs distance times the destination cell's cost. The start cell
    incurs no entry cost. Seconds/metre therefore yield a total in seconds.
    Coordinates are zero-based (row, column), not latitude/longitude.
    Diagonals cannot cross blocked corners. Blocked endpoints return None;
    invalid inputs raise ValueError. Do not mutate the grid during the search.
    Optional on_expand receives each evaluated cell, including start and goal,
    after obsolete heap entries are discarded (useful for visualizing search).
    """
    if not isinstance(cell_size_m, Real) or not isfinite(cell_size_m) or cell_size_m <= 0:
        raise ValueError("cell_size_m must be finite and positive")
    rows = len(costs)
    if rows == 0 or len(costs[0]) == 0:
        raise ValueError("costs must be a nonempty rectangular grid")
    cols = len(costs[0])
    minimum = float('inf')
    for row in costs:
        if len(row) != cols:
            raise ValueError("costs must be rectangular")
        for value in row:
            if value is not None:
                if not isinstance(value, Real) or not isfinite(value) or value <= 0:
                    raise ValueError("cell costs must be finite and positive, or None")
                minimum = min(minimum, value)
    for point in (start, goal):
        if (len(point) != 2 or not all(isinstance(v, Integral) for v in point)
                or not (0 <= point[0] < rows and 0 <= point[1] < cols)):
            raise ValueError("endpoints must be valid (row, column) cells")
    if costs[start[0]][start[1]] is None or costs[goal[0]][goal[1]] is None:
        return None

    def heuristic(cell: Cell) -> float:
        dr, dc = abs(cell[0] - goal[0]), abs(cell[1] - goal[1])
        distance = dr + dc
        if allow_diagonal:
            distance += (sqrt(2) - 2) * min(dr, dc)
        return distance * cell_size_m * minimum

    steps = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if allow_diagonal:
        steps += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    frontier = [(heuristic(start), 0.0, start)]
    best = {start: 0.0}
    parent: dict[Cell, Cell] = {}
    while frontier:
        _, current_cost, current = heappop(frontier)
        if current_cost != best[current]:
            continue  # Superseded heap entry.
        if on_expand is not None:
            on_expand(current)
        if current == goal:
            path = [goal]
            while path[-1] != start:
                path.append(parent[path[-1]])
            return PathResult(tuple(reversed(path)), current_cost)
        r, c = current
        for dr, dc in steps:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            value = costs[nr][nc]
            if value is None:
                continue
            if dr and dc and (costs[r][nc] is None or costs[nr][c] is None):
                continue
            neighbor = (nr, nc)
            distance = cell_size_m * (sqrt(2) if dr and dc else 1)
            candidate = current_cost + distance * value
            if candidate < best.get(neighbor, float('inf')):
                best[neighbor] = candidate
                parent[neighbor] = current
                heappush(frontier, (candidate + heuristic(neighbor), candidate, neighbor))
    return None
