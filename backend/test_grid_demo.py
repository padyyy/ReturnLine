import unittest
from backend.astar import astar
from backend.grid_demo import CONFIG, START, GOAL, CELL_SIZE_M, create_example_grid
from backend.terrain_costs import build_cost_grid


class GridDemoTests(unittest.TestCase):
    def test_grid_shape_reproducibility_and_route(self):
        self.assertEqual(CELL_SIZE_M, 1)
        grid = create_example_grid()
        self.assertEqual(grid, create_example_grid())
        self.assertEqual(len(grid), 100)
        self.assertTrue(all(len(row) == 100 for row in grid))
        costs = build_cost_grid(grid, CONFIG)
        expanded = []
        result = astar(costs, START, GOAL, cell_size_m=CELL_SIZE_M, on_expand=expanded.append)
        self.assertEqual(result.path[0], START)
        self.assertEqual(result.path[-1], GOAL)
        self.assertEqual(expanded[0], START)
        self.assertEqual(expanded[-1], GOAL)
        self.assertTrue(set(result.path) <= set(expanded))
        self.assertTrue(all(costs[r][c] is not None for r, c in result.path))
        for (r, c), (nr, nc) in zip(result.path, result.path[1:]):
            self.assertEqual(abs(r-nr) + abs(c-nc), 1)
        self.assertAlmostEqual(result.total_cost, sum(costs[r][c] * CELL_SIZE_M for r, c in result.path[1:]))
        # Observation does not change the search result.
        self.assertEqual(result, astar(costs, START, GOAL, cell_size_m=CELL_SIZE_M))
        self.assertIsNone(costs[0][50])
        self.assertIsNotNone(costs[60][50])
        self.assertIsNone(costs[70][70])


if __name__ == '__main__':
    unittest.main()
