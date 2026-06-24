import unittest
import pandas as pd

from engine.fvg import detect_fvgs


class TestFVGEngine(unittest.TestCase):
    def test_empty_data_returns_no_gaps(self):
        candles = pd.DataFrame(
            columns=["datetime", "open", "high", "low", "close"]
        )
        gaps = detect_fvgs(candles)
        self.assertEqual(gaps, [])

    def test_bullish_fvg_is_detected(self):
        candles = pd.DataFrame([
            {"datetime": "2026-01-01", "open": 100, "high": 105, "low": 95, "close": 102},
            {"datetime": "2026-01-02", "open": 102, "high": 110, "low": 101, "close": 109},
            {"datetime": "2026-01-03", "open": 110, "high": 120, "low": 106, "close": 119},
        ])

        gaps = detect_fvgs(candles)
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0].direction, "bullish")
        self.assertEqual(gaps[0].top, 106.0)
        self.assertEqual(gaps[0].bottom, 105.0)


if __name__ == "__main__":
    unittest.main()
