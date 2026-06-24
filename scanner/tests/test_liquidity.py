import unittest
import pandas as pd
from engine.liquidity import detect_liquidity

class TestLiquidity(unittest.TestCase):
    def test_detects_swing_liquidity(self):
        candles = pd.DataFrame([
            {"datetime":"2026-01-01","open":10,"high":11,"low":9,"close":10},
            {"datetime":"2026-01-02","open":10,"high":15,"low":10,"close":14},
            {"datetime":"2026-01-03","open":14,"high":13,"low":8,"close":9},
            {"datetime":"2026-01-04","open":9,"high":12,"low":10,"close":11},
            {"datetime":"2026-01-05","open":11,"high":16,"low":11,"close":15},
        ])
        events = detect_liquidity(candles, pivot_left=1, pivot_right=1)
        self.assertTrue(any(x.kind == "liquidity_pool" for x in events))

if __name__ == "__main__":
    unittest.main()
