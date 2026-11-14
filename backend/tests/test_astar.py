"""Run: python -m unittest discover -s backend -v"""
import unittest
from math import sqrt
from backend.astar import astar


class AStarTests(unittest.TestCase):
    def test_weighted_detour(self):
        result = astar([[1, 100, 1], [1, 1, 1]], (0, 0), (0, 2), cell_size_m=10)
        self.assertEqual(result.path, ((0, 0), (1, 0), (1, 1), (1, 2), (0, 2)))
        self.assertEqual(result.total_cost, 40)

    def test_fractional_costs(self):
        result = astar([[0.1, 1, 0.1], [0.1, 0.1, 0.1]], (0, 0), (0, 2))
        self.assertAlmostEqual(result.total_cost, 0.4)

    def test_unreachable_and_blocked_endpoints(self):
        self.assertIsNone(astar([[1, None, 1]], (0, 0), (0, 2)))
        self.assertIsNone(astar([[None, 1]], (0, 0), (0, 1)))
        self.assertIsNone(astar([[1, None]], (0, 0), (0, 1)))

    def test_diagonals_and_corner_blocking(self):
        result = astar([[1, 1], [1, 1]], (0, 0), (1, 1), allow_diagonal=True)
        self.assertAlmostEqual(result.total_cost, sqrt(2))
        self.assertIsNone(astar([[1, None], [None, 1]], (0, 0), (1, 1), allow_diagonal=True))
        result = astar([[1, None], [1, 1]], (0, 0), (1, 1), allow_diagonal=True)
        self.assertEqual(result.total_cost, 2)

    def test_start_equals_goal(self):
        result = astar([[1]], (0, 0), (0, 0))
        self.assertEqual(result.path, ((0, 0),))
        self.assertEqual(result.total_cost, 0)

    def test_invalid_inputs(self):
        for grid in ([], [[]], [[1], [1, 2]], [[0]], [[-1]], [[float('nan')]], [[float('inf')]]):
            with self.subTest(grid=grid), self.assertRaises(ValueError):
                astar(grid, (0, 0), (0, 0))
        with self.assertRaises(ValueError):
            astar([[1]], (1, 0), (0, 0))
        with self.assertRaises(ValueError):
            astar([[1]], (0, 0), (0, 0), cell_size_m=0)


if __name__ == '__main__':
    unittest.main()
