import unittest
import pandas as pd

from engine.cisd import detect_cisd_levels


class TestCISD(unittest.TestCase):
    def test_bullish_cisd_is_created(self):
        candles = pd.DataFrame([
            {"datetime": "2026-01-01", "open": 100, "high": 105, "low": 95, "close": 98},
            {"datetime": "2026-01-02", "open": 97, "high": 110, "low": 96, "close": 103},
        ])

        levels = detect_cisd_levels(candles)
        self.assertEqual(len(levels), 1)
        self.assertEqual(levels[0].direction, "bullish")
        self.assertEqual(levels[0].level, 105.0)


if __name__ == "__main__":
    unittest.main()
